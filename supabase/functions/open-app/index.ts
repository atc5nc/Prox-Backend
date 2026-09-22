import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { createOpenAppHandler } from "./handler.ts";

serve(
  createOpenAppHandler({
    publicAppUrl: Deno.env.get("PUBLIC_APP_URL"),
    launcherUrl: Deno.env.get("OPEN_APP_LAUNCHER_URL"),
  })
);
