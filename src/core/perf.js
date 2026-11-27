/* Matter Lab Ultra — adaptive performance profile and memory guardrails.
 * Device tiers are sourced from MatterEngine.TIERS; no private resolution
 * table lives in this module. Exports a deterministic device simulator for
 * low-memory regression tests. */
import { TIERS as ENGINE_TIERS } from './matter-engine.js';

const KEY = 'omni:sandlab:perf';
const MiB = 1024 * 1024;
const LOW_MEM_MB = 2048;
let cached = null;
let simulatedDevice = null;

export function setSimulatedDevice(profile = null) {
  simulatedDevice = profile && typeof profile === 'object' ? { ...profile } : null;
  cached = null;
  return deviceInfo();
}
export const clearSimulatedDevice = () => setSimulatedDevice(null);

export function deviceInfo() {
  if (cached) return cached;
  const reasons = [];
  const ua = (() => { try { return simulatedDevice?.userAgent || navigator.userAgent || ''; } catch { return simulatedDevice?.userAgent || ''; } })();
  const isAndroid = simulatedDevice ? simulatedDevice.android !== false : /android/i.test(ua);
  const isDesktopUA = /(windows nt|macintosh|mac os|x11; linux|x86_64)/i.test(ua);
  const isAndroidMobile = isAndroid && !isDesktopUA;
  let memMB = 0;
  let conc = 0;
  if (simulatedDevice) {
    memMB = Math.max(0, Number(simulatedDevice.ramMB ?? simulatedDevice.RAM ?? 0) || 0);
    conc = Math.max(0, Number(simulatedDevice.threads ?? simulatedDevice.hardwareConcurrency ?? 0) || 0);
  } else {
    try { if (typeof navigator !== 'undefined' && navigator.deviceMemory) memMB = navigator.deviceMemory * 1024; } catch { /* API unavailable */ }
    try { conc = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 0) : 0; } catch { /* API unavailable */ }
  }
  const safe2GB = (memMB > 0 && memMB <= LOW_MEM_MB) || (!memMB && isAndroidMobile && conc > 0 && conc <= 2);
  if (memMB > 0 && memMB <= LOW_MEM_MB) reasons.push(`~${memMB} MB RAM`);
  if (isAndroidMobile && memMB > 0 && memMB <= 3072) reasons.push('Android within 3 GB');
  if (isAndroidMobile && conc > 0 && conc <= 4) reasons.push(`${conc} CPU threads`);
  if (safe2GB) reasons.push('2GB-safe profile');
  const lowEnd = safe2GB || (isAndroidMobile && ((memMB > 0 && memMB <= 3072) || (conc > 0 && conc <= 4)));
  cached = { lowEnd, safe2GB, memMB, conc, isAndroidMobile, simulated: !!simulatedDevice, reasons: lowEnd ? reasons : [] };
  return cached;
}

export function resourceBudget(profile = deviceInfo()) {
  const safe2GB = !!profile.safe2GB;
  const largest = ENGINE_TIERS[0];
  const safe = ENGINE_TIERS[ENGINE_TIERS.length - 1];
  const maxCells = safe2GB ? safe.cols * safe.rows : largest.cols * largest.rows;
  return Object.freeze({
    safe2GB,
    tierFloor: safe2GB ? ENGINE_TIERS.length - 1 : 0,
    maxWorldCells: maxCells,
    particleBudget: safe2GB ? Math.min(17000, Math.floor(maxCells * 0.82)) : 0,
    maxWorldTextureDimension: safe2GB ? 512 : 2048,
    maxTextureQuality: safe2GB ? 0 : 2,
    heapCeilingBytes: (safe2GB ? 160 : 384) * MiB,
    engineCeilingBytes: (safe2GB ? 8 : 96) * MiB,
    rendererCeilingBytes: (safe2GB ? 12 : 128) * MiB,
  });
}

