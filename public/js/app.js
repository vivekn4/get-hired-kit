/* Crafted by Vivek Nair (VN) — https://github.com/vivekn4 */
/* GET HIRED KIT frontend: WebAudio SFX, canvas VFX, 3 modules, zero deps. */
"use strict";

/* ============================== utils ============================== */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), 2600);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) {
    openPro("Out of training tokens — go Pro ($29, one-time, unlimited).");
    throw new Error("OUT_OF_TOKENS");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ============================== SFX (WebAudio, zero assets) ============================== */
const SFX = (() => {
  let ctx = null;
  let muted = localStorage.getItem("ghk_muted") === "1";
  const ac = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  const on = () => !muted;
  const env = (g, t0, peak, dur) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };
  const tone = ({ f = 440, f1 = null, type = "sine", dur = 0.3, vol = 0.25, at = 0 }) => {
    if (!on()) return;
    try {
      const c = ac(), t0 = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      env(g, t0, vol, dur);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch { /* audio unavailable — stay silent */ }
  };
  const noise = ({ dur = 0.4, vol = 0.2, at = 0, fc = 1200, q = 1, sweepTo = null }) => {
    if (!on()) return;
    try {
      const c = ac(), t0 = c.currentTime + at;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = "bandpass"; flt.Q.value = q;
      flt.frequency.setValueAtTime(fc, t0);
      if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
      const g = c.createGain(); env(g, t0, vol, dur);
      src.connect(flt).connect(g).connect(c.destination);
      src.start(t0); src.stop(t0 + dur + 0.05);
    } catch { /* silent */ }
  };
  return {
    get muted() { return muted; },
    toggle() { muted = !muted; localStorage.setItem("ghk_muted", muted ? "1" : "0"); return muted; },
    unlock() { try { ac(); } catch { /* noop */ } },
    blip() { tone({ f: 660, type: "square", dur: 0.07, vol: 0.08 }); },
    zap() { tone({ f: 1400, f1: 180, type: "sawtooth", dur: 0.28, vol: 0.16 }); },
    gong() { // dojo start — deep layered gong
      [98, 147, 220, 294].forEach((f, i) => tone({ f, dur: 2.4 - i * 0.3, vol: 0.22 - i * 0.03 }));
      noise({ dur: 0.5, vol: 0.1, fc: 300, q: 0.7 });
    },
    drum() { tone({ f: 95, f1: 45, dur: 0.35, vol: 0.4 }); noise({ dur: 0.12, vol: 0.14, fc: 900 }); },
    cheer() { // crowd swell
      noise({ dur: 1.4, vol: 0.22, fc: 1800, q: 0.6, sweepTo: 2600 });
      [523, 659, 784].forEach((f, i) => tone({ f, dur: 0.5, vol: 0.1, at: 0.15 + i * 0.12 }));
    },
    trombone() { // sad trombone: wah-wah-wah-waaaah
      const seq = [[233, 0], [220, 0.28], [208, 0.56], [155, 0.84, 0.7]];
      seq.forEach(([f, at, dur = 0.26]) => tone({ f, f1: f * 0.94, type: "sawtooth", dur, vol: 0.16, at }));
    },
    crackleBurst() { noise({ dur: 0.09, vol: 0.16, fc: 2400 + Math.random() * 2000, q: 2 }); },
    thud() { tone({ f: 75, f1: 38, dur: 0.28, vol: 0.42 }); noise({ dur: 0.08, vol: 0.12, fc: 500 }); },
    fanfare() { [392, 523, 659, 784].forEach((f, i) => tone({ f, type: "square", dur: 0.32, vol: 0.12, at: i * 0.14 })); tone({ f: 1046, dur: 0.7, vol: 0.14, at: 0.58 }); },
    chaching() { tone({ f: 1568, dur: 0.18, vol: 0.16 }); tone({ f: 2093, dur: 0.4, vol: 0.16, at: 0.12 }); },
    sting() { [110, 130.8, 155.6].forEach((f) => tone({ f, type: "sawtooth", dur: 0.8, vol: 0.1 })); },
  };
})();

/* ============================== VFX (canvas particles) ============================== */
const VFX = (() => {
  const canvas = $("fxCanvas");
  const cx = canvas.getContext("2d");
  let W = 0, H = 0, parts = [], confetti = [], running = false;
  const THEMES = {
    "theme-dojo":    { colors: ["#ff2d55", "#ffb300", "#ff7a3d"], kind: "ember" },
    "theme-roaster": { colors: ["#ff6a00", "#ff2d2d", "#ffd23e"], kind: "flame" },
    "theme-tracker": { colors: ["#22d3ee", "#4ade80", "#a5f3fc"], kind: "holo" },
  };
  let theme = THEMES["theme-dojo"];
  const resize = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };
  addEventListener("resize", resize); resize();
  const spawn = () => {
    const c = theme.colors[(Math.random() * theme.colors.length) | 0];
    const kind = theme.kind;
    parts.push({
      x: Math.random() * W, y: H + 10,
      vy: kind === "flame" ? -(0.8 + Math.random() * 2.2) : -(0.3 + Math.random() * 1.1),
      vx: (Math.random() - 0.5) * (kind === "holo" ? 0.9 : 0.4),
      r: kind === "flame" ? 2 + Math.random() * 5 : 1 + Math.random() * 2.6,
      life: 1, decay: 0.002 + Math.random() * 0.006,
      color: c, flick: Math.random() * 6.28,
    });
    if (parts.length > 90) parts.shift();
  };
  const loop = () => {
    if (!running) return;
    cx.clearRect(0, 0, W, H);
    if (Math.random() < 0.5) spawn();
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx + Math.sin(p.flick += 0.05) * 0.4; p.y += p.vy; p.life -= p.decay;
      if (p.life <= 0 || p.y < -20) { parts.splice(i, 1); continue; }
      cx.globalAlpha = Math.max(0, p.life) * (0.5 + 0.5 * Math.abs(Math.sin(p.flick * 2)));
      cx.fillStyle = p.color;
      cx.beginPath(); cx.arc(p.x, p.y, p.r * p.life + 0.4, 0, 6.29); cx.fill();
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.x += c.vx; c.y += c.vy; c.vy += 0.22; c.rot += c.vr; c.life -= 0.008;
      if (c.life <= 0 || c.y > H + 20) { confetti.splice(i, 1); continue; }
      cx.save(); cx.globalAlpha = Math.max(0, c.life);
      cx.translate(c.x, c.y); cx.rotate(c.rot);
      cx.fillStyle = c.color; cx.fillRect(-c.s / 2, -c.s / 2, c.s, c.s * 0.62);
      cx.restore();
    }
    cx.globalAlpha = 1;
    requestAnimationFrame(loop);
  };
  return {
    start() { if (!running) { running = true; loop(); } },
    setTheme(name) { theme = THEMES[name] || THEMES["theme-dojo"]; },
    shake() { document.body.classList.remove("shake"); void document.body.offsetWidth; document.body.classList.add("shake"); },
    confettiBurst(n = 90) {
      const colors = ["#ffd23e", "#ff2d55", "#22d3ee", "#4ade80", "#ff6a00", "#ffffff"];
      for (let i = 0; i < n; i++) {
        confetti.push({
          x: W / 2 + (Math.random() - 0.5) * W * 0.5, y: H * 0.32,
          vx: (Math.random() - 0.5) * 11, vy: -4 - Math.random() * 8,
          s: 5 + Math.random() * 8, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
          color: colors[(Math.random() * colors.length) | 0], life: 1,
        });
      }
    },
  };
})();

