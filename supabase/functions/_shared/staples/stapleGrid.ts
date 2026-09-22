// PORTED FROM src/lib/fetchStaplePrices.ts and
// src/components/deals/WeeklyStaplesChart.tsx — DO NOT EDIT DIRECTLY.
//
// Both sources import browser-only modules (the Supabase client, React), so the
// selection and basket math they perform are extracted here as pure functions
// over rows the caller already fetched from `get_staple_prices_v1`. Given the
// same RPC rows, this produces the same cells and the same winner the /deals
// screen shows. The parity suite in this directory asserts that against the
// originals.
//
// Two deliberate differences from the screen, both in what the email chooses to
// show rather than in how anything is priced:
//
//  1. Complete baskets only. `WeeklyStaplesChart` also ranks incomplete
//     retailers so missing coverage stays visible on screen; an email has no
//     such affordance, so `buildCompleteBaskets` drops anything short of all
//     five staples.
//  2. Columns can reach past the user's preferred retailers. See
//     `selectEmailRetailers` — the screen only ever shows preferred stores, so
//     a shopper whose stores are missing a staple gets a one-column "comparison"
//     that hides a cheaper option down the street.
//
// The winner is still chosen by the identical rule — cheapest complete basket —
// and every price is the one the app would show for that retailer.

import { isProductRelevantForSearch } from "./productCategoryUtils.ts";
import { searchTermMatchesProduct } from "./searchTermMatch.ts";
import { toCanonicalRetailer } from "./preferredRetailers.ts";

/** The five staples the /deals "Cheapest For You" comparison uses. */
export const STAPLE_NAMES = [
  "Chicken Breast",
  "Ground Beef",
  "Large Eggs",
  "Whole Milk",
  "Cheddar Cheese",
] as const;

export const COMPLETE_STAPLE_COUNT = STAPLE_NAMES.length;

/**
 * 10 miles in meters — `milesToMeters(10)` from src/lib/fetchStaplePrices.ts,
 * which is the radius the /deals screen defaults to.
 */
export const STAPLE_RADIUS_METERS = 16093;

/** One row as returned by `public.get_staple_prices_v1`. */
export type StaplePriceRpcRow = {
  staple: string | null;
  retailer: string | null;
  product_name: string | null;
  product_price: number | null;
  product_size: string | null;
  zip_code?: string | null;
  distance_m?: number | null;
  base_amount?: number | null;
  base_unit?: string | null;
  comparison_price?: number | null;
  comparison_unit?: string | null;
};

/**
 * The cheapest matching candidate for one (staple, retailer) cell.
 *
 * `price` is the normalized comparison price used for cross-retailer math;
 * `packagePrice`/`packageSize` stay on the cell so the email can show what the
 * shopper would actually pay at the shelf.
 */
export type StaplePriceCell = {
  price: number;
  packagePrice: number;
  packageSize: string | null;
  comparisonLabel: string | null;
  productName: string;
  /** Raw retailer name as the RPC returned it — flyer_deals stores this form. */
  sourceRetailer: string;
  /** Source zip the RPC priced this candidate from, for indexed lookups. */
  sourceZip: string | null;
};

/** Staple name → canonical retailer → cheapest matching cell. */
export type StaplePriceGrid = Map<string, Map<string, StaplePriceCell>>;

/**
 * Reduce `get_staple_prices_v1` rows to one cheapest normalized cell per
 * (staple, canonical retailer).
 *
 * Mirrors the loop in `fetchStaplePrices`, including the two client-side
 * relevance guards that run after the RPC and the compatibility fallback to
 * package price when a row carries no normalized comparison price.
 */
export function buildStaplePriceGrid(
  stapleNames: readonly string[],
  rows: StaplePriceRpcRow[]
): StaplePriceGrid {
  const priceGrid: StaplePriceGrid = new Map();

  for (const staple of stapleNames) {
    priceGrid.set(staple, new Map());
  }

  for (const row of rows) {
    if (!row.staple || !row.product_name || !row.retailer) continue;
    if (row.product_price == null || row.product_price <= 0) continue;

    const cells = priceGrid.get(row.staple);
    if (!cells) continue;

    if (
      !searchTermMatchesProduct(row.product_name, row.staple) ||
      !isProductRelevantForSearch(row.product_name, row.product_size, row.staple)
    ) {
      continue;
    }

    // Compatibility fallback protects clients during a staggered database
    // deploy, but production get_staple_prices_v1 supplies this field.
    const comparisonPrice =
      typeof row.comparison_price === "number" && row.comparison_price > 0
        ? row.comparison_price
        : row.product_price;

    const retailerKey = toCanonicalRetailer(row.retailer) ?? row.retailer;
    const existing = cells.get(retailerKey);
    if (existing === undefined || comparisonPrice < existing.price) {
      cells.set(retailerKey, {
        price: comparisonPrice,
        packagePrice: row.product_price,
        packageSize: row.product_size ?? null,
        comparisonLabel: row.comparison_unit ?? null,
        productName: row.product_name,
        sourceRetailer: row.retailer,
        sourceZip: row.zip_code ?? null,
      });
    }
  }

  return priceGrid;
}

/** A retailer that priced all five staples, with its normalized basket total. */
export type CompleteBasket = {
  retailer: string;
  total: number;
  cells: StaplePriceCell[];
};

/**
 * Retailers with a price for every staple, cheapest normalized basket first.
 *
 * `WeeklyStaplesChart` computes the same aggregate and applies the same
 * all-five rule before naming a cheapest retailer; the email simply discards
 * the incomplete retailers instead of ranking them below the complete ones.
 */
