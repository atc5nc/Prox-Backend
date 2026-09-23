"""Deterministic category rules shared by ingestion and backfills.

These rules intentionally classify product form before ingredient keywords:
``canned chicken`` is pantry food, while ``chicken breast`` is meat.
"""

from __future__ import annotations

import re


CATEGORY_PANTRY = "PANTRY"
CATEGORY_MEAT = "MEAT"
CATEGORY_SEAFOOD = "SEAFOOD"
CATEGORY_DELI_PREPARED = "DELI_PREPARED"
CATEGORY_SNACKS = "SNACKS"

_CANNED_RE = re.compile(
    r"\b(can|canned|tin|tinned|pouch|pouched)\b|\b(in water|in oil)\b", re.I
)
_PREPARED_RE = re.compile(
    r"\b(prepared|ready[- ]to[- ]eat|parmesan[- ]crusted|tortellini|"
    r"enchilada|casserole|lasagna|lasagne|nugget|tender|patty|"
    r"salad kit|meal kit)\b",
    re.I,
)
_PACKAGED_SNACK_RE = re.compile(
    r"\b(fruit bar|granola bar|protein bar|mushroom chocolate|chocolate bar)\b",
    re.I,
)
_BABY_FOOD_RE = re.compile(r"\b(baby food|infant food)\b", re.I)
_RAW_CHICKEN_RE = re.compile(
    r"\b(chicken breast|chicken thigh|chicken leg|chicken wing|"
    r"whole chicken|drumstick|drumsticks|chicken tenderloin)\b",
    re.I,
)
_RAW_FISH_RE = re.compile(
    r"\b(fillet|fillets|salmon|cod|tilapia|trout|halibut|"
    r"catfish|mahi mahi|swordfish|fresh fish|fish fillet)\b",
    re.I,
)


def classify_product(product_name: str | None, canonical_name: str | None = None) -> str | None:
    """Return a canonical department for a product, or ``None`` if unknown."""
    text = " ".join(
        part.strip() for part in (product_name or "", canonical_name or "") if part
    )
    if not text:
        return None

    # Form takes precedence over the ingredient so packaged proteins do not
    # inherit the raw-meat department.
    if _CANNED_RE.search(text):
        return CATEGORY_PANTRY
    if _BABY_FOOD_RE.search(text):
        return CATEGORY_PANTRY
    if _PREPARED_RE.search(text):
        return CATEGORY_DELI_PREPARED
    if _PACKAGED_SNACK_RE.search(text):
        return CATEGORY_SNACKS
    if _RAW_CHICKEN_RE.search(text):
        return CATEGORY_MEAT
    if _RAW_FISH_RE.search(text):
        return CATEGORY_SEAFOOD
    return None
