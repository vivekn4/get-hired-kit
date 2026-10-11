# QC_NOTES.md — get-hired-kit

Tested 2026-10-11 by Squirt (subagent) before handoff. **No real Gemini key and no real user data were used** — AI paths tested in training-dummy mode; the license key used was freshly generated for the test.

## Unit tests — 21/21 pass (`npm test`)

`test/logic.test.mjs` covers the pure logic:
- License: key generation shape, 25/25 generated keys verify, tampered key fails checksum, garbage rejected, lowercase/missing-prefix tolerated, pro-cookie HMAC sign/verify roundtrip (forged cookie rejected)
- Quota: N-then-block, per-client isolation (IP+UA), Pro bypass, fingerprint stability
- Util: XSS escaping, text bounds validation, URL validation (rejects `javascript:`), tracker import validation (good export accepted, 4 malformed variants rejected)
- Prompts: belt thresholds (Black≥90 … White<50), fallback scoring rewards examples+metrics, banks non-empty, question prompt avoids repeats, roast prompt has anti-harassment rails
- Gemini: `extractJson` tolerates markdown fences, returns null on garbage

## Live server tests (PORT 3210, no GEMINI_API_KEY → dummy mode)

| Test | Result |
|---|---|
| `npm install` | clean |
| `node --check` on server.js + app.js + all lib files | syntax OK |
| `GET /api/health` | 200 `{ok, service, version, ai:false}` |
| `GET /api/quota` | 200 `{pro:false, remaining:3, daily:3}` |
| `POST /api/interview/start` (valid JD) | 200, sessionId + round 1 question (dummy bank) |
| `POST /api/interview/answer` ×5 (full run) | 200 each; scores 79; final → `{done:true, report:{average:79, belt:"Brown", rounds:[5]}}` |
| Double-submit guard | `session.scoring` flag → 409 on concurrent answer |
| Unknown session | 404 clean JSON |
| Short JD (<20 chars) | 400 clean JSON |
| Short answer (<5 chars) | 400 clean JSON |
| `POST /api/roast` (dummy) | 200, fallback roast lines, quota untouched (dummy is free) |
| `POST /api/rewrite` (dummy) | 200, dummy rewrite tips |
| `POST /api/license/verify` (fresh `generateKey()`) | 200 `{valid:true, tier:"pro", via:"offline-checksum"}` + `Set-Cookie: ghk_pro=1.<hmac>` |
| `GET /api/quota` with pro cookie | 200 `{pro:true}` |
| Bad key (`GHK-AAAA-BBBB-CCCC`) | 200 `{valid:false, error:"Key checksum failed…"}` |
| Forged pro cookie (`1.deadbeef`) | rejected (unit-tested) |
| `GET /` → index.html, CSS, JS, favicon.svg | all 200 |
| Unknown `/api/*` | 404 JSON; unknown page → SPA fallback serves index.html |

## Frontend static checks

- All **63** `$("…")` IDs referenced in `app.js` exist in `index.html` (script-verified, none missing); all 4 views present
- No external assets: SFX 100% WebAudio, fonts system stack, particles canvas — page works offline except API calls
- All user/AI content rendered through `esc()` or `textContent` (XSS); server also escapes
- Banner visually verified: three themed zones (dojo / burning resume / holo command center), gold 3D title, VN badge

## Quota semantics (verified by design + unit tests)

- Dummy (no-key) mode consumes **zero** tokens — demo never paywalls
- With a key: interview start = 1 token (answers ride along), roast = 1, rewrite = 1; at 0 → 402 `OUT_OF_TOKENS` + Pro modal
- Pro cookie bypasses quota server-side (HMAC-signed, HttpOnly, 1yr)

## Not live-tested (needs deployer credentials)

- Real Gemini calls (no key in test env) — code paths reviewed; dummy fallback covers failures
- Gumroad API verification (no access token) — checksum path verified; Gumroad branch fails open to checksum (documented)
- Render cold start — standard config, same as sibling projects

## Secrets audit

- No `.env` file in repo; `.gitignore` covers `.env`, `.env.local`, `node_modules`
- Grep for `AIza`, `sk-`, `ghp_`, `BEGIN PRIVATE KEY` → clean
- API keys only read from env at runtime; never logged (logger only logs event names + scores)
