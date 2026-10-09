# DQ-01: Canned Tuna / Canned Salmon category correction

**Status:** Draft for review only. Do not merge, apply, backfill, or deploy.
**Scope:** Change `category` only for approved canonical identities
`Canned Tuna` (id 27) and `Canned Salmon` (id 236). The rule requires the
canonical id/name pair to match; a name-only match, mismatched id, or null id
is excluded. Do not change canonical identity, canonical product id, or match
key.

## Candidate counts

**User-supplied read-only queries 1a and 1b, rerun 2026-10-09.** These queries
cover priced rows with the exact approved ID/name pairs, and apply the current
DQ-01 name guard.

| Metric | Rows / count |
|---|---:|
| Candidate-category rows before name guard | 39,605 |
| Rule-selected rows (`would_move`) | 39,165 |
| Selected rows meeting app-eligible definition (`product_price > 0` and `store_id is not null`) | 35,852 |
| Distinct exact product names across selected rows | 571 |
| Retailers represented among selected rows | 139 |
| Rows excluded by current name guard | 440 |
| Rows in other categories left alone | 1,473 |
| Rows already in Pantry | 12,049 |

Candidate-category breakdown:

| Canonical identity | Stored category | Candidate rows | Would move | App-eligible | Guard excluded |
|---|---|---:|---:|---:|---:|
| Canned Tuna (27) | SEAFOOD | 38,632 | 38,192 | 34,898 | 440 |
| Canned Tuna (27) | BEVERAGES | 515 | 515 | 499 | 0 |
| Canned Tuna (27) | DESSERT | 178 | 178 | 178 | 0 |
| Canned Salmon (236) | SEAFOOD | 280 | 280 | 277 | 0 |
| **Total** |  | **39,605** | **39,165** | **35,852** | **440** |

The 1a row sums reconcile with 1b. These are rule-selected row candidates,
not a manual verification that every selected row is a true defect. The
affected rows are cross-retailer (139 retailers) and current priced rows, not
a recent-processing cohort. The SQL contains no August 25 date predicate,
so these figures are not cutoff-specific. They include 35,852 app-eligible
selected rows, not 39,165.

**Cutoff semantics are now confirmed from the prior inventory and user
confirmation:** use `processed_at >= 2026-08-25 00:00:00+00`, inclusive from
midnight UTC, with no upper bound. “Recently processed” is distinct from
current app eligibility (`product_price > 0 and store_id is not null`).
The dry-run SQL has been updated to report both measures separately. The
counts above remain the prior unfiltered current-row output; rerun queries
1a/1b/1c from the updated file before publishing cutoff-specific totals.

The exact product-name values in 1a are grouped by canonical identity,
category, and retailer and must not be summed. Query 1b provides the overall
deduplicated count of 571 distinct exact product names. The supplied 1c
output contains 100 eligible example rows, all `(27, Canned Tuna)` /
`SEAFOOD` / `kroger`, with 32 distinct names; it is a LIMIT 100 sample, not
the complete affected-ID list. The sample is positive-priced and has
non-null store IDs.

An earlier first-guard run (25,756 would move / 22,616 app-eligible / 274
excluded) predates these outputs and is historical only; do not mix those
counts with this run.

## Rule and exclusions

Only approved canonical names in `SEAFOOD`, `BEVERAGES`, or `DESSERT` are
eligible. The name guard excludes sushi/roll/nigiri/poke/salad/sandwich/bakery
items, tuna steaks and fresh/raw/frozen items, and explicit pet products.
It neutralizes the two reviewed retailer-brand phrases before applying those
tokens. Rows in all other categories, raw tuna/salmon identities, and canned
chicken are outside scope.

The trigger rule does not change identity fields. It sets Pantry and the
existing manual-correction metadata only. Existing pet and canned-chicken
rules retain priority.

## Evidence level and gaps

- The disposable local PostgreSQL fixture passes `local_replica_test.sql`.
  It exercises the proposed migration, bounded canary backfill, simulated
  subsequent category writer, identity/match-key preservation, and the
  documented trigger-first/data-second rollback sequence.
- The 82-name local fixture returns 66 eligible names and 16 reviewed
  exclusions, with assertions that the excluded names are exactly the
  reviewed sushi/salad/bowl/steak/fresh-fish cases. Seven distinct name
  variants from the newly supplied 100-row exclusion sample were added to
  exercise prepared tuna bowls/poke, salad rolls, and fresh tuna. Additional
  assertions reject mismatched or missing canonical id/name pairs. This is a
  fixture regression, not a production-data false-positive rate.
