# scripts/write_canonical_fields.py
import sys
import time
import logging
from collections import defaultdict
from config.supabase import get_supabase_client
from scoring.product_normalizer import make_match_key
from scoring.category_classifier import classify_product

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DRY_RUN      = "--dry-run" in sys.argv
ONLY_MISSING = "--only-missing" in sys.argv
FETCH_BATCH  = 500   # bigger = fewer round trips
WRITE_BATCH  = 500
MAX_RETRIES  = 2     # retry up to 8 times with backoff


def fetch_batch_with_retry(supabase, offset: int) -> list[dict]:
    for attempt in range(MAX_RETRIES):
        try:
            q = supabase.table("flyer_deals").select(
                "id, product_name, base_amount, base_unit, brand, canonical_product_name"
            )
            if ONLY_MISSING:
                q = q.is_("brand", "null").is_("canonical_product_name", "null")
            res = q.range(offset, offset + FETCH_BATCH - 1).execute()
            return res.data or []
        except Exception as e:
            wait = 2  # 1s, 2s, 4s, 8s... max 60s
            logger.warning(f"Fetch failed at offset {offset} (attempt {attempt+1}/{MAX_RETRIES}): retrying in {wait}s")
            time.sleep(wait)
    logger.error(f"Fetch permanently failed at offset {offset} after {MAX_RETRIES} attempts — skipping")
    return None  # None = skip this batch, not empty = done


def write_batch_with_retry(supabase, records: list[dict], offset: int) -> int:
    for attempt in range(MAX_RETRIES):
        try:
            res = (
                supabase.table("flyer_deals")
                .upsert(records, on_conflict="id")
                .execute()
            )
            return len(res.data or [])
        except Exception as e:
            wait = 2
            logger.warning(f"Write failed at offset {offset} (attempt {attempt+1}/{MAX_RETRIES}): retrying in {wait}s")
            time.sleep(wait)
    logger.error(f"Write permanently failed at offset {offset} — skipping {len(records)} rows")
    return 0


def main():
    supabase = get_supabase_client()

    offset        = 0
    total_written = 0
    total_skipped = 0
    total_fetched = 0
    by_conf       = defaultdict(int)

    logger.info(f"Starting {'DRY RUN ' if DRY_RUN else ''}{'(only-missing) ' if ONLY_MISSING else ''}backfill...")

    while True:
        batch = fetch_batch_with_retry(supabase, offset)

        if batch is None:
            # permanently failed fetch — skip ahead
            offset += FETCH_BATCH
            continue

        if len(batch) == 0:
            break  # done

        total_fetched += len(batch)

        # Normalize
        to_write = []
        for row in batch:
            result = make_match_key(
                product_name=row.get("product_name") or "",
                base_amount=row.get("base_amount"),
                base_unit=row.get("base_unit"),
            )
            by_conf[result["confidence"]] += 1
            if result["confidence"] == "none" and not result["canonical_name"]:
                total_skipped += 1
                continue
            payload = {"id": row["id"]}
            if result["brand"]:
                payload["brand"] = result["brand"]
            if result["canonical_name"]:
                payload["canonical_product_name"] = result["canonical_name"]
                payload["category"] = classify_product(
                    row.get("product_name"), result["canonical_name"]
                )
            if len(payload) > 1:
                to_write.append(payload)
            else:
                total_skipped += 1

        # Write
        if to_write and not DRY_RUN:
            written = write_batch_with_retry(supabase, to_write, offset)
            total_written += written
            total_skipped += len(to_write) - written
        elif to_write and DRY_RUN:
            total_written += len(to_write)

        offset += FETCH_BATCH

        if total_fetched % 10000 == 0:
            logger.info(f"Progress: {total_fetched:,} fetched | {total_written:,} written | {total_skipped:,} skipped")

    print(f"\nDone.")
    print(f"  Fetched:  {total_fetched:,}")
    print(f"  Written:  {total_written:,}")
    print(f"  Skipped:  {total_skipped:,}")
    print(f"\nConfidence breakdown:")
    for k, v in sorted(by_conf.items()):
        print(f"  {k}: {v:,}")
    if DRY_RUN:
        print("\n[DRY RUN] Nothing was written.")


if __name__ == "__main__":
    main()