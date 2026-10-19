# jobs/backfill_store_ids.py
# Backfills store_id + Phase 3 store-match fields for existing flyer_deals rows.
# By default only processes rows where store_id IS NULL.
#
# Safe behavior:
# - Uses flyer_deals.retailer_key as the authoritative source key.
# - Never collapses distinct banners (QFC, Ralphs, Mariano's, FoodsCo, etc.).
# - Never creates synthetic store_locations rows.
# - Existing non-null store_id values are not overwritten unless --all-rows is used.
# - Does not write candidate_store_ids because the legacy DB column is uuid[]
#   while public.store_locations.id is integer. store_id remains authoritative.
#
# Usage:
#   PYTHONPATH=. python jobs/backfill_store_ids.py
#   PYTHONPATH=. python jobs/backfill_store_ids.py --retailer ralphs
#   PYTHONPATH=. python jobs/backfill_store_ids.py --created-after 2026-08-26T07:00:00+00:00
#   PYTHONPATH=. python jobs/backfill_store_ids.py --dry-run

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from collections import defaultdict
from concurrent.futures import Future, ThreadPoolExecutor

from config.supabase import supabase
from services.store_location_matcher import (
    StoreMatchResult,
    find_store_for_deal,
    get_match_cache_stats,
    valid_store_ids_for_retailer,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("BACKFILL")

DEFAULT_PAGE_SIZE = int(os.getenv("STORE_LOCATION_PAGE_SIZE", "1000"))
BATCH_WRITE_MAX = int(os.getenv("STORE_LOCATION_WRITE_CHUNK", "50"))
MIN_CHUNK = 1
TIMEOUT_CODE = "57014"
TRANSIENT_NETWORK_MARKERS = (
    "RemoteProtocolError",
    "LocalProtocolError",
    "ReadError",
    "ConnectError",
    "TimeoutException",
    "ConnectionTerminated",
    "Resource temporarily unavailable",
    "Server disconnected",
    "KeyError",
)
MAX_NETWORK_RETRIES = int(os.getenv("STORE_LOCATION_NETWORK_RETRIES", "5"))
DISABLE_PREFETCH = os.getenv("STORE_LOCATION_DISABLE_PREFETCH", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def _is_transient_network_error(exc: Exception) -> bool:
    text = f"{type(exc).__name__}: {exc}"
    return any(marker in text for marker in TRANSIENT_NETWORK_MARKERS)


def _execute_with_retry(operation, *, label: str):
    for attempt in range(1, MAX_NETWORK_RETRIES + 1):
        try:
            return operation()
        except Exception as exc:
            if not _is_transient_network_error(exc) or attempt >= MAX_NETWORK_RETRIES:
                raise
            delay = min(0.5 * (2 ** (attempt - 1)), 8.0)
            logger.warning(
                "Transient Supabase/httpx error during %s (attempt %s/%s): %s; retrying in %.1fs",
                label,
                attempt,
                MAX_NETWORK_RETRIES,
                exc,
                delay,
            )
            time.sleep(delay)


def _fetch_page(
    last_id: int,
    retailer_filter: str | None,
    only_unmatched: bool,
    created_after: str | None,
    created_before: str | None,
    end_id: int | None,
    page_size: int,
) -> list:
    q = (
        supabase.table("flyer_deals")
        .select("id, retailer_key, retailer, zip_code, store_lat, store_lng, store_id")
        .gt("id", last_id)
        .order("id")
        .limit(page_size)
    )

    if end_id is not None:
        q = q.lte("id", end_id)
    if retailer_filter:
        q = q.eq("retailer_key", retailer_filter)
    if only_unmatched:
        q = q.is_("store_id", "null")
    if created_after:
        q = q.gte("created_at", created_after)
    if created_before:
        q = q.lt("created_at", created_before)

    result = _execute_with_retry(
        q.execute,
        label=f"fetch flyer_deals page after id={last_id} retailer={retailer_filter or '*'}",
    )
    return result.data or []


def _build_payload(match) -> dict:
    # candidate_store_ids is intentionally omitted here. The current production
    # column is uuid[] but public.store_locations.id, flyer_deals.store_id, and
    # the matcher all use integer IDs. Including integer candidates causes
    # Postgres to reject the entire PATCH, including the valid store_id.
    # Keep the chosen store_id plus match metadata now. Candidate re-resolution
    # can be restored after the candidate ID schema is migrated deliberately.
    return {
        "store_id": match.store_id,
        "match_confidence": match.match_confidence,
        "candidate_store_count": match.candidate_store_count,
        "matched_by": match.matched_by,
    }


def _write_chunk(ids: list, payload: dict, depth: int = 0) -> tuple[int, int]:
    if not ids:
        return 0, 0

    try:
        _execute_with_retry(
            lambda: supabase.table("flyer_deals").update(payload).in_("id", ids).execute(),
            label=f"write flyer_deals store match chunk size={len(ids)}",
        )
        return len(ids), 0

    except Exception as exc:
        err_str = str(exc)
        code = getattr(exc, "code", None) or (
            exc.args[0].get("code")
            if exc.args and isinstance(exc.args[0], dict)
            else None
        )

        if TIMEOUT_CODE in err_str or code == TIMEOUT_CODE:
            if len(ids) <= MIN_CHUNK:
                logger.error("Timeout on single row id=%s, skipping", ids[0])
                return 0, 1

            mid = len(ids) // 2
            left, right = ids[:mid], ids[mid:]
            logger.warning(
                "Timeout on %s-row chunk (depth=%s), splitting into %s + %s",
                len(ids),
                depth,
                len(left),
                len(right),
            )
            time.sleep(0.5 * (depth + 1))
            s1, e1 = _write_chunk(left, payload, depth + 1)
            s2, e2 = _write_chunk(right, payload, depth + 1)
            return s1 + s2, e1 + e2

        logger.error("Batch update failed (%s rows): %s", len(ids), exc)
        return 0, len(ids)


def _write_batch(matched_pairs: list[tuple], dry_run: bool) -> tuple[int, int]:
    groups: dict[str, list] = defaultdict(list)

    for deal_id, match in matched_pairs:
        payload = _build_payload(match)
        key = json.dumps(payload, sort_keys=True, default=str)
        groups[key].append((deal_id, payload))

    success = 0
    errors = 0

    for items in groups.values():
        ids = [item[0] for item in items]
        payload = items[0][1]

        if dry_run:
            logger.info("[DRY-RUN] %s rows -> %s", len(ids), payload)
            success += len(ids)
            continue

        for i in range(0, len(ids), BATCH_WRITE_MAX):
            chunk = ids[i : i + BATCH_WRITE_MAX]
            s, e = _write_chunk(chunk, payload)
            success += s
            errors += e

    return success, errors


def _process_page(
    page: list,
    stats: dict,
    repair_invalid_existing: bool = False,
) -> list[tuple]:
    updates = []
    valid_store_ids_cache: dict[tuple[str, str], set[int]] = {}

    for deal in page:
        stats["processed"] += 1
        source_key = (deal.get("retailer_key") or "").strip()
        retailer_raw = deal.get("retailer") or source_key
        zip_code = str(deal.get("zip_code") or "").strip()
        current_store_id = deal.get("store_id")
        current_store_invalid = False

        if not source_key:
            stats["skipped_null_retailer"] += 1
            continue
        if not zip_code:
            stats["skipped_null_zip"] += 1
            continue

        if repair_invalid_existing and current_store_id is not None:
            cache_key = (source_key.lower(), str(retailer_raw).strip().lower())
            if cache_key not in valid_store_ids_cache:
                valid_store_ids_cache[cache_key] = valid_store_ids_for_retailer(
                    source_key,
                    retailer_raw,
                )

            try:
                current_store_id_int = int(current_store_id)
            except (TypeError, ValueError):
                current_store_id_int = None

            if (
                current_store_id_int is not None
                and current_store_id_int in valid_store_ids_cache[cache_key]
            ):
                stats["skipped_valid_existing"] += 1
                continue

            current_store_invalid = True
            stats["repair_candidates"] += 1
        elif repair_invalid_existing:
            stats["null_candidates"] += 1

        try:
            match = find_store_for_deal(
                retailer_key=source_key,
                retailer_raw=retailer_raw,
                zip_code=zip_code,
                deal_lat=deal.get("store_lat"),
                deal_lng=deal.get("store_lng"),
            )
            if match.store_id is not None:
                updates.append((deal["id"], match))
                if current_store_invalid:
                    stats["remap_candidates"] += 1
                stats[match.match_confidence] = (
                    stats.get(match.match_confidence, 0) + 1
                )
            else:
                stats["no_match"] += 1
                stats["no_match_reasons"][match.matched_by] = (
                    stats["no_match_reasons"].get(match.matched_by, 0) + 1
                )
                if current_store_invalid:
                    updates.append(
                        (
                            deal["id"],
                            StoreMatchResult(
                                None,
                                "none",
                                0,
                                "repair_invalid_no_match",
                                [],
                                None,
                                match.store_retailer_key,
                            ),
                        )
                    )
                    stats["clear_candidates"] += 1
        except Exception as exc:
            logger.exception("Store match error on flyer_deals.id=%s: %s", deal["id"], exc)
            stats["errors"] += 1

    return updates

def run_backfill(
    retailer_filter: str | None = None,
    dry_run: bool = False,
    only_unmatched: bool = True,
    start_id: int = 0,
    created_after: str | None = None,
    created_before: str | None = None,
    end_id: int | None = None,
    page_size: int | None = None,
    max_pages: int | None = None,
    repair_invalid_existing: bool = False,
) -> dict:
    """Run a restart-safe store-location backfill.

    created_after should be an ISO-8601 timestamptz string when supplied.
    """
    effective_page_size = page_size or DEFAULT_PAGE_SIZE
    stats = {
        "processed": 0,
        "skipped_null_retailer": 0,
        "skipped_null_zip": 0,
        "matched": 0,
        "zip_single": 0,
        "zip_multi": 0,
        "nearby_single": 0,
        "nearby_multi": 0,
        "no_match": 0,
        "errors": 0,
        "repair_candidates": 0,
        "null_candidates": 0,
        "skipped_valid_existing": 0,
        "remap_candidates": 0,
        "clear_candidates": 0,
        "no_match_reasons": {},
    }

    last_id = start_id
    page_num = 0
    total_rows = 0

    if start_id:
        logger.info("Resuming from id > %s", start_id)

    def process_page(page: list) -> tuple[int, bool]:
        nonlocal page_num, total_rows, last_id

        page_num += 1
        total_rows += len(page)
        next_last_id = page[-1]["id"]
        is_last = len(page) < effective_page_size

        logger.info(
            "Page %s, retailer=%s, fetched=%s after id=%s, total=%s",
            page_num,
            retailer_filter or "*",
            len(page),
            last_id,
            total_rows,
        )

        matched_pairs = _process_page(
            page,
            stats,
            repair_invalid_existing=repair_invalid_existing,
        )

        if matched_pairs:
            success, errors = _write_batch(matched_pairs, dry_run)
            stats["matched"] += success
            stats["errors"] += errors
            logger.info(
                "Page %s wrote %s matched rows%s",
                page_num,
                success,
                f", {errors} write errors" if errors else "",
            )

        last_id = next_last_id
        return next_last_id, is_last

    if DISABLE_PREFETCH:
        logger.info("HTTP prefetch disabled; using sequential fetch/process mode")
        while True:
            page = _fetch_page(
                last_id,
                retailer_filter,
                only_unmatched,
                created_after,
                created_before,
                end_id,
                effective_page_size,
            )
            if not page:
                break

            _, is_last = process_page(page)
            if is_last or (max_pages and page_num >= max_pages):
                break
    else:
        with ThreadPoolExecutor(max_workers=2) as executor:
            fetch_future: Future = executor.submit(
                _fetch_page,
                last_id,
                retailer_filter,
                only_unmatched,
                created_after,
                created_before,
                end_id,
                effective_page_size,
            )

            while True:
                page = fetch_future.result()
                if not page:
                    break

                next_last_id = page[-1]["id"]
                is_last = len(page) < effective_page_size

                if not is_last and not (max_pages and page_num + 1 >= max_pages):
                    fetch_future = executor.submit(
                        _fetch_page,
                        next_last_id,
                        retailer_filter,
                        only_unmatched,
                        created_after,
                        created_before,
                        end_id,
                        effective_page_size,
                    )

                _, is_last = process_page(page)

                if is_last or (max_pages and page_num >= max_pages):
                    break

    stats["pages"] = page_num
    stats["last_id"] = last_id
    stats["cache"] = get_match_cache_stats()
    logger.info("Done retailer=%s: %s", retailer_filter or "*", stats)
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill store_id on flyer_deals")
    parser.add_argument(
        "--retailer",
        default=None,
        help="Limit to one flyer_deals.retailer_key, e.g. ralphs or qfc",
    )
    parser.add_argument(
        "--start-id",
        type=int,
        default=0,
        help="Resume from this flyer_deals.id (exclusive)",
    )
    parser.add_argument(
        "--created-after",
        default=None,
        help="Only process rows created at/after this ISO-8601 timestamptz",
    )
    parser.add_argument(
        "--created-before",
        default=None,
        help="Only process rows created before this ISO-8601 timestamptz",
    )
    parser.add_argument(
        "--end-id",
        type=int,
        default=None,
        help="Optional inclusive upper flyer_deals.id bound for a frozen cohort",
    )
    parser.add_argument(
        "--all-rows",
        action="store_true",
        help="Reprocess already-matched rows",
    )
    parser.add_argument(
        "--repair-invalid-store-ids",
        action="store_true",
        help=(
            "Process null store IDs plus existing mappings that are not valid "
            "for the canonical retailer catalog; leave valid existing mappings untouched"
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log payloads without writing to the database",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Optional cap for validation runs",
    )
    args = parser.parse_args()

    run_backfill(
        retailer_filter=args.retailer,
        dry_run=args.dry_run,
        only_unmatched=not (args.all_rows or args.repair_invalid_store_ids),
        start_id=args.start_id,
        created_after=args.created_after,
        created_before=args.created_before,
        end_id=args.end_id,
        max_pages=args.max_pages,
        repair_invalid_existing=args.repair_invalid_store_ids,
    )
