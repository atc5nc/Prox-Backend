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
            classify_product("Frozen Chicken Meal", existing_category="FROZEN"),
            "FROZEN",
        )

    def test_packaged_food_does_not_inherit_produce(self):
        self.assertEqual(classify_product("Fruit Bar"), "SNACKS")
        self.assertEqual(classify_product("Baby Food Pouch"), "PANTRY")
        self.assertEqual(classify_product("Mushroom Chocolate"), "SNACKS")

    def test_canned_and_raw_canonical_identities_are_distinct(self):
        canned = build_canonical_name("Brand Canned Chicken Breast", "brand")
        raw = build_canonical_name("Brand Chicken Breast", "brand")
        self.assertNotEqual(canned, raw)
        self.assertTrue(canned.startswith("canned "))
        self.assertEqual(raw, "chicken breast")


if __name__ == "__main__":
    unittest.main()
