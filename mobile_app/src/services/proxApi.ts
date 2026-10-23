const BASE_URL = "https://prox-api-production.up.railway.app";

export interface SearchResult {
  canonical_product_name: string;
  category: string | null;
  brand: string | null;
  retailer_count: number;
  min_price: number;
  max_price: number;
  avg_price: number;
  match_key: string;
  image_link: string | null;
}

export interface BestDeal {
  canonical_product_name: string;
  brand: string | null;
  match_key: string;
  best_price: number;
  all_time_low: number;
  median_price: number;
  pct_below_median: number;
  price_status: string;
  composite_score: number;
  retailer_count: number;
  days_tracked: number;
  absolute_savings: number;
}

export interface NearbyStore {
  retailer: string;
  product_price: number;
  coupon_detail: string | null;
  store_id: number;
  address: string | null;
  city: string | null;
  state: string | null;
  distance_miles: number | null;
}

export interface DealDetails {
  match_key: string;
  canonical_name: string | null;
  category: string | null;
  brand: string | null;
  display_size: string | null;
  coupon_detail: string | null;
  image_url: string | null;
  price_summary: { min: number; max: number; median: number };
  nearby_stores: NearbyStore[];
  all_retailer_count: number;
}

export interface PriceHistoryPoint {
  date: string;
  min_price: number;
  max_price: number;
}

export interface PriceHistory {
  match_key: string;
  days: number;
  data_points: number;
  all_time_low: number;
  all_time_high: number;
  history: PriceHistoryPoint[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export async function searchProducts(
  q: string,
  opts: { limit?: number; zipCode?: string; radiusMiles?: number } = {}
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, limit: String(opts.limit ?? 10) });
  if (opts.zipCode) params.set("zip_code", opts.zipCode);
  if (opts.radiusMiles) params.set("radius_miles", String(opts.radiusMiles));
  const data = await get<{ results: SearchResult[] }>(`/search?${params}`);
  return data.results;
}

export async function getBestDeals(
  opts: { limit?: number; minSavings?: number; minRetailers?: number } = {}
): Promise<BestDeal[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 20),
    min_savings: String(opts.minSavings ?? 10),
    min_retailers: String(opts.minRetailers ?? 2),
  });
  const data = await get<{ deals: BestDeal[] }>(`/best-deals?${params}`);
  return data.deals;
}

export async function getDealDetails(
  matchKey: string,
  opts: { zipCode?: string; radiusMiles?: number } = {}
): Promise<DealDetails> {
  const params = new URLSearchParams();
  if (opts.zipCode) params.set("zip_code", opts.zipCode);
  if (opts.radiusMiles) params.set("radius_miles", String(opts.radiusMiles));
  const query = params.toString() ? `?${params}` : "";
  return get<DealDetails>(`/deals/${encodeURIComponent(matchKey)}${query}`);
}

export async function getPriceHistory(
  matchKey: string,
  days = 90
): Promise<PriceHistory> {
  return get<PriceHistory>(
    `/deals/${encodeURIComponent(matchKey)}/history?days=${days}`
  );
}

export function formatSavingsLabel(deal: BestDeal | DealDetails & { pct_below_median?: number }): string {
  if ("pct_below_median" in deal && deal.pct_below_median) {
    return `${Math.round(deal.pct_below_median)}% below average`;
  }
  if ("price_status" in deal && deal.price_status === "all_time_low") {
    return "All-time low";
  }
  return "Good deal";
}
