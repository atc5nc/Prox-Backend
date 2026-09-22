// PORTED FROM src/lib/searchDeals.ts — DO NOT EDIT DIRECTLY.
//
// `src/lib/searchDeals.ts` imports the browser Supabase client, so it cannot be
// copied wholesale into Deno. This module extracts the two pure functions the
// staple grid depends on — `levenshtein` and `searchTermMatchesProduct` — with
// their bodies unchanged. `searchTermMatchesProduct` pulls in nothing else from
// that file, so the extraction is complete rather than approximate.
//
// To change behavior, edit src/lib/searchDeals.ts and mirror the change here.
// The parity suite in this directory fails if the two ever drift.

import { normalizeText } from "./productCategoryUtils.ts";
import {
  isExcludedByKeyword,
  isSearchTermPrimaryNoun,
} from "./searchExclusions.ts";

// --- Fuzzy matching utilities ---

export const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

// --- Strict search-term matching for the results pipeline ---

/**
 * Stricter search-term matching for the single-item results pipeline.
 *
 * Uses exact/prefix matching for short tokens (< 5 chars) and allows
 * fuzzy matching only for longer tokens where edit distance 1 is less
 * ambiguous. This prevents false positives like "mild" → "milk" while
 * still handling legitimate morphological variants.
 */
export function searchTermMatchesProduct(
  productName: string,
  searchTerm: string
): boolean {
  // Phase 1: negative keyword blocking
  if (isExcludedByKeyword(searchTerm, productName)) return false;

  // Phase 2: subordinating modifier check
  // Only apply when search term is a single token (multi-word searches like
  // "chicken soup" are intentional and should not be blocked)
  if (searchTerm.trim().split(/\s+/).length === 1 && !isSearchTermPrimaryNoun(searchTerm, productName)) return false;

  const normProduct = normalizeText(productName);
  const productTokens = normProduct.split(/\s+/);
  const searchTokens = searchTerm.toLowerCase().trim().split(/\s+/);

  return searchTokens.every((st) => {
    if (st.length === 0) return true;

    return productTokens.some((pt) => {
      // 1. Exact word match
      if (pt === st) return true;

      // 2. Prefix match — handles plurals and morphological variants
      //    e.g., "milk" → "milks", "strawberry" → "strawberries",
      //    "egg" → "eggs", "chicken" → "chickens"
      const shorter = st.length <= pt.length ? st : pt;
      const longer = st.length <= pt.length ? pt : st;
      if (
        shorter.length >= 3 &&
        longer.startsWith(shorter) &&
        shorter.length / longer.length >= 0.6
      ) {
        return true;
      }

      // 3. Fuzzy match — only for tokens with 5+ characters where
      //    edit distance 1 is less ambiguous.
      //    Skipped for short tokens (< 5 chars) to prevent false matches
      //    like "milk" ↔ "mild", "milk" ↔ "silk", etc.
      if (st.length >= 5 && pt.length >= 5) {
        const dist = levenshtein(pt, st);
        if (dist <= 1) return true;
      }

      return false;
    });
  });
}
