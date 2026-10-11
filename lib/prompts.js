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
/* Interview Dojo                                                      */
/* ------------------------------------------------------------------ */

export function interviewQuestionPrompt({ jobDescription, role, askedSoFar }) {
  const asked = askedSoFar.length
    ? `Questions already asked (do NOT repeat or closely paraphrase):\n${askedSoFar.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
    : "This is the first question.";
  return {
    system:
      "You are a tough-but-fair hiring manager running a mock interview. " +
      "Ask ONE sharp, role-specific interview question based on the job description. " +
      "No preamble, no commentary, no numbering — output ONLY the question text. " +
      "Vary the style: behavioral, situational, technical, or culture-fit. " +
      "Keep it under 40 words.",
    user:
      `Job description:\n${jobDescription}\n\n` +
      (role ? `Role title: ${role}\n\n` : "") +
      `${asked}\n\nAsk the next interview question.`,
  };
}

export function interviewScorePrompt({ question, answer, jobDescription }) {
  return {
    system:
      "You are a strict but fair interview coach. Score the candidate's answer 0–100. " +
      "Reply with ONLY valid JSON: " +
      '{"score": <number>, "feedback": "<2-3 sentences of specific, actionable feedback>", "strength": "<one thing they did well>", "fix": "<the single biggest thing to improve>"}. ' +
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

export function fallbackScore(answer) {
  const len = answer.trim().length;
  const hasExample = /\b(for example|for instance|when i|at my|in my (previous|last|current))\b/i.test(answer);
  const hasMetric = /\d/.test(answer);
  let score = 45;
  if (len > 120) score += 12;
  if (len > 300) score += 8;
  if (hasExample) score += 12;
  if (hasMetric) score += 10;
  score = Math.min(88, score);
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
