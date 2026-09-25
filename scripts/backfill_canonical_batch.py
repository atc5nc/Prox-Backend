# Backfills canonical_product_name + brand + match_key for flyer_deals rows
# that have product_name but no canonical_product_name.
# Processes in streaming batches — safe for 1.5M+ rows.

import time
import logging
import re
from config.supabase import get_supabase_client
from scoring.product_normalizer import extract_brand, build_canonical_name
from services.cross_retailer_service import _get_kiran_lookup, _kiran_canonical
from scoring.category_classifier import classify_product

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

sb = get_supabase_client()
BATCH = 500

def main():
    total_updated = 0
    total_skipped = 0
    total_fetched = 0

    logger.info("Starting canonical name + match_key backfill on flyer_deals...")

    while True:
        # Always fetch from offset 0 — processed rows are updated and disappear from query
        res = (
            sb.table("flyer_deals")
            .select("id, product_name, brand, retailer, category, base_amount, base_unit")
            .is_("canonical_product_name", "null")
            .not_.is_("product_name", "null")
            .limit(BATCH)
            .execute()
        )
        batch = res.data or []
        if not batch:
            break

        total_fetched += len(batch)
        to_write = []

        for row in batch:
            product_name = (row.get("product_name") or "").strip()
            if not product_name:
                total_skipped += 1
                continue

            existing_brand = row.get("brand")
            brand = existing_brand or extract_brand(product_name)

            our_canonical = build_canonical_name(product_name, brand)
            # Try Kiran first with raw name, then with our normalized output as fallback key
            canonical = _kiran_canonical(product_name, pre_normalized=our_canonical) or our_canonical

            if not canonical or len(canonical) < 2:
                canonical = product_name.lower().strip()[:120]
            if not canonical:
                total_skipped += 1
                continue

            size = row.get("base_amount")
            size_str = str(size) if size is not None else "no_size"
            match_key = f"{brand or ''}|{canonical}|{size_str}"

            category = classify_product(
                product_name,
                canonical,
                existing_category=row.get("category"),
            )
            to_write.append({
                "id": row["id"],
                "canonical_product_name": canonical,
                "brand": brand,
                "match_key": match_key,
                **({"category": category} if category else {}),
            })

        if to_write:
            for attempt in range(3):
                try:
                    sb.table("flyer_deals").upsert(to_write, on_conflict="id").execute()
                    total_updated += len(to_write)
                    break
                except Exception as e:
                    if attempt == 2:
                        logger.error(f"Write failed after 3 attempts: {e}")
                    else:
                        time.sleep(2)
        else:
            total_skipped += len(batch)

        if total_fetched % 5000 == 0:
            logger.info(f"Progress: {total_fetched:,} fetched | {total_updated:,} updated | {total_skipped:,} skipped")

    logger.info(f"\nDone. Fetched: {total_fetched:,} | Updated: {total_updated:,} | Skipped: {total_skipped:,}")

if __name__ == "__main__":
    main()
