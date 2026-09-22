import {
  normalizePreferredRetailers,
} from "../_shared/staples/preferredRetailers.ts";
import type { StaplePriceCell } from "../_shared/staples/stapleGrid.ts";

/**
 * App-relative CTA target, matching the push deep-link convention.
 *
 * The email itself links to the `open-app` function rather than this path
 * directly; `open-app` rebuilds it as either a native-scheme link or a website
 * URL depending on the device. Kept as the single source of the screen name
 * and attribution tag.
 */
export const WEEKLY_STAPLES_DEEP_LINK_PATH = "/deals?source=weekly-staples-email";

/**
 * Local hour in America/Los_Angeles when the email goes out. The cron job runs
 * every 15 minutes on Wednesdays; this is the gate that turns those attempts
 * into one 11:00-11:59 AM PT send.
 */
export const SEND_WINDOW_HOUR_PT = 11;

const SEND_WEEKDAY = "Wed";
const TIME_ZONE_PT = "America/Los_Angeles";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** One `public.waitlist` row as loaded by the sender. */
export type WaitlistRecipientRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  zip_code: string | null;
  preferred_retailers: string[] | null;
};

/** A recipient that passed every pre-pricing eligibility check. */
export type EligibleRecipient = {
  waitlistId: string;
  email: string;
  firstName: string | null;
  zipCode: string;
  /** Canonical preferred retailers, saved order, capped at 3. */
  retailers: string[];
};

export type SkipCounts = {
  noCompleteBasket: number;
  noZip: number;
  noRetailers: number;
  alreadySent: number;
  unsubscribed: number;
  invalidEmail: number;
};

export type RunError = {
  waitlistId: string | null;
  message: string;
};

export type RunSummary = {
  processed: number;
  sent: number;
  skipped: SkipCounts;
  errors: RunError[];
};

export function createSkipCounts(): SkipCounts {
  return {
    noCompleteBasket: 0,
    noZip: 0,
    noRetailers: 0,
    alreadySent: 0,
    unsubscribed: 0,
    invalidEmail: 0,
  };
}

type LocalTimeParts = {
  hour: number;
  minute: number;
  weekday: string;
};

function getLocalTimeParts(date: Date, timeZone: string): LocalTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    hour: Number.parseInt(readPart("hour"), 10),
    minute: Number.parseInt(readPart("minute"), 10),
    weekday: readPart("weekday"),
  };
}

/**
 * True during the Wednesday send hour in Pacific time.
 *
 * Anchoring to PT local time rather than a fixed UTC hour is what makes the
 * schedule DST-proof: the cron fires on UTC Wednesdays either way, and this
 * check moves the actual send with the offset.
 */
export function isWithinSendWindow(now: Date): boolean {
  const local = getLocalTimeParts(now, TIME_ZONE_PT);
  return local.weekday === SEND_WEEKDAY && local.hour === SEND_WINDOW_HOUR_PT;
}

/**
 * Sort waitlist rows into recipients to price and reasons to skip.
 *
 * `disabledCount` is passed separately because opted-out rows are counted with
 * a cheap id-only query rather than loaded in full — they never need pricing.
 */
export function classifyRecipients(params: {
  rows: WaitlistRecipientRow[];
  alreadySentWaitlistIds: Set<string>;
  disabledCount: number;
}): { eligible: EligibleRecipient[]; skipped: SkipCounts } {
  const skipped = createSkipCounts();
  skipped.unsubscribed = params.disabledCount;

  const eligible: EligibleRecipient[] = [];

  for (const row of params.rows) {
    const email = (row.email ?? "").trim();
    if (!email) {
      skipped.invalidEmail += 1;
      continue;
    }

    const zipCode = (row.zip_code ?? "").trim();
    if (!/^\d{5}$/.test(zipCode)) {
      skipped.noZip += 1;
      continue;
    }

    const retailers = normalizePreferredRetailers(row.preferred_retailers);
    if (retailers.length === 0) {
      skipped.noRetailers += 1;
      continue;
    }

    // Checked after the cheap filters so the counters describe why a row was
    // genuinely ineligible, not just that it was already handled.
    if (params.alreadySentWaitlistIds.has(row.id)) {
      skipped.alreadySent += 1;
      continue;
    }

    eligible.push({
      waitlistId: row.id,
      email,
      firstName: (row.first_name ?? "").trim() || null,
      zipCode,
      retailers,
    });
  }

  return { eligible, skipped };
}

/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * Each recipient costs one RPC round trip plus one Resend call, so a little
 * concurrency matters, but the RPC is the expensive half and we are a
 * background job — modest is the right setting.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (limit <= 0) {
    throw new Error("Concurrency limit must be greater than zero.");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      results[index] = await worker(items[index], index);
    }
  }

  const runnerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: runnerCount }, () => runNext()));

  return results;
}

/** `$3.49` — the same formatting the chart uses on screen. */
export function formatUsd(value: number): string {
  return USD.format(value);
}

/**
 * Turn the RPC's comparison unit into the email's per-unit suffix:
 * "per lb" → "/ lb", "per 8 oz" → "/ 8 oz". Returns an empty string when the
 * row carried no normalized unit, so the price renders bare rather than with a
 * unit we cannot vouch for.
 */
export function formatComparisonUnit(label: string | null): string {
  if (!label) return "";

  const trimmed = label.trim();
  if (!trimmed) return "";

  const withoutPrefix = trimmed.replace(/^per\s+/i, "");
  return `/ ${withoutPrefix}`;
}

/** "August 19, 2026" from a `YYYY-MM-DD` period key. */
export function formatWeekOfLabel(periodKey: string): string {
  const [year, month, day] = periodKey.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid period key: ${periodKey}`);
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** One flyer_deals row from the product-image lookup query. */
export type ProductImageRow = {
  product_name: string | null;
  product_price: number | null;
  retailer: string | null;
  image_link: string | null;
  created_at: string | null;
};

/** Key for the per-cell image map: staple and canonical retailer. */
export function productImageKey(staple: string, retailer: string): string {
  return `${staple}\u0000${retailer}`;
}

const HTTP_URL_PATTERN = /^https?:\/\//i;

/**
 * Match each grid cell to its flyer photo from a batch of flyer_deals rows.
 *
 * A cell's product is identified by (product_name, product_price); the source
 * retailer breaks ties when two stores advertise an identically named and
 * priced product, and newest wins after that. Only http(s) links are accepted —
 * anything else renders as the staple's illustration fallback instead.
 */
export function chooseProductImages(
  cells: Array<{ staple: string; retailer: string; cell: StaplePriceCell }>,
  rows: ProductImageRow[]
): Map<string, string> {
  const images = new Map<string, string>();

  for (const entry of cells) {
    const candidates = rows.filter(
      (row) =>
        row.product_name === entry.cell.productName &&
        row.product_price != null &&
        Math.abs(Number(row.product_price) - entry.cell.packagePrice) < 0.005 &&
        typeof row.image_link === "string" &&
        HTTP_URL_PATTERN.test(row.image_link)
    );

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const aRetailerMatch = a.retailer === entry.cell.sourceRetailer ? 0 : 1;
      const bRetailerMatch = b.retailer === entry.cell.sourceRetailer ? 0 : 1;
      if (aRetailerMatch !== bRetailerMatch) return aRetailerMatch - bRetailerMatch;
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

    images.set(
      productImageKey(entry.staple, entry.retailer),
      candidates[0].image_link as string
    );
  }

  return images;
}
