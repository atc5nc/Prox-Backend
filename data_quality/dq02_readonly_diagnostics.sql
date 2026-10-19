-- DQ-02 read-only discovery, no mutation.
-- Run statements individually with a conservative statement_timeout on a replica or off-peak.
-- Do not infer eligibility solely from a canonical_product_id.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '20s';
-- Current footprint
SELECT count(*) AS uncertain_rows,
 count(*) FILTER (WHERE canonical_product_id IS NOT NULL) AS assigned_canonical,
 count(*) FILTER (WHERE brand_category_ai_last_error IS NOT NULL) AS errors_present
FROM public.flyer_deals WHERE category='CATEGORY_UNCERTAIN';
COMMIT;
-- Separate potentially slower queries below, use one at a time and stop if they time out.
-- Canonical identity and manual override checks (do not use these as update statements):
-- SELECT f.id,f.product_name,f.category,f.category_source,f.canonical_product_id,
--        f.canonical_product_name,cp.canonical_name,cp.category AS proposed_category,
--        cp.is_active,f.category_conflicts,f.category_flag,
--        f.brand_category_ai_attempts,f.brand_category_ai_last_error
-- FROM public.flyer_deals f JOIN public.canonical_products_v2 cp ON cp.id=f.canonical_product_id
-- WHERE f.category='CATEGORY_UNCERTAIN' AND f.id BETWEEN :min_id AND :max_id
-- ORDER BY f.id LIMIT 200;
-- Guard candidate: active cp, nonblank non-placeholder cp.category,
-- exact ID/name agreement, no explicit manual override, no unresolved conflict,
-- and review highest-precedence product-specific exceptions.
