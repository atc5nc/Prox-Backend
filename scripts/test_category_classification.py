"""Regression tests for canonical product form and category rules."""

import unittest

from scoring.category_classifier import classify_product
from scoring.product_normalizer import build_canonical_name


class CategoryClassificationTests(unittest.TestCase):
    def test_canned_proteins_are_pantry(self):
        self.assertEqual(
            classify_product("Canned Chicken Breast in Water, 12 oz"), "PANTRY"
        )
        self.assertEqual(classify_product("Canned Tuna"), "PANTRY")
        self.assertEqual(
            classify_product(
                "Canned Chicken Dog Food",
                existing_category="PANTRY",
            ),
            "PET",
        )

    def test_raw_proteins_keep_distinct_departments(self):
        self.assertEqual(classify_product("Fresh Chicken Breast"), "MEAT")
        self.assertEqual(classify_product("Fresh Salmon Fillet"), "SEAFOOD")

    def test_weak_packaging_and_product_words_do_not_override_category(self):
        self.assertEqual(
            classify_product("Chicken Pouch", existing_category="MEAT"),
            "MEAT",
        )
        self.assertEqual(
            classify_product("Salmon Fillet", existing_category="PANTRY"),
            "PANTRY",
        )
        self.assertEqual(
            classify_product("Chicken Patty", existing_category="FROZEN"),
            "FROZEN",
        )
        self.assertEqual(
            classify_product("Salad Kit", existing_category="PRODUCE"),
            "PRODUCE",
        )

    def test_prepared_dishes_are_not_raw_ingredients(self):
        self.assertEqual(
            classify_product("Parmesan-Crusted Chicken"), "DELI_PREPARED"
        )
        self.assertEqual(
            classify_product("Spinach-and-Cheese Tortellini"), "DELI_PREPARED"
        )
        self.assertEqual(
            classify_product("Uncooked Cheese Tortellini", existing_category="PANTRY"),
            "PANTRY",
        )
        self.assertEqual(
            classify_product(
                "Uncooked Spinach-and-Cheese Tortellini",
                existing_category="PANTRY",
            ),
            "PANTRY",
        )
        self.assertEqual(
            classify_product("Frozen Chicken Meal", existing_category="FROZEN"),
            "FROZEN",
        )
        self.assertEqual(
            classify_product(
                "Frozen Chicken Lasagna",
                existing_category="DELI_PREPARED",
            ),
            "FROZEN",
        )

    def test_packaged_food_does_not_inherit_produce(self):
        self.assertEqual(classify_product("Fruit Bar"), "SNACKS")
        self.assertEqual(classify_product("Baby Food Pouch"), "BABY")
        self.assertEqual(classify_product("Mushroom Chocolate"), "SNACKS")

    def test_canned_and_raw_canonical_identities_are_distinct(self):
        canned = build_canonical_name("Brand Canned Chicken Breast", "brand")
        raw = build_canonical_name("Brand Chicken Breast", "brand")
        self.assertNotEqual(canned, raw)
        self.assertTrue(canned.startswith("canned "))
        self.assertEqual(raw, "chicken breast")

    def test_category_and_canonical_name_stay_correct_together(self):
        cases = [
            (
                "Canned Chicken Dog Food",
                "PANTRY",
                "PET",
                "canned chicken dog food",
            ),
            (
                "Frozen Chicken Lasagna",
                "DELI_PREPARED",
                "FROZEN",
                "frozen chicken lasagna",
            ),
            (
                "Uncooked Cheese Tortellini",
                "PANTRY",
                "PANTRY",
                "uncooked cheese tortellini",
            ),
            (
                "Uncooked Spinach-and-Cheese Tortellini",
                "DAIRY",
                "DAIRY",
                "uncooked spinach and cheese tortellini",
            ),
        ]
        for product_name, existing_category, expected_category, expected_canonical in cases:
            canonical = build_canonical_name(product_name, None)
            self.assertEqual(canonical, expected_canonical)
            self.assertEqual(
                classify_product(
                    product_name,
                    canonical,
                    existing_category=existing_category,
                ),
                expected_category,
            )

    def test_uncooked_tortellini_never_gets_prepared_prefix(self):
        self.assertEqual(
            build_canonical_name("Uncooked Cheese Tortellini", None),
            "uncooked cheese tortellini",
        )
        self.assertEqual(
            classify_product(
                "Uncooked Cheese Tortellini",
                build_canonical_name("Uncooked Cheese Tortellini", None),
                existing_category="PANTRY",
            ),
            "PANTRY",
        )


if __name__ == "__main__":
    unittest.main()
