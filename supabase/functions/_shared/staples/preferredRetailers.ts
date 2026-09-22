// PORTED VERBATIM FROM src/lib/preferredRetailers.ts — DO NOT EDIT DIRECTLY.
//
// Supabase edge functions run on Deno and cannot import from src/, so the
// weekly staples email keeps a byte-identical copy of the app's selection
// logic: `toCanonicalRetailer` / `normalizePreferredRetailers` — retailer name
// canonicalization used to key the price grid and cap preferred retailers.
//
// To change behavior, edit src/lib/preferredRetailers.ts and re-copy the file below. The
// parity suite in this directory fails if the two ever drift.
//
// ---- BEGIN PORTED SOURCE ----
export const GROCERY_STORES = [
  "Albertsons",
  "Aldi",
  "Amazon Fresh",
  "Costco",
  "Food Lion",
  "H-E-B",
  "Kroger",
  "Meijer",
  "Northgate",
  "Publix",
  "Ralphs",
  "Sam's Club",
  "Safeway",
  "El Super",
  "Superior Grocers",
  "Smart & Final",
  "Sprouts Market",
  "Target",
  "Trader Joe's",
  "Vallarta",
  "Vons",
  "Wegmans",
  "Walmart",
  "Whole Foods",
  "Other",
] as const;

export type GroceryStore = (typeof GROCERY_STORES)[number];

const normalizeRetailerKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const RETAILER_ALIASES: Record<string, GroceryStore> = {
  "costco wholesale": "Costco",
  "h e b": "H-E-B",
  heb: "H-E-B",
  "sam s club": "Sam's Club",
  sams: "Sam's Club",
  sprouts: "Sprouts Market",
  "sprouts farmers market": "Sprouts Market",
  "smart and final": "Smart & Final",
  "smart and final extra": "Smart & Final",
  "smart and final extra!": "Smart & Final",
  "kroger delivery now": "Kroger",
  "ralphs delivery now": "Ralphs",
  "whole foods market": "Whole Foods",
  "amazon fresh market": "Amazon Fresh",
};

const NORMALIZED_RETAILER_LOOKUP = new Map<string, GroceryStore>(
  GROCERY_STORES.map((store) => [normalizeRetailerKey(store), store])
);

export const toCanonicalRetailer = (value: string): GroceryStore | null => {
  const normalized = normalizeRetailerKey(value);
  if (!normalized) return null;

  // 1. Exact alias match
  const aliasMatch = RETAILER_ALIASES[normalized];
  if (aliasMatch) return aliasMatch;

  // 2. Exact canonical lookup
  const exactMatch = NORMALIZED_RETAILER_LOOKUP.get(normalized);
  if (exactMatch) return exactMatch;

  // 3. Prefix match — e.g. "kroger marketplace" → "Kroger"
  for (const [key, store] of NORMALIZED_RETAILER_LOOKUP) {
    if (normalized.startsWith(key + " ")) return store;
  }

  return null;
};

export const normalizePreferredRetailers = (
  retailers: unknown,
  maxRetailers = 3
): GroceryStore[] => {
  if (!Array.isArray(retailers)) return [];

  const normalized: GroceryStore[] = [];

  for (const retailer of retailers) {
    if (typeof retailer !== "string") continue;

    const canonical = toCanonicalRetailer(retailer);
    if (!canonical || normalized.includes(canonical)) continue;

    normalized.push(canonical);

    if (normalized.length === maxRetailers) {
      break;
    }
  }

  return normalized;
};
