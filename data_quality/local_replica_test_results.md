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
- Guard regression: **75** product-name fixtures checked; **66** accepted;
  **9** reviewed conservative/identity exclusions; **0 unexpected
  exclusions**. Mismatched and missing canonical ID/name pairs were also
  rejected. This validates the rule on this fixture only, not a
  production-wide false-positive rate.
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

This fixture does **not** substitute for the outstanding final production
read-only dry run, writer/trigger/bypass review, real-schema isolated
integration replay, or Deals/See All/Cart Finder application-path evidence.
No production migration, backfill, RPC, or deployment was run.
