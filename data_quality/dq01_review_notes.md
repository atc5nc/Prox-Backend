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
  affected-ID export for full replay. The production writer/trigger
  inspection output remains outstanding; the latest attachment labeled "2"
  contains the excluded-row sample again, not writer definitions/catalog
  results.
- The local fixture's miniature schema and helper functions are test doubles;
  this is not an integration run on an isolated copy of the real schema.
- Current dry-run aggregates are user-supplied outputs from queries 1a/1b.
  These totals are not August-25-cutoff counts because the SQL has no date
  filter.
- The RPC definition output shows the v2.7 finalizer updates identity and
  match-key fields on `flyer_deals`, not `category`. Writer coverage still
  requires results for `commit_pipeline_enrichment_v1`,
  `apply_brand_category_ai_batch`, and `cleanup_flyer_deals_batch`, plus
  enabled trigger attachment and bypass review.
- A real-schema isolated integration replay and app-path checks using actual
  affected IDs have not been completed.

## Rollout gate

No production data has been changed. Before any rollout, require a reviewed
final read-only dry run, writer/trigger/bypass review, isolated integration
and app-path evidence, reviewed bounded-canary output, explicit approval,
monitoring criteria, and rollback order: restore the old trigger function
first, then restore snapshotted row values.
