// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// ATS KEYWORD GAP CHECK — deterministic, zero-AI, always free (no tokens).
//
// Mechanism (learned at a high level from studying open-source resume tools,
// re-implemented here in original code): compare the words/phrases a job
// description actually emphasizes against the resume, report which ones are
// present vs missing, and add parser-readability signals (section headings,
// quantified bullets, sane length). Nothing here is copied from any other
// implementation — tokenization, phrase weighting, scoring weights, and
// suggestion copy are all original to this repo.
//
// What it is NOT: a real ATS. Real applicant-tracking systems differ wildly
// and also weigh formatting, file type, and recruiter behavior. This is a
// sparring-partner signal: "these JD words never appear in your resume."

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "as", "is", "are", "was", "were", "be", "been",
  "will", "would", "can", "could", "should", "you", "your", "we", "our",
  "they", "their", "this", "that", "these", "those", "it", "its", "who",
  "whom", "which", "what", "when", "where", "how", "why", "have", "has",
  "had", "do", "does", "did", "not", "no", "yes", "if", "then", "than",
  "into", "over", "under", "per", "via", "etc", "including", "include",
  "role", "job", "work", "working", "team", "company", "position", "must",
  "shall", "may", "might", "need", "needs", "required", "requirements", "preferred",
]);

// Generic professional vocabulary used ONLY when no job description is
// supplied, so the check still says something useful about a bare resume.
const GENERIC_TERMS = [
  "communication", "teamwork", "leadership", "problem solving", "results",
  "deadline", "customer", "data", "project", "budget", "analysis",
  "quality", "process", "training", "sales", "support", "planning",
  "reporting", "collaboration", "initiative",
];

const SECTION_PATTERNS = {
  summary: /^\s*(summary|profile|objective|about)\b/im,
  experience: /^\s*(experience|work history|employment|professional experience)\b/im,
  education: /^\s*(education|academic|qualifications)\b/im,
  skills: /^\s*(skills|technical skills|core skills|competencies)\b/im,
  projects: /^\s*(projects|selected projects)\b/im,
};

/** Normalize text into a token stream: lowercase, keep + # / inside words. */
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, "").replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1);
}

/** Content tokens = tokens minus stopwords. */
function contentTokens(text) {
  return tokenize(text).filter((t) => !STOPWORDS.has(t));
}

/**
 * Extract candidate JD phrases: unigrams + consecutive bigrams, weighted by
 * (frequency in JD) x (phrase length). Returns top N by weight.
 */
function extractJdTerms(jdText, maxTerms = 40) {
  const toks = contentTokens(jdText);
  const counts = new Map();
  const bump = (term, weight) => counts.set(term, (counts.get(term) || 0) + weight);
  for (const t of toks) bump(t, 1);
  // Bigrams only WITHIN one clause — never across sentence boundaries or
  // comma-separated list items (otherwise "…service, cash handling…"
  // yields the junk phrase "service cash").
  for (const sentence of String(jdText).split(/[.!?\n;,:]+/)) {
    const st = contentTokens(sentence);
    for (let i = 0; i + 1 < st.length; i++) {
      const bigram = `${st[i]} ${st[i + 1]}`;
      if (/[a-z]/.test(bigram)) bump(bigram, 1.5);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term, weight]) => ({ term, weight }));
}

/** Does the resume contain this term? Unigrams: token match. Bigrams: consecutive tokens. */
function resumeHas(resumeToks, resumeTokSet, term) {
  const parts = term.split(" ");
  if (parts.length === 1) return resumeTokSet.has(parts[0]);
  for (let i = 0; i + 1 < resumeToks.length; i++) {
    if (resumeToks[i] === parts[0] && resumeToks[i + 1] === parts[1]) return true;
  }
  return false;
}

/** Section-heading presence: line-anchored heading match. */
function detectSections(resume) {
  const found = {};
  for (const [key, re] of Object.entries(SECTION_PATTERNS)) {
    found[key] = re.test(resume);
  }
  return found;
}

