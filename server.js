// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
/**
 * GET HIRED KIT — career dojo API
 * --------------------------------
 * Hardened Express backend: helmet, CORS allowlist, per-IP rate limiting,
 * structured JSON logging, request validation, 60s AI timeout, graceful
 * JSON errors — the server NEVER crashes and NEVER leaks stack traces,
 * API keys, resumes, job descriptions, or answers.
 *
 * AI: Google's FREE Gemini OpenAI-compatible endpoint. Key lives ONLY in
 * GEMINI_API_KEY env — never in code, never in logs.
 *
 * Freemium: 3 AI generations/day per client (soft quota). Pro ($29 one-time
 * via Gumroad) unlocks unlimited via HMAC-signed cookie. See README for
 * the honest v1 tradeoffs.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chatComplete, extractJson, aiConfigured } from "./lib/gemini.js";
import {
  interviewQuestionPrompt,
  interviewScorePrompt,
  roastPrompt,
  rewritePrompt,
  FALLBACK_QUESTIONS,
  FALLBACK_ROAST_LINES,
  fallbackScore,
  beltFor,
  LIMITS,
} from "./lib/prompts.js";
import { verifyKey, signProCookie, isProCookie } from "./lib/license.js";
import { Quota } from "./lib/quota.js";
import { escapeHtml, validText, clip } from "./lib/util.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 3000;
const FREE_DAILY_QUOTA = Number(process.env.FREE_DAILY_QUOTA) || 3;
const FRONTEND_URL = (process.env.FRONTEND_URL || "").trim();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 200;
const TRUST_PROXY = process.env.TRUST_PROXY ?? "1";
const GUMROAD_PRODUCT_URL = (process.env.GUMROAD_PRODUCT_URL || "").trim();
const GUMROAD_ACCESS_TOKEN = (process.env.GUMROAD_ACCESS_TOKEN || "").trim();
const IS_PROD = process.env.NODE_ENV === "production";

const VERSION = "1.0.0";
const SERVICE = "get-hired-kit";
const ROUNDS = 5;
const SESSION_TTL_MS = 30 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Structured logger (JSON lines; NEVER logs user content)              */
/* ------------------------------------------------------------------ */

function log(level, event, fields = {}) {
  const rec = { ts: new Date().toISOString(), level, service: SERVICE, event, ...fields };
  (level === "error" ? console.error : console.log)(JSON.stringify(rec));
}

/* ------------------------------------------------------------------ */
/* App setup                                                           */
/* ------------------------------------------------------------------ */

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", TRUST_PROXY);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: FRONTEND_URL ? FRONTEND_URL.split(",").map((s) => s.trim()) : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "64kb" }));

const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests — take a breath, champ." },
});
app.use(globalLimiter);

// Tighter limit on AI routes to protect the demo key.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Whoa — slow down. The dojo needs a breather (1 min)." },
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "?";
}

function getCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isPro(req) {
  return isProCookie(getCookies(req).ghk_pro);
}

const quota = new Quota(FREE_DAILY_QUOTA);

/** Gate an AI route: pro bypasses; free tier needs tokens left (no consume here).
 *  Routes consume exactly one token when they actually call the AI —
 *  dummy (offline) mode is always free so the demo never paywalls. */
function quotaCheck(req, res, next) {
  if (isPro(req)) {
    req.quotaInfo = { pro: true, remaining: Infinity };
    return next();
  }
  const remaining = quota.remaining(clientIp(req), req.headers["user-agent"]);
  req.quotaInfo = { pro: false, remaining };
  if (remaining <= 0) {
    return res.status(402).json({
      error: "OUT_OF_TOKENS",
      message: "Out of training tokens for today — go Pro ($29, one-time, unlimited) or come back tomorrow.",
      proUrl: GUMROAD_PRODUCT_URL || null,
      remaining: 0,
    });
  }
  next();
}

/** Consume one free token (no-op for Pro). Returns remaining ("unlimited" for Pro). */
function spendToken(req) {
  if (isPro(req)) return "unlimited";
  const r = quota.consume(clientIp(req), req.headers["user-agent"], false);
  return r.remaining;
}

function quotaLeft(req) {
  return isPro(req) ? "unlimited" : quota.remaining(clientIp(req), req.headers["user-agent"]);
}

function friendlyAiError(err) {
  if (err?.code === "NO_KEY") return { status: 200, dummy: true, note: "Training-dummy mode (no AI key configured)." };
  return { status: 502, message: err?.message || "The AI service hiccuped. Training dummy stepping in." };
}

/* ------------------------------------------------------------------ */
/* Interview sessions (in-memory, TTL sweep)                            */
/* ------------------------------------------------------------------ */

