# Category issue inventory snapshot

Status: read-only snapshot for review; production was not modified.

This snapshot was collected from 5,000 rows returned through the Supabase
REST API. It is not the final full-table count. "Currently app-eligible"
means `product_price > 0` and a non-null `store_id`. "Recent" means
`processed_at >= 2026-08-25`.

| Rank | Issue | Recommended change | Current affected count |
| --- | --- | --- | --- |
| 1 | Canned chicken/fish outside `PANTRY` | Require explicit packaged-protein evidence, classify as `PANTRY`, and preserve canned/fresh canonical identity separation. | 37 currently app-eligible; 38 recent |
| 2 | Raw fish outside `SEAFOOD` | Require raw/fresh/wild-caught/farm-raised/portion evidence, exclude prepared, pet, baby-food, and shelf-stable products, and preserve existing category when uncertain. | 9 currently app-eligible; 9 recent |
| 3 | Raw chicken outside `MEAT` | Classify confident raw chicken cuts as `MEAT`; exclude deli, cooked, breaded, nugget, tender, patty, meal, and pet products. | 1 currently app-eligible; 2 recent |
| 4 | Prepared dishes in raw departments | Use explicit dish/form combinations only and map those products to the existing `DELI_PREPARED` taxonomy value. | 0 currently app-eligible in this snapshot |

The counts intentionally exclude broad keyword false positives, including
pet food, baby food, prepared products, brand names, and unrelated phrases.
The full ranked inventory must be rerun with
[`category_issue_inventory.sql`](./category_issue_inventory.sql) before a
production backfill.

## Before/after evidence

| Input | Previous risk | Proposed result |
| --- | --- | --- |
| `Canned Chicken Breast in Water` | Generic chicken identity/category could place it with fresh meat. | `canned chicken breast`; `PANTRY` |
| `Brand Chicken Breast` | Could merge with canned chicken. | `chicken breast`; `MEAT` |
| `Fresh Salmon Fillet` | Broad fish terms could produce an unrelated category. | `SEAFOOD` when confident |
| `Parmesan-Crusted Chicken` | Could be treated as raw chicken. | `DELI_PREPARED` |
| `Uncooked Cheese Tortellini` | Must not become prepared food from the word tortellini alone. | Preserve existing category |
| `Chicken Pouch` | Pouch alone is insufficient evidence. | Preserve existing category |
| `Fruit Bar` | Could appear under `PRODUCE`. | `SNACKS` |
| `Baby Food Pouch` | Could appear under `PRODUCE`. | `PANTRY` |

## Validation

`PYTHONPATH=. python3 scripts/test_category_classification.py`

```text
......
Ran 6 tests
OK
```

The existing deterministic matching script also completed its read-only
50,796-row run after the missing dependencies and local CA bundle were
resolved:

```text
Rows with a match key:  45,130 (88.8%)
Rows without key:       5,666
Cross-retailer groups:  1,698
Rows in those groups:   9,471 (18.6%)
```

That matching report is a separate identity-quality result, not a category
defect count.
