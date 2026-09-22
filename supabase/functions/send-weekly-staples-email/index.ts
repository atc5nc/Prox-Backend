import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// npm: specifier, not esm.sh. The esm.sh bundle drags in a `ws` build that
// fails to boot in the edge runtime ("module \"node:url\" not found"), and
// esm.sh resolves that transitive dep at request time, so a previously fine
// pin can start crashing on a fresh deploy. Matches cart-optimizer-search.
import { createClient } from "npm:@supabase/supabase-js@2.50.0";

import { createSendWeeklyStaplesEmailHandler } from "./handler.ts";

serve(
  createSendWeeklyStaplesEmailHandler({
    emailCtaUrl: Deno.env.get("EMAIL_CTA_URL"),
    createAdminClient: () =>
      createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      ),
    notificationCronSecret: Deno.env.get("NOTIFICATION_CRON_SECRET"),
    publicAppUrl: Deno.env.get("PUBLIC_APP_URL"),
    resendApiKey: Deno.env.get("RESEND_API_KEY"),
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: Deno.env.get("SUPABASE_URL"),
    unsubscribeSecret: Deno.env.get("WEEKLY_STAPLES_UNSUBSCRIBE_SECRET"),
  })
);
