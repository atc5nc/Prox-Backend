// HMAC-signed unsubscribe tokens for the weekly staples email.
//
// The unsubscribe link has to work without a session — people click it from an
// inbox, and one-click unsubscribe is a bare POST from the mail provider. A
// signed token lets `unsubscribe-weekly-staples` trust the waitlist id in the
// URL without exposing an unauthenticated "disable anyone's email" endpoint.
//
// Web Crypto is available in both Deno and the Node runtime vitest uses, so the
// signing and verifying paths are exercised by the same tests that run in CI.

const encoder = new TextEncoder();

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Compare two signatures without leaking their common prefix length through
 * timing. Length is not secret — the digest size is fixed — so an early return
 * on mismatched length is fine.
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let index = 0; index < a.length; index++) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

async function signWaitlistId(
  waitlistId: string,
  secret: string
): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(waitlistId)
  );
  return toBase64Url(signature);
}

/**
 * Build the `<waitlistId>.<signature>` token embedded in an email's
 * unsubscribe link.
 */
export async function createUnsubscribeToken(
  waitlistId: string,
  secret: string
): Promise<string> {
  if (!waitlistId) {
    throw new Error("Cannot sign an unsubscribe token without a waitlist id.");
  }
  if (!secret) {
    throw new Error("Cannot sign an unsubscribe token without a secret.");
  }

  return `${waitlistId}.${await signWaitlistId(waitlistId, secret)}`;
}

/**
 * Recover the waitlist id from a token, or null when the token is malformed or
 * the signature does not match. Callers must treat null as "do not touch any
 * row" rather than as an empty id.
 */
export async function verifyUnsubscribeToken(
  token: string,
  secret: string
): Promise<string | null> {
  if (!token || !secret) return null;

  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) return null;

  const waitlistId = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expected = await signWaitlistId(waitlistId, secret);

  return timingSafeEquals(signature, expected) ? waitlistId : null;
}

/** Absolute unsubscribe URL for one recipient. */
export function buildUnsubscribeUrl(params: {
  functionsBaseUrl: string;
  token: string;
}): string {
  const base = params.functionsBaseUrl.replace(/\/+$/, "");
  return `${base}/unsubscribe-weekly-staples?token=${encodeURIComponent(params.token)}`;
}