/* Burn-in text reveal (roaster): lines flicker in like catching fire. */
async function burnIn(el, text) {
  el.innerHTML = "";
  const lines = String(text).split("\n");
  for (const line of lines) {
    const div = document.createElement("div");
    div.className = "burn-in";
    div.textContent = line || " ";
    el.appendChild(div);
    if (line.trim()) { SFX.crackleBurst(); await sleep(140 + Math.random() * 160); }
  }
}

/* Animated score count-up. */
async function countUp(el, target, dur = 900) {
  const t0 = performance.now();
  while (true) {
    const p = Math.min(1, (performance.now() - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p >= 1) break;
    await sleep(16);
  }
}

/* ============================== navigation / themes ============================== */
function setView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  const view = $("view-" + name);
  if (view) view.classList.remove("hidden");
  document.body.dataset.view = name;
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle("active", active);
    if (active) {
      document.body.classList.remove("theme-dojo", "theme-roaster", "theme-tracker");
      document.body.classList.add(t.dataset.theme);
      VFX.setTheme(t.dataset.theme);
    }
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => { SFX.unlock(); SFX.blip(); setView(t.dataset.view); })
);
document.querySelectorAll("[data-goto]").forEach((el) =>
  el.addEventListener("click", () => { SFX.unlock(); SFX.zap(); setView(el.dataset.goto); })
);
$("btnEnterDojo").addEventListener("click", () => { SFX.unlock(); SFX.gong(); setView("dojo"); });

