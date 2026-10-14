// Crafted by Vivek Nair (VN) — unit tests for get-hired-kit pure logic.
// Run: npm test  (node test/logic.test.mjs)
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateKey, verifyKeyFormat, normalizeKey, checksumFor,
  signProCookie, isProCookie,
} from "../lib/license.js";
import { Quota } from "../lib/quota.js";
import { escapeHtml, validText, looksLikeUrl, validateTrackerImport, fingerprint, clip } from "../lib/util.js";
import { beltFor, fallbackScore, FALLBACK_QUESTIONS, FALLBACK_ROAST_LINES, interviewQuestionPrompt, roastPrompt } from "../lib/prompts.js";
import { extractJson } from "../lib/gemini.js";

let pass = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`ok - ${name}`); } catch (e) { console.error(`FAIL - ${name}: ${e.message}`); process.exitCode = 1; } };

/* license keys */
t("generateKey produces GHK-XXXX-XXXX-XXXX shape", () => {
  const k = generateKey();
  assert.match(k, /^GHK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});
t("generated keys pass checksum verification", () => {
  for (let i = 0; i < 25; i++) {
    const r = verifyKeyFormat(generateKey());
    assert.equal(r.valid, true, r.reason);
  }
});
t("tampered key fails checksum", () => {
  const k = generateKey();
  const bad = k.slice(0, -1) + (k.endsWith("A") ? "B" : "A");
  assert.equal(verifyKeyFormat(bad).valid, false);
});
t("garbage key rejected", () => {
  assert.equal(verifyKeyFormat("hello").valid, false);
  assert.equal(verifyKeyFormat("GHK-AAAA-BBBB-CCCC").valid, false); // bad checksum
  assert.equal(verifyKeyFormat("").valid, false);
});
t("normalizeKey tolerates lowercase + missing prefix", () => {
  const k = generateKey();
  const lower = k.toLowerCase().replace("GHK-", "");
  assert.equal(verifyKeyFormat(lower).valid, true);
});
t("pro cookie sign/verify roundtrip", () => {
  const c = signProCookie();
  assert.equal(isProCookie(c), true);
  assert.equal(isProCookie("1.deadbeef"), false);
  assert.equal(isProCookie("2." + c.split(".")[1]), false);
  assert.equal(isProCookie(null), false);
});

/* quota */
t("quota allows N then blocks", () => {
  const q = new Quota(3);
  assert.equal(q.consume("1.2.3.4", "ua").allowed, true);
  assert.equal(q.consume("1.2.3.4", "ua").allowed, true);
  assert.equal(q.consume("1.2.3.4", "ua").allowed, true);
  const r = q.consume("1.2.3.4", "ua");
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0);
});
t("quota is per-client (ip+ua)", () => {
  const q = new Quota(1);
  q.consume("1.1.1.1", "a");
  assert.equal(q.consume("2.2.2.2", "a").allowed, true);
  assert.equal(q.consume("1.1.1.1", "b").allowed, true);
});
t("pro bypasses quota", () => {
  const q = new Quota(1);
  const r = q.consume("9.9.9.9", "x", true);
  assert.equal(r.allowed, true);
  assert.equal(r.pro, true);
});
t("fingerprint is stable + hex", () => {
  const f = fingerprint("1.2.3.4", "Mozilla", crypto);
  assert.match(f, /^[0-9a-f]{16}$/);
  assert.equal(f, fingerprint("1.2.3.4", "Mozilla", crypto));
});