- The supplied query-2 exclusion sample contains 100 rows, all with the
  approved `(27, Canned Tuna)` identity and `SEAFOOD` category, across four
  retailers: Walmart 75, Safeway 13, Whole Foods 8, Albertsons 4. All 100
  have positive prices and non-null store IDs (app-eligible by the stated
  definition). It contains 10 exact product-name strings: poke (24 rows),
  Genova tuna bowls (42), StarKist Smart Bowls (9), Zenshi poke bowl (8),
  tuna rolls (15), and fresh tuna (2). This is a capped sample of excluded
  rows, not the total excluded count or unique-product count; store fan-out
  repeats products. These results validate the canonical ID/name pair and
  app-eligibility for the sampled excluded rows only.
- Queries 1a/1b aggregate outputs and a 100-row query-1c eligible-ID sample
  have been supplied. Query 1c's sample is all approved Canned Tuna /
  SEAFOOD / Kroger rows, with 32 exact names; all have positive price and a
  non-null store ID. It is suitable as a small example set, not a complete
  affected-ID export for full replay. That sample predates the updated
  August-25 recent-only filter and must be regenerated.
- The supplied trigger-catalog result shows `zz_enforce_flyer_deals_product_rules`
  enabled for origin sessions (`tgenabled=O`) on BEFORE INSERT and UPDATE OF
  `brand`, `product_name`, `category`, `canonical_product_id`, and
  `canonical_product_name`. Thus an update statement setting `category`
  invokes this trigger. It is listed after other applicable BEFORE triggers
  and before `zzz_set_match_key_v2`; the catalog output also includes AFTER
  triggers, so its `row_number` is a name-sorted display order, not a
  standalone execution-order field. PostgreSQL orders triggers by name among
  triggers that apply to the same event/timing.
- The trigger catalog output lists disabled AFTER INSERT notification
  triggers and enabled retailer/size/match-key triggers. This does not prove
  writer coverage by itself.
- The supplied first result set from `writers_check.sql` returned 21
  definitions (3 explicitly requested writers and 18 catalog candidates).
  The explicitly named bodies show direct `flyer_deals.category` writes in
  `commit_pipeline_enrichment_v1`, `apply_brand_category_ai_batch`, and
  `cleanup_flyer_deals_batch`. The returned `bypass_evidence` field for all
  21 definitions says no searched marker was found
  (`session_replication_role`, `DISABLE TRIGGER`, or `ENABLE TRIGGER`); this
  is source-text evidence only, not proof that a session, caller, dynamic
  SQL, or another function cannot bypass triggers.
- The requested
  `v27_finalize_source_product_incremental(...)` definition is not in the
  21 returned definitions. Returned v27 pipeline candidates include
  identity/finalization functions that update `flyer_deals`; their definitions
  must be reviewed for exact update columns and trigger interactions. Any
  `app.bulk_match_key_migration` setting is not itself evidence that the
  DQ-01 product-rules trigger is disabled or bypassed.
- The local fixture's miniature schema and helper functions are test doubles;
  this is not an integration run on an isolated copy of the real schema.
- The currently recorded aggregate counts are from the pre-cutoff version
  of the dry-run. The updated SQL uses the confirmed inclusive UTC
  `processed_at` lower bound and reports recent processing and current
  app-eligibility separately; those cutoff-filtered results are pending.
- Writer function inspection is partially complete: the three direct
  category-writing routines above have been returned and text-checked for
  bypass markers. Several v27 candidates also update `flyer_deals` identity
  and match-key columns, which are in the product-rule trigger's `UPDATE OF`
  list and can therefore invoke the rule. Need the missing v27 finalizer
  definition (or confirmation it was renamed/removed), a complete review of
  relevant v27 update statements, and bypass validation beyond a simple
  source-text marker search.
- A real-schema isolated integration replay and app-path checks using actual
  affected IDs have not been completed.

## Rollout gate

No production data has been changed. Before any rollout, require a reviewed
final read-only dry run, writer/trigger/bypass review, isolated integration
and app-path evidence, reviewed bounded-canary output, explicit approval,
monitoring criteria, and rollback order: restore the old trigger function
first, then restore snapshotted row values.