const sessions = new Map(); // id -> { jd, role, round, asked, qa, updatedAt, dummy }

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60_000).unref();

function newSessionId() {
  return crypto.randomBytes(12).toString("hex");
}

/** Ask the AI (or dummy) for the next question. */
async function nextQuestion(session) {
  if (!aiConfigured()) {
    const pool = FALLBACK_QUESTIONS.filter((q) => !session.asked.includes(q));
    const q = pool.length ? pool[Math.floor(Math.random() * pool.length)] : FALLBACK_QUESTIONS[session.round % FALLBACK_QUESTIONS.length];
    return { question: q, dummy: true };
  }
  const { system, user } = interviewQuestionPrompt({
    jobDescription: session.jd,
    role: session.role,
    askedSoFar: session.asked,
  });
  try {
    const question = await chatComplete({ system, user, maxTokens: 120 });
    return { question: question.trim(), dummy: false };
  } catch (err) {
    const pool = FALLBACK_QUESTIONS.filter((q) => !session.asked.includes(q));
    const q = pool.length ? pool[0] : FALLBACK_QUESTIONS[session.round % FALLBACK_QUESTIONS.length];
    return { question: q, dummy: true, note: friendlyAiError(err).message || friendlyAiError(err).note };
  }
}

/** Score an answer via AI (or dummy). Always returns a score object. */
async function scoreAnswer({ question, answer, jd }) {
  if (!aiConfigured()) return { ...fallbackScore(answer), dummy: true };
  const { system, user } = interviewScorePrompt({ question, answer, jobDescription: jd });
  try {
    const raw = await chatComplete({ system, user, maxTokens: 400 });
    const parsed = extractJson(raw);
    if (parsed && typeof parsed.score === "number") {
      return {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        feedback: clip(String(parsed.feedback || "No feedback."), 600),
        strength: clip(String(parsed.strength || "—"), 200),
        fix: clip(String(parsed.fix || "—"), 200),
        dummy: false,
      };
    }
    throw new Error("off-format");
  } catch {
    return { ...fallbackScore(answer), dummy: true };
  }
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: SERVICE, version: VERSION, ai: aiConfigured(), proUrl: GUMROAD_PRODUCT_URL || null });
});

app.get("/api/quota", (req, res) => {
  const pro = isPro(req);
  res.json({
    pro,
    remaining: pro ? Infinity : quota.remaining(clientIp(req), req.headers["user-agent"]),
    daily: FREE_DAILY_QUOTA,
  });
});

/* Interview Dojo */

app.post("/api/interview/start", aiLimiter, quotaCheck, async (req, res) => {
  const jd = validText(req.body?.jobDescription, { min: 20, max: LIMITS.jobDescription, label: "Job description" });
  if (!jd.ok) return res.status(400).json({ error: jd.error });
  const role = clip(req.body?.role || "", 120).trim();

  const session = {
    id: newSessionId(),
    jd: jd.value,
    role,
    round: 0,
    asked: [],
    qa: [],
    updatedAt: Date.now(),
  };
  const { question, dummy, note } = await nextQuestion(session);
  if (!dummy) spendToken(req); // one interview = one token; answers ride along
  session.round = 1;
  session.asked.push(question);
  session.updatedAt = Date.now();
  sessions.set(session.id, session);

  log("info", "interview_start", { dummy: Boolean(dummy) });
  res.json({
    sessionId: session.id,
    round: 1,
    totalRounds: ROUNDS,
    question,
    dummy: Boolean(dummy),
    note: note || null,
    quota: quotaLeft(req),
  });
});

app.post("/api/interview/answer", aiLimiter, async (req, res) => {
  const session = sessions.get(req.body?.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session expired or unknown — start a new sparring round." });
  }
  if (session.scoring) {
    return res.status(409).json({ error: "Already scoring that answer — hold your stance." });
  }
  const a = validText(req.body?.answer, { min: 5, max: LIMITS.answer, label: "Answer" });
  if (!a.ok) return res.status(400).json({ error: a.error });

  session.scoring = true;
  try {
  const question = session.asked[session.asked.length - 1];
  const scored = await scoreAnswer({ question, answer: a.value, jd: session.jd });
  session.qa.push({ question, answer: a.value, ...scored });
  session.updatedAt = Date.now();

  const done = session.qa.length >= ROUNDS;
  if (done) {
    const avg = Math.round(session.qa.reduce((s, x) => s + x.score, 0) / session.qa.length);
    const belt = beltFor(avg);
    sessions.delete(session.id);
    log("info", "interview_done", { avg, belt: belt.belt });
    return res.json({
      done: true,
      score: scored.score,
      feedback: scored.feedback,
      strength: scored.strength,
      fix: scored.fix,
      dummy: scored.dummy,
      report: {
        average: avg,
        belt: belt.belt,
        rounds: session.qa.map((x) => ({
          question: x.question,
          score: x.score,
          feedback: x.feedback,
          strength: x.strength,
          fix: x.fix,
        })),
      },
    });
  }

  const { question: q2, dummy, note } = await nextQuestion(session);
  session.round += 1;
  session.asked.push(q2);
  session.updatedAt = Date.now();

  res.json({
    done: false,
    score: scored.score,
    feedback: scored.feedback,
    strength: scored.strength,
    fix: scored.fix,
    dummy: scored.dummy,
    round: session.round,
    totalRounds: ROUNDS,
    question: q2,
    note: note || null,
  });
  } finally {
    session.scoring = false;
  }
});