/** Bullet / quantification signals. */
function measureBullets(resume) {
  const lines = String(resume).split("\n");
  const bullets = lines.filter((l) => /^\s*([-*•·>]|\d+[.)])\s+\S/.test(l));
  const quantified = bullets.filter((l) => /\d/.test(l) && /(%|\$|€|£|x\b|\+|million|billion|k\b)/i.test(l));
  return {
    bullets: bullets.length,
    quantifiedBullets: quantified.length,
    quantifiedRatio: bullets.length ? quantified.length / bullets.length : 0,
  };
}

/**
 * Run the ATS gap check. Returns
 * { score, coverage, matched, missing, sections, metrics, suggestions, verdict, terms }
 * matched/missing are [{ term, weight }] sorted by weight desc.
 */
export function analyzeAts(resume, jobDescription = "") {
  const resumeText = String(resume || "");
  const jdText = String(jobDescription || "").trim();
  const resumeToks = tokenize(resumeText);
  const resumeTokSet = new Set(resumeToks);

  const terms = jdText.length >= 20
    ? extractJdTerms(jdText)
    : GENERIC_TERMS.map((term) => ({ term, weight: 1 }));

  const matched = [];
  const missing = [];
  for (const t of terms) {
    (resumeHas(resumeToks, resumeTokSet, t.term) ? matched : missing).push(t);
  }
  const totalWeight = terms.reduce((s, t) => s + t.weight, 0) || 1;
  const matchedWeight = matched.reduce((s, t) => s + t.weight, 0);
  const coverage = matchedWeight / totalWeight;

  const sections = detectSections(resumeText);
  const sectionCount = Object.values(sections).filter(Boolean).length;
  const bullets = measureBullets(resumeText);
  const wordCount = resumeToks.length;

  // Score: 55% keyword coverage + 20% section coverage + 15% quantified
  // bullets + 10% length sanity (100-900 words is the sane band).
  const sectionScore = (Math.min(sectionCount, 4) / 4) * 20;
  const bulletScore = Math.min(1, bullets.quantifiedRatio * 2) * 15;
  const lengthScore = wordCount < 60 ? (wordCount / 60) * 10
    : wordCount <= 900 ? 10
    : Math.max(0, 10 - (wordCount - 900) / 150);
  const score = Math.max(0, Math.min(100,
    Math.round(coverage * 55 + sectionScore + bulletScore + lengthScore)));

  const suggestions = [];
  if (missing.length) {
    suggestions.push(
      `Work these JD words into your bullets where they're TRUE of you: ${missing.slice(0, 6).map((m) => m.term).join(", ")}. Never claim a skill you don't have — recruiters check.`
    );
  }
  const missingSections = Object.entries(sections).filter(([, v]) => !v).map(([k]) => k);
  if (missingSections.includes("summary")) suggestions.push("Add a 2-line Summary up top targeting the role — parsers and humans both read it first.");
  if (missingSections.includes("skills")) suggestions.push("Add a Skills section so both the parser and the recruiter can scan your stack in seconds.");
  if (missingSections.includes("experience")) suggestions.push("Add an Experience section with one bullet per win, not per duty.");
  if (bullets.quantifiedRatio < 0.3) suggestions.push("Quantify more bullets: numbers (% / $ / time saved) are the fastest credibility signal on the page.");
  if (wordCount < 100) suggestions.push("This reads thin — expand each role with 2–3 outcome bullets.");
  if (wordCount > 900) suggestions.push("This is long for one role — trim the oldest role to 1–2 bullets and keep the page tight.");
  if (suggestions.length === 0) suggestions.push("Strong coverage. Next: read every bullet out loud — if it doesn't name an outcome, rewrite it until it does.");

  const verdict = score >= 80 ? "ATS-READY"
    : score >= 55 ? "CLOSE — PATCH THE GAPS"
    : "NEEDS WORK";

  return {
    score,
    verdict,
    coverage: Math.round(coverage * 100),
    matched: matched.sort((a, b) => b.weight - a.weight),
    missing: missing.sort((a, b) => b.weight - a.weight),
    sections,
    metrics: { wordCount, ...bullets, sectionCount },
    suggestions: suggestions.slice(0, 5),
    termsChecked: terms.length,
    usedGenericTerms: jdText.length < 20,
  };
}
