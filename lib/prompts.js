// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Prompt templates for the Gemini interviewer / roaster / rewriter,
// plus built-in fallback banks so the app never hard-fails when the
// AI API is down or no key is configured ("training dummy" mode).

export const LIMITS = {
  jobDescription: 4000,
  resume: 8000,
  answer: 3000,
};

/* ------------------------------------------------------------------ */
/* Interview difficulty (original VN ladder: Chill / Standard / Beast) */
/* ------------------------------------------------------------------ */

export const DIFFICULTIES = ["chill", "standard", "beast"];

export const DIFFICULTY_PRESETS = {
  chill: {
    label: "Chill 🟢",
    questionStyle: "Ask a warm, straightforward question. One clear ask, no traps.",
    scoreStyle: "Score generously: reward effort and partial answers.",
    fallbackBase: 52,
    fallbackCap: 92,
  },
  standard: {
    label: "Standard 🟡",
    questionStyle: "Ask a sharp, role-specific question. Behavioral, situational, technical, or culture-fit.",
    scoreStyle: "Score fairly: strong answers earn 80+, vague answers land below 55.",
    fallbackBase: 45,
    fallbackCap: 88,
  },
  beast: {
    label: "Beast 🔴",
    questionStyle: "Ask a hard, adversarial question: a hostile follow-up, a failure post-mortem, or a pressure scenario. Demand specifics and numbers.",
    scoreStyle: "Score harshly: only concrete, metric-backed, well-structured answers earn 80+. Hand-waving earns under 50.",
    fallbackBase: 40,
    fallbackCap: 82,
  },
};

export function normalizeDifficulty(d) {
  const v = String(d || "").trim().toLowerCase();
  return DIFFICULTIES.includes(v) ? v : "standard";
}

/* ------------------------------------------------------------------ */
/* Rubric dimensions — one overall score + 5 explainable sub-scores.   */
/* The AI returns them; the offline fallback computes each from        */
/* observable signals (see fallbackRubric). Weights sum to 1.          */
/* ------------------------------------------------------------------ */

export const RUBRIC_DIMENSIONS = [
  { id: "structure", label: "Structure", weight: 0.25 },
  { id: "example", label: "Real example", weight: 0.25 },
  { id: "metrics", label: "Metrics & proof", weight: 0.2 },
  { id: "relevance", label: "Role relevance", weight: 0.2 },
  { id: "punch", label: "Punchy delivery", weight: 0.1 },
];

const STAR_HINTS = /\b(situation|task|action|result|context|challenge|outcome|impact|learned|changed)\b/i;
const EXAMPLE_HINTS = /\b(for example|for instance|when i|at my|in my (previous|last|current)|once|last year|recently)\b/i;
const FILLER_HINTS = /\b(um+|uh+|like,|you know|basically|i think|kind of|sort of|stuff|things)\b/gi;
const STRONG_VERBS = /\b(built|led|shipped|cut|grew|launched|fixed|drove|owned|delivered|reduced|increased|designed|automated|negotiated|mentored)\b/i;

/**
 * Offline rubric: score each dimension 0–100 from observable answer signals.
 * jd is optional; without it, relevance falls back to a neutral midpoint.
 */
