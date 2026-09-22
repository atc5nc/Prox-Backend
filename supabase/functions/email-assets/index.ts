import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { EMAIL_ASSETS } from "./assets.ts";

// Serves the handful of brand images the weekly staples email references
// (Prox logo, staple illustrations). Embedding them here gives the email
// stable, first-party image URLs with no dependency on the web deployment
// or a storage bucket. Assets are content-stable, so far-future caching is
// safe; changing an image means adding a new filename.
//
// GET /email-assets/<name>  ->  image/png

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

serve((req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const name = new URL(req.url).pathname.split("/").pop() ?? "";
  const base64 = EMAIL_ASSETS[name];

  if (!base64) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(req.method === "HEAD" ? null : decodeBase64(base64), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
