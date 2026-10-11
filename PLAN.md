# GET HIRED KIT — Developer Plan

## 1. What it is

One VN-styled web app, three career modules, one Gumroad product ($29 one-time):

1. **Interview Dojo** — paste a job description → AI interviewer asks role-specific questions → you answer → scored feedback per answer + overall belt rank.
2. **Resume Roaster** — paste resume → savage-but-fair roast → one-click professional rewrite.
3. **Job Tracker** — kanban board (Applied → Screening → Interview → Offer / Rejected), follow-up reminders, stats (applied, response rate, stage distribution). 100% local (localStorage) — free forever, no account.

**Monetization:** free tier = 3 AI generations/day (Dojo + Roaster combined); tracker always free. Pro ($29 Gumroad one-time) = unlimited generations. License key unlocks in-app.

## 2. Architecture

```
Browser (static frontend, zero build) → Express backend (Node 20) → Gemini API (free, user key)
```

- **Frontend:** plain HTML/CSS/JS in `public/`. Tab navigation: Dojo / Roaster / Tracker. No framework.
- **Backend:** Express + helmet + rate limits.
  - `lib/gemini.js` — Gemini client via Google's OpenAI-compatible endpoint (`gemini-2.0-flash` or current free tier), key from `GEMINI_API_KEY` env. Prompt templates in `lib/prompts.js`.
  - `lib/license.js` — key format `GHK-XXXX-XXXX-XXXX` (checksum); `POST /api/license/verify` checks format + optional Gumroad API verification if `GUMROAD_ACCESS_TOKEN` set; otherwise accepts valid-format keys (documented as v1 tradeoff).
  - `lib/quota.js` — free-tier counting: 3 generations/day per client (fingerprint: IP + user-agent hash, in-memory with daily reset; honest note in README that it's soft enforcement — the paywall is convenience, not DRM).
- **Tracker:** pure frontend, localStorage. Export/import JSON backup.
- **Deploy:** Render free tier via `render.yaml`. Gumroad product created separately by the user (guide in README).

### API surface

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/interview/start` | Body: `{jobDescription, role?}` → first question + session id |
| POST | `/api/interview/answer` | Body: `{sessionId, answer}` → score/feedback + next question (or final report after N=5) |
| POST | `/api/roast` | Body: `{resume}` → the roast |
| POST | `/api/rewrite` | Body: `{resume, jobDescription?}` → rewritten resume |
| POST | `/api/license/verify` | Body: `{key}` → `{valid, tier}` |
| GET | `/api/quota` | → `{remaining, isPro}` |

## 3. Build steps (in order)

1. **Scaffold** — package.json, server.js, public/, .env.example, .gitignore, render.yaml, MIT LICENSE, VN favicon.
2. **Gemini client + prompts** — interviewer persona (tough but fair hiring manager), roast persona (savage, never cruel about protected traits), rewriter persona (concise, action verbs, ATS-friendly). Cap input lengths (JD ≤ 4000 chars, resume ≤ 8000).
3. **Interview Dojo flow** — session state in memory (id → questions asked, answers, scores); 5 questions then final report with belt rank (White → Black based on avg score).
4. **Resume Roaster** — two modes, side-by-side view for rewrite (original vs rewritten, copy button).
5. **Job Tracker** — kanban, drag or button-move between stages, follow-up date with overdue highlight, stats header, JSON export/import.
6. **Freemium + license** — quota middleware on AI routes, license verify, pro unlock UI (key input modal, "Get Pro — $29" linking to Gumroad product URL from env).
7. **Frontend styling** — career-dojo theme (§4).
8. **QC + docs** — README (setup, Gumroad product creation steps, honest limits), QC_NOTES.md, secrets audit.

## 4. Possible bugs & problems (and mitigations)

**AI / Gemini**
- 429 rate limits / quota exhaustion → catch, return friendly "the dojo is catching its breath, try again in a minute" + `retryAfter`; never leak raw API errors.
- Model returns off-format (not the expected JSON/questions) → defensive parse: try JSON, fall back to regex/text split, final fallback = generic question bank (ship 10 built-in interview questions + generic roast lines so the app never hard-fails).
- Prompt injection via pasted JD/resume ("ignore instructions…") → system prompts re-assert role each call; cap lengths; treat user content as data, never instructions. Low stakes here (user attacking their own session) but keep hygiene.
- Empty/garbage input → validate non-empty + min length before spending API calls.

**Interview state machine**
- Answer submitted with no active session / double-submit → session lookup, idempotent answer handling, disable button while scoring.
- Sessions pile up in memory → TTL sweep (expire after 30 min inactive); fine for v1 scale, documented.

**License / quota**
- Key sharing (one buyer shares key publicly) → v1 accepts it; README notes v2 path (Gumroad API verification + key→fingerprint binding). Don't over-engineer.
- Free quota bypass (clear storage / new IP) → accepted tradeoff, documented; conversion comes from convenience + goodwill, not DRM.
- Gumroad API token absent → verify falls back to checksum-only; UI copy stays honest ("offline-validated key").

**Tracker (localStorage)**
- Quota exceeded (huge boards) → try/catch on setItem, warn + offer JSON export.
- Schema changes later → version key (`ghk_tracker_v1`), migrate-or-reset gracefully.

**Security / privacy**
- Escape all AI output + user content before render (XSS) — resumes contain arbitrary text.
- Never log resumes/JDs/answers server-side; in-memory only, sessions expire.
- Rate-limit AI routes per IP (express-rate-limit) to stop abuse of the demo key.

**Mobile** — primary device: tab bar thumb-friendly, kanban becomes stacked lists with stage move buttons, textareas grow, NUKE-style primary buttons ≥48px.

## 5. UI/UX — LOUD maximalist, three distinct textures (user directive 2026-10-10)

**One arcade, three themed cabinets.** Each module gets its own texture, palette, particles, and SFX personality — switching tabs should feel like walking to a different machine. VN logo/branding everywhere (header, footer, favicon).

- **Interview Dojo — dark arena.** Leather/mat texture feel (dark layered gradients), red + gold neon, ember particles drifting up, gong SFX on start, drum hit per question, belt-rank glow progression (White→Yellow→Green→Brown→Black). Screen shake on low scores, crowd cheer on high.
- **Resume Roaster — fire/grunge.** Charred dark background, flame particles, orange/red glow, fire-crackle SFX under the roast, sad-trombone sting, roast lines appear with a burn-in effect (chars flicker in with ember glow). Cha-ching on rewrite.
- **Job Tracker — neon command center.** Carbon-fiber/dark-grid texture, cyan/green holographic accents, stamp-thud SFX on stage moves, fanfare + confetti burst when an Offer is logged. Overdue follow-ups pulse red.

**Shared:** ALL SFX synthesized with WebAudio (zero audio files), mute toggle persisted in localStorage. Canvas particles, screen shake / impact moments, confetti. Mobile-first: big touch targets, kanban collapses to stacked lists with move buttons.

**Flow (one primary action per screen):**
- **Landing:** three big themed module cards with hover glow. "Enter the Dojo" primary button.
- **Dojo:** step 1 = paste JD + `START SPARRING`. Step 2 = question card (round x/5), answer box, `SUBMIT ANSWER`. Scoring animation: score counts up, belt progress bar fills. Final = report card with belt rank, per-answer breakdown, `REMATCH` button.
- **Roaster:** paste resume → two buttons: `ROAST ME` / `REWRITE IT`. Roast appears line-by-line with burn-in VFX; rewrite shows side-by-side with copy button.
- **Tracker:** columns/cards with counts, `+ ADD APPLICATION` modal (company, role, date, stage, follow-up date, notes, link). Stats strip on top. Export/import JSON.
- **Pro upsell:** when free quota hits 0, modal: "Out of training tokens — go Pro ($29, one-time, unlimited)" + key input + link to Gumroad product. Dismissible, tracker never gated.

**Simplicity rules:** plain labels ("Start sparring", not "Initialize interview session"); every AI action shows what it costs (token count visible); destructive actions (delete application) confirm first.