/* Resume Roaster */

app.post("/api/roast", aiLimiter, quotaCheck, async (req, res) => {
  const r = validText(req.body?.resume, { min: 50, max: LIMITS.resume, label: "Resume" });
  if (!r.ok) return res.status(400).json({ error: r.error });

  if (!aiConfigured()) {
    log("info", "roast", { dummy: true });
    return res.json({
      roast: FALLBACK_ROAST_LINES.join("\n"),
      dummy: true,
      note: "Training-dummy roast (no AI key configured). Still stings, doesn't it?",
      quota: quotaLeft(req),
    });
  }
  spendToken(req);
  const { system, user } = roastPrompt({ resume: r.value });
  try {
    const roast = await chatComplete({ system, user, maxTokens: 800 });
    log("info", "roast", { dummy: false });
    res.json({ roast: roast.trim(), dummy: false, quota: quotaLeft(req) });
  } catch (err) {
    log("warn", "roast_fallback", { code: err?.code });
    res.json({
      roast: FALLBACK_ROAST_LINES.join("\n"),
      dummy: true,
      note: friendlyAiError(err).message || "Training dummy stepping in.",
      quota: quotaLeft(req),
    });
  }
});

app.post("/api/rewrite", aiLimiter, quotaCheck, async (req, res) => {
  const r = validText(req.body?.resume, { min: 50, max: LIMITS.resume, label: "Resume" });
  if (!r.ok) return res.status(400).json({ error: r.error });
  const jdRaw = typeof req.body?.jobDescription === "string" ? req.body.jobDescription.trim() : "";
  const jd = jdRaw ? clip(jdRaw, LIMITS.jobDescription) : "";

  if (!aiConfigured()) {
    log("info", "rewrite", { dummy: true });
    return res.json({
      rewrite:
        "TRAINING-DUMMY REWRITE (connect an AI key for the real thing):\n\n" +
        "Quick wins for this resume:\n" +
        "1. Open with a 2-line summary targeting the role.\n" +
        "2. Start every bullet with a strong verb (Built, Led, Shipped, Cut, Grew).\n" +
        "3. Add numbers to at least 3 bullets (%, $, time saved).\n" +
        "4. Kill the objective statement and the 'references available' line.\n" +
        "5. One page unless you have 10+ years.",
      dummy: true,
      note: "Training-dummy rewrite (no AI key configured).",
      quota: quotaLeft(req),
    });
  }
  spendToken(req);
  const { system, user } = rewritePrompt({ resume: r.value, jobDescription: jd });
  try {
    const rewrite = await chatComplete({ system, user, maxTokens: 1500 });
    log("info", "rewrite", { dummy: false });
    res.json({ rewrite: rewrite.trim(), dummy: false, quota: quotaLeft(req) });
  } catch (err) {
    log("warn", "rewrite_fallback", { code: err?.code });
    res.status(502).json({ error: friendlyAiError(err).message || "Rewrite failed — try again in a minute." });
  }
});

/* License / Pro */

app.post("/api/license/verify", async (req, res) => {
  const key = req.body?.key;
  if (!key || typeof key !== "string") return res.status(400).json({ valid: false, error: "Enter your license key." });
  const result = await verifyKey(key, { gumroadToken: GUMROAD_ACCESS_TOKEN || null });
  if (!result.valid) {
    log("info", "license_rejected", { via: result.via });
    return res.status(200).json({ valid: false, error: result.reason });
  }
  const cookieVal = signProCookie();
  res.setHeader(
    "Set-Cookie",
    `ghk_pro=${encodeURIComponent(cookieVal)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${IS_PROD ? "; Secure" : ""}`
  );
  log("info", "license_accepted", { via: result.via });
  res.json({ valid: true, tier: "pro", via: result.via });
});

/* SPA fallback + static */

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown API route." }));
app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  log("error", "unhandled", { message: err?.message });
  res.status(500).json({ error: "Something broke in the dojo. Try again." });
});

app.listen(PORT, () => log("info", "boot", { port: PORT, ai: aiConfigured() }));