/* ============================== quota / pro ============================== */
async function refreshQuota() {
  try {
    const q = await api("/api/quota");
    const label = q.pro ? "∞ PRO" : String(q.remaining);
    $("quotaCount").textContent = label;
    $("footQuotaCount").textContent = label;
    $("dojoTokens").textContent = label;
    $("roastTokens").textContent = label;
    $("quotaPill").classList.toggle("pro", Boolean(q.pro));
    return q;
  } catch { /* offline — leave placeholders */ return null; }
}
function openPro(msg) {
  if (msg) { const m = $("proMessage"); m.textContent = msg; m.className = "pro-message err"; }
  $("proModal").classList.remove("hidden");
  SFX.sting();
}
$("proBtn").addEventListener("click", () => { SFX.blip(); openPro(); });
$("btnClosePro").addEventListener("click", () => { SFX.blip(); $("proModal").classList.add("hidden"); });
$("btnVerifyKey").addEventListener("click", async () => {
  const key = $("licenseKeyInput").value.trim();
  const m = $("proMessage");
  if (!key) { m.textContent = "Enter your license key first."; m.className = "pro-message err"; return; }
  m.textContent = "Checking…"; m.className = "pro-message";
  SFX.blip();
  try {
    const r = await api("/api/license/verify", { key });
    if (r.valid) {
      m.textContent = "👑 PRO UNLOCKED — unlimited training tokens. Go get hired.";
      m.className = "pro-message ok";
      SFX.fanfare(); VFX.confettiBurst(70);
      await refreshQuota();
      setTimeout(() => $("proModal").classList.add("hidden"), 1400);
    } else {
      m.textContent = r.error || "Invalid key.";
      m.className = "pro-message err";
      SFX.trombone();
    }
  } catch (e) { m.textContent = e.message; m.className = "pro-message err"; }
});
$("muteBtn").addEventListener("click", () => {
  SFX.unlock();
  const muted = SFX.toggle();
  $("muteBtn").textContent = muted ? "🔇" : "🔊";
  if (!muted) SFX.blip();
});

/* ============================== DOJO HISTORY + STREAK ============================== */
const DOJO_HISTORY_KEY = "ghk_dojo_history_v1";