/* util */
t("escapeHtml neutralizes XSS", () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('"onmouseover="x'), '&quot;onmouseover=&quot;x');
});
t("validText bounds", () => {
  assert.equal(validText("   ", { min: 1 }).ok, false);
  assert.equal(validText("abc", { min: 5 }).ok, false);
  assert.equal(validText("abcdef", { min: 5, max: 6 }).ok, true);
  assert.equal(validText("abcdefg", { max: 6 }).ok, false);
});
t("clip truncates", () => assert.equal(clip("abcdef", 3), "abc"));
t("looksLikeUrl", () => {
  assert.equal(looksLikeUrl("https://example.com/jobs/1"), true);
  assert.equal(looksLikeUrl("not a url"), false);
  assert.equal(looksLikeUrl("javascript:alert(1)"), false);
});
t("validateTrackerImport accepts good export", () => {
  const r = validateTrackerImport({
    app: "get-hired-kit-tracker",
    applications: [
      { id: "a1", company: "Acme", role: "Clerk", stage: "interview", dateApplied: "2026-10-01", followUp: "", notes: "", link: "https://acme.example/jobs" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.apps.length, 1);
  assert.equal(r.apps[0].company, "Acme");
});
t("validateTrackerImport rejects junk", () => {
  assert.equal(validateTrackerImport(null).ok, false);
  assert.equal(validateTrackerImport({ app: "nope", applications: [] }).ok, false);
  assert.equal(validateTrackerImport({ app: "get-hired-kit-tracker", applications: [{ company: "", role: "x", stage: "applied" }] }).ok, false);
  assert.equal(validateTrackerImport({ app: "get-hired-kit-tracker", applications: [{ company: "x", role: "y", stage: "boss" }] }).ok, false);
  assert.equal(validateTrackerImport({ app: "get-hired-kit-tracker", applications: [{ company: "x", role: "y", stage: "applied", link: "javascript:alert(1)" }] }).ok, true);
});

/* prompts */
t("beltFor thresholds", () => {
  assert.equal(beltFor(95).belt, "Black");
  assert.equal(beltFor(80).belt, "Brown");
  assert.equal(beltFor(70).belt, "Green");
  assert.equal(beltFor(55).belt, "Yellow");
  assert.equal(beltFor(10).belt, "White");
});
t("fallbackScore rewards examples + metrics", () => {
  const good = fallbackScore("For example, at my last job I cut checkout time by 30% by rebuilding the queue. ".repeat(6));
  const bad = fallbackScore("I am good.");
  assert.ok(good.score > bad.score, `${good.score} > ${bad.score}`);
  assert.ok(good.score <= 88);
});
t("fallback banks are non-empty", () => {
  assert.ok(FALLBACK_QUESTIONS.length >= 10);
  assert.ok(FALLBACK_ROAST_LINES.length >= 5);
});
t("interviewQuestionPrompt avoids repeats", () => {
  const p = interviewQuestionPrompt({ jobDescription: "Retail job", role: "Clerk", askedSoFar: ["Q1"] });
  assert.ok(p.user.includes("Q1"));
  assert.ok(p.system.length > 20);
});
t("roastPrompt has safety rails", () => {
  const p = roastPrompt({ resume: "x" });
  assert.ok(/never mock/i.test(p.system));
});
t("extractJson tolerates fences", () => {
  const o = extractJson('```json\n{"score": 80, "feedback": "ok"}\n```');
  assert.equal(o.score, 80);
  assert.equal(extractJson("not json at all"), null);
});

/* ---- ATS keyword gap check (lib/ats.js) ---- */
import { analyzeAts } from "../lib/ats.js";
import { fallbackRubric, normalizeDifficulty, DIFFICULTY_PRESETS, interviewScorePrompt } from "../lib/prompts.js";
import fs from "node:fs";
import vm from "node:vm";

const JD = "Retail Sales Associate. Must have: customer service, cash handling, inventory, POS system, merchandising, teamwork, weekend availability.";
const GOOD_RESUME = `SUMMARY\nRetail associate with 3 years of customer service experience.\nEXPERIENCE\n- Handled cash handling and POS system transactions, balancing $2,000 daily.\n- Managed inventory counts and merchandising displays, cutting stock errors by 20%.\n- Trained new staff on teamwork and weekend availability coverage.\nEDUCATION\nHigh school diploma.\nSKILLS\nCustomer service, cash handling, POS, inventory, merchandising.`;
const THIN_RESUME = `SUMMARY\nI am a hard worker.\nEXPERIENCE\n- Did various tasks.\nEDUCATION\nHigh school.`;

t("ats: strong resume outscores thin resume on same JD", () => {
  const good = analyzeAts(GOOD_RESUME, JD);
  const thin = analyzeAts(THIN_RESUME, JD);
  assert.ok(good.score > thin.score, `${good.score} > ${thin.score}`);
  assert.ok(good.score >= 55);
  assert.ok(thin.score < 55);
});
t("ats: missing terms are JD-only terms, matched are present terms", () => {
  const r = analyzeAts(THIN_RESUME, JD);
  const missing = r.missing.map((m) => m.term);
  const matched = r.matched.map((m) => m.term);
  assert.ok(missing.includes("inventory") || missing.includes("merchandising"));
  assert.ok(!matched.includes("inventory"));
  assert.ok(r.suggestions.length >= 1);
  assert.ok(["ATS-READY", "CLOSE — PATCH THE GAPS", "NEEDS WORK"].includes(r.verdict));
});
t("ats: bigram matching requires consecutive words (no false positives)", () => {
  const r = analyzeAts("I love customer care. Service quality is my passion. Nothing else.", "customer service skills");
  // "customer" and "service" appear but never consecutively → "customer service" must be missing
  assert.ok(r.missing.map((m) => m.term).includes("customer service"));
});
t("ats: sections detected + no-JD mode uses generic terms", () => {
  const r = analyzeAts(GOOD_RESUME, JD);
  assert.equal(r.sections.experience, true);
  assert.equal(r.sections.skills, true);
  assert.ok(r.metrics.quantifiedBullets >= 2);
  const noJd = analyzeAts(GOOD_RESUME, "");
  assert.equal(noJd.usedGenericTerms, true);
  assert.ok(noJd.termsChecked > 0);
});
t("ats: no junk bigrams across sentence boundaries", () => {
  const r = analyzeAts(GOOD_RESUME, JD);
  const all = [...r.matched, ...r.missing].map((m) => m.term);
  assert.ok(!all.some((t) => t.includes(".") || t.includes("must")), `junk terms: ${all.join(", ")}`);
  assert.ok(all.includes("customer service"));
});
t("ats: deterministic", () => {
  assert.deepEqual(analyzeAts(GOOD_RESUME, JD), analyzeAts(GOOD_RESUME, JD));
});

/* ---- rubric + difficulty ---- */
t("normalizeDifficulty defaults + validates", () => {
  assert.equal(normalizeDifficulty("beast"), "beast");
  assert.equal(normalizeDifficulty("BOGUS"), "standard");
  assert.equal(normalizeDifficulty(""), "standard");
  assert.equal(DIFFICULTY_PRESETS.beast.fallbackCap < DIFFICULTY_PRESETS.chill.fallbackCap, true);
});
t("fallbackRubric returns 5 dims 0-100, weighted overall", () => {
  const { dimensions, overall } = fallbackRubric(
    "For example, at my last job I cut checkout time by 30% by rebuilding the queue. The situation was a slow checkout, my task was to fix it, I rebuilt the queue, and the result was a 30% faster checkout.",
    "checkout queue retail cashier speed"
  );
  assert.deepEqual(Object.keys(dimensions).sort(), ["example", "metrics", "punch", "relevance", "structure"]);
  for (const v of Object.values(dimensions)) assert.ok(v >= 0 && v <= 100);
  assert.ok(overall >= 0 && overall <= 100);
  assert.ok(dimensions.example >= 60 && dimensions.metrics >= 60);
});
t("fallbackRubric: example-rich answer beats thin answer on example dim", () => {
  const rich = fallbackRubric("For example, when I worked at Acme I led a team of 4 and cut returns by 15%.", "");
  const thin = fallbackRubric("I am good at things.", "");
  assert.ok(rich.dimensions.example > thin.dimensions.example);
  assert.ok(rich.overall > thin.overall);
});
t("fallbackScore carries dimensions + difficulty caps beast lower than chill", () => {
  const beast = fallbackScore("For example, I cut errors by 30% at my last job. ".repeat(8), { difficulty: "beast" });
  const chill = fallbackScore("For example, I cut errors by 30% at my last job. ".repeat(8), { difficulty: "chill" });
  assert.ok(beast.dimensions && chill.dimensions);
  assert.ok(beast.score <= DIFFICULTY_PRESETS.beast.fallbackCap);
  assert.ok(chill.score <= DIFFICULTY_PRESETS.chill.fallbackCap);
  assert.ok(chill.score >= beast.score);
});
t("interviewScorePrompt asks for dimensions JSON", () => {
  const p = interviewScorePrompt({ question: "Q", answer: "A", jobDescription: "JD", difficulty: "beast" });
  assert.ok(p.system.includes("dimensions"));
  assert.ok(p.system.includes("harshly"));
  const chill = interviewScorePrompt({ question: "Q", answer: "A", jobDescription: "JD", difficulty: "chill" });
  assert.ok(chill.system.includes("generously"));
});

/* ---- tracker logic (public/js/tracker_logic.js via vm) ---- */
const trackerSrc = fs.readFileSync(new URL("../public/js/tracker_logic.js", import.meta.url), "utf8");
const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(trackerSrc, sandbox);
const T = sandbox.module.exports;

t("tracker: ghosted after 14 days in applied/screening only", () => {
  const old = { stage: "applied", dateApplied: "2026-01-01" };
  assert.equal(T.isGhosted(old, "2026-01-20"), true);
  assert.equal(T.isGhosted(old, "2026-01-10"), false);
  assert.equal(T.isGhosted({ stage: "interview", dateApplied: "2026-01-01" }, "2026-01-20"), false);
  assert.equal(T.isGhosted({ stage: "offer", dateApplied: "2026-01-01" }, "2026-01-20"), false);
  assert.equal(T.GHOST_DAYS, 14);
});
t("tracker: dueStatus overdue/soon/ok/none", () => {
  assert.equal(T.dueStatus({ followUp: "2026-01-01", stage: "applied" }, "2026-01-05"), "overdue");
  assert.equal(T.dueStatus({ followUp: "2026-01-06", stage: "applied" }, "2026-01-05"), "soon");
  assert.equal(T.dueStatus({ followUp: "2026-02-01", stage: "applied" }, "2026-01-05"), "ok");
  assert.equal(T.dueStatus({ followUp: "2026-01-01", stage: "offer" }, "2026-01-05"), "none");
  assert.equal(T.dueStatus({ stage: "applied" }, "2026-01-05"), "none");
});
t("tracker: appendHistory caps at 50 + migrate v1 adds created event", () => {
  const a = { stage: "applied" };
  for (let i = 0; i < 60; i++) T.appendHistory(a, "status_change", { from: "applied", to: "screening" });
  assert.equal(a.history.length, 50);
  const m = T.migrateTracker({ apps: [{ company: "Acme", role: "Clerk", stage: "applied" }] });
  assert.equal(m.version, 2);
  assert.equal(m.apps[0].history.length, 1);
  assert.equal(m.apps[0].history[0].type, "created");
  const m2 = T.migrateTracker({ apps: [{ company: "Acme", role: "Clerk", stage: "applied", history: [{ at: "2026-01-01", type: "created" }] }] });
  assert.equal(m2.apps[0].history.length, 1); // existing history preserved, not duplicated
  assert.equal(T.migrateTracker({ apps: [{ company: "", role: "x" }] }).apps.length, 0);
});
t("tracker: filterApps by query + stage", () => {
  const apps = [
    { company: "Acme", role: "Clerk", notes: "", stage: "applied" },
    { company: "Globex", role: "Manager", notes: "retail", stage: "interview" },
  ];
  assert.equal(T.filterApps(apps, { query: "acme" }).length, 1);
  assert.equal(T.filterApps(apps, { query: "retail" }).length, 1);
  assert.equal(T.filterApps(apps, { stage: "interview" }).length, 1);
  assert.equal(T.filterApps(apps, { query: "zzz" }).length, 0);
  assert.equal(T.filterApps(apps, {}).length, 2);
});
t("tracker: streakDays counts consecutive days, tolerates missing today", () => {
  assert.equal(T.streakDays([{ date: "2026-10-14" }, { date: "2026-10-13" }, { date: "2026-10-12" }], "2026-10-14"), 3);
  assert.equal(T.streakDays([{ date: "2026-10-13" }, { date: "2026-10-12" }], "2026-10-14"), 2);
  assert.equal(T.streakDays([{ date: "2026-10-10" }], "2026-10-14"), 0);
  assert.equal(T.streakDays([], "2026-10-14"), 0);
});

console.log(`\n${pass} tests passed.`);