export function fallbackRubric(answer, jobDescription = "") {
  const text = String(answer || "").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const wc = words.length;
  const hasExample = EXAMPLE_HINTS.test(text);
  const hasStar = STAR_HINTS.test(text);
  const digitCount = (text.match(/\d/g) || []).length;
  const hasMetric = /\d\s*(%|\$|€|£|x|\+|million|billion|hours?|days?|weeks?|months?)/i.test(text) || digitCount >= 2;
  const fillerCount = (text.match(FILLER_HINTS) || []).length;
  const strongVerbCount = (text.match(new RegExp(STRONG_VERBS.source, "gi")) || []).length;

  // Structure: STAR shape + sane length (60–350 words is the sweet spot).
  let structure = 35;
  if (hasStar) structure += 25;
  if (wc >= 60) structure += 15;
  if (wc >= 120) structure += 10;
  if (wc > 450) structure -= 15; // ramble penalty

  // Example: concrete story beats generic claims.
  let example = 30;
  if (hasExample) example += 40;
  if (/\b(i|we)\b/i.test(text) && /\b(ed\b|built|led|fixed)/i.test(text)) example += 10;
  if (wc >= 120) example += 5;

  // Metrics: numbers with units beat bare numbers beat none.
  let metrics = 25;
  if (digitCount >= 1) metrics += 20;
  if (hasMetric) metrics += 35;
  if (digitCount >= 4) metrics += 10;

  // Relevance: overlap between answer tokens and JD content tokens.
  let relevance = 55; // neutral when no JD is available
  const jdWords = new Set(
    String(jobDescription || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/).filter((w) => w.length > 3)
  );
  if (jdWords.size >= 5) {
    const ansSet = new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/));
    let hits = 0;
    for (const w of jdWords) if (ansSet.has(w)) hits++;
    relevance = Math.round(25 + Math.min(70, (hits / Math.min(jdWords.size, 40)) * 140));
  }

  // Punch: strong verbs + low filler + tight length.
  let punch = 55;
  if (strongVerbCount >= 1) punch += 12;
  if (strongVerbCount >= 3) punch += 10;
  punch -= Math.min(30, fillerCount * 8);
  if (wc > 400) punch -= 10;
  if (wc < 25) punch -= 20;

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const dimensions = {
    structure: clamp(structure),
    example: clamp(example),
    metrics: clamp(metrics),
    relevance: clamp(relevance),
    punch: clamp(punch),
  };
  const overall = Math.round(
    RUBRIC_DIMENSIONS.reduce((s, d) => s + dimensions[d.id] * d.weight, 0)
  );
  return { dimensions, overall };
}

/* ------------------------------------------------------------------ */
/* Interview Dojo                                                      */
/* ------------------------------------------------------------------ */

