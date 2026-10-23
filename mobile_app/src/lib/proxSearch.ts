import { searchProducts } from "@/services/proxApi";
import type { SearchSingleItemResult, DealMenuItem } from "@/lib/searchDeals";
import type { OptimizedCartItem } from "@/components/cart-optimizer/types";

export async function proxSearchSingleItem(params: {
  searchTerm: string;
  zipCode: string;
  radiusMiles: number;
  minDate: string;
}): Promise<SearchSingleItemResult> {
  const results = await searchProducts(params.searchTerm, {
    limit: 20,
    zipCode: params.zipCode,
    radiusMiles: params.radiusMiles,
  });

  const items: OptimizedCartItem[] = [];
  const menuItems: DealMenuItem[] = [];

  for (const r of results) {
    if (!r.canonical_product_name || r.min_price <= 0) continue;
    const retailer = `${r.retailer_count} stores`;
    items.push({
      searched_item:     params.searchTerm,
      product_name:      r.canonical_product_name,
      product_price:     r.min_price,
      retailer,
      zip_code:          params.zipCode,
      distance_m:        0,
      product_size:      null,
      image_link:        r.image_link ?? null,
      retailer_logo_url: null,
      brand:             null,
      category:          r.category ?? null,
      is_store_brand:    null,
      is_organic:        null,
      base_amount:       null,
      base_unit:         null,
      match_key:         r.match_key ?? null,
    });
    menuItems.push({
      retailer,
      zip_code:           params.zipCode,
      searched_item_name: params.searchTerm,
      product_name:       r.canonical_product_name,
      product_price:      r.min_price,
      distance_m:         0,
      product_size:       null,
      image_link:         r.image_link ?? null,
      retailer_logo_url:  null,
      match_key:          r.match_key ?? null,
    });
  }

  return { results: items, rawMenu: menuItems, filteredMenu: menuItems };
}
