# DQ-02: Canonical category fallback (diagnostic stage)

**Status:** Investigating. No production migration, trigger, or backfill approved.

## Observed live data (2026-10-19)
- 542,969 `flyer_deals` rows with `category = 'CATEGORY_UNCERTAIN'`.
- 202,339 of those rows have non-null `canonical_product_id`. This is **not** the safe-backfill count.
- 316,554 have a non-null `brand_category_ai_last_error`.
- `brand_category_ai_attempts` was NULL on 530,072 uncertain rows and zero on 12,897. This does not support the hypothesis of three-or-more retries exhausting on those rows.
- Example identity counts: Chocolate Candy 28,117; Dried Fruit 16,660; Coffee Creamer 11,200; Frozen Pizza 7,592; Frozen Waffles 6,690.
- A heavier full-table eligibility join timed out. Scope future audits to bounded ID ranges.

## Root-cause investigation
1. Identify writers setting `CATEGORY_UNCERTAIN` (AI worker, RPCs, data enrichment, triggers, migrations). Capture exact files and writer priority.
2. Trace how/when `canonical_product_id` and `canonical_product_name` are populated relative to `category`.
3. Determine retry/error semantics; zero or NULL attempt counters must not be labeled exhausted retries without evidence.
4. Confirm canonical category vocabulary and any manual, PET, Valley Fresh, canned-chicken, and DQ-01 exceptions.
5. Establish unique acceptance cases for correctly matched, stale/mismatched identity, null/invalid category, explicit override, conflict, and concurrent updates.

## Proposed eligibility gate (NOT YET APPROVED)
Correct only when:
- stored category is exactly `CATEGORY_UNCERTAIN`;
- canonical ID resolves to an active canonical product;
- stored canonical name matches the linked canonical row after explicitly reviewed normalization;
- canonical category is a valid non-placeholder value;
- no manual override, unresolved category conflict, or higher-priority product rule prohibits fallback;
- updates preserve canonical ID/name, match key, retailer, price, ZIP, size, timestamps unrelated to this correction.

Set `category_source = 'canonical_fallback'` for auditability. Confidence and flag semantics must be checked against current consumers before writing.

## Next deliverables
- Map of all category writers and their order.
- Read-only bounded eligibility/exception report, grouped by canonical category, retailer, and error reason.
- Separate, locally tested PostgreSQL 16 fixture with at least 12 positive/negative cases and DQ-01 regression tests.
- Draft forward-only migration, dry-run batch backfill, rollback and canary procedure, all **unapplied**.
- Reviewer sign-off before any production DDL/DML.

## Independence
Use `prox_dq02_local` created fresh, not the populated DQ-01 database. Do not merge PR #17 into this branch without explicitly designing integration regression tests.
