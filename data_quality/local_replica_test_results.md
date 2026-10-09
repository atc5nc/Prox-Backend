# DQ-01 local replica fixture results

**Environment:** Disposable local PostgreSQL 16 cluster bound to
`127.0.0.1:55439`. The test runner creates a unique temporary data directory,
loads only `local_replica_setup.sql` fixture rows, runs the proposed SQL, and
stops/removes that local cluster. No production connection string is read.

**Result:** Passed.

- Read-only dry-run query parsed and ran on 8 local fixture rows:
  6 rows in the candidate categories, 4 rows selected by the name guard,
  4 app-eligible fixture rows, 4 distinct fixture names, 1 fixture retailer,
  and 2 excluded fixture rows.
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
ID export. These SQL outputs contain no August 25 date filter. The latest
attachment labeled query 2 repeated the excluded-row sample. A separate
trigger-catalog result confirms the proposed product-rules trigger is enabled
for origin sessions and includes category in its UPDATE OF columns. It is
still not the writer-function definitions or bypass evidence, which remain
outstanding for production review.
