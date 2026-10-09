# DQ-01: Canned Tuna / Canned Salmon category correction

**Status:** Draft for review only. Do not merge, apply, backfill, or deploy.
**Scope:** Change `category` only for approved canonical identities
`Canned Tuna` (id 27) and `Canned Salmon` (id 236). The rule requires the
canonical id/name pair to match; a name-only match, mismatched id, or null id
is excluded. Do not change canonical identity, canonical product id, or match
key.

## Candidate counts

The provided first-guard run is candidate evidence, not the final dry run:
25,756 rows would move, of which 22,616 are app-eligible; 274 were excluded.
Review recorded 24 deliberate exclusions (prepared tuna products) and 250
brand-name false negatives, including Fresh Thyme Market (27) and Bowl &
Basket (12); those brand phrases are neutralized in the current guard.
Safe Catch Ahi steaks (211) remain excluded conservatively.

The final overall totals (`would move`, app-eligible, distinct exact product
names, retailers, excluded by guard, and left alone in other categories) are
not yet populated from the final dry-run queries. Do not infer or add the
brand-review counts to claim a final total. Current code/output files contain
an unfinished, over-broad general inventory query; its results are not
evidence for this scoped DQ-01 count.

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
- The pasted output contains query-2 sample rows, not the aggregate outputs
  from queries 1a/1b or the full output from query 1c. Final totals and the
  full eligible-ID sample remain outstanding.
- The local fixture's miniature schema and helper functions are test doubles;
  this is not an integration run on an isolated copy of the real schema.
- First-guard dry-run numbers are from read-only production queries, as
  reported by the requester. Final dry-run figures remain blank pending
  rerunning queries 1b/1c with the final guard.
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
