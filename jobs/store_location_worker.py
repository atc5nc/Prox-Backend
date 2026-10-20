# jobs/store_location_worker.py
"""Continuous Railway worker for flyer_deals store-location attribution."""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from config.supabase import supabase
from jobs.backfill_store_ids import run_backfill, run_indexed_source_store_repair

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("STORE_LOCATION_WORKER")

LOCAL_TZ = ZoneInfo(os.getenv("STORE_LOCATION_WEEK_TIMEZONE", "America/Los_Angeles"))
ACTIVE_SLEEP_SECONDS = float(os.getenv("STORE_LOCATION_ACTIVE_SLEEP_SECONDS", "5"))
IDLE_SLEEP_SECONDS = float(os.getenv("STORE_LOCATION_IDLE_SLEEP_SECONDS", "300"))
ERROR_SLEEP_SECONDS = float(os.getenv("STORE_LOCATION_ERROR_SLEEP_SECONDS", "15"))
WEEKLY_ONLY = os.getenv("STORE_LOCATION_WEEKLY_ONLY", "true").lower() not in {
    "0",
    "false",
    "no",
}

# Optional bounded repair for known legacy store catalogs that can arrive with a
# non-null store_id. Disabled unless a source retailer key is configured.
INVALID_REPAIR_SOURCE_RETAILER_KEY = os.getenv(
    "STORE_LOCATION_INVALID_REPAIR_SOURCE_RETAILER_KEY", ""
).strip()
INVALID_REPAIR_RETAILER_KEY = (
    os.getenv("STORE_LOCATION_INVALID_REPAIR_RETAILER_KEY", "").strip()
    or INVALID_REPAIR_SOURCE_RETAILER_KEY
)
INVALID_REPAIR_INTERVAL_SECONDS = max(
    60.0,
    float(os.getenv("STORE_LOCATION_INVALID_REPAIR_INTERVAL_SECONDS", "1800")),
)
INVALID_REPAIR_LOOKBACK_DAYS = max(
    1.0,
    float(os.getenv("STORE_LOCATION_INVALID_REPAIR_LOOKBACK_DAYS", "7")),
)
INVALID_REPAIR_PAGE_SIZE = max(
    1,
    int(os.getenv("STORE_LOCATION_INVALID_REPAIR_PAGE_SIZE", "250")),
)
INVALID_REPAIR_MAX_PAGES = max(
    1,
    int(os.getenv("STORE_LOCATION_INVALID_REPAIR_MAX_PAGES", "8")),
)


def latest_wednesday_start_utc(now: datetime | None = None) -> datetime:
    current = now or datetime.now(timezone.utc)
    local = current.astimezone(LOCAL_TZ)
    days_since_wednesday = (local.weekday() - 2) % 7
    start_local = (local - timedelta(days=days_since_wednesday)).replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    return start_local.astimezone(timezone.utc)


