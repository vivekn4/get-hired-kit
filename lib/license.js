// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Pro license keys: format GHK-XXXX-XXXX-XXXX with a checksum digit.
//
// v1 honesty note (also in README): checksum verification proves the key is
// well-formed, not that it was purchased. If GUMROAD_ACCESS_TOKEN is set,
// verify() also checks the key against real Gumroad sales. Without it, any
// well-formed key unlocks Pro — the paywall is convenience + goodwill, not DRM.
// Key sharing is possible in v1; v2 path = Gumroad API + key→fingerprint binding.

import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I/L
const GROUPS = [4, 4, 4];
const TOTAL_CHARS = GROUPS.reduce((a, b) => a + b, 0); // 12

function charVal(c) {
  return ALPHABET.indexOf(c);
}

/** Checksum char for the first 11 chars (weighted sum mod 32). */
export function checksumFor(eleven) {
  let sum = 0;
  for (let i = 0; i < eleven.length; i++) {
    sum += charVal(eleven[i]) * (i + 3);
  }
  return ALPHABET[sum % 32];
}

/** Generate a fresh key (used by tests / the seller's keygen script). */
export function generateKey(randomBytes = crypto.randomBytes) {
  let body = "";
  for (let i = 0; i < TOTAL_CHARS - 1; i++) {
    body += ALPHABET[randomBytes(1)[0] % 32];
  }
  body += checksumFor(body);
  const g = [];
  let k = 0;
  for (const size of GROUPS) {
    g.push(body.slice(k, k + size));
    k += size;
  }
  return `GHK-${g.join("-")}`;
}

/** Normalize user input: trim, uppercase, tolerate missing GHK- prefix. */
export function normalizeKey(input) {
  let k = String(input || "").trim().toUpperCase().replace(/[\s_]/g, "");
  if (!k.startsWith("GHK-")) k = `GHK-${k}`;
  return k;
}

/** Offline format+checksum check. Returns { valid, reason }. */
export function verifyKeyFormat(input) {
  const key = normalizeKey(input);
  const m = /^GHK-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/.exec(key);
  if (!m) return { valid: false, reason: "That doesn't look like a Get Hired Kit key (GHK-XXXX-XXXX-XXXX)." };
  const body = `${m[1]}${m[2]}${m[3]}`;
  for (const c of body) {
    if (!ALPHABET.includes(c)) return { valid: false, reason: "Invalid characters in key." };
  }
  const eleven = body.slice(0, 11);
  if (checksumFor(eleven) !== body[11]) {
    return { valid: false, reason: "Key checksum failed — double-check for typos." };
  }
  return { valid: true, key };
}

/**
 * Full verification: checksum, then optional Gumroad sale lookup.
 * Returns { valid, tier: "pro"|"free", via, reason }.
 */
export async function verifyKey(input, { gumroadToken } = {}) {
  const fmt = verifyKeyFormat(input);
  if (!fmt.valid) return { valid: false, tier: "free", via: "format", reason: fmt.reason };
  if (!gumroadToken) {
    return { valid: true, tier: "pro", via: "offline-checksum", key: fmt.key };
  }
  try {
    // Gumroad license verification endpoint.
    const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ product_permalink: "", license_key: fmt.key, access_token: gumroadToken }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.success && data?.purchase) {
      return { valid: true, tier: "pro", via: "gumroad", key: fmt.key };
    }
    return { valid: false, tier: "free", via: "gumroad", reason: "Key not found in Gumroad sales." };
  } catch {
    // Gumroad unreachable: fail open to checksum (documented tradeoff).
    return { valid: true, tier: "pro", via: "offline-checksum-fallback", key: fmt.key };
  }
}

/* Pro cookie: HMAC-signed so clients can't forge "pro" themselves. */

export function proSecret() {
  if (!process.env.PRO_SECRET) {
    if (!globalThis.__ghkProSecret) globalThis.__ghkProSecret = crypto.randomBytes(32).toString("hex");
    return globalThis.__ghkProSecret; // per-boot secret; Pro unlocks reset on restart (documented)
  }
  return process.env.PRO_SECRET;
}

export function signProCookie() {
  const sig = crypto.createHmac("sha256", proSecret()).update("ghk-pro-v1").digest("hex");
  return `1.${sig}`;
}

export function isProCookie(value) {
  if (typeof value !== "string") return false;
  const [flag, sig] = value.split(".");
  if (flag !== "1" || !sig) return false;
  const expected = crypto.createHmac("sha256", proSecret()).update("ghk-pro-v1").digest("hex");
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
