# Classification and app trace notes

## Completed production-path trace

- [`jobs/pipeline_ingest.py`](../jobs/pipeline_ingest.py) is the normal
  ingestion writer. It now derives brand, canonical name, match key, and
  category before the `flyer_deals` upsert.
- [`scripts/backfill_canonical_batch.py`](../scripts/backfill_canonical_batch.py)
  and [`scripts/write_canonical_fields.py`](../scripts/write_canonical_fields.py)
  are existing canonical-field writers. They now use the same classifier and
  preserve an existing category when the classifier has no confident answer.
- [`scoring/product_normalizer.py`](../scoring/product_normalizer.py) keeps
  canned/prepared form in the canonical identity.
- [`services/cross_retailer_service.py`](../services/cross_retailer_service.py)
  now projects category into product search results and chooses the most
  frequent category deterministically for a grouped identity.
- [`mobile_app/src/lib/proxSearch.ts`](../mobile_app/src/lib/proxSearch.ts)
  now carries search category into cart items instead of hardcoding `null`.

## Deals and Grocery List findings

- [`mobile_app/src/pages/deals/fetchFlyerDeals.ts`](../mobile_app/src/pages/deals/fetchFlyerDeals.ts)
  reads `category` from `flyer_deals`.
- [`mobile_app/src/pages/deals/flyerDeals.ts`](../mobile_app/src/pages/deals/flyerDeals.ts)
  passes that value through to the app model.
- [`mobile_app/src/pages/deals/useDealsPageState.ts`](../mobile_app/src/pages/deals/useDealsPageState.ts)
  sends the fetched items into the Deals derivation/section helpers.
- The checkout does not contain the imported `catalog`, `browseDerivations`,
  or cart-rendering modules, so the final client section implementation cannot
  be independently verified from this backend checkout.
- Search-originated cart items previously discarded category in
  `proxSearch.ts`; that is a confirmed grouping/data-loss defect and is fixed
  in the working tree.

## Taxonomy finding

`DELI_PREPARED` is already used as a supported backend preference value in
[`scripts/run_notification_trigger.py`](../scripts/run_notification_trigger.py).
The classifier now uses it only for explicit prepared-dish combinations; it
does not classify frozen meals, uncooked pasta, or a standalone keyword as
`DELI_PREPARED`.

The missing app catalog/derivation modules prevent a definitive confirmation
of the displayed title mapping. That is an app checkout/content blocker, not
a production write blocker.

## RPC finding

[`jobs/v27_classification_worker.py`](../jobs/v27_classification_worker.py)
calls the deployed functions:

- `v27_classify_leased_source_product`
- `v27_finalize_source_product_incremental`
- lease/claim/cancel functions

No definitions or migrations for these functions are tracked in this
repository. The anon REST key can read application tables but cannot inspect
`pg_proc` or `pg_get_functiondef`, and invoking the worker RPCs would be
mutating. Therefore overwrite behavior is not yet confirmed.

Recommended next action: inspect the definitions using the read-only catalog
query in [`v27_rpc_definition_query.sql`](./v27_rpc_definition_query.sql).
If the RPC writes the same canonical/category fields, update it in a separate
linked migration PR.

## Remaining blockers and exact help needed

1. Full counts: run the inventory SQL with a query path that can complete the
   full-table scan, or provide a read-only database connection if REST times
   out.
2. RPC behavior: run the catalog query in Supabase SQL Editor or provide its
   output; do not invoke the classifier RPCs.
3. Grocery List UI: provide the app checkout/repository containing the missing
   catalog and cart rendering modules, or confirm that this backend checkout is
   the intended source for Monday's test demo.
