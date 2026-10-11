// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Gemini client via Google's OpenAI-compatible endpoint (free tier).
// Same proven pattern as the sibling project ai-dungeon-master.
// Key lives ONLY in GEMINI_API_KEY env — never logged, never in code.

const BASE_URL = (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, "");
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 60_000;
const MAX_TOKENS = Number(process.env.GEMINI_MAX_TOKENS) || 1500;

function apiKey() {
  return (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "").trim();
}

export function aiConfigured() {
  return Boolean(apiKey());
}

/**
 * Chat completion. Throws a friendly Error on failure — callers map it to
 * user-facing copy and fall back to the built-in banks.
 */
export async function chatComplete({ system, user, maxTokens = MAX_TOKENS }) {
  const key = apiKey();
  if (!key) {
    const e = new Error("AI key not configured");
    e.code = "NO_KEY";
    throw e;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 429) {
      const e = new Error("AI rate limit hit — the dojo is catching its breath. Try again in a minute.");
      e.code = "RATE_LIMITED";
      e.retryAfter = 60;
      throw e;
    }
    if (!res.ok) {
      const e = new Error("The AI service hiccuped. Your training dummy is stepping in.");
      e.code = "UPSTREAM";
      e.status = res.status;
      throw e;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      const e = new Error("Empty AI response — training dummy stepping in.");
      e.code = "EMPTY";
      throw e;
    }
    return text;
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error("The AI took too long — training dummy stepping in.");
      e.code = "TIMEOUT";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/** Parse a JSON blob out of model output (tolerates fences / prose). */
export function extractJson(text) {
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fall through */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[1] ?? m[0]);
    } catch { /* fall through */ }
  }
  return null;
}
