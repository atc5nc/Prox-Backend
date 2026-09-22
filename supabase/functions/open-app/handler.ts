// Smart link target for emails: one https URL that opens the native app on a
// phone and the website on a desktop.
//
// Email clients strip or refuse custom-scheme links (com.proxshopping.mobile://),
// so an email can never link the app directly. This endpoint is the indirection:
//
//   iPhone/iPad -> 302 to the launcher page, which attempts
//                  com.proxshopping.mobile://<screen> and falls back to the
//                  website if the app never takes over
//   everything else -> 302 straight to the website (see canOpenNativeScheme
//                      for why Android is in this bucket today)
//
// Why iOS gets a page rather than a redirect straight to the scheme: iOS
// confirms a custom-scheme navigation with a system sheet ("Open in Prox?").
// Redirecting there works when the person taps Open, but leaves the browser
// with nothing behind the sheet when they tap Cancel - a blank page, or
// "the address is invalid". A page stays put underneath it, so Cancel lands
// on the website instead of nowhere.
//
// Why that page is not served from here: Supabase forces
// content-type: text/plain on every response from the shared *.supabase.co
// functions domain (an anti-phishing measure), so HTML returned here reaches
// the reader as visible source code and its script never runs. The page ships
// as a static file with the web app instead - public/open-app.html - where it
// is served as real text/html.
//
// This function stays in the chain as the email's stable URL: already-sent
// emails keep working if the launcher ever moves, and non-iOS readers skip
// the page entirely rather than loading it just to be redirected again.
//
// Needs no app changes: iOS already registers the scheme in
// ios/App/App/Info.plist.

// The web app's production origin. joinprox.com is a separate marketing
// site on Cloudflare and does not serve this repo, so the launcher cannot
// live there; PUBLIC_APP_URL stays the fallback destination, not the host.
const LAUNCHER_URL_DEFAULT =
  "https://mobile-app-three-iota.vercel.app/open-app.html";

type HandlerDeps = {
  /** Website root, e.g. https://joinprox.com. */
  publicAppUrl?: string;
  /**
   * Absolute URL of the static launcher page (public/open-app.html) served by
   * the web app. Overridable so the deploy can point at a preview build, or at
   * a first-party domain once one exists.
   */
  launcherUrl?: string;
};

/**
 * App-relative targets this endpoint may forward to.
 *
 * The endpoint is unauthenticated and takes a target from the query string, so
 * an unvalidated value would make it an open redirect - and worse, a launcher
 * for arbitrary URL schemes. An allowlist of known app screens keeps it inert.
 */
const ALLOWED_PATHS = new Set([
  "deals",
  "cart",
  "pantry-tracker",
  "account",
  "recipes",
]);

const SOURCE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function resolveTarget(rawPath: string | null): string {
  const trimmed = (rawPath ?? "").trim().replace(/^\/+/, "");
  const withoutQuery = trimmed.split(/[?#]/)[0];

  return ALLOWED_PATHS.has(withoutQuery) ? withoutQuery : "deals";
}

export function resolveSource(rawSource: string | null): string | null {
  const trimmed = (rawSource ?? "").trim();
  return SOURCE_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Whether this client can actually resolve the app scheme.
 *
 * iOS only, deliberately. A redirect is one-shot - the server cannot tell
 * whether the scheme resolved and cannot fall back - so it may only be aimed
 * at a platform that provably registers it. iOS does, in
 * ios/App/App/Info.plist (CFBundleURLSchemes). Android does NOT:
 * android/app/src/main/AndroidManifest.xml declares no `android:scheme`
 * intent-filter, so an Android phone sent to com.proxshopping.mobile:// gets a
 * dead link every time. Those users get the website until the manifest
 * registers the scheme.
 *
 * iPadOS 13+ masquerades as Macintosh and cannot be told apart server-side;
 * those users get the website, which is the safe direction to be wrong in.
 */
export function canOpenNativeScheme(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

export function createOpenAppHandler({
  publicAppUrl,
  launcherUrl = LAUNCHER_URL_DEFAULT,
}: HandlerDeps) {
  return (req: Request): Response => {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        },
      });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!publicAppUrl) {
      console.error("open-app is missing PUBLIC_APP_URL.");
      return new Response("Server configuration error", { status: 500 });
    }

    const requestUrl = new URL(req.url);
    const target = resolveTarget(requestUrl.searchParams.get("path"));
    const source = resolveSource(requestUrl.searchParams.get("source"));
    const query = source ? `?source=${encodeURIComponent(source)}` : "";

    const webRoot = publicAppUrl.replace(/\/+$/, "");

    // `target` is already reduced to an allowlist entry and `source` to a
    // conservative pattern, so neither can break out of the launcher's query
    // string. The app scheme itself is deliberately NOT passed - the launcher
    // hardcodes it, so no query parameter can ever aim it at another scheme.
    const launcher =
      `${launcherUrl}?path=${encodeURIComponent(target)}` +
      (source ? `&source=${encodeURIComponent(source)}` : "");

    const destination = canOpenNativeScheme(req.headers.get("user-agent") ?? "")
      ? launcher
      : `${webRoot}/${query}`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: destination,
        // Phones and desktops get different targets from the same URL, so this
        // must never be cached by a shared proxy.
        "Cache-Control": "no-store",
        Vary: "User-Agent",
      },
    });
  };
}
