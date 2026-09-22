import { isAuthorizedNotificationCronRequest } from "../_shared/cronAuth.ts";
import {
  getLastWednesdayPST,
  getStaplesPeriodKey,
} from "../_shared/staples/dateUtils.ts";
import {
  buildCompleteBaskets,
  buildStapleGridRows,
  buildStaplePriceGrid,
  collectGridRetailers,
  compareBaskets,
  selectEmailRetailers,
  STAPLE_NAMES,
  STAPLE_RADIUS_METERS,
  type StaplePriceRpcRow,
} from "../_shared/staples/stapleGrid.ts";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
} from "../_shared/staples/unsubscribeToken.ts";
import {
  FROM_ADDRESS,
  renderStaplesEmail,
  type RenderedEmail,
} from "./emailTemplate.ts";
import {
  chooseProductImages,
  classifyRecipients,
  createSkipCounts,
  isWithinSendWindow,
  mapWithConcurrency,
  WEEKLY_STAPLES_DEEP_LINK_PATH,
  type EligibleRecipient,
  type ProductImageRow,
  type RunError,
  type RunSummary,
  type WaitlistRecipientRow,
} from "./helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notification-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_API_URL = "https://api.resend.com/emails";

/** Recipients priced and emailed at once. The RPC is the expensive half. */
const SEND_CONCURRENCY = 4;

/** Rows per page when reading the waitlist, matching PostgREST's max page. */
const PAGE_SIZE = 1000;

/** How many rendered bodies a dry run returns for eyeballing. */
const DRY_RUN_HTML_SAMPLE_COUNT = 3;

type RequestPayload = {
  now?: string;
  dryRun?: boolean;
  preview?: string;
};

type RunMode = "send" | "dryRun" | "preview";

type QueryError = {
  message?: string;
  code?: string;
};

type QueryOutcome<T> = { data: T[] | null; error: QueryError | null };

type SelectBuilder<T> = PromiseLike<QueryOutcome<T>> & {
  eq: (column: string, value: unknown) => SelectBuilder<T>;
  in: (column: string, values: unknown[]) => SelectBuilder<T>;
  gte: (column: string, value: unknown) => SelectBuilder<T>;
  not: (column: string, operator: string, value: unknown) => SelectBuilder<T>;
  limit: (count: number) => SelectBuilder<T>;
  range: (from: number, to: number) => SelectBuilder<T>;
};

