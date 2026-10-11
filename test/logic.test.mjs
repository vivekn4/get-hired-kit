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

console.log(`\n${pass} tests passed.`);
