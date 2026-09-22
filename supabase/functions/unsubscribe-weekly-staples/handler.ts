import { verifyUnsubscribeToken } from "../_shared/staples/unsubscribeToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};


type QueryError = {
  message?: string;
};

type AdminClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (
        column: string,
        value: unknown
      ) => PromiseLike<{ error: QueryError | null }>;
    };
  };
};

type HandlerDeps = {
  createAdminClient: () => AdminClient;
  /** Website root the confirmation redirect lands on. */
  publicAppUrl?: string;
  serviceRoleKey?: string;
  supabaseUrl?: string;
  unsubscribeSecret?: string;
};

/**
 * Send the browser to the website with a status the page can read.
 *
 * Not an HTML page: Supabase serves every edge-function body on the shared
 * *.supabase.co domain as text/plain regardless of the Content-Type we set (an
 * anti-phishing measure), so a branded page returned from here reaches the
 * user as visible source code. Redirecting hands rendering to joinprox.com,
 * which serves real HTML.
 */
function redirectWithStatus(publicAppUrl: string, status: string): Response {
  const webRoot = publicAppUrl.replace(/\/+$/, "");

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: `${webRoot}/?unsubscribed=${encodeURIComponent(status)}`,
      // Mail clients and link scanners must not cache an unsubscribe result.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Handles both halves of the unsubscribe path:
 *  - GET  - a person clicking the footer link, sent on to the website.
 *  - POST - RFC 8058 one-click unsubscribe from the mail client, answered with
 *           a bare 200 so the provider marks it handled.
 *
 * Both carry the same HMAC-signed token, so neither can disable an arbitrary
 * row, and the endpoint stays open (verify_jwt = false) as it must be.
 */
export function createUnsubscribeWeeklyStaplesHandler({
  createAdminClient,
  publicAppUrl,
  serviceRoleKey,
  supabaseUrl,
  unsubscribeSecret,
}: HandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const isOneClick = req.method === "POST";

    if (req.method !== "GET" && !isOneClick) {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!supabaseUrl || !serviceRoleKey || !unsubscribeSecret || !publicAppUrl) {
      console.error("unsubscribe-weekly-staples is missing configuration.");
      return new Response("Server configuration error", { status: 500 });
    }

    const token = new URL(req.url).searchParams.get("token") ?? "";
    const waitlistId = await verifyUnsubscribeToken(token, unsubscribeSecret);

    if (!waitlistId) {
      return redirectWithStatus(publicAppUrl, "invalid");
    }

    const { error } = await createAdminClient()
      .from("waitlist")
      .update({ weekly_staples_email_enabled: false })
      .eq("id", waitlistId);

    if (error) {
      console.error("Failed to unsubscribe waitlist row:", waitlistId, error);
      return redirectWithStatus(publicAppUrl, "error");
    }

    if (isOneClick) {
      return new Response("Unsubscribed", {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return redirectWithStatus(publicAppUrl, "1");
  };
}
