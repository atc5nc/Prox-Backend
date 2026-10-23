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

- The complete private client checkout is accessible at
  `atc5nc/mobile_app`, local branch `agents/category-misplacement-guards`.
- `src/pages/deals/categories.ts` maps `DELI_PREPARED` to the existing
  "Deli + Prepared Foods" section; it is not a new taxonomy value.
- `src/pages/deals/catalog.ts` groups landing Deals by stored category and
  now applies narrow product-form guards for screenshot examples (packaged
  bars/chocolate, baby food, canned protein, specific prepared dishes) and
  pet/frozen exclusions.
- `src/pages/deals/sectionContinuation.ts` applies the same resolved category
  when filtering category See All pages. Since those pages fetch by stored DB
  category, a misclassified item is removed from the incorrect page but may
  not appear in its correct See All page until the stored category or RPC
  candidate scope is corrected.
- Cart Finder uses category carried on deal results for product-category
  gating. The saved/manual Grocery List itself groups by retailer, not
  department. Backend search results now project category and the app adapter
  carries it into cart items.
- Client tests exercise the actual Deals landing and See All derivation
  functions. No production endpoint or data was changed. A visual local
  before/after capture remains outstanding.

## Taxonomy finding

`DELI_PREPARED` is a supported taxonomy key and maps to "Deli + Prepared
Foods" in the app. The classifier uses explicit dish/form combinations only;
frozen dishes stay `FROZEN`, and uncooked tortellini retains its existing
category and canonical form.

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

1. Full counts: run the inventory SQL in a read-only SQL Editor or database
   connection that can complete the full-table scan. The 5,000-row REST
   snapshot is not the final cross-retailer ranking.
2. RPC behavior: current SQL Editor access has not been verified. Needed:
   read-only access to this project's Supabase SQL Editor, or the output of
   [`v27_rpc_definition_query.sql`](./v27_rpc_definition_query.sql) run there.
   Do not invoke worker/classifier RPCs; they may write.
3. Local visual evidence: run the client against local/test fixtures and
   capture Deals and Cart Finder before/after. No production endpoint is
   required for this verification.