function loadDojoHistory() {
  try {
    const raw = localStorage.getItem(DOJO_HISTORY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((b) => b && typeof b.avg === "number") : [];
  } catch { return []; }
}

function saveDojoBout(bout) {
  const h = loadDojoHistory();
  h.unshift({ ...bout, date: new Date().toISOString().slice(0, 10) });
  try { localStorage.setItem(DOJO_HISTORY_KEY, JSON.stringify(h.slice(0, 50))); } catch { /* storage full */ }
}

function renderDojoHistory() {
  const el = $("dojoHistory");
  const h = loadDojoHistory();
  if (!h.length) {
    el.innerHTML = `<div class="history-empty">No sparring bouts yet. Your first belt is one fight away.</div>`;
    return;
  }
  const streak = GHKTracker.streakDays(h);
  const best = h.reduce((m, b) => Math.max(m, b.avg), 0);
  const rows = h.slice(0, 5).map((b) =>
    `<div class="history-item"><span>${esc(b.date)}</span><span>${esc(b.belt || "?")} belt</span><b>${b.avg}/100</b></div>`
  ).join("");
  el.innerHTML = `<div class="streak-chip">🔥 ${streak}-day streak · ${h.length} bouts · best ${best}/100</div>${rows}`;
}

/** Rubric dimension bars (shared by per-answer feedback + final report). */
function dimBarsHTML(dimensions) {
  if (!dimensions) return "";
  const labels = { structure: "Structure", example: "Real example", metrics: "Metrics & proof", relevance: "Role relevance", punch: "Punchy delivery" };
  return `<div class="dim-bars">${Object.entries(dimensions).map(([k, v]) => `
    <div class="dim-row"><span class="dim-label">${labels[k] || k}</span>
    <div class="dim-bar"><div class="dim-fill" style="width:${Math.max(0, Math.min(100, v))}%"></div></div>
    <span class="dim-val">${v}</span></div>`).join("")}</div>`;
}
let dojoSession = null;
let dojoScores = [];

$("btnStartSparring").addEventListener("click", async () => {
  const jd = $("jdInput").value.trim();
  const role = $("roleInput").value.trim();
  if (jd.length < 20) { toast("Paste a real job description (20+ characters)."); SFX.trombone(); return; }
  const btn = $("btnStartSparring");
  btn.disabled = true; btn.textContent = "🥋 BOWING IN…";
  try {
    const r = await api("/api/interview/start", { jobDescription: jd, role, difficulty: $("difficultyInput").value });
    dojoSession = r.sessionId; dojoScores = [];
    $("dojoSetup").classList.add("hidden");
    $("dojoFight").classList.remove("hidden");
    $("dojoReport").classList.add("hidden");
    setRound(r.round, r.totalRounds, r.question);
    SFX.gong(); setTimeout(() => SFX.drum(), 700);
    if (r.dummy) toast("🤖 Training-dummy mode — connect an AI key for the real sensei.");
    refreshQuota();
  } catch (e) { if (e.message !== "OUT_OF_TOKENS") { toast(e.message); SFX.trombone(); } }
  finally { btn.disabled = false; btn.innerHTML = "🔔 START SPARRING"; }
});

function setRound(round, total, question) {
  $("roundLabel").textContent = `ROUND ${round}/${total}`;
  $("questionCard").textContent = question;
  $("answerInput").value = "";
  $("scoreFlash").classList.add("hidden");
  $("feedbackBox").classList.add("hidden");
  const btn = $("btnSubmitAnswer");
  btn.disabled = false; btn.innerHTML = "⚔️ SUBMIT ANSWER";
  SFX.drum();
}

$("btnSubmitAnswer").addEventListener("click", async () => {
  const answer = $("answerInput").value.trim();
  if (answer.length < 5) { toast("Give it a real shot (5+ characters)."); return; }
  const btn = $("btnSubmitAnswer");
  btn.disabled = true; btn.textContent = "⏳ SCORING…";
  try {
    const r = await api("/api/interview/answer", { sessionId: dojoSession, answer });
    dojoScores.push(r.score);
    const avg = Math.round(dojoScores.reduce((a, b) => a + b, 0) / dojoScores.length);
    $("beltBar").style.width = Math.min(100, avg) + "%";
    $("beltLabel").textContent = `avg ${avg}/100`;
    const sf = $("scoreFlash");
    sf.classList.remove("hidden");
    await countUp(sf, r.score);
    const fb = $("feedbackBox");
    fb.innerHTML = `<b>Coach:</b> ${esc(r.feedback)}<br><b>💪 Strength:</b> ${esc(r.strength)}<br><b>🎯 Fix:</b> ${esc(r.fix)}${r.dummy ? '<br><span style="opacity:.6">🤖 training-dummy scoring</span>' : ""}${dimBarsHTML(r.dimensions)}`;
    fb.classList.remove("hidden");
    if (r.score >= 80) SFX.cheer();
    else if (r.score < 50) { SFX.trombone(); VFX.shake(); }
    else SFX.blip();
    await sleep(1600);
    if (r.done) showReport(r.report);
    else setRound(r.round, r.totalRounds, r.question);
  } catch (e) { toast(e.message); SFX.trombone(); btn.disabled = false; btn.innerHTML = "⚔️ SUBMIT ANSWER"; }
});

function showReport(report) {
  $("dojoFight").classList.add("hidden");
  $("dojoReport").classList.remove("hidden");
  const beltColors = { White: "#e5e5e5", Yellow: "#facc15", Green: "#4ade80", Brown: "#c98a4b", Black: "#ffffff" };
  const bc = beltColors[report.belt] || "#fff";
  $("reportBelt").innerHTML = `🥋 <span style="color:${bc}">${esc(report.belt).toUpperCase()} BELT</span>`;
  $("reportAvg").textContent = `Average score: ${report.average}/100 across ${report.rounds.length} rounds`;
  $("reportRounds").innerHTML = report.rounds.map((x, i) => `
    <div class="report-round">
      <div class="rq">R${i + 1}: ${esc(x.question)}</div>
      <div class="rs">${x.score}/100</div>
      <div>${esc(x.feedback)}</div>
      ${dimBarsHTML(x.dimensions)}
    </div>`).join("");
  saveDojoBout({ avg: report.average, belt: report.belt, rounds: report.rounds.length });
  renderDojoHistory();
  if (report.belt === "Black") { SFX.fanfare(); VFX.confettiBurst(120); toast("👑 BLACK BELT. The dojo bows to you."); }
  else if (report.average >= 65) { SFX.cheer(); VFX.confettiBurst(50); }
  else { SFX.trombone(); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$("btnRematch").addEventListener("click", () => {
  SFX.gong();
  $("dojoReport").classList.add("hidden");
  $("dojoSetup").classList.remove("hidden");
});

/* ============================== RESUME ROASTER ============================== */
$("btnRoast").addEventListener("click", async () => {
  const resume = $("resumeInput").value.trim();
  if (resume.length < 50) { toast("Paste your resume (50+ characters) — I need material."); SFX.trombone(); return; }
  const btn = $("btnRoast");
  btn.disabled = true; btn.textContent = "🔥 HEATING UP…";
  $("roastOutput").classList.remove("hidden");
  try {
    const r = await api("/api/roast", { resume });
    SFX.zap();
    await burnIn($("roastText"), r.roast);
    SFX.trombone();
    if (r.dummy) toast("🤖 Training-dummy roast — add an AI key for maximum savagery.");
    refreshQuota();
  } catch (e) { if (e.message !== "OUT_OF_TOKENS") { toast(e.message); SFX.trombone(); } }
  finally { btn.disabled = false; btn.innerHTML = "🔥 ROAST ME"; }
});

$("btnRewrite").addEventListener("click", async () => {
  const resume = $("resumeInput").value.trim();
  if (resume.length < 50) { toast("Paste your resume (50+ characters) first."); SFX.trombone(); return; }
  const btn = $("btnRewrite");
  btn.disabled = true; btn.textContent = "✨ REBUILDING…";
  try {
    const r = await api("/api/rewrite", { resume });
    $("rewriteText").textContent = r.rewrite;
    $("rewriteOutput").classList.remove("hidden");
    SFX.chaching();
    if (r.dummy) toast("🤖 Training-dummy rewrite — add an AI key for the full rebuild.");
    refreshQuota();
    $("rewriteOutput").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) { if (e.message !== "OUT_OF_TOKENS") { toast(e.message); SFX.trombone(); } }
  finally { btn.disabled = false; btn.innerHTML = "✨ REWRITE IT"; }
});

$("btnCopyRewrite").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("rewriteText").textContent);
    toast("📋 Rewrite copied — go paste it somewhere that pays.");
    SFX.blip();
  } catch { toast("Copy failed — select the text manually."); }
});

