# DQ-01: Canned Tuna / Canned Salmon category correction

**Status:** Draft for review only. Do not merge, apply, backfill, or deploy.
**Scope:** Change `category` only for approved canonical identities
`Canned Tuna` (id 27) and `Canned Salmon` (id 236). The rule requires the
canonical id/name pair to match; a name-only match, mismatched id, or null id
is excluded. Do not change canonical identity, canonical product id, or match
key.

## Candidate counts

**User-supplied read-only queries 1a and 1b with cutoff, rerun 2026-10-09.**
These queries cover priced rows with exact approved ID/name pairs and apply
the current DQ-01 name guard. Recent means
`processed_at >= 2026-08-25 00:00:00+00` (inclusive UTC, no upper bound).

| Metric | Rows / count |
|---|---:|
| Candidate-category rows before name guard | 39,606 |
| Candidate rows processed on/after cutoff | 39,606 |
| Rule-selected rows (`would_move`) | 39,166 |
| Selected rows processed on/after cutoff | 39,166 |
| Selected rows with positive price and non-null `store_id` (proxy only; actual app eligibility unverified) | 35,853 |
| Selected rows recent and meeting that price/store proxy | 35,853 |
| Distinct exact product names across selected rows | 571 |
| Retailers represented among selected rows | 139 |
| Rows excluded by current name guard | 440 |
| Excluded rows processed on/after cutoff | 440 |
| Rows in other categories left alone | 1,473 |
| Rows already in Pantry | 12,049 |

Candidate-category breakdown:

| Canonical identity | Stored category | Candidate rows | Recent candidates | Would move | Recent would move | Positive price + store ID proxy | Recent + proxy | Guard excluded |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Canned Tuna (27) | SEAFOOD | 38,633 | 38,633 | 38,193 | 38,193 | 34,899 | 34,899 | 440 |
| Canned Tuna (27) | BEVERAGES | 515 | 515 | 515 | 515 | 499 | 499 | 0 |
| Canned Tuna (27) | DESSERT | 178 | 178 | 178 | 178 | 178 | 178 | 0 |
| Canned Salmon (236) | SEAFOOD | 280 | 280 | 280 | 280 | 277 | 277 | 0 |
| **Total** |  | **39,606** | **39,606** | **39,166** | **39,166** | **35,853** | **35,853** | **440** |

The 1a row sums reconcile with 1b. All candidate rows in this output were
processed on/after the agreed August 25 UTC cutoff. The 35,853 count means
only `product_price > 0 AND store_id IS NOT NULL` at query time. This is not
verified app eligibility: the app query also filters by ZIP and non-null
price, and other app paths may apply additional predicates. These are
rule-selected row candidates, not manual verification that every selected
row is a true defect.

The supplied 1c sample has 100 unique recent IDs meeting the positive-price
and non-null-store proxy: 99 Canned Tuna and 1 Canned Salmon, all in SEAFOOD,
across six retailers (ALDI 19,
Costco 13, Sam's Club 4, Smart & Final 11, Target 48, Walgreens 5), with 43
exact names. Timestamps range from Oct 8 03:22 to 03:43 UTC. It is a LIMIT
100 sample, not the complete 39,166 selected row IDs.

Earlier unfiltered counts (39,165 selected / 35,852 positive-price-and-store
proxy rows) and the first-guard run (25,756 selected / 22,616 proxy rows /
274 excluded) are historical only and superseded by this cutoff-filtered
output.

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
  It exercises the proposed migration, bounded canary backfill, a simulated
  subsequent category writer, the saved `v27_finalize_source_product_incremental`
  body, identity/match-key projection, and trigger-first/data-second rollback.
  Only `v2_upsert_source_search_shadow_v27_range` is stubbed; the classifier
  RPC and full production schema are not exercised.
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
  have positive prices and non-null store IDs (meeting the price/store proxy,
  not verified app eligibility). It contains 10 exact product-name strings: poke (24 rows),
  Genova tuna bowls (42), StarKist Smart Bowls (9), Zenshi poke bowl (8),
  tuna rolls (15), and fresh tuna (2). This is a capped sample of excluded
  rows, not the total excluded count or unique-product count; store fan-out
  repeats products. These results validate the canonical ID/name pair and
  the identity pair and price/store proxy for the sampled excluded rows only.
- Cutoff-filtered queries 1a/1b and a 100-row query-1c recent price/store-proxy
  sample have been supplied. Query 1c is an example subset, not the complete
  affected-ID export for full replay.
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
- `v27_finalize_source_product_incremental(p_source_product_id bigint)` was
  explicitly retrieved by exact name in the earlier RPC-definition query and
  saved at `data_quality/v27_finalize.txt` in the inventory worktree. Its
  absence from the category-writer discovery output was due to that query's
  category-write filter, not evidence the function was missing. The finalizer
  calls the range shadow upsert, refreshes recent offer shadow/projection rows,
  creates match-key aliases, and updates `flyer_deals` identity/source/match
  key/version for changed rows. That UPDATE includes identity fields covered
  by the supplied product-rule trigger's UPDATE OF list, so the category rule
  is invoked on that finalizer update. It does not directly set `category`.
- `writers_check.sql` now includes a read-only exact-name lookup for the
  finalizer before the category-writer discovery query. Re-run it against the
  isolated database and inspect the full current definition and called helper
  definitions; the saved prior definition is not proof of current live schema.
- Any `app.bulk_match_key_migration` setting is not itself evidence that the
  DQ-01 product-rules trigger is disabled or bypassed.
- The local fixture's miniature schema and helper functions are test doubles;
  the finalizer replay is not an integration run on an isolated copy of the
  real schema.
- Current aggregate counts use the confirmed inclusive UTC `processed_at`
  lower bound and report recent processing separately from the positive-price
  and non-null-store proxy.
- Writer function inspection is partially complete: the three direct
  category-writing routines above have been returned and text-checked for
  bypass markers. Several v27 candidates also update `flyer_deals` identity
  and match-key columns, which are in the product-rule trigger's `UPDATE OF`
  list and can therefore invoke the rule. Bypass validation beyond a simple
  source-text marker search remains open.
- The Deals browse query in `mobile_app/src/pages/deals/fetchFlyerDeals.ts`
  selects the stored `category`, filters by ZIP and non-null price, sorts by
  price, and limits to 2,000; it does not filter by `store_id` or category.
  The page's query returns the category as data; no category-based grouping
  was found in the reviewed Deals components. The fixture mirrors the query's
  ZIP/non-null-price predicate and checks the corrected category, but it does
  not run the app or establish app-wide eligibility. No frontend override was
  added.
- Real-schema isolated replay and app-path checks using actual affected IDs
  have not been completed.

## Rollout gate

No production data has been changed. Before any rollout, require a reviewed
final read-only dry run, writer/trigger/bypass review, isolated integration
and app-path evidence, reviewed bounded-canary output, explicit approval,
monitoring criteria, and rollback order: restore the old trigger function
first, then restore snapshotted row values.
