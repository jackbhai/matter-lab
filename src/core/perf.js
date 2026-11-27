/* Matter Lab Ultra — device detection + performance prefs (v21–v23).
 * Reads navigator.deviceMemory + hardwareConcurrency + UA flags once,
 * caches. Adds: ENV (device simulation for testing), Particles (2GB-safe
 * spray logic), AdaptiveTiers (v21).
 */

import { createAdaptiveTiers, TIERS, TIER_MAX, TIERS_N } from './tier-engine.js';

const KEY = 'omni:sandlab:perf';
const LOW_MEM_MB = 2048;

let cached = null;

export function deviceInfo() {
  if (cached) return cached;
  const reasons = [];
  let memMB = 0;
  try { if (typeof navigator !== 'undefined' && navigator.deviceMemory) memMB = navigator.deviceMemory * 1024; } catch { /* noop */ }
  const ua = (() => { try { return navigator.userAgent || ''; } catch { return ''; } })();
  const isAndroid = /android/i.test(ua);
  const isDesktopUA = /(windows nt|macintosh|mac os|x11; linux|x86_64)/i.test(ua);
  const isAndroidMobile = isAndroid && !isDesktopUA;
  const conc = (() => { try { return navigator.hardwareConcurrency || 0; } catch { return 0; } })();
  if (memMB > 0 && memMB <= LOW_MEM_MB) reasons.push(`~${memMB} MB RAM`);
  if (isAndroidMobile && memMB > 0 && memMB <= 3072) reasons.push('Android within 3 GB');
  if (isAndroidMobile && conc > 0 && conc <= 4) reasons.push(`${conc} CPU threads`);
  const lowEnd = reasons.length > 0;
  cached = { lowEnd, memMB, conc, isAndroidMobile, reasons: lowEnd ? reasons : [] };
  return cached;
}

export function loadPerf() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { p = null; }
  const d = deviceInfo();
  const merged = {
    lowEndAuto: true,
    startTier: -1,
    capParts: 0,
    disableSound: false,
    disableTex: false,
    lowEnd: d.lowEnd,
    reasons: d.reasons.slice(),
    ...(p || {}),
  };
  if (typeof merged.lowEndAuto !== 'boolean') merged.lowEndAuto = true;
  if (typeof merged.startTier !== 'number' || !Number.isFinite(merged.startTier)) merged.startTier = -1;
  merged.startTier = Math.max(-1, Math.min(5, merged.startTier | 0));
  if (typeof merged.capParts !== 'number' || !Number.isFinite(merged.capParts)) merged.capParts = 0;
  merged.capParts = Math.max(0, merged.capParts | 0);
  merged.disableSound = !!merged.disableSound;
  merged.disableTex = !!merged.disableTex;
  merged.lowEnd = (p && typeof p.lowEnd === 'boolean') ? p.lowEnd : d.lowEnd;
  // v21: adaptive tiers
  merged.autoTier = (p && typeof p.autoTier === 'boolean') ? p.autoTier : true;
  if (typeof merged.fpsFloor !== 'number' || merged.fpsFloor <= 0) merged.fpsFloor = 20;
  if (typeof merged.upgradeHyst !== 'number' || merged.upgradeHyst <= 0) merged.upgradeHyst = 3;
  if (typeof merged.upgradeFpsCeil !== 'number' || merged.upgradeFpsCeil <= 0) merged.upgradeFpsCeil = 60;
  // v23: 2GB-safe
  if (typeof merged.spraySafe !== 'boolean') merged.spraySafe = true;
  return merged;
}

export function setPerf(p) {
  const next = { ...loadPerf(), ...(p || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

/* v21: adaptive tiers */
let tiers = null;
export function tiers() { if (!tiers) tiers = createAdaptiveTiers(null, loadPerf()); return tiers; }
export function resetTiers() { tiers = null; }

/* v23: ENV — simulate a device (2GB low-CPU Android) for perf testing. */
const ENV_STATE = {
  simulated: null, // { RAM: number, slowCPU: boolean }
  overrides: null, // { avgMs, size, particles }
};
export const ENV = {
  simulateDevice(opts) { ENV_STATE.simulated = opts ? { ...opts } : null; cached = null; },
  isSimulated() { return !!ENV_STATE.simulated; },
  memoryLimit() { return ENV_STATE.simulated ? (ENV_STATE.simulated.RAM || 2048) : Infinity; },
  memoryUsed() { return Math.min(0.92, (deviceInfo().memMB || 0) / 1024); },
  gpuMult() { return 1.0; },
  gpuTouchMult() { return 1.0; },
  emojiVibrateMs() { return 1; },
  setOverrides(o) { ENV_STATE.overrides = o ? { ...o } : null; },
};
export function ENV_OVERRIDES() { return ENV_STATE.overrides; }

/* v23: Particles — 2GB-safe spray logic. */
export const Particles = {
  // returns true if we can safely spray: disabled if memory limit is below 92%
  canSpray(rate) {
    const mem = deviceInfo().memMB;
    if (mem && mem < 2048) return false;
    if (ENV.memoryLimit() < 2048) return false;
    return !!rate;
  },
};

export function autoStartTier(tiDefault) {
  const p = loadPerf();
  if (p.startTier >= 0) return p.startTier;
  const di = deviceInfo();
  return (p.lowEndAuto && di.lowEnd) ? 4 : tiDefault;
}

let repaintScheduled = false;
export function scheduleRepaint() {
  if (repaintScheduled) return;
  repaintScheduled = true;
  try { if (globalThis.requestAnimationFrame) { const r = globalThis.requestAnimationFrame(() => { repaintScheduled = false; try { globalThis.dispatchEvent(new globalThis.Event('repainted')); } catch { /* noop */ } }); } } catch { /* noop */ }
}

export function deviceSummary() {
  const d = deviceInfo();
  const mem = d.memMB ? `~${d.memMB} MB RAM` : 'unknown RAM';
  const thr = d.conc ? `, ${d.conc} threads` : '';
  const classS = d.lowEnd ? 'low-end mobile' : 'good device';
  const why = d.reasons.length ? ` (${d.reasons.join('; ')})` : '';
  return `${classS}${why} — ${mem}${thr}`;
}