export function loadPerf() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
  const device = deviceInfo();
  const defaults = {
    v: 2,
    lowEndAuto: true,
    autoTier: true,
    startTier: -1,
    capParts: 0,
    disableSound: false,
    disableTex: false,
    fpsDown: 30,
    fpsUp: 52,
    memoryDown: 0.86,
    memoryUp: 0.62,
    /* PHONE-FIX: holds/cooldown deliberately LONG — the old values
       (450/1200/4000/1100 ms) let the adaptive controller resize the
       world every few seconds under flame load, which read on the phone
       as the whole screen shaking. The tier engine additionally freezes
       grid resizes after a short session settle window. */
    downgradeHoldMs: 2500,
    memoryHoldMs: 1500,
    upgradeHoldMs: 15000,
    tierCooldownMs: 8000,
  };
  /* PHONE-FIX schema migration (v2): a pre-v2 save may pin a stale manual
     startTier with autoTier off and the old twitchy thresholds — framing
     fields reset to the v2 defaults so a returning phone gets the new
     framing. User data is untouched: capParts / sound / texture prefs are
     preserved, and scenes/saves/slots live under different keys entirely. */
  if (saved && saved.v !== 2) {
    saved = {
      capParts: saved.capParts, disableSound: saved.disableSound,
      disableTex: saved.disableTex, lowEndAuto: saved.lowEndAuto,
    };
    try { localStorage.setItem(KEY, JSON.stringify({ ...defaults, ...saved })); } catch { /* storage may be full/private */ }
  }
  const merged = { ...defaults, ...(saved || {}) };
  if (typeof merged.lowEndAuto !== 'boolean') merged.lowEndAuto = true;
  if (typeof merged.autoTier !== 'boolean') merged.autoTier = true;
  if (typeof merged.startTier !== 'number' || !Number.isFinite(merged.startTier)) merged.startTier = -1;
  merged.startTier = Math.max(-1, Math.min(ENGINE_TIERS.length - 1, merged.startTier | 0));
  if (typeof merged.capParts !== 'number' || !Number.isFinite(merged.capParts)) merged.capParts = 0;
  merged.capParts = Math.max(0, merged.capParts | 0);
  merged.disableSound = !!merged.disableSound;
  merged.disableTex = !!merged.disableTex;
  merged.lowEnd = device.lowEnd;
  merged.safe2GB = device.safe2GB;
  merged.reasons = device.reasons.slice();
  merged.budget = resourceBudget(device);
  return merged;
}

export function setPerf(patch) {
  const next = { ...loadPerf(), ...(patch || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage may be full/private */ }
  return next;
}

export function autoStartTier(defaultIndex = 1) {
  const prefs = loadPerf();
  if (prefs.safe2GB) return prefs.budget.tierFloor;
  if (!prefs.autoTier && prefs.startTier >= 0) return prefs.startTier;
  if (prefs.lowEndAuto && prefs.lowEnd) return ENGINE_TIERS.length - 1;
  return Math.max(0, Math.min(ENGINE_TIERS.length - 1, defaultIndex | 0));
}

function typedArrayBytes(engine) {
  if (!engine) return 0;
  const seen = new Set();
  let bytes = 0;
  for (const value of Object.values(engine)) {
    if (!ArrayBuffer.isView(value) || !value.buffer || seen.has(value.buffer)) continue;
    seen.add(value.buffer);
    bytes += value.byteLength;
  }
  return bytes;
}

export function measureMemory(engine, renderer = null, profile = deviceInfo()) {
  const budget = resourceBudget(profile);
  const cells = Math.max(1, (engine?.cols || 0) * (engine?.rows || 0));
  const particles = Math.max(0, Number(engine?.particles) || 0);
  const particleBudget = budget.particleBudget || Math.max(1, Math.floor(cells * 0.92));
  const particleRatio = particles / particleBudget;
  const engineBytes = typedArrayBytes(engine);
  const rendererBytes = Math.max(0, Number(renderer?.estimatedBytes) || 0);
  let heapUsedBytes = 0;
  try {
    const mem = globalThis.performance?.memory;
    if (mem && Number.isFinite(mem.usedJSHeapSize)) heapUsedBytes = mem.usedJSHeapSize;
  } catch { /* Chromium-only API */ }
  const heapRatio = heapUsedBytes ? heapUsedBytes / budget.heapCeilingBytes : 0;
  const engineRatio = engineBytes / budget.engineCeilingBytes;
  const rendererRatio = rendererBytes / budget.rendererCeilingBytes;
  // In browsers without a heap meter, measured cell occupancy and our typed
  // buffer estimates remain useful pressure signals; never invent heap use.
  const memoryPressure = Math.max(heapRatio, engineRatio, rendererRatio, particleRatio);
  return {
    safe2GB: budget.safe2GB,
    ramMB: profile.memMB,
    particles,
    particleBudget,
    particleRatio,
    heapUsedBytes,
    heapCeilingBytes: budget.heapCeilingBytes,
    engineBytes,
    rendererBytes,
    memoryPressure: Math.max(0, Math.min(2, memoryPressure)),
    maxWorldCells: budget.maxWorldCells,
    maxWorldTextureDimension: budget.maxWorldTextureDimension,
    maxTextureQuality: budget.maxTextureQuality,
    tierFloor: budget.tierFloor,
  };
}

let repaintScheduled = false;
export function scheduleRepaint() {
  if (repaintScheduled) return;
  repaintScheduled = true;
  try {
    if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(() => {
      repaintScheduled = false;
      try { globalThis.dispatchEvent(new globalThis.Event('repainted')); } catch { /* noop */ }
    });
  } catch { /* noop */ }
}

export function deviceSummary() {
  const d = deviceInfo();
  const mem = d.memMB ? `~${d.memMB} MB RAM` : 'unknown RAM';
  const thr = d.conc ? `, ${d.conc} threads` : '';
  const classS = d.safe2GB ? '2GB-safe Android' : d.lowEnd ? 'low-end mobile' : 'good device';
  const why = d.reasons.length ? ` (${d.reasons.join('; ')})` : '';
  return `${classS}${why} — ${mem}${thr}`;
}
