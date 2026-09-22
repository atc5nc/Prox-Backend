// PORTED FROM src/lib/dateUtils.ts — DO NOT EDIT DIRECTLY.
//
// The app reads the current deal cycle from the wall clock. A cron-driven email
// has to be reproducible (debug `now` overrides, retries inside the same send
// window), so the port takes the reference instant as an argument and defaults
// to the same `new Date()` the app uses. Called with the same instant, this
// returns exactly what src/lib/dateUtils.ts returns — the parity suite in this
// directory asserts that against a frozen clock.
//
// To change behavior, edit src/lib/dateUtils.ts and mirror the change here.

/**
 * Returns an ISO 8601 timestamp representing the current grocery deal cycle's
 * Wednesday at midnight in America/Los_Angeles (PST/PDT), suitable for passing
 * to a Supabase `timestamptz` parameter.
 *
 * Grocery flyer cycles reset on Wednesdays:
 *  - Wednesday -> use today at 00:00 LA time.
 *  - Thursday-Tuesday -> use the most recent Wednesday.
 *
 * Deals from a cycle are eligible through 11:59:59 PM Tuesday. At Wednesday
 * 00:00 the cutoff advances to the new Wednesday immediately.
 */
export function getLastWednesdayPST(now: Date = new Date()): string {
  // Determine the current date in America/Los_Angeles
  const laFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = laFormatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)!.value;

  const laYear = Number(get("year"));
  const laMonth = Number(get("month"));
  const laDay = Number(get("day"));

  // Build a Date object for "today" in LA calendar terms (using UTC helpers
  // so we don't get shifted by the local machine's timezone).
  const todayLA = new Date(Date.UTC(laYear, laMonth - 1, laDay));
  const dayOfWeek = todayLA.getUTCDay(); // 0 = Sun, 3 = Wed

  // Days since the current cycle's Wednesday. Wednesday itself is zero so the
  // cutoff advances immediately at Wednesday 00:00 LA time.
  const WEDNESDAY = 3;
  const daysSinceWed =
    dayOfWeek >= WEDNESDAY
      ? dayOfWeek - WEDNESDAY
      : dayOfWeek + 7 - WEDNESDAY;

  const lastWed = new Date(todayLA);
  lastWed.setUTCDate(lastWed.getUTCDate() - daysSinceWed);

  const yyyy = lastWed.getUTCFullYear();
  const mm = String(lastWed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(lastWed.getUTCDate()).padStart(2, "0");

  // Determine whether that Wednesday falls in PST (-08:00) or PDT (-07:00).
  // We check LA's offset later that same day, which is stable for that calendar day.
  const wednesdayMiddayUtc = new Date(
    Date.UTC(yyyy, lastWed.getUTCMonth(), lastWed.getUTCDate(), 12)
  );
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(wednesdayMiddayUtc);
  const readOffsetPart = (type: string) =>
    offsetParts.find((part) => part.type === type)?.value ?? "";
  const offsetMs =
    Date.UTC(
      Number(readOffsetPart("year")),
      Number(readOffsetPart("month")) - 1,
      Number(readOffsetPart("day")),
      Number(readOffsetPart("hour")),
      Number(readOffsetPart("minute")),
      Number(readOffsetPart("second"))
    ) - wednesdayMiddayUtc.getTime();
  const offsetMinutes = Math.round(offsetMs / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const absH = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const absM = String(absoluteMinutes % 60).padStart(2, "0");

  // Return midnight LA time expressed as an offset-aware ISO 8601 string
  return `${yyyy}-${mm}-${dd}T00:00:00${sign}${absH}:${absM}`;
}

/**
 * `YYYY-MM-DD` of the deal cycle's Wednesday in America/Los_Angeles.
 *
 * This is the send log's period key. Deriving it from the same cutoff the
 * prices use means a retry later in the send window — or a run that straddles
 * a DST change — resolves to the same key and stays idempotent.
 */
export function getStaplesPeriodKey(now: Date = new Date()): string {
  return getLastWednesdayPST(now).slice(0, 10);
}
