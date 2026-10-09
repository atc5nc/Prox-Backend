# DQ-01 local replica fixture results

**Environment:** Disposable local PostgreSQL 16 cluster bound to
`127.0.0.1:55439`. The test runner creates a unique temporary data directory,
loads only `local_replica_setup.sql` fixture rows, runs the proposed SQL, and
stops/removes that local cluster. No production connection string is read.

**Result:** Passed.

- Read-only dry-run query parsed and ran on 8 local fixture rows:
  6 rows in the candidate categories, 4 rows selected by the name guard,
  4 currently app-eligible fixture rows, 4 distinct fixture names, 1 fixture
  retailer, and 2 excluded fixture rows. Under the agreed cutoff,
  5 candidates / 3 selected / 3 app-eligible / 2 excluded fixture rows were
  recent; these local values only validate query behavior.
- Cutoff boundary assertions passed: a row at `2026-08-25 00:00:00+00` is
  included and a row one second before is excluded. Local display timezone
  differs, confirming the explicit UTC `timestamptz` comparison is used.
- Guard regression: **82** product-name fixtures checked; **66** accepted;
  **16** reviewed conservative/identity exclusions; **0 unexpected
  exclusions**. Seven distinct name variants from the supplied 100-row
  excluded-name sample are covered. Mismatched and missing canonical ID/name
  pairs were also rejected. This validates the rule on this fixture only,
  not a production-wide false-positive rate.
- Bounded local canary updated exactly 4 fixture rows. `category` and its
  manual-correction metadata changed; canonical id/name and match key
  assertions verified unchanged.
- A simulated subsequent category write to `SEAFOOD` was corrected back to
  `PANTRY` by the trigger.
- Rollback test restored the old trigger function first, then restored the
  four captured category/metadata values.
- Writer and compatible-category catalog queries parsed locally. Their empty
  local results say nothing about production writer coverage. The fixture
  showed the product-rules trigger enabled for origin sessions (`tgenabled=O`,
  `tgtype=23`); this is not evidence of production trigger state or order.

This fixture does **not** substitute for the production writer/trigger/bypass
review, real-schema isolated integration replay, or Deals/See All/Cart Finder
application-path evidence. No production migration, backfill, RPC, or
deployment was run.

The user-supplied query-2 excluded-name sample contained 100 rows, all with
the approved `(27, Canned Tuna)` identity and `SEAFOOD` category, across four
retailers (Walmart 75, Safeway 13, Whole Foods 8, Albertsons 4). All 100 have
positive prices and non-null store IDs. The sample has 10 exact product names;
it is capped row evidence, not the total exclusion count or distinct-product
count, because store fan-out repeats products. It validates identity and
eligibility for these sampled excluded rows only.

Subsequent user-supplied query 1a/1b results report 39,605 candidate-category
rows, 39,165 selected, 35,852 app-eligible, 571 distinct exact names, 139
retailers, 440 guard exclusions, 1,473 other-category rows left alone, and
12,049 already-Pantry rows. Query 1c returned 100 eligible examples (all
approved Canned Tuna / SEAFOOD rows from Kroger, 32 exact names), not a full
ID export. These counts are from the pre-cutoff query version. The agreed
recent-processing definition is now explicitly
`processed_at >= 2026-08-25 00:00:00+00` (inclusive UTC, no upper bound).
The updated read-only query reports recent processing separately from
current app eligibility; cutoff-specific production outputs are pending. The latest
attachment labeled query 2 repeated the excluded-row sample. A separate
trigger-catalog result confirms the proposed product-rules trigger is enabled
for origin sessions and includes category in its UPDATE OF columns. It is
complemented by a first-query writer result containing 21 function
definitions. Three named routines directly write `flyer_deals.category`:
`commit_pipeline_enrichment_v1`, `apply_brand_category_ai_batch`, and
`cleanup_flyer_deals_batch`. No searched bypass marker was found in those
returned bodies; no searched marker appears in the `bypass_evidence` field
for any of the 21 definitions. This source-text scan is not proof of no
bypass. Several v27 candidates update identity/match-key columns included in
the product-rule trigger's `UPDATE OF` list. The requested
`v27_finalize_source_product_incremental` definition was absent, and its
replacement/rename status, complete v27 update review, and bypass validation
beyond text search remain open.
