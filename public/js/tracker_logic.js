/* Crafted by Vivek Nair (VN) — https://github.com/vivekn4 */
/* GET HIRED KIT tracker logic — PURE functions, zero DOM, zero storage.
 * Loaded as a classic script in the browser (window.GHKTracker) and
 * required by the node test suite. Mechanisms (per-application activity
 * history, derived "ghosted" flag, search/filter) are original
 * implementations of widely-used tracker concepts. */
"use strict";

var GHKTracker = (function () {
  var STAGES = ["applied", "screening", "interview", "offer", "rejected"];
  var GHOST_DAYS = 14; // no movement for 14+ days in an early stage = ghosted
  var DUE_SOON_DAYS = 3;

  function todayStr(d) {
    var t = d ? new Date(d) : new Date();
    return t.toISOString().slice(0, 10);
  }

  function daysBetween(fromDate, toDate) {
    var a = new Date(fromDate + "T00:00:00Z");
    var b = new Date(toDate + "T00:00:00Z");
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  /** Derived ghosted flag — NOT a stage, so existing boards keep working. */
  function isGhosted(app, today) {
    if (!app || (app.stage !== "applied" && app.stage !== "screening")) return false;
    if (!app.dateApplied) return false;
    return daysBetween(app.dateApplied, today || todayStr()) >= GHOST_DAYS;
  }

  /** Follow-up urgency: "overdue" | "soon" (<=3d) | "ok" | "none". */
  function dueStatus(app, today) {
    if (!app || !app.followUp) return "none";
    if (app.stage === "offer" || app.stage === "rejected") return "none";
    var t = today || todayStr();
    if (app.followUp < t) return "overdue";
    if (daysBetween(t, app.followUp) <= DUE_SOON_DAYS) return "soon";
    return "ok";
  }

  /** Append one activity entry to an app's history (capped at 50). */
  function appendHistory(app, type, detail) {
    if (!app) return app;
    if (!Array.isArray(app.history)) app.history = [];
    app.history.push({
      at: new Date().toISOString(),
      type: type,
      from: detail && detail.from !== undefined ? detail.from : null,
      to: detail && detail.to !== undefined ? detail.to : null,
      note: (detail && detail.note) || "",
    });
    if (app.history.length > 50) app.history = app.history.slice(-50);
    return app;
  }

  function sanitizeApp(a, i) {
    if (!a || typeof a !== "object") return null;
    var company = String(a.company || "").slice(0, 120).trim();
    var role = String(a.role || "").slice(0, 120).trim();
    if (!company || !role) return null;
    return {
      id: typeof a.id === "string" && a.id ? a.id.slice(0, 40) : "imp-" + Date.now() + "-" + i,
      company: company,
      role: role,
      stage: STAGES.indexOf(a.stage) >= 0 ? a.stage : "applied",
      dateApplied: String(a.dateApplied || "").slice(0, 10),
      followUp: String(a.followUp || "").slice(0, 10),
      link: String(a.link || "").slice(0, 300),
      notes: String(a.notes || "").slice(0, 2000),
      history: Array.isArray(a.history) ? a.history.filter(function (h) {
        return h && typeof h.at === "string" && typeof h.type === "string";
      }).slice(-50) : [],
    };
  }

  /** Migrate stored tracker data to v2: every app gets a history array. */
  function migrateTracker(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.apps)) {
      return { version: 2, apps: [] };
    }
    var apps = [];
    data.apps.forEach(function (a, i) {
      var clean = sanitizeApp(a, i);
      if (!clean) return;
      if (clean.history.length === 0) {
        clean.history = [{
          at: new Date().toISOString(),
          type: "created",
          from: null,
          to: clean.stage,
          note: "Migrated from tracker v1",
        }];
      }
      apps.push(clean);
    });
    return { version: 2, apps: apps };
  }

  /** Filter apps by free-text query (company/role/notes) + stage. */
  function filterApps(apps, opts) {
    var q = String((opts && opts.query) || "").trim().toLowerCase();
    var stage = (opts && opts.stage) || "all";
    return (apps || []).filter(function (a) {
      if (stage !== "all" && a.stage !== stage) return false;
      if (!q) return true;
      var hay = ((a.company || "") + " " + (a.role || "") + " " + (a.notes || "")).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  /** Consecutive-day practice streak from an array of bout ISO dates. */
  function streakDays(bouts, today) {
    var days = {};
    (bouts || []).forEach(function (b) {
      var d = String((b && b.date) || b || "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days[d] = true;
    });
    var t = new Date(((today || todayStr()) + "T00:00:00Z"));
    // Streak may start today or yesterday (haven't trained yet today).
    if (!days[todayStr(t)]) t = new Date(t.getTime() - 86400000);
    var streak = 0;
    while (days[todayStr(t)]) {
      streak++;
      t = new Date(t.getTime() - 86400000);
    }
    return streak;
  }

  return {
    STAGES: STAGES,
    GHOST_DAYS: GHOST_DAYS,
    todayStr: todayStr,
    daysBetween: daysBetween,
    isGhosted: isGhosted,
    dueStatus: dueStatus,
    appendHistory: appendHistory,
    migrateTracker: migrateTracker,
    filterApps: filterApps,
    streakDays: streakDays,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = GHKTracker;