/* ============================== ATS KEYWORD CHECK (free, no token) ============================== */
$("btnAts").addEventListener("click", async () => {
  const resume = $("resumeInput").value.trim();
  if (resume.length < 50) { toast("Paste your resume (50+ characters) first."); SFX.trombone(); return; }
  const btn = $("btnAts");
  btn.disabled = true; btn.textContent = "🎯 SCANNING…";
  try {
    const r = await api("/api/ats", { resume, jobDescription: $("atsJdInput").value.trim() });
    const out = $("atsOutput");
    out.classList.remove("hidden");
    $("atsVerdict").textContent = r.verdict;
    $("atsScore").innerHTML = `ATS score: <b>${r.score}/100</b> · keyword coverage ${r.coverage}% · ${r.termsChecked} terms checked${r.usedGenericTerms ? " · <span style='opacity:.7'>(no JD pasted — checked against generic professional terms)</span>" : ""}`;
    const secLabels = { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects" };
    $("atsSections").innerHTML = `Sections detected: ${Object.entries(secLabels).map(([k, l]) =>
      `<span class="chip ${r.sections[k] ? "chip-hit" : "chip-miss"}">${r.sections[k] ? "✓" : "✗"} ${l}</span>`).join("")} · ${r.metrics.wordCount} words · ${r.metrics.quantifiedBullets}/${r.metrics.bullets} quantified bullets`;
    $("atsMatched").innerHTML = r.matched.length
      ? r.matched.map((m) => `<span class="chip chip-hit">${esc(m.term)}</span>`).join("")
      : `<span class="chip chip-hit">none yet — paste a JD to see matches</span>`;
    $("atsMissing").innerHTML = r.missing.length
      ? r.missing.map((m) => `<span class="chip chip-miss">${esc(m.term)}</span>`).join("")
      : `<span class="chip chip-hit">nothing missing — clean sweep 🎉</span>`;
    $("atsSuggestions").innerHTML = r.suggestions.map((s) => `<li>${esc(s)}</li>`).join("");
    SFX.zap();
    out.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) { toast(e.message); SFX.trombone(); }
  finally { btn.disabled = false; btn.innerHTML = "🎯 ATS KEYWORD CHECK — FREE, NO TOKEN"; }
});

/* ============================== JOB TRACKER ============================== */
const TRACK_KEY = "ghk_tracker_v1";
const STAGES = [
  { id: "applied", label: "📨 APPLIED" },
  { id: "screening", label: "🔍 SCREENING" },
  { id: "interview", label: "🎤 INTERVIEW" },
  { id: "offer", label: "🎉 OFFER" },
  { id: "rejected", label: "🪦 REJECTED" },
];
let apps = [];
let editingId = null;

function loadApps() {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    if (!raw) return [];
    return GHKTracker.migrateTracker(JSON.parse(raw)).apps;
  } catch { return []; }
}
function saveApps() {
  try {
    localStorage.setItem(TRACK_KEY, JSON.stringify({ version: 2, apps }));
  } catch {
    toast("⚠️ Storage full — export your board as backup!");
  }
}
function uid() { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function isOverdue(a) {
  if (!a.followUp || a.stage === "offer" || a.stage === "rejected") return false;
  return a.followUp < new Date().toISOString().slice(0, 10);
}

function renderTracker() {
  const kb = $("kanban");
  kb.innerHTML = "";
  const visible = GHKTracker.filterApps(apps, { query: $("trackerSearch").value, stage: $("trackerStage").value });
  for (const st of STAGES) {
    const col = document.createElement("div");
    col.className = "kcol" + (st.id === "offer" ? " offer" : "");
    const list = visible.filter((a) => a.stage === st.id);
    col.innerHTML = `<h4>${esc(st.label)} <span class="count">${list.length}</span></h4>`;
    for (const a of list) {
      const card = document.createElement("div");
      card.className = "kcard";
      const od = isOverdue(a);
      const ghost = GHKTracker.isGhosted(a);
      const due = GHKTracker.dueStatus(a);
      card.innerHTML = `
        <div class="kc">${esc(a.company)}${ghost ? ' <span class="ghost-badge" title="No movement in 14+ days">👻 GHOSTED?</span>' : ""}</div>
        <div class="kr">${esc(a.role)}</div>
        <div class="kd ${od ? "overdue" : due === "soon" ? "due-soon" : ""}">${a.followUp ? (od ? "⚠️ follow up OVERDUE: " : due === "soon" ? "⏰ follow up SOON: " : "📅 follow up: ") + esc(a.followUp) : ""}</div>
        <div class="kmove">
          <button data-act="back" title="Move back">◀</button>
          <button data-act="edit" title="Edit">✏️</button>
          <button data-act="fwd" title="Move forward">▶</button>
        </div>`;
      card.querySelector('[data-act="back"]').addEventListener("click", (e) => { e.stopPropagation(); moveApp(a.id, -1); });
      card.querySelector('[data-act="fwd"]').addEventListener("click", (e) => { e.stopPropagation(); moveApp(a.id, 1); });
      card.querySelector('[data-act="edit"]').addEventListener("click", (e) => { e.stopPropagation(); openAppModal(a.id); });
      card.addEventListener("click", () => openAppModal(a.id));
      col.appendChild(card);
    }
    kb.appendChild(col);
  }
  // stats
  const total = apps.length;
  const responded = apps.filter((a) => a.stage !== "applied").length;
  $("statApplied").textContent = total;
  $("statResponse").textContent = total ? Math.round((responded / total) * 100) + "%" : "0%";
  $("statInterview").textContent = apps.filter((a) => ["screening", "interview", "offer"].includes(a.stage)).length;
  $("statOffer").textContent = apps.filter((a) => a.stage === "offer").length;
  $("statGhosted").textContent = apps.filter((a) => GHKTracker.isGhosted(a)).length;
  $("statDue").textContent = apps.filter((a) => GHKTracker.dueStatus(a) === "overdue" || GHKTracker.dueStatus(a) === "soon").length;
}

function moveApp(id, dir) {
  const a = apps.find((x) => x.id === id);
  if (!a) return;
  const order = STAGES.map((s) => s.id);
  const i = order.indexOf(a.stage) + dir;
  if (i < 0 || i >= order.length) return;
  const from = a.stage;
  a.stage = order[i];
  GHKTracker.appendHistory(a, "status_change", { from, to: a.stage });
  saveApps(); renderTracker();
  if (a.stage === "offer") { SFX.fanfare(); VFX.confettiBurst(110); toast(`🎉 OFFER from ${a.company}?! LEGENDARY.`); }
  else { SFX.thud(); VFX.shake(); }
}

function openAppModal(id) {
  editingId = id || null;
  const a = id ? apps.find((x) => x.id === id) : null;
  $("modalTitle").textContent = a ? "✏️ Edit application" : "＋ New application";
  $("mCompany").value = a?.company || "";
  $("mRole").value = a?.role || "";
  $("mStage").value = a?.stage || "applied";
  $("mDate").value = a?.dateApplied || new Date().toISOString().slice(0, 10);
  $("mFollowUp").value = a?.followUp || "";
  $("mLink").value = a?.link || "";
  $("mNotes").value = a?.notes || "";
  $("btnDeleteApp").classList.toggle("hidden", !a);
  // Activity history (newest first).
  const hist = (a?.history || []).slice().reverse();
  $("appHistory").innerHTML = a ? `<div class="field-label">📜 ACTIVITY HISTORY</div>` + (hist.length
    ? hist.map((h) => `<div class="history-item"><span>${esc(String(h.at || "").slice(0, 10))}</span><span>${esc(
        h.type === "status_change" ? `moved ${h.from || "?"} → ${h.to || "?"}`
        : h.type === "created" ? `created in ${h.to || "?"}`
        : h.type) }</span></div>`).join("")
    : `<div class="history-empty">No history yet.</div>`) : "";
  $("appModal").classList.remove("hidden");
  SFX.blip();
}
$("btnAddApp").addEventListener("click", () => openAppModal(null));
$("btnCloseModal").addEventListener("click", () => { $("appModal").classList.add("hidden"); SFX.blip(); });
$("btnSaveApp").addEventListener("click", () => {
  const company = $("mCompany").value.trim();
  const role = $("mRole").value.trim();
  if (!company || !role) { toast("Company and role are required."); SFX.trombone(); return; }
  const wasNew = !editingId;
  const prev = editingId ? apps.find((x) => x.id === editingId) : null;
  const prevStage = prev?.stage;
  const rec = {
    id: editingId || uid(),
    company: company.slice(0, 120), role: role.slice(0, 120),
    stage: $("mStage").value, dateApplied: $("mDate").value,
    followUp: $("mFollowUp").value, link: $("mLink").value.trim().slice(0, 300),
    notes: $("mNotes").value.trim().slice(0, 2000),
    history: prev?.history || [],
  };
  if (editingId) {
    Object.assign(prev, rec);
    if (prevStage && prevStage !== rec.stage) {
      GHKTracker.appendHistory(prev, "status_change", { from: prevStage, to: rec.stage });
    }
  } else {
    GHKTracker.appendHistory(rec, "created", { to: rec.stage });
    apps.unshift(rec);
  }
  saveApps(); renderTracker();
  $("appModal").classList.add("hidden");
  if (rec.stage === "offer" && (wasNew || prevStage !== "offer")) {
    SFX.fanfare(); VFX.confettiBurst(110); toast(`🎉 OFFER from ${company}?! LEGENDARY.`);
  } else { SFX.thud(); toast(wasNew ? "📨 Application logged. Get that bag." : "💾 Saved."); }
});
$("btnDeleteApp").addEventListener("click", () => {
  if (!editingId) return;
  if (!confirm("Delete this application for good?")) return;
  apps = apps.filter((x) => x.id !== editingId);
  saveApps(); renderTracker();
  $("appModal").classList.add("hidden");
  SFX.zap(); toast("🗑 Deleted.");
});

$("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "get-hired-kit-tracker", version: 2, exportedAt: new Date().toISOString(), applications: apps }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "get-hired-kit-tracker.json";
  a.click();
  URL.revokeObjectURL(a.href);
  SFX.blip(); toast("⤓ Board exported — keep it safe.");
});
$("btnImport").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "get-hired-kit-tracker" || !Array.isArray(data.applications)) throw new Error("bad file");
    const migrated = GHKTracker.migrateTracker({ apps: data.applications });
    if (!migrated.apps.length && data.applications.length) throw new Error("no valid apps");
    if (!confirm(`Import ${migrated.apps.length} applications? This replaces your current board.`)) return;
    apps = migrated.apps.slice(0, 2000);
    saveApps(); renderTracker();
    SFX.chaching(); toast(`⤒ Imported ${apps.length} applications.`);
  } catch { toast("⚠️ That file isn't a valid tracker export."); SFX.trombone(); }
  e.target.value = "";
});

/* Tracker search / stage filter (re-render only). */
$("trackerSearch").addEventListener("input", () => renderTracker());
$("trackerStage").addEventListener("change", () => renderTracker());

/* ============================== boot ============================== */
(async function boot() {
  $("muteBtn").textContent = SFX.muted ? "🔇" : "🔊";
  VFX.start();
  apps = loadApps();
  renderTracker();
  renderDojoHistory();
  try {
    const h = await api("/api/health");
    const g = $("proGumroadLink");
    if (h.proUrl) g.href = h.proUrl; else { g.textContent = "💳 PRO — $29 (link coming soon)"; g.removeAttribute("href"); }
  } catch { /* offline */ }
  refreshQuota();
  document.addEventListener("pointerdown", () => SFX.unlock(), { once: true });
})();
