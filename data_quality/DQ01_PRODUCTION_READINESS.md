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

## Isolated environment: recommendation and inputs

**Simplest setup:** one disposable PostgreSQL 16 database loaded with the
current relevant DDL/functions and a small sanitized data fixture, not a full
production clone. A dedicated Supabase staging project is also suitable if
the app-path checks need to run through the deployed client. Keep it separate
from production, use synthetic ZIP/store values where possible, and do not
reuse production credentials. I can prepare and run the replay scripts locally
once that package is supplied.

**I can prepare independently now:** the proposed migration/backfill and
rollback scripts; local PostgreSQL fixture and finalizer replay; exact-name
function/trigger extraction queries; a short checklist of assertions for
identity, category, match key, projections, and excluded examples; and a
read-only reproduction of the Deals browse query. No additional production
access is needed for those tasks.

**Still needed from mentor/data owner or another engineer:**

1. A disposable PostgreSQL 16 database or a sanitized schema/data dump that
   can be restored locally. Include current definitions and required columns,
   constraints, and indexes for `flyer_deals`, `canonical_products_v2`,
   `source_products_v2`, `canonical_offer_shadow_v2`,
   `canonical_source_search_shadow_v27`,
   `canonical_offer_search_projection_v27`, and `match_key_aliases_v2`.
2. Current definitions of the `flyer_deals` product-rules trigger and function,
   its helper functions (`prox_forced_pet_valley_category`,
   `prox_forced_pet_valley_canonical`, `prox_is_canned_chicken`), and
   `v27_finalize_source_product_incremental(bigint)` plus its called helpers
   `v2_upsert_source_search_shadow_v27_range`, `build_match_key_v3`, and
   `v2_norm`. Please include current definitions of the three known direct
   category writers (`commit_pipeline_enrichment_v1`,
   `apply_brand_category_ai_batch`, `cleanup_flyer_deals_batch`) and their
   relevant trigger/bypass context. If exercising the whole worker rather
   than finalization alone, also include
   `v27_classify_leased_source_product`.
3. A small stable-ID sample (about 5–10 rows): at least two intended moves
   (tuna and salmon), two name-guard exclusions (such as sushi/prepared and
   fresh/raw), one out-of-scope category, and one mismatched identity if
   available. Include linked source-product IDs and the necessary recent
   shadow/projection rows for finalizer replay. Preserve product name, category
   and metadata, canonical ID/name, match key/version, retailer key, price,
   store ID, ZIP (or synthetic non-empty ZIP), product size/base amount/unit,
   and `created_at`/`processed_at`. Omit customer/personal data and secrets.
4. For actual app query-path checks, either a staging app connected to this
   isolated database plus its normal test access, or the current Deals, See
   All, and Cart Finder query/filter definitions and sample before/after
   results for the selected IDs. No frontend override is requested.

The mentor/data owner’s concrete action is to arrange items 1–3 (or have an
authorized engineer produce the sanitized dump and definitions); item 4 is
needed only for actual app-environment verification. Do not send connection
credentials in chat. A local sanitized dump can be transferred through the
approved secure channel.

## Remaining steps and estimate

| Step | Owner | Estimate | Target |
|---|---|---:|---|
| Arrange isolated database/dump, current definitions, and sanitized stable-ID rows | Mentor/data owner or authorized engineer | About 1–2h of their time | By Tue Oct 20 to retain Oct 23 target |
| Verify supplied DDL/functions, replay correction and bounded canary, run finalizer, assert identity/category/match/projection and exclusions | Pragya | 4–5h | Fri Oct 23, if inputs arrive by Tue Oct 20 |
| Verify Deals, See All, Cart Finder query results before/after using actual IDs; capture evidence | Pragya; app/data owner supplies staging/query access | 2–3h | Fri Oct 23, if app inputs/access arrive by Tue Oct 20 |
| Consolidate test evidence and update PR readiness status | Pragya | About 1h | Fri Oct 23 |
| Review canary bounds, monitoring, rollback snapshot/order, and deployment approval | Mentor/data owner | ~1h review | Before any deployment |

**This week:** committed availability is Thu Oct 15 (3h) and Fri Oct 16 (2h).
By Friday, this linked readiness note, corrected count semantics, the saved
finalizer replay, and local test results will be reviewable. If isolated
schema/rows are not provided, real-schema and app checks will remain
unverified and continue the following week; production remains unchanged.

**Starting Oct 19:** planned availability is 15 hours per week across Tuesday,
Thursday, and Friday. With the required database package by Tue Oct 20 and app
access/query evidence by then, I estimate 7–9 hours of work and completion by
Fri Oct 23. If an input arrives later, completion is within two scheduled
working days after all dependencies are available; I will confirm the calendar
date on receipt. Production remains unchanged pending review and approval.
