# DQ-01 production readiness

**Status: review only; not approved to deploy.** No DQ-01 correction,
backfill, or worker replay has run in production.

## Live today vs. proposed

- **Already live:** The supplied production catalog output shows
  `zz_enforce_flyer_deals_product_rules` enabled for origin sessions. It
  contains existing product rules; the canned-fish correction is not live.
- **Proposed:** Set category to `PANTRY` only for exact canonical pairs
  `(27, Canned Tuna)` and `(236, Canned Salmon)` currently in `SEAFOOD`,
  `BEVERAGES`, or `DESSERT`. Preserve canonical identity and match key.
  Exclude reviewed prepared, sushi, pet, fresh/raw/frozen, sandwich, bakery,
  bowl, and steak cases. The Aug 25 inclusive UTC query selected 39,166 rows.
  Of those, 35,853 have positive price and non-null `store_id`; this is only a
  **price/store proxy, not verified app eligibility**. Counts are
  rule-selected rows, not manual adjudication of every defect.

## Validation completed

- [Local fixture results](./local_replica_test_results.md): disposable
  PostgreSQL 16 fixture passed for the correction, guard cases, simulated
  category writer, saved `v27_finalize_source_product_incremental` body,
  and rollback. Its range-upsert helper is stubbed; this is not a replay on
  the real schema.
- Supplied read-only writer output identified three direct category writers;
  supplied trigger output confirms category updates invoke the enabled
  product-rules trigger. The exact-name v27 finalizer was previously retrieved
  and replayed from its saved definition locally. Current isolated-database
  definitions and trigger-bypass behavior remain unverified.
- The Deals browse fetch selects stored `category` and filters by ZIP and
  non-null price. A local SQL assertion mirrors those query predicates and
  confirms the corrected sample as `PANTRY` and excluded sushi as `SEAFOOD`.
  This is not a rendered app check. Actual-ID app results for Deals, See All,
  and Cart Finder remain unverified.

## Readiness and recommendation

Draft SQL, supplied counts, local regression, and rollback proposal are ready
for review. **Recommend no production change yet.** First require isolated
real-schema replay, actual app/query-path before/after checks, and reviewed
canary/rollback approval. No frontend override is in scope.

## Remaining steps

| Step | Owner | Estimate | Target |
|---|---|---:|---|
| Provide isolated nonproduction schema/database, current function/trigger definitions, and sanitized affected/excluded rows with stable IDs | Mentor/data owner | External prerequisite; ~1–2h to package | Before integration replay |
| Refresh exact-name writer/trigger review; replay correction and bounded canary; run relevant finalizer | Pragya, once inputs arrive | 3–4h | Fri Oct 23, contingent on inputs |
| Verify Deals, See All, and Cart Finder query results before/after with actual IDs | Pragya; app/data owner if app environment access is required | 2–3h | Fri Oct 23, contingent on inputs |
| Review canary bounds, monitoring, rollback snapshot/order, and deployment approval | Mentor/data owner | ~1h review | Before any deployment |

**This week:** committed availability is Thu Oct 15 (3h) and Fri Oct 16 (2h).
By Friday, this linked readiness note, corrected count semantics, the saved
finalizer replay, and local test results will be reviewable. If isolated
schema/rows are not provided, real-schema and app checks will remain
unverified and continue the following week; production remains unchanged.

**Starting Oct 19:** planned availability is 15 hours per week across Tuesday,
Thursday, and Friday. Oct 23 is the integration target only if the required
isolated inputs arrive in time; otherwise set a revised target when they do.
