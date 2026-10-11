// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Shared utilities: HTML escaping, input validation, client fingerprinting.

/** Escape a string for safe HTML rendering (XSS defense). */
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Clamp a string to max chars; returns "" for non-strings. */
export function clip(s, max) {
  const t = typeof s === "string" ? s : "";
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Validate free-text input: must be a non-empty string within bounds.
 * Returns { ok, value, error }.
 */
export function validText(s, { min = 1, max = 8000, label = "input" } = {}) {
  const v = typeof s === "string" ? s.trim() : "";
  if (v.length < min) return { ok: false, error: `${label} is too short — give me something to work with.` };
  if (v.length > max) return { ok: false, error: `${label} is too long (max ${max} characters).` };
  return { ok: true, value: v };
}

/** Looks like an email address (loose check, for UX only). */
export function looksLikeEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
}

export function looksLikeUrl(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t) && t.length <= 300;
}

/**
 * Soft client fingerprint for quota counting: SHA-256 of IP + user-agent,
 * truncated. Not a security boundary — documented as soft enforcement.
 */
export function fingerprint(ip, userAgent, crypto) {
  const h = crypto.createHash("sha256");
  h.update(`${ip || "?"}|${userAgent || "?"}`);
  return h.digest("hex").slice(0, 16);
}

/** Today's date key (UTC) for daily quota buckets. */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Validate the job-tracker import payload. Returns { ok, apps, error }. */
export function validateTrackerImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Import file must be a JSON object." };
  }
  if (data.app !== "get-hired-kit-tracker" || !Array.isArray(data.applications)) {
    return { ok: false, error: "Not a Get Hired Kit tracker export." };
  }
  const stages = ["applied", "screening", "interview", "offer", "rejected"];
  const apps = [];
  for (const [i, a] of data.applications.entries()) {
    if (!a || typeof a !== "object") return { ok: false, error: `Application #${i + 1} is malformed.` };
    const company = clip(a.company, 120).trim();
    const role = clip(a.role, 120).trim();
    if (!company || !role) return { ok: false, error: `Application #${i + 1} needs a company and role.` };
    if (!stages.includes(a.stage)) return { ok: false, error: `Application #${i + 1} has an unknown stage.` };
    apps.push({
      id: typeof a.id === "string" && a.id ? clip(a.id, 40) : `imp-${Date.now()}-${i}`,
      company,
      role,
      stage: a.stage,
      dateApplied: typeof a.dateApplied === "string" ? clip(a.dateApplied, 10) : "",
      followUp: typeof a.followUp === "string" ? clip(a.followUp, 10) : "",
      notes: clip(a.notes, 2000),
      link: looksLikeUrl(a.link) ? clip(a.link, 300) : "",
    });
    if (apps.length > 2000) return { ok: false, error: "Too many applications (max 2000)." };
  }
  return { ok: true, apps };
}
