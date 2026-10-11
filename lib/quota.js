// Crafted by Vivek Nair (VN) — https://github.com/vivekn4
// Free-tier quota: N AI generations per client per day (soft enforcement).
// Fingerprint = IP + user-agent hash. In-memory with daily reset.
// Honest v1 tradeoff (also in README): determined users can bypass by
// switching networks; conversion comes from convenience + goodwill, not DRM.

import { fingerprint, todayKey } from "./util.js";
import crypto from "node:crypto";

const DEFAULT_DAILY = 3;

export class Quota {
  constructor(daily = DEFAULT_DAILY) {
    this.daily = daily;
    this.buckets = new Map(); // fingerprint -> { day, used }
  }

  _key(ip, ua) {
    return `${todayKey()}:${fingerprint(ip, ua, crypto)}`;
  }

  remaining(ip, ua) {
    const b = this.buckets.get(this._key(ip, ua));
    const used = b ? b.used : 0;
    return Math.max(0, this.daily - used);
  }

  /**
   * Try to consume one generation. Returns { allowed, remaining }.
   * Pro clients bypass via the isPro flag (checked by the caller).
   */
  consume(ip, ua, isPro = false) {
    if (isPro) return { allowed: true, remaining: Infinity, pro: true };
    const k = this._key(ip, ua);
    const b = this.buckets.get(k) || { used: 0 };
    if (b.used >= this.daily) return { allowed: false, remaining: 0 };
    b.used += 1;
    this.buckets.set(k, b);
    this.sweep();
    return { allowed: true, remaining: this.daily - b.used };
  }

  /** Drop buckets older than today (keeps memory bounded). */
  sweep() {
    const today = todayKey();
    for (const [k] of this.buckets) {
      if (!k.startsWith(today)) this.buckets.delete(k);
    }
  }
}