export function buildCompleteBaskets(
  stapleNames: readonly string[],
  retailers: readonly string[],
  grid: StaplePriceGrid
): CompleteBasket[] {
  const baskets: CompleteBasket[] = [];

  for (const retailer of retailers) {
    const cells: StaplePriceCell[] = [];
    let total = 0;

    for (const staple of stapleNames) {
      const cell = grid.get(staple)?.get(retailer);
      if (!cell) break;
      cells.push(cell);
      total += cell.price;
    }

    if (cells.length !== stapleNames.length) continue;

    baskets.push({ retailer, total, cells });
  }

  return baskets.sort((a, b) => a.total - b.total);
}

/** Winner, runner-up, and the savings pill amount for a set of baskets. */
export type BasketComparison = {
  winner: CompleteBasket;
  runnerUp: CompleteBasket | null;
  savingsVsRunnerUp: number;
};

/**
 * The cheapest complete basket and what it saves against the next cheapest.
 *
 * Returns null when no retailer has all five staples — the caller's signal to
 * skip this recipient for the week rather than send a partial comparison.
 */
export function compareBaskets(
  baskets: CompleteBasket[]
): BasketComparison | null {
  // Sorted defensively: callers pass columns in display order (preferred
  // first), which is not cheapest-first, and the winner must be the cheapest
  // basket regardless of how the columns happen to be arranged.
  const ranked = [...baskets].sort((a, b) => a.total - b.total);

  const winner = ranked[0];
  if (!winner) return null;

  const runnerUp = ranked[1] ?? null;

  return {
    winner,
    runnerUp,
    savingsVsRunnerUp: runnerUp ? Math.max(0, runnerUp.total - winner.total) : 0,
  };
}

/** One rendered row of the email's price grid. */
export type StapleGridRow = {
  staple: string;
  cells: Array<{
    retailer: string;
    cell: StaplePriceCell;
    isLowest: boolean;
  }>;
};

/**
 * Row-per-staple shape for the email table, with the cheapest normalized price
 * in each row flagged for highlighting.
 *
 * Only complete retailers are passed in, so every cell resolves — the email
 * never renders an empty cell or an "n/5" coverage note.
 */
export function buildStapleGridRows(
  stapleNames: readonly string[],
  retailers: readonly string[],
  grid: StaplePriceGrid
): StapleGridRow[] {
  const rows: StapleGridRow[] = [];

  for (const staple of stapleNames) {
    const cells = retailers.flatMap((retailer) => {
      const cell = grid.get(staple)?.get(retailer);
      return cell ? [{ retailer, cell, isLowest: false }] : [];
    });

    if (cells.length === 0) continue;

    const lowest = Math.min(...cells.map((entry) => entry.cell.price));

    rows.push({
      staple,
      cells: cells.map((entry) => ({
        ...entry,
        isLowest: entry.cell.price === lowest,
      })),
    });
  }

  return rows;
}

/** Every canonical retailer that priced at least one staple in the grid. */
export function collectGridRetailers(grid: StaplePriceGrid): string[] {
  const retailers = new Set<string>();

  for (const cells of grid.values()) {
    for (const retailer of cells.keys()) {
      retailers.add(retailer);
    }
  }

  return [...retailers];
}

/** One column of the email's price grid. */
export type EmailRetailerColumn = {
  retailer: string;
  basket: CompleteBasket;
  /** False for a store backfilled from the area rather than chosen by the user. */
  isPreferred: boolean;
};

/** Same 3-column cap the /deals grid uses (MAX_STAPLE_RETAILERS). */
export const MAX_EMAIL_RETAILERS = 3;

/**
 * Choose the retailers the email compares.
 *
 * The user's own stores come first, in their saved order, so the email still
 * answers "what do my stores cost this week". Any remaining column slots are
 * backfilled with the cheapest other complete baskets nearby.
 *
 * This is a deliberate widening of what /deals shows on screen. The screen only
 * ever renders preferred retailers, so a shopper whose stores are missing a
 * staple sees a one-column comparison — which is not a comparison at all, and
 * hides that a nearby store may be far cheaper. Per-retailer prices are still
 * exactly what the app would show; only the column set is wider.
 *
 * Retailers without a complete basket are never eligible, preferred or not.
 */
export function selectEmailRetailers(params: {
  preferred: readonly string[];
  /** Complete baskets across every retailer in the grid. */
  baskets: CompleteBasket[];
  limit?: number;
}): EmailRetailerColumn[] {
  const limit = params.limit ?? MAX_EMAIL_RETAILERS;
  if (limit <= 0) return [];

  const basketByRetailer = new Map(
    params.baskets.map((basket) => [basket.retailer, basket])
  );

  const columns: EmailRetailerColumn[] = [];
  const claimed = new Set<string>();

  for (const retailer of params.preferred) {
    const basket = basketByRetailer.get(retailer);
    if (!basket || claimed.has(retailer)) continue;

    columns.push({ retailer, basket, isPreferred: true });
    claimed.add(retailer);

    if (columns.length === limit) return columns;
  }

  const backfill = [...params.baskets]
    .filter((basket) => !claimed.has(basket.retailer))
    .sort((a, b) => a.total - b.total);

  for (const basket of backfill) {
    columns.push({
      retailer: basket.retailer,
      basket,
      isPreferred: false,
    });

    if (columns.length === limit) break;
  }

  return columns;
}