type AdminClient = {
  from: (table: string) => {
    select: <T>(columns: string) => SelectBuilder<T>;
    insert: (
      payload: Record<string, unknown>
    ) => PromiseLike<{ error: QueryError | null }>;
  };
  rpc: <T>(
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<QueryOutcome<T>>;
};

type HandlerDeps = {
  createAdminClient: () => AdminClient;
  /** Verbatim CTA URL override; falls back to publicAppUrl + the deep link. */
  emailCtaUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  notificationCronSecret?: string;
  publicAppUrl?: string;
  resendApiKey?: string;
  serviceRoleKey?: string;
  supabaseUrl?: string;
  unsubscribeSecret?: string;
};

type RecipientPreview = {
  waitlistId: string;
  email: string;
  zipCode: string;
  retailers: string[];
  completeRetailers: string[];
  backfilledRetailers: string[];
  winner: string | null;
  winnerTotal: number | null;
  runnerUp: string | null;
  savingsVsRunnerUp: number | null;
  subject: string | null;
  skippedReason: "noCompleteBasket" | null;
  html?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function resolveRequestNow(params: {
  now: () => Date;
  payload: RequestPayload | null;
}): Date {
  const allowDebugOverride =
    Deno.env.get("ALLOW_WEEKLY_STAPLES_EMAIL_DEBUG") === "true";

  if (!allowDebugOverride || !params.payload?.now) {
    return params.now();
  }

  const parsed = new Date(params.payload.now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Debug override `now` must be a valid ISO timestamp.");
  }

  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read every row of a filtered select, one PostgREST page at a time.
 *
 * A plain select silently stops at the server's row cap, which would quietly
 * drop recipients as the waitlist grows — the run would still report success.
 */
async function loadAllRows<T>(
  build: () => SelectBuilder<T>
): Promise<{ rows: T[]; error: QueryError | null }> {
  const rows: T[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error };

    const pageRows = data ?? [];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) return { rows, error: null };
  }
}

async function sendViaResend(params: {
  apiKey: string;
  email: RenderedEmail;
  fetchImpl: typeof fetch;
  to: string;
  unsubscribeUrl: string;
}): Promise<void> {
  const response = await params.fetchImpl(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [params.to],
      subject: params.email.subject,
      html: params.email.html,
      text: params.email.text,
      headers: {
        // Inbox-level unsubscribe. The one-click POST hits the same endpoint
        // as the footer link, so both paths flip the same flag.
        "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }
}

export function createSendWeeklyStaplesEmailHandler({
  createAdminClient,
  emailCtaUrl,
  fetchImpl = fetch,
  now = () => new Date(),
  notificationCronSecret,
  publicAppUrl,
  resendApiKey,
  serviceRoleKey,
  supabaseUrl,
  unsubscribeSecret,
}: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse(405, {
        code: "METHOD_NOT_ALLOWED",
        message: "Method not allowed.",
      });
    }

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !resendApiKey ||
      !notificationCronSecret ||
      !publicAppUrl ||
      !unsubscribeSecret
    ) {
      return jsonResponse(500, {
        code: "SERVER_CONFIG_ERROR",
        message:
          "Server is missing weekly staples email environment configuration.",
      });
    }

    if (
      !isAuthorizedNotificationCronRequest({
        req,
        secret: notificationCronSecret,
      })
    ) {
      return jsonResponse(401, {
        code: "UNAUTHORIZED",
        message: "Unauthorized.",
      });
    }

    let payload: RequestPayload | null = null;
    try {
      payload = (await req.json()) as RequestPayload;
    } catch {
      payload = null;
    }

    let requestNow: Date;
    try {
      requestNow = resolveRequestNow({ now, payload });
    } catch (error) {
      return jsonResponse(400, {
        code: "INVALID_DEBUG_NOW",
        message: errorMessage(error),
      });
    }

    const previewEmail =
      typeof payload?.preview === "string" ? payload.preview.trim() : "";
    const mode: RunMode = previewEmail
      ? "preview"
      : payload?.dryRun === true
        ? "dryRun"
        : "send";

    const periodKey = getStaplesPeriodKey(requestNow);
    const minDate = getLastWednesdayPST(requestNow);
    const inSendWindow = isWithinSendWindow(requestNow);

    // Dry runs and previews are already gated behind the cron secret, so they
    // deliberately ignore the window — otherwise they would only be testable
    // for one hour a week.
    if (mode === "send" && !inSendWindow) {
      return jsonResponse(200, {
        success: true,
        mode,
        periodKey,
        inSendWindow,
        processed: 0,
        sent: 0,
        skipped: createSkipCounts(),
        errors: [],
      });
    }

    const adminClient = createAdminClient();

    const { rows: enabledRows, error: recipientError } =
      await loadAllRows<WaitlistRecipientRow>(() =>
        adminClient
          .from("waitlist")
          .select<WaitlistRecipientRow>(
            "id,email,first_name,zip_code,preferred_retailers"
          )
          .eq("weekly_staples_email_enabled", true)
      );

    if (recipientError) {
      console.error("Failed to load weekly staples recipients:", recipientError);
      return jsonResponse(500, {
        code: "RECIPIENT_LOOKUP_FAILED",
        message: "Failed to load weekly staples email recipients.",
      });
    }

    const { rows: disabledRows, error: disabledError } = await loadAllRows<{
      id: string;
    }>(() =>
      adminClient
        .from("waitlist")
        .select<{ id: string }>("id")
        .eq("weekly_staples_email_enabled", false)
    );

    if (disabledError) {
      console.error(
        "Failed to count weekly staples opt-outs:",
        disabledError
      );
      return jsonResponse(500, {
        code: "RECIPIENT_LOOKUP_FAILED",
        message: "Failed to load weekly staples email opt-out count.",
      });
    }

    const { rows: sentRows, error: sendLogError } = await loadAllRows<{
      waitlist_id: string;
    }>(() =>
      adminClient
        .from("weekly_staples_email_sends")
        .select<{ waitlist_id: string }>("waitlist_id")
        .eq("period_key", periodKey)
    );

    if (sendLogError) {
      console.error("Failed to load weekly staples send log:", sendLogError);
      return jsonResponse(500, {
        code: "SEND_LOG_LOOKUP_FAILED",
        message: "Failed to load the weekly staples send log.",
      });
    }

    // A preview must render regardless of whether the real send already went
    // out this week, so it ignores the send log.
    const alreadySentWaitlistIds =
      mode === "preview"
        ? new Set<string>()
        : new Set(sentRows.map((row) => row.waitlist_id));

    const { eligible, skipped } = classifyRecipients({
      rows: enabledRows,
      alreadySentWaitlistIds,
      disabledCount: disabledRows.length,
    });

    let recipients: EligibleRecipient[] = eligible;

    if (mode === "preview") {
      const target = eligible.find(
        (recipient) =>
          recipient.email.toLowerCase() === previewEmail.toLowerCase()
      );

      if (!target) {
        return jsonResponse(400, {
          code: "PREVIEW_RECIPIENT_NOT_ELIGIBLE",
          message:
            `No eligible waitlist row found for ${previewEmail}. Preview renders a real recipient's own data, so the address must belong to a waitlist row with a valid 5-digit zip, at least one preferred retailer, and the weekly staples email still enabled.`,
        });
      }

      recipients = [target];
    }

    const functionsBaseUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
    const assetsBaseUrl = `${functionsBaseUrl}/email-assets`;
    // The CTA points at open-app rather than the website directly: email
    // clients refuse custom-scheme links, so that endpoint is what turns one
    // https URL into "open the app on a phone, open the site on a desktop".
    const ctaUrl =
      (emailCtaUrl ?? "").trim() ||
      `${functionsBaseUrl}/open-app?path=deals&source=weekly-staples-email`;

    const errors: RunError[] = [];
    const previews: RecipientPreview[] = [];
    let sent = 0;

    await mapWithConcurrency(recipients, SEND_CONCURRENCY, async (recipient, index) => {
      try {
        const { data: rpcRows, error: rpcError } = await adminClient.rpc<
          StaplePriceRpcRow
        >("get_staple_prices_v1", {
          p_user_zip: recipient.zipCode,
          p_staples: [...STAPLE_NAMES],
          p_radius_meters: STAPLE_RADIUS_METERS,
          p_min_date: minDate,
        });

        if (rpcError) {
          throw new Error(
            `get_staple_prices_v1 failed: ${rpcError.message ?? "unknown error"}`
          );
        }

        const grid = buildStaplePriceGrid(STAPLE_NAMES, rpcRows ?? []);

        // Baskets are computed across every retailer the RPC returned, not just
        // the recipient's, so the column picker can backfill when their own
        // stores are short a staple.
        const baskets = buildCompleteBaskets(
          STAPLE_NAMES,
          collectGridRetailers(grid),
          grid
        );
        const columns = selectEmailRetailers({
          preferred: recipient.retailers,
          baskets,
        });
        const comparison = compareBaskets(columns.map((column) => column.basket));

        if (!comparison) {
          skipped.noCompleteBasket += 1;

          if (mode !== "send") {
            previews.push({
              waitlistId: recipient.waitlistId,
              email: recipient.email,
              zipCode: recipient.zipCode,
              retailers: recipient.retailers,
              completeRetailers: [],
              backfilledRetailers: [],
              winner: null,
              winnerTotal: null,
              runnerUp: null,
              savingsVsRunnerUp: null,
              subject: null,
              skippedReason: "noCompleteBasket",
            });
          }

          return;
        }

        const unsubscribeUrl = buildUnsubscribeUrl({
          functionsBaseUrl,
          token: await createUnsubscribeToken(
            recipient.waitlistId,
            unsubscribeSecret
          ),
        });

        // Flyer photos for the winner's five products. The query leans on the
        // (retailer, zip_code, product_name, ...) index — an unindexed
        // product_name lookup over a week of flyer_deals takes minutes.
        const winnerCells = STAPLE_NAMES.map((staple) => ({
          staple,
          retailer: comparison.winner.retailer,
          cell: grid.get(staple)?.get(comparison.winner.retailer),
        })).filter(
          (entry): entry is { staple: string; retailer: string; cell: NonNullable<typeof entry.cell> } =>
            entry.cell != null
        );

        let productImages = new Map<string, string>();
        try {
          const lookupZips = [
            ...new Set(
              winnerCells.flatMap((entry) =>
                entry.cell.sourceZip ? [entry.cell.sourceZip] : []
              )
            ),
          ];
          const lookupRetailers = [
            ...new Set(winnerCells.map((entry) => entry.cell.sourceRetailer)),
          ];

          if (lookupZips.length > 0) {
            const { data: imageRows, error: imageError } = await adminClient
              .from("flyer_deals")
              .select<ProductImageRow>(
                "product_name,product_price,retailer,image_link,created_at"
              )
              .in("retailer", lookupRetailers)
              .in("zip_code", lookupZips)
              .in(
                "product_name",
                winnerCells.map((entry) => entry.cell.productName)
              )
              .gte("created_at", minDate)
              .not("image_link", "is", null)
              .limit(60);

            if (imageError) {
              console.error(
                "Product image lookup failed (rendering with illustrations):",
                recipient.waitlistId,
                imageError
              );
            } else {
              productImages = chooseProductImages(winnerCells, imageRows ?? []);
            }
          }
        } catch (imageLookupError) {
          // Photos are an enhancement; a lookup failure must never cost the
          // recipient their email. The staple illustrations render instead.
          console.error(
            "Product image lookup threw (rendering with illustrations):",
            recipient.waitlistId,
            imageLookupError
          );
        }

        // When a nearby store wins, quantify it against the recipient's own
        // cheapest complete store — that difference is the email's whole story.
        const bestPreferred = columns
          .filter((column) => column.isPreferred)
          .sort((a, b) => a.basket.total - b.basket.total)[0];
        const winnerIsPreferred = columns.some(
          (column) =>
            column.retailer === comparison.winner.retailer && column.isPreferred
        );
        const bestPreferredRetailer =
          !winnerIsPreferred && bestPreferred ? bestPreferred.retailer : null;
        const savingsVsPreferred = bestPreferredRetailer
          ? Math.max(0, bestPreferred.basket.total - comparison.winner.total)
          : 0;

        const email = renderStaplesEmail({
          firstName: recipient.firstName,
          zipCode: recipient.zipCode,
          periodKey,
          winner: comparison.winner,
          runnerUp: comparison.runnerUp,
          savingsVsRunnerUp: comparison.savingsVsRunnerUp,
          bestPreferredRetailer,
          savingsVsPreferred,
          columns,
          rows: buildStapleGridRows(
            STAPLE_NAMES,
            columns.map((column) => column.retailer),
            grid
          ),
          productImages,
          assetsBaseUrl,
          ctaUrl,
          unsubscribeUrl,
        });

        if (mode === "dryRun") {
          previews.push({
            waitlistId: recipient.waitlistId,
            email: recipient.email,
            zipCode: recipient.zipCode,
            retailers: recipient.retailers,
            completeRetailers: columns.map((column) => column.retailer),
            backfilledRetailers: columns
              .filter((column) => !column.isPreferred)
              .map((column) => column.retailer),
            winner: comparison.winner.retailer,
            winnerTotal: comparison.winner.total,
            runnerUp: comparison.runnerUp?.retailer ?? null,
            savingsVsRunnerUp: comparison.savingsVsRunnerUp,
            subject: email.subject,
            skippedReason: null,
            ...(index < DRY_RUN_HTML_SAMPLE_COUNT ? { html: email.html } : {}),
          });
          return;
        }

        await sendViaResend({
          apiKey: resendApiKey,
          email,
          fetchImpl,
          to: mode === "preview" ? previewEmail : recipient.email,
          unsubscribeUrl,
        });

        sent += 1;

        if (mode === "preview") {
          previews.push({
            waitlistId: recipient.waitlistId,
            email: previewEmail,
            zipCode: recipient.zipCode,
            retailers: recipient.retailers,
            completeRetailers: columns.map((column) => column.retailer),
            backfilledRetailers: columns
              .filter((column) => !column.isPreferred)
              .map((column) => column.retailer),
            winner: comparison.winner.retailer,
            winnerTotal: comparison.winner.total,
            runnerUp: comparison.runnerUp?.retailer ?? null,
            savingsVsRunnerUp: comparison.savingsVsRunnerUp,
            subject: email.subject,
            skippedReason: null,
          });
          return;
        }

        const { error: logError } = await adminClient
          .from("weekly_staples_email_sends")
          .insert({
            waitlist_id: recipient.waitlistId,
            period_key: periodKey,
            email: recipient.email,
          });

        if (logError) {
          // The email is already delivered, so this cannot be retried away.
          // Surfacing it keeps the run honest: without the log row the next
          // attempt inside this window would send a duplicate.
          console.error(
            "Weekly staples email sent but send log insert failed:",
            recipient.waitlistId,
            logError
          );
          errors.push({
            waitlistId: recipient.waitlistId,
            message: `Email sent but send log insert failed: ${logError.message ?? "unknown error"}`,
          });
        }
      } catch (error) {
        console.error(
          "Weekly staples email failed for waitlist row:",
          recipient.waitlistId,
          error
        );
        errors.push({
          waitlistId: recipient.waitlistId,
          message: errorMessage(error),
        });
      }
    });

    const summary: RunSummary = {
      processed: enabledRows.length + disabledRows.length,
      sent,
      skipped,
      errors,
    };

    return jsonResponse(200, {
      success: true,
      mode,
      periodKey,
      inSendWindow,
      ...summary,
      ...(mode === "send" ? {} : { previews }),
    });
  };
}