export function interviewQuestionPrompt({ jobDescription, role, askedSoFar, difficulty = "standard" }) {
  const asked = askedSoFar.length
    ? `Questions already asked (do NOT repeat or closely paraphrase):\n${askedSoFar.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "This is the first question.";
  const preset = DIFFICULTY_PRESETS[normalizeDifficulty(difficulty)];
  return {
    system:
      "You are a tough-but-fair hiring manager running a mock interview. " +
      "Ask ONE sharp, role-specific interview question based on the job description. " +
      "No preamble, no commentary, no numbering — output ONLY the question text. " +
      preset.questionStyle + " " +
      "Keep it under 40 words.",
    user:
      `Job description:\n${jobDescription}\n\n` +
      (role ? `Role title: ${role}\n\n` : "") +
      `${asked}\n\nAsk the next interview question.`,
  };
}

export function interviewScorePrompt({ question, answer, jobDescription, difficulty = "standard" }) {
  const preset = DIFFICULTY_PRESETS[normalizeDifficulty(difficulty)];
  return {
    system:
      "You are a strict but fair interview coach. Score the candidate's answer 0–100. " +
      preset.scoreStyle + " " +
      "Reply with ONLY valid JSON: " +
      '{"score": <number>, "feedback": "<2-3 sentences of specific, actionable feedback>", "strength": "<one thing they did well>", "fix": "<the single biggest thing to improve>", ' +
      '"dimensions": {"structure": <0-100>, "example": <0-100>, "metrics": <0-100>, "relevance": <0-100>, "punch": <0-100>}}. ' +
      "Dimensions: structure = clear STAR-shaped flow; example = anchored in a real story; metrics = numbers/proof; relevance = tied to the job; punch = tight, filler-free delivery. " +
      "No markdown fences, no extra text.",
    user:
      `Interview question: ${question}\n\n` +
      `Candidate answer: ${answer}\n\n` +
      `Job context: ${jobDescription.slice(0, 1500)}`,
  };
}

/* ------------------------------------------------------------------ */
/* Resume Roaster                                                      */
/* ------------------------------------------------------------------ */

export function roastPrompt({ resume }) {
  return {
    system:
      "You are a savage-but-fair resume roaster with a heart of gold — think comedy roast, " +
      "not cruelty. Roast the resume's REAL flaws: weak action verbs, vague claims, " +
      "formatting sins, buzzword soup, missing metrics. NEVER mock anyone's name, " +
      "background, age, gender, ethnicity, disability, or employment gaps — punch at " +
      "the document, never the person. 6–9 punchy lines. End with one genuinely " +
      "encouraging line. Plain text, no markdown headers.",
    user: `Roast this resume:\n${resume}`,
  };
}

export function rewritePrompt({ resume, jobDescription }) {
  return {
    system:
      "You are an expert resume writer. Rewrite the resume to be concise, ATS-friendly, " +
      "and punchy: strong action verbs, quantified achievements where plausible from " +
      "context (never invent employers or degrees), clean sections (Summary, Experience, " +
      "Skills, Education). Keep it truthful to the source — improve wording, not facts. " +
      "Output ONLY the rewritten resume as plain text.",
    user:
      `Resume:\n${resume}` +
      (jobDescription ? `\n\nTailor it toward this job:\n${jobDescription}` : ""),
  };
}

/* ------------------------------------------------------------------ */
/* Fallback banks (training-dummy mode — zero API needed)              */
/* ------------------------------------------------------------------ */

export const FALLBACK_QUESTIONS = [
  "Walk me through your background and why you're a fit for this role.",
  "Tell me about a time you missed a deadline. What happened and what did you change?",
  "Describe a disagreement you had with a teammate or manager and how you resolved it.",
  "What's the hardest technical problem you've solved recently? Walk me through your approach.",
  "Tell me about a time you had to learn something completely new under pressure.",
  "How do you prioritize when everything on your plate is marked urgent?",
  "Describe a project you're proud of. What was your specific contribution?",
  "Tell me about a time you received tough feedback. How did you respond?",
  "Where do you see the biggest gap between your skills and this role — and how would you close it?",
  "Why this company and this role, specifically?",
];

export const FALLBACK_ROAST_LINES = [
  "This resume has more buzzwords than a startup pitch deck on demo day.",
  '"Responsible for various tasks" — ah yes, the professional way of saying "I showed up."',
  "Your skills section lists everything except evidence you can do any of it.",
  "There are numbers nowhere on this page. Did you achieve things, or just witness them?",
  "\"Detail-oriented\" — spelled consistently, I'll give you that one.",
  "This reads like it was written to impress an ATS robot AND a human, and somehow impressed neither.",
  "Two pages to say what one sharp page could. Brevity is a skill too, champ.",
  "Here's the good news: the raw material is here. It just needs a blacksmith, not a poet.",
];

export function fallbackScore(answer, { jobDescription = "", difficulty = "standard" } = {}) {
  const preset = DIFFICULTY_PRESETS[normalizeDifficulty(difficulty)];
  const { dimensions, overall } = fallbackRubric(answer, jobDescription);
  // Blend: rubric overall carries the score, nudged by difficulty base/cap.
  const len = answer.trim().length;
  const hasExample = /\b(for example|for instance|when i|at my|in my (previous|last|current))\b/i.test(answer);
  const hasMetric = /\d/.test(answer);
  let score = Math.round(overall * 0.85 + preset.fallbackBase * 0.15);
  score = Math.min(preset.fallbackCap, score);
  const feedback =
    "Training-dummy scoring (AI offline): " +
    (hasExample ? "good — you anchored with a real example. " : "add a concrete example from your experience. ") +
    (hasMetric ? "Numbers make it believable — nice. " : "Drop in a metric or outcome to make it land harder. ") +
    (len < 120 ? "This is too short — aim for 4–6 sentences." : "Solid length — tighten the opening line.");
  return {
    score,
    feedback,
    strength: hasExample ? "Used a concrete example" : len > 300 ? "Thorough answer" : "Showed up and answered",
    fix: hasExample ? (hasMetric ? "Sharpen the closing line" : "Add a measurable outcome") : "Anchor every answer in a real story",
    dimensions,
  };
}

/** Belt rank from average score (0–100). */
export function beltFor(avg) {
  if (avg >= 90) return { belt: "Black", color: "#1a1a1a", glow: "#e8e8e8" };
  if (avg >= 78) return { belt: "Brown", color: "#6b3a1e", glow: "#c98a4b" };
  if (avg >= 65) return { belt: "Green", color: "#15803d", glow: "#4ade80" };
  if (avg >= 50) return { belt: "Yellow", color: "#a16207", glow: "#facc15" };
  return { belt: "White", color: "#e5e5e5", glow: "#ffffff" };
}
