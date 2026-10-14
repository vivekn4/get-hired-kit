# QC_NOTES.md — get-hired-kit

Tested 2026-10-11 by Squirt (subagent) before handoff. **No real Gemini key and no real user data were used** — AI paths tested in training-dummy mode; the license key used was freshly generated for the test.

## Unit tests — 22/22 pass (`npm test`)

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

---

## v1.1 teardown + upgrade (2026-10-14, Squirt subagent — NOT pushed)

### Similar apps analyzed (all from official GitHub, shallow clones, no paid apps)

| App | Source | Commit (HEAD at clone) | License | REA |
|---|---|---|---|---|
| OpenResume (resume builder + PDF parser, ATS-readability test) | https://github.com/xitanggg/open-resume | 4f8255a2c763479837f69f1dccf2a3338730cd79 (2024-10-29) | AGPL-3.0 | `analyze-javascript-application` on `src/app/lib/parse-resume-from-pdf` — 187 graph nodes, exit 0 |
| Jobify (job tracker: kanban, timeline, ghosted, stats, hunts) | https://github.com/esg450/jobify | 50fdc2c6698093174873fd431d096f3ec3dc6256 (2026-10-13) | AGPL-3.0 | REA on `apps/server/src/jobs` — 126 nodes, exit 0 |
| Prepped / ai-interview-prep (ATS keyword scorer + mock interview + history) | https://github.com/utkarshtripathi45/ai-interview-prep | 59325411c52ef0226c42fae221c7e5d08cf4c454 (2026-07-17) | NO LICENSE FILE in repo | REA on `backend` — 106 nodes, exit 0 |

No hashes were published by these projects for their source (git SHAs above are the verification). No APKs involved. No proprietary/paid apps touched.

### Learnings applied (mechanisms only — all code written from scratch for this repo)

- **Keyword gap analysis** (Prepped: matched/missing keyword lists + coverage score + hygiene bonuses; OpenResume: ATS readability as a parseability signal) → `lib/ats.js`: own tokenizer, within-clause bigrams, section + quantified-bullet signals, own weights/suggestions.
- **Difficulty-graded interviews** (Prepped: role + difficulty passed to question generation and fallback bank) → Chill/Standard/Beast presets driving prompt style + fallback base/cap.
- **Structured scoring + history** (Prepped: per-answer score + session history) → 5-dimension rubric (AI JSON validated, offline recompute) + localStorage bout history + streak.
- **Activity timeline + ghosted + filters + upcoming follow-ups** (Jobify: per-job event log, ghosted status, filters, upcoming stats) → per-app history log, *derived* ghosted badge (not a stage), search/stage filter, due-soon state, ghosted/due stats.

### Deliberately skipped

- **PDF resume import/parsing** (OpenResume's parser pipeline): heavy (PDF text extraction + section inference), out of scope for a paste-text app; the ATS check covers the same user need for pasted resumes.
- **Job-site importers / Gmail sync / semantic embeddings** (Jobify): need external fetch/OAuth/embeddings infra; violates zero-budget + privacy posture (resumes never leave the session).
- **Socket.io live "thinking" events** (Prepped): GHK already disables the submit button with a SCORING state; a socket adds infra for no user-visible gain.
- **JWT auth + per-user server history** (Prepped/Jobify): GHK is intentionally account-free; history stays in localStorage.
- **Copying any code**: OpenResume and Jobify are AGPL-3.0 and Prepped carries no license — nothing was copied from any of them, only mechanisms re-implemented. AGPL sources were used as *reference for behavior*, never as code donors (GHK stays MIT).

### QA evidence (2026-10-14)

- `node --check` on server.js, all lib files, both public JS files, test file: clean.
- `npm test`: **38/38 pass** (was 22/22) — 16 new: 6 ATS, 5 rubric/difficulty, 5 tracker-logic (via node:vm on the browser file).
- Static check: all **79** `$("…")` IDs in app.js exist in index.html — none missing.
- Live server (PORT 3211–3213, dummy mode, no Gemini key):
  - `POST /api/ats` with JD → 200, score 77, coverage 63%, clean matched/missing lists (junk cross-clause bigrams fixed after first smoke run showed "associate. must" / "service cash" — now split on `[.!?\n;,:]`).
  - `POST /api/ats` without JD → 200, generic-terms mode flagged.
  - `POST /api/ats` short resume → 400.
  - Full 5-round Beast interview → 200 each, every answer carries `dimensions` (5 dims), final report `difficulty: "beast"`.
  - ATS calls did **not** consume quota (`/api/quota` still 3/3).
  - Static: `/`, `/js/app.js`, `/js/tracker_logic.js`, `/css/style.css`, `/favicon.svg` all 200.
- NOT live-tested: real Gemini dimension JSON (no key in test env — server validates + falls back offline if malformed); frontend in a real browser (no browser harness in this task — ID/syntax/unit coverage only); Render deploy.