def _week_start_id(week_start: datetime) -> int:
    """Return an ID cursor just before the first row created this flyer week.

    The backfill table already has a partial index on id WHERE store_id IS NULL.
    Scanning unmatched rows forward from the weekly ID boundary is dramatically
    cheaper than issuing one retailer_key-filtered query per retailer, because
    retailer_key currently has no supporting backfill index.
    """
    result = (
        supabase.table("flyer_deals")
        .select("id,created_at")
        .gte("created_at", week_start.isoformat())
        .order("created_at")
        .order("id")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return 0

    first_id = int(rows[0]["id"])
    # The backfill query is exclusive (id > start_id).
    return max(0, first_id - 1)


def run_cycle() -> dict:
    week_start = latest_wednesday_start_utc() if WEEKLY_ONLY else None

    if week_start is not None:
        start_id = _week_start_id(week_start)
        logger.info(
            "Starting global weekly cycle, week_start=%s, start_id=%s",
            week_start.isoformat(),
            start_id,
        )
        # Important: do not also add created_at or retailer_key filters here.
        # The efficient production path is the existing partial index
        # idx_flyer_deals_unmatched_id (id WHERE store_id IS NULL), starting at
        # the current week's ID boundary. The matcher itself keeps retailer_key
        # authoritative and loads only same-retailer store_locations candidates.
        stats = run_backfill(
            retailer_filter=None,
            only_unmatched=True,
            start_id=start_id,
            created_after=None,
        )
    else:
        logger.info("Starting global all-history unmatched cycle")
        stats = run_backfill(
            retailer_filter=None,
            only_unmatched=True,
            start_id=0,
            created_after=None,
        )

    totals = {
        "processed": int(stats.get("processed", 0)),
        "matched": int(stats.get("matched", 0)),
        "no_match": int(stats.get("no_match", 0)),
        "errors": int(stats.get("errors", 0)),
        "pages": int(stats.get("pages", 0)),
        "last_id": int(stats.get("last_id", 0)),
    }
    logger.info("Cycle complete: %s", totals)
    return totals


def invalid_repair_enabled() -> bool:
    return bool(INVALID_REPAIR_SOURCE_RETAILER_KEY and INVALID_REPAIR_RETAILER_KEY)


def invalid_repair_due(
    last_started_monotonic: float | None,
    *,
    now_monotonic: float | None = None,
) -> bool:
    if not invalid_repair_enabled():
        return False
    if last_started_monotonic is None:
        return True
    current = time.monotonic() if now_monotonic is None else now_monotonic
    return current - last_started_monotonic >= INVALID_REPAIR_INTERVAL_SECONDS


def run_invalid_existing_repair(now: datetime | None = None) -> dict:
    """Repair recent rows that still reference a configured legacy store catalog.

    The repair is intentionally separate from the global unmatched scan. It uses
    the indexed flyer_deals.store_id path, is retailer-scoped, and is capped by
    page count so a legacy catalog cannot turn the continuous worker into an
    unbounded full-table repair.
    """
    if not invalid_repair_enabled():
        return {
            "enabled": False,
            "processed": 0,
            "matched": 0,
            "errors": 0,
            "pages": 0,
        }

    current = now or datetime.now(timezone.utc)
    created_after = current - timedelta(days=INVALID_REPAIR_LOOKBACK_DAYS)

    logger.info(
        "Starting bounded invalid-store repair source_store_retailer=%s retailer=%s "
        "created_after=%s page_size=%s max_pages=%s",
        INVALID_REPAIR_SOURCE_RETAILER_KEY,
        INVALID_REPAIR_RETAILER_KEY,
        created_after.isoformat(),
        INVALID_REPAIR_PAGE_SIZE,
        INVALID_REPAIR_MAX_PAGES,
    )

    stats = run_indexed_source_store_repair(
        source_store_retailer_key=INVALID_REPAIR_SOURCE_RETAILER_KEY,
        retailer_filter=INVALID_REPAIR_RETAILER_KEY,
        dry_run=False,
        created_after=created_after.isoformat(),
        created_before=current.isoformat(),
        page_size=INVALID_REPAIR_PAGE_SIZE,
        max_pages=INVALID_REPAIR_MAX_PAGES,
    )
    stats["enabled"] = True
    logger.info(
        "Bounded invalid-store repair complete: processed=%s matched=%s no_match=%s "
        "errors=%s pages=%s",
        stats.get("processed", 0),
        stats.get("matched", 0),
        stats.get("no_match", 0),
        stats.get("errors", 0),
        stats.get("pages", 0),
    )
    return stats


def main() -> None:
    logger.info(
        "Store-location worker started, weekly_only=%s, max_nearby_miles=%s, "
        "invalid_repair_enabled=%s, invalid_repair_source=%s, "
        "invalid_repair_retailer=%s, invalid_repair_interval_seconds=%s, "
        "invalid_repair_page_size=%s, invalid_repair_max_pages=%s",
        WEEKLY_ONLY,
        os.getenv("STORE_LOCATION_MAX_NEARBY_MILES", "15"),
        invalid_repair_enabled(),
        INVALID_REPAIR_SOURCE_RETAILER_KEY or "-",
        INVALID_REPAIR_RETAILER_KEY or "-",
        INVALID_REPAIR_INTERVAL_SECONDS,
        INVALID_REPAIR_PAGE_SIZE,
        INVALID_REPAIR_MAX_PAGES,
    )

    last_invalid_repair_started: float | None = None

    while True:
        try:
            # Repair known non-null legacy mappings before the broad unmatched
            # scan. The global scan can be large, so putting the indexed repair
            # first prevents an existing bad store_id from waiting behind a
            # backlog of unrelated null store_ids.
            if invalid_repair_due(last_invalid_repair_started):
                last_invalid_repair_started = time.monotonic()
                run_invalid_existing_repair()

            totals = run_cycle()

            sleep_for = (
                ACTIVE_SLEEP_SECONDS if totals["matched"] > 0 else IDLE_SLEEP_SECONDS
            )
            logger.info("Sleeping %.1fs before next cycle", sleep_for)
            time.sleep(sleep_for)
        except KeyboardInterrupt:
            logger.info("Worker interrupted, exiting")
            return
        except Exception:
            logger.exception("Worker cycle failed")
            time.sleep(ERROR_SLEEP_SECONDS)


if __name__ == "__main__":
    main()
