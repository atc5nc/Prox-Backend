// PORTED VERBATIM FROM src/lib/searchExclusions.ts — DO NOT EDIT DIRECTLY.
//
// Supabase edge functions run on Deno and cannot import from src/, so the
// weekly staples email keeps a byte-identical copy of the app's selection
// logic: Negative-keyword and subordinating-modifier tables backing
// `searchTermMatchesProduct` (e.g. battered/tender chicken never counts as
// Chicken Breast).
//
// To change behavior, edit src/lib/searchExclusions.ts and re-copy the file below. The
// parity suite in this directory fails if the two ever drift.
//
// ---- BEGIN PORTED SOURCE ----
export const SEARCH_EXCLUSIONS: Record<string, string[]> = {
  chicken: [
    "soup", "broth", "stock", "stew", "pet", "dog", "cat", "food", "flavor",
    "flavored", "treat", "snack", "nugget", "tender", "strip", "patty",
    "bouillon", "powder", "mix", "ramen", "noodle",
    "nuggets", "tenders", "sausage", "sausages", "curry", "skewer", "skewers",
    "dumpling", "dumplings", "potsticker", "potstickers", "meatball", "meatballs",
    "shu", "mai", "bites", "cutlet", "cutlets", "schnitzel", "marsala",
    "piccata", "parmesan", "tikka", "masala", "teriyaki", "satay", "enchilada",
    "enchiladas", "burrito", "burritos", "taco", "tacos", "quesadilla",
  ],
  beef: [
    "jerky", "dog", "pet", "cat", "bouillon", "ramen", "soup", "broth",
    "stock", "powder", "mix", "flavor", "flavored",
  ],
  tuna: ["cat", "pet", "dog", "flavor", "flavored", "food"],
  pork: ["rinds", "pet", "dog", "cat", "flavor", "flavored", "soup", "broth"],
  salmon: ["cat", "pet", "dog", "flavor", "flavored", "food"],
  turkey: ["dog", "cat", "pet", "flavor", "flavored", "food", "treat"],
};

export const SUBORDINATING_MODIFIERS = new Set([
  "soup", "broth", "stock", "stew", "chowder", "bisque", "bouillon", "base",
  "flavor", "flavored", "seasoned", "style", "infused",
  "food", "treat", "snack", "chew",
  "powder", "mix", "sauce", "gravy", "paste", "spread",
  "nuggets", "tenders", "sausage", "sausages", "curry", "skewer", "skewers",
  "dumpling", "dumplings", "potsticker", "potstickers", "meatball", "meatballs",
  "bites", "cutlet", "cutlets", "schnitzel", "marsala", "piccata", "parmesan",
  "tikka", "masala", "teriyaki", "satay", "enchilada", "enchiladas", "burrito",
  "burritos", "taco", "tacos", "quesadilla", "bowl", "bowls", "sandwich",
  "sandwiches", "wrap", "wraps", "salad", "salads",
]);

export function isExcludedByKeyword(
  searchTerm: string,
  productName: string
): boolean {
  const searchKey = searchTerm.toLowerCase().trim();
  const exclusions = SEARCH_EXCLUSIONS[searchKey];
  if (!exclusions) return false;
  const productTokens = productName.toLowerCase().split(/\s+/);
  return productTokens.some((t) => exclusions.includes(t));
}

export function isSearchTermPrimaryNoun(
  searchTerm: string,
  productName: string
): boolean {
  const searchTokens = new Set(searchTerm.toLowerCase().trim().split(/\s+/));
  const productTokens = productName.toLowerCase().split(/\s+/);
  const extraTokens = productTokens.filter((t) => !searchTokens.has(t));
  return !extraTokens.some((t) => SUBORDINATING_MODIFIERS.has(t));
}
