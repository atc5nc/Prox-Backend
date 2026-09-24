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

_PACKAGED_PROTEIN_RE = re.compile(
    r"\b(canned|tinned|in water|in oil)\b"
    r"|\b(?:\d+\s+)?cans?\b"
    r"|\bshelf[- ]stable\b",
    re.I,
)
_PREPARED_RE = re.compile(
    r"\bready[- ]to[- ]eat\b"
    r"|\bparmesan[- ]crusted\s+(?:chicken|fish|salmon)\b"
    r"|\bspinach[- ]and[- ]cheese\s+tortellini\b"
    r"|\b(?:chicken|beef|fish)\s+(?:enchiladas?|casserole|lasagna|lasagne)\b"
    r"|\b(?:deli|hot|rotisserie)\s+(?:meal|dish|chicken|pasta)\b",
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
_PROCESSED_PROTEIN_RE = re.compile(
    r"\b(rotisserie|deli|cooked|grilled|breaded|smoked|"
    r"nuggets?|tenders?|tenderloins?|patties?|skewers?|"
    r"burgers?|meal|prepared|ready[- ]to[- ]eat|"
    r"baby food|cat food|dog food)\b",
    re.I,
)


def classify_product(
    product_name: str | None,
    canonical_name: str | None = None,
    existing_category: str | None = None,
) -> str | None:
    """Return a confident department, otherwise preserve the existing value."""
    text = " ".join(
        part.strip() for part in (product_name or "", canonical_name or "") if part
    )
    if not text:
        return None

    # Form takes precedence over the ingredient so packaged proteins do not
    # inherit the raw-meat department.
    protein_text = re.search(
        r"\b(chicken|tuna|salmon|fish|sardines?|anchovies?)\b", text, re.I
    )
    if protein_text and _PACKAGED_PROTEIN_RE.search(text):
        return CATEGORY_PANTRY
    if _BABY_FOOD_RE.search(text):
        return CATEGORY_PANTRY
    if _PREPARED_RE.search(text):
        return CATEGORY_DELI_PREPARED
    if _PACKAGED_SNACK_RE.search(text):
        return CATEGORY_SNACKS
    if _RAW_CHICKEN_RE.search(text) and not _PROCESSED_PROTEIN_RE.search(text):
        return CATEGORY_MEAT
    if (
        _RAW_FISH_RE.search(text)
        and re.search(
            r"\b(raw|fresh|wild[- ]caught|farm[- ]raised|portion|portions)\b",
            text,
            re.I,
        )
        and not _PROCESSED_PROTEIN_RE.search(text)
    ):
        return CATEGORY_SEAFOOD
    return existing_category
