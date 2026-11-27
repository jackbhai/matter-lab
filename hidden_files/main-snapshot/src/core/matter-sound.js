/**
 * matter-sound.js — Matter Lab Ultra (W32U) procedural simulation sound.
 * No samples, no files: every class is synthesised with Web Audio.
 * SND2: 34 classes, variation engine, positional audio, ambient bed.
 * SND3 ULTRA-REALISM pass: timbres are no longer hand-tuned placeholders —
 * every family is a physical model parameterised by an acoustic profile
 * (matter-acoustics.js): Minnaert bubble resonance for boil/fizz/lava,
 * modal synthesis for impacts, flow-shaped noise for pours, a layered
 * boom, stochastic micro-pops for fire, pressure-driven turbulent noise
 * for gas, plus a single generated-IR scene reverb whose per-voice wet
 * gain follows the event's enclosure (ev.enc: 0.15 open, 0.7 vessel,
 * 0.8 sealed; default 0.15 until the engine pass lands).
 * Call-sites, caps, variation, pan and ambient contracts are unchanged.
 *
 * INTENSITY CURVE (binding):
 *   gain(cls, i) = MASTER_CEILING * classScale[cls] * (0.05 + 0.95 * i^1.5),
 *   i clamped 0..1 — super-linear so big events feel disproportionately big.
 *   SND3 pulled class scales down ~12 % so quiet events stay quiet; the
 *   curve still guarantees testGain(0.05) ≥ 6 dB below testGain(0.3).
 *
 * ARCHITECTURE: own AudioContext (sfx.js exports none), gated strictly on
 * sfx.enabled(), same MASTER ceiling (−18 dBFS = 0.126) + compressor as
 * sfx, settings-bus + 500 ms poll silence (loops AND reverb sends).
 * Graph: voices/loops → per-source StereoPanner → master GainNode →
 * DynamicsCompressor (limiter) → out; in parallel each voice feeds a
 * per-voice wet gain → ONE ConvolverNode (generated IR) → master.
 * Continuous classes are persistent loop nodes; one-shots are pooled with
 * a hard cap of 8 concurrent voices (quietest dropped). Per-frame
 * per-class energy aggregation happens in the ENGINE (≤1 event/class/tick).
 *
 * VARIATION ENGINE: every one-shot play draws pitch ×(0.85..1.18),
 * filter-cutoff ×(0.75..1.25), attack/decay jitter; noise comes from 3
 * round-robin pre-rendered buffers. Loops evolve: slow LFO + random-walk
 * on filter cutoff and on stochastic-event rate.
 *
 * POSITIONAL AUDIO: events may carry x (0..1). Pan maps x → −0.8..0.8
 * with distance attenuation gain ×(1 − 0.25×|pan|). boom/thunder/whoosh
 * stay centred. Loops pan by their dominant source x, smoothed per frame.
 *
 * AMBIENT LAYER: setAmbient({fire, water, wind, steam}) — presence levels
 * fed by the UI (~250 ms) from real engine counters. Beds mix UNDER events
 * as per-loop intensity floors with ≥1 s crossfades, ducked briefly when
 * a big one-shot fires, and get a low fixed reverb wet (AMBIENT_WET).
 */
import { MASTER_CEILING as MASTER, DUCK_FACTOR, enabled as sfxEnabled } from './sfx.js';
import { onSettings } from './settings.js';
import { profileForClass, bubbleParams, drawBubbleR, minnaertHz, modalParams, reverbWet, irSecondsFor, AMBIENT_WET } from './matter-acoustics.js';

export const LOOP_CLASSES = ['boil', 'pour', 'pour-oil', 'pour-grain', 'fire', 'steam', 'fizz', 'acidfizz', 'sizzle', 'vent', 'bubble', 'lava', 'wind', 'lap', 'scrape'];
export const ONESHOT_CLASSES = ['splash', 'dropsplash', 'bigsplash', 'boom', 'pop', 'zap', 'thunder', 'clink', 'clank', 'knock', 'shush', 'whoosh', 'rockbreak', 'ice', 'icebreak', 'glassbreak', 'chime', 'bubblepop', 'creak'];
export const ALL_CLASSES = [...LOOP_CLASSES, ...ONESHOT_CLASSES];
export const CENTERED = new Set(['boom', 'thunder', 'whoosh']);
export { reverbWet, irSecondsFor, AMBIENT_WET };

/* SND3: scales pulled down slightly (~12 %) for dynamic range headroom. */
const SCALE = { boil: 0.44, pour: 0.62, 'pour-oil': 0.58, 'pour-grain': 0.53, fire: 0.53, steam: 0.44, fizz: 0.48, acidfizz: 0.48, sizzle: 0.55, vent: 0.53, bubble: 0.48, lava: 0.55, wind: 0.37, lap: 0.30, scrape: 0.44, splash: 0.70, dropsplash: 0.48, bigsplash: 0.84, boom: 0.90, pop: 0.62, zap: 0.62, thunder: 0.84, clink: 0.53, clank: 0.64, knock: 0.58, shush: 0.35, whoosh: 0.80, rockbreak: 0.75, ice: 0.44, icebreak: 0.69, glassbreak: 0.75, chime: 0.44, bubblepop: 0.44, creak: 0.48 };
const MIN_MS = { splash: 90, dropsplash: 70, bigsplash: 110, boom: 120, pop: 70, zap: 80, thunder: 900, clink: 60, clank: 70, knock: 70, shush: 140, whoosh: 150, rockbreak: 130, ice: 60, icebreak: 160, glassbreak: 180, chime: 110, bubblepop: 45, creak: 700 };
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const rnd = (a, b) => a + Math.random() * (b - a);
const DEFAULT_ENC = 0.15;
const clampEnc = (v) => (v == null || !Number.isFinite(v) ? DEFAULT_ENC : Math.max(0, Math.min(1, v)));

/** Pure: master-relative gain for a class at an intensity (verify harness). */
export function testGain(cls, intensity) {
  const i = clamp01(intensity);
  const s = SCALE[cls] != null ? SCALE[cls] : 0.5;
  return MASTER * s * (0.05 + 0.95 * Math.pow(i, 1.5));
}
export { MASTER };

/** Variation draw for one play: pitch/cutoff multipliers + envelope jitter. */
function vary() {
  return { pm: rnd(0.85, 1.18), cm: rnd(0.75, 1.25), atk: rnd(0.6, 1.6), dm: rnd(0.8, 1.3) };
}
const NEUTRAL_V = { pm: 1, cm: 1, atk: 1, dm: 1 };

/* 3 round-robin pre-rendered noise buffers (variation source #3). */
const noiseBufs = [];
let noiseRR = 0;
function noiseBuffer(ctx, idx) {
  const slot = noiseBufs[idx];
  if (slot && slot.rate === ctx.sampleRate) return slot.buf;
  const n = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = Math.max(-1, Math.min(1, (Math.random() * 2 - 1) * 0.6 + last * 2.4)); }
  noiseBufs[idx] = { rate: ctx.sampleRate, buf };
  return buf;
}
function noiseSrc(ctx, loop = false) { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, noiseRR++ % 3); s.loop = loop; return s; }
function tone(ctx, dest, { type = 'sine', f = 440, to = null, t = 0, dur = 0.2, peak = 0.2 }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(Math.max(20, f), t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
}
function noiseHit(ctx, d, t, g, { type = 'bandpass', f = 800, q = 1, dur = 0.3, V = NEUTRAL_V, sweepTo = null }) {
  const s = noiseSrc(ctx); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(Math.max(30, f * V.cm), t); fl.Q.value = q;
  if (sweepTo) fl.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo * V.cm), t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + 0.01 * V.atk);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur * V.dm);
  s.connect(fl).connect(gn).connect(d); s.start(t); s.stop(t + dur * V.dm + 0.1);
}

/* ================= SND3 physical primitives ================= */

/** Minnaert bubble ping: sine at 3260/r Hz with the bubble's characteristic
 * slight downward wobble as it detaches, exponential decay ∝ duration. */
function bubblePing(ctx, d, t, peak, { rMm = 1.5, durMs = 50, V = NEUTRAL_V } = {}) {
  const f = minnaertHz(rMm) * V.pm;
  const dur = Math.max(0.012, (durMs / 1000) * V.dm);
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.07, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.94, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(d); o.start(t); o.stop(t + dur + 0.05);
}

/** Modal impact: 3–5 decaying sine modes from the profile + a noise
 * transient whose brightness follows hardness. */
function modalHit(ctx, d, t, g, prof, { base = 400, V = NEUTRAL_V, noiseAmt = 0.45 } = {}) {
  for (const m of modalParams(prof, base)) {
    tone(ctx, d, { f: m.f * V.pm, t, dur: m.decay * V.dm, peak: g * m.gain * 0.75 });
  }
  noiseHit(ctx, d, t, g * noiseAmt, { f: 900 + 5200 * prof.hardness, q: 0.8, dur: 0.03 + 0.03 * (1 - prof.hardness), V });
}

/** One stochastic fire pop: a 2–6 ms filtered click, random pitch/size. */
function firePop(ctx, d, t, peak, big) {
  noiseHit(ctx, d, t, peak, { f: rnd(700, 2600) * (big ? 0.55 : 1), q: 1.6, dur: (big ? 0.006 : rnd(0.002, 0.006)), V: NEUTRAL_V });
  if (big) tone(ctx, d, { f: rnd(120, 200), to: 60, t, dur: 0.05, peak: peak * 0.5 });
}

/* Loop profile plumbing: bubble kind + implied temperature per class.
 * The engine sends intensity only; for boil, intensity IS the heat proxy
 * (rolling boil = full intensity), mapped 60→118 °C. Steam's intensity is
 * temperature-driven upstream already. */
const BUBBLE_KIND = { boil: 'boil', fizz: 'fizz', acidfizz: 'acid', sizzle: 'sizzle', bubble: 'bubble', lava: 'lava' };
function loopBubbleParams(cls, eff) {
  const prof = profileForClass(cls);
  const temp = cls === 'boil' ? 60 + 58 * eff : cls === 'lava' ? 1100 : 100;
  return { prof, bp: bubbleParams(prof, { temp, kind: BUBBLE_KIND[cls] }) };
}

/** One-shot voice builders: (ctx, dest, t, gain, intensity, pitch01, V, profile). */
const VOICES = {
  /* ---- splashes: flow noise shaped by wetness + Minnaert droplet spray ---- */
  splash(ctx, d, t, g, i, p, V, prof) {
    noiseHit(ctx, d, t, g, { f: (420 + 900 * prof.wetness + 500 * i) * 1, q: 0.8, dur: 0.22 + 0.2 * i, V });
    tone(ctx, d, { f: 150 * V.pm, to: 52, t, dur: 0.15 * V.dm, peak: g * 0.6 });
    for (let k = 0; k < 3; k++) bubblePing(ctx, d, t + rnd(0.02, 0.12), g * rnd(0.15, 0.35), { rMm: rnd(0.8, 2.2), durMs: 40, V });
  },
  dropsplash(ctx, d, t, g, i, p, V, prof) {
    // a single drop: one Minnaert ping (drop ≈ 1.2–2 mm) + tiny crown noise
    bubblePing(ctx, d, t, g * 0.95, { rMm: rnd(1.2, 2.0), durMs: 65, V });
    noiseHit(ctx, d, t, g * 0.3, { f: 2400, q: 1.2, dur: 0.045, V });
  },
  bigsplash(ctx, d, t, g, i, p, V, prof) {
    noiseHit(ctx, d, t, g, { f: 340 + 420 * i, q: 0.6, dur: 0.5 + 0.3 * i, V });
    tone(ctx, d, { f: 105 * V.pm, to: 36, t, dur: 0.34 * V.dm, peak: g * 0.9 });
    noiseHit(ctx, d, t + 0.05, g * 0.45, { type: 'highpass', f: 2600, dur: 0.28, V });
    for (let k = 0; k < 6; k++) bubblePing(ctx, d, t + rnd(0.04, 0.3), g * rnd(0.1, 0.3), { rMm: rnd(0.7, 2.4), durMs: 45, V });
  },
  /* ---- BOOM: sub thump + mid crack + delayed debris patter + pressure tail ---- */
  boom(ctx, d, t, g, i, p, V, prof) {
    tone(ctx, d, { f: 90, to: 30, t, dur: (0.55 + 0.65 * i) * V.dm, peak: g });                                   // sub thump 90→30 Hz
    noiseHit(ctx, d, t, g * 0.85, { f: 1500, q: 0.5, dur: 0.09 + 0.06 * i, V });                                  // mid crack
    const nd = 3 + Math.round(5 * i);                                                                             // debris patter
    for (let k = 0; k < nd; k++) noiseHit(ctx, d, t + 0.09 + k * rnd(0.03, 0.1), g * rnd(0.12, 0.3), { f: rnd(500, 1600), q: 1.3, dur: 0.05, V });
    const s = noiseSrc(ctx); const f = ctx.createBiquadFilter(); f.type = 'lowpass';                              // pressure tail
    f.frequency.setValueAtTime(900 * V.cm, t); f.frequency.exponentialRampToValueAtTime(90, t + (0.5 + 0.7 * i) * V.dm);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(g * 0.7, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + (0.55 + 0.75 * i) * V.dm);
    s.connect(f).connect(gn).connect(d); s.start(t); s.stop(t + 1.6);
  },
  pop(ctx, d, t, g, i, p, V) {
    // the boom's crack layer alone, tiny
    noiseHit(ctx, d, t, g * 0.9, { f: 1300 + 500 * i, q: 0.7, dur: 0.045, V });
    tone(ctx, d, { f: (260 + 300 * i) * V.pm, to: 95, t, dur: 0.05 * V.dm, peak: g * 0.5 });
  },
  bubblepop(ctx, d, t, g, i, p, V, prof) {
    bubblePing(ctx, d, t, g, { rMm: rnd(1.0, 2.6), durMs: 55, V }); // surface bubble bursting
  },
  /* ---- thunder: slow-attack low rumble + rolling noise; NO zap chirp ---- */
  thunder(ctx, d, t, g, i, p, V) {
    tone(ctx, d, { f: 62, to: 32, t, dur: 1.7 * V.dm, peak: g * 0.85 });
    tone(ctx, d, { f: 44, to: 27, t: t + 0.14, dur: 2.0 * V.dm, peak: g * 0.55 });
    noiseHit(ctx, d, t, g * 0.4, { type: 'lowpass', f: 260, dur: 1.5 * V.dm, V, sweepTo: 65 });
    noiseHit(ctx, d, t + 0.32, g * 0.26, { type: 'lowpass', f: 170, dur: 1.3 * V.dm, V });
    noiseHit(ctx, d, t + 0.65, g * 0.16, { type: 'lowpass', f: 130, dur: 1.1 * V.dm, V }); // rolling-off echoes
  },
  whoosh(ctx, d, t, g, i, p, V) {
    // band-swept noise; sweep rate ∝ intensity
    const dur = (0.42 - 0.16 * i) * V.dm + 0.18;
    const s = noiseSrc(ctx); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(280 * V.cm, t); f.frequency.exponentialRampToValueAtTime((900 + 1900 * i) * V.cm, t + dur * 0.35);
    f.frequency.exponentialRampToValueAtTime(380 * V.cm, t + dur);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.3 * V.atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(gn).connect(d); s.start(t); s.stop(t + dur + 0.1);
  },
  /* ---- zap: fast descending chirp + crackle transients (rate ∝ intensity) ---- */
  zap(ctx, d, t, g, i, p, V) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(3200 * V.pm, t); o.frequency.exponentialRampToValueAtTime(280, t + 0.09);
    const og = ctx.createGain(); og.gain.setValueAtTime(g * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(og).connect(d); o.start(t); o.stop(t + 0.12);
    const n = 2 + Math.round(6 * i);
    for (let k = 0; k < n; k++) noiseHit(ctx, d, t + k * rnd(0.012, 0.03), g * rnd(0.25, 0.5), { type: 'highpass', f: rnd(2600, 5200), dur: 0.018, V });
  },
  /* ---- impacts: modal synthesis, profile-driven ---- */
  clink(ctx, d, t, g, i, p, V, prof) { modalHit(ctx, d, t, g, prof, { base: 1500 + 500 * i, V, noiseAmt: 0.3 }); },
  clank(ctx, d, t, g, i, p, V, prof) { modalHit(ctx, d, t, g * 1.05, prof, { base: 300 + 120 * i, V }); },
  knock(ctx, d, t, g, i, p, V, prof) { modalHit(ctx, d, t, g, prof, { base: 300, V, noiseAmt: 0.65 }); },
  chime(ctx, d, t, g, i, p, V, prof) {
    const ladder = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const step = p != null && p >= 0 ? ladder[Math.min(ladder.length - 1, Math.round(p * (ladder.length - 1)))] : ladder[(Math.random() * ladder.length) | 0];
    const f = 523.25 * Math.pow(2, step / 12);
    // bell = metal modal stack tuned to the struck note
    for (const m of modalParams(prof, f)) tone(ctx, d, { f: m.f * V.pm, t, dur: Math.max(0.3, m.decay * 1.6) * V.dm, peak: g * m.gain * 0.8 });
  },
  glassbreak(ctx, d, t, g, i, p, V, prof) {
    modalHit(ctx, d, t, g * 0.9, prof, { base: 1900, V, noiseAmt: 0.8 });       // brittle cluster + bright burst
    for (let k = 0; k < 6; k++) tone(ctx, d, { f: rnd(2600, 5200) * V.pm, t: t + 0.12 + k * rnd(0.05, 0.13), dur: 0.07, peak: g * 0.26 }); // falling shards
  },
  rockbreak(ctx, d, t, g, i, p, V, prof) {
    modalHit(ctx, d, t, g, prof, { base: 210, V, noiseAmt: 0.9 });              // dull modes, noise leads
    noiseHit(ctx, d, t, g * 0.8, { type: 'lowpass', f: 850, dur: 0.26 * V.dm, V, sweepTo: 150 });
    for (let k = 0; k < 3; k++) noiseHit(ctx, d, t + 0.04 + k * rnd(0.03, 0.08), g * 0.32, { f: rnd(480, 1200), q: 1.4, dur: 0.06, V }); // rubble
  },
  ice(ctx, d, t, g, i, p, V, prof) {
    modalHit(ctx, d, t, g * 0.7, prof, { base: 1250, V, noiseAmt: 0.35 });      // bright short ring
    const n = 2 + Math.round(3 * i);                                            // crackle ticks
    for (let k = 0; k < n; k++) noiseHit(ctx, d, t + k * rnd(0.012, 0.04), g * 0.6, { type: 'highpass', f: rnd(3800, 6500), dur: 0.025, V });
  },
  icebreak(ctx, d, t, g, i, p, V, prof) {
    noiseHit(ctx, d, t, g * 0.95, { type: 'highpass', f: 2400, dur: 0.15, V }); // main crack burst
    modalHit(ctx, d, t, g * 0.75, prof, { base: 1050, V, noiseAmt: 0.3 });
    tone(ctx, d, { f: 210 * V.pm, to: 58, t, dur: 0.2 * V.dm, peak: g * 0.6 }); // body drop
    for (let k = 0; k < 5; k++) noiseHit(ctx, d, t + 0.05 + k * rnd(0.03, 0.09), g * 0.38, { type: 'highpass', f: rnd(3000, 7000), dur: 0.045, V }); // crackle tail
  },
  shush(ctx, d, t, g, i, p, V) {
    noiseHit(ctx, d, t, g, { type: 'highpass', f: 2300 + 1900 * i, dur: 0.3, V }); // dry grain hiss (powder falling)
  },
  creak(ctx, d, t, g, i, p, V) {
    // stick-slip: a short train of narrowband slips, each lower than the last
    let tt = t; const slips = 2 + Math.round(2 * i);
    for (let k = 0; k < slips; k++) {
      const dur = rnd(0.05, 0.1) * V.dm;
      noiseHit(ctx, d, tt, g * (0.85 - k * 0.15), { f: rnd(200, 380) * V.cm * (1 - k * 0.12), q: 9, dur, V });
      tt += dur * rnd(0.8, 1.3);
    }
  },
};

/** Offline render of a one-shot (verify harness / intensity proof). */
export function renderOneshot(cls, intensity, { seconds = 1.2, rate = 44100 } = {}) {
  const OC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
  if (!OC || !VOICES[cls]) return Promise.resolve(null);
  const ctx = new OC(1, Math.floor(rate * seconds), rate);
  const g = testGain(cls, intensity);
  try { VOICES[cls](ctx, ctx.destination, 0.02, g / MASTER * 0.9, clamp01(intensity), 0.5, NEUTRAL_V, profileForClass(cls)); } catch { return Promise.resolve(null); }
  return ctx.startRendering().then((buf) => {
    const d = buf.getChannelData(0); let sum = 0, peak = 0;
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    return { rms: Math.sqrt(sum / d.length), peak };
  });
}

/* Loop base filter frequencies by class + intensity (+ vent pitch).
 * SND3: pour centres/widths and gas centres are profile-derived in
 * loopFreqFor() below; this table remains the fallback shape. */
function loopFreq(cls, i, pitch) {
  switch (cls) {
    case 'boil': return 500 + 700 * i;
    case 'pour': return 400 + 1000 * i;
    case 'pour-oil': return 220 + 380 * i;
    case 'pour-grain': return 2600 + 1600 * i;
    case 'steam': return 3000 + 3000 * i;
    case 'sizzle': return 2000 + 5000 * i;
    case 'fizz': return 1800 + 1800 * i;
    case 'acidfizz': return 2600 + 2600 * i;
    case 'vent': return 500 + 1900 * pitch;
    case 'lava': return 130 + 130 * i;
    case 'wind': return 300 + 700 * i;
    case 'lap': return 480 + 240 * i;
    case 'scrape': return 700 + 900 * i;
    default: return 700;
  }
}
/** Profile-shaped loop filter: [type, Q, centreHz]. Flow noise: water
 * bright/narrow, oil low/wide; gas: centre rises with pressure (pitch). */
function loopFreqFor(cls, i, pitch) {
  const prof = profileForClass(cls);
  switch (cls) {
    case 'pour': return ['bandpass', 1.5 - 0.7 * prof.viscosity, (480 + 1150 * i) * (1.15 - 0.55 * prof.viscosity)];
    case 'pour-oil': return ['bandpass', 0.55, 190 + 330 * i];                       // low + wide
    case 'steam': return ['bandpass', 0.6, 2600 + 3400 * i];                        // temp-driven pressure
    case 'vent': return ['bandpass', 1.3, 420 + 2300 * pitch];                      // pressure = pitch
    case 'sizzle': return ['highpass', 0.7, 2100 + 4200 * i];
    case 'wind': return ['bandpass', 0.45, 300 + 700 * i];
    case 'scrape': return ['bandpass', 1.4, (650 + 950 * i) * (0.6 + 0.7 * prof.hardness)];
    default: { const spec = LOOP_FILTER[cls]; return spec ? [spec[0], spec[1], loopFreq(cls, i, pitch)] : ['bandpass', 1, 700]; }
  }
}
const LOOP_FILTER = { boil: ['bandpass', 0.7], pour: ['bandpass', 0.6], 'pour-oil': ['bandpass', 1.1], 'pour-grain': ['highpass', 0.7], steam: ['bandpass', 0.5], sizzle: ['highpass', 0.7], fizz: ['bandpass', 2.2], acidfizz: ['bandpass', 2.6], vent: ['bandpass', 1.4], fire: ['lowpass', 0.5], lava: ['lowpass', 0.8], wind: ['bandpass', 0.45], lap: ['bandpass', 0.9], scrape: ['bandpass', 1.3] };
/* Bubble-family loops run their noise bed REDUCED — the stochastic bubble
 * pings carry the sound. Fire's bed is a very low rumble under the pops. */
const BED_GAIN = { boil: 0.30, fizz: 0.28, acidfizz: 0.25, sizzle: 0.38, bubble: 0.22, lava: 0.45, fire: 0.30 };

/** Generated stereo impulse response: noise burst, exponential decay. */
function makeIR(ctx, seconds) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  return buf;
}

export class MatterSound {
  constructor() {
    this.ctx = null; this.master = null;
    this.conv = null; this._irs = new Map(); this._loopWet = null;
    this.localEnabled = true;
    this.loops = new Map();       // cls -> {gain, pan, target, amb, pitch, panCur, walk, phase, enc...}
    this.voices = [];             // {cls, gain, at}
    this.lastAt = new Map();
    this.lastEvents = [];         // ring for tests {cls, intensity, kind, at}
    this.amb = { fire: 0, water: 0, wind: 0, steam: 0 };
    this._duckAt = -10;
    this._poll = null; this._unsub = null;
    try { this._unsub = onSettings((s) => { if (s && s.sfx === false) this._silenceLoops(); }); } catch { /* no settings bus */ }
    if (typeof setInterval !== 'undefined') {
      this._poll = setInterval(() => { if (!this._gate()) this._silenceLoops(); }, 500);
      if (this._poll && this._poll.unref) this._poll.unref();
    }
  }
  _gate() { if (!this.localEnabled) return false; try { return sfxEnabled(); } catch { return true; } }
  setEnabled(on) { this.localEnabled = !!on; if (!on) this._silenceLoops(); return this.localEnabled; }
  enabled() { return this._gate(); }
  testGain(cls, i) { return testGain(cls, i); }
  /** Wet gain a voice with this enclosure would get (verify harness). */
  wetFor(enc) { return reverbWet(clampEnc(enc)); }

  _ensure() {
    if (this.ctx) { if (this.ctx.state !== 'running' && this.ctx.resume) this.ctx.resume().catch(() => {}); return this.ctx; }
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return null;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 9; comp.attack.value = 0.004; comp.release.value = 0.12;
      this.master = this.ctx.createGain(); this.master.gain.value = MASTER;
      this.master.connect(comp).connect(this.ctx.destination);
      // SCENE REVERB: exactly ONE convolver for the whole module.
      if (typeof this.ctx.createConvolver === 'function') {
        this.conv = this.ctx.createConvolver();
        this.conv.buffer = this._ir(1.0);
        this.conv.connect(this.master);
        this._loopWet = this.ctx.createGain(); this._loopWet.gain.value = AMBIENT_WET;
        this._loopWet.connect(this.conv);
      }
    } catch { this.ctx = null; }
    return this.ctx;
  }
  _ir(seconds) {
    if (!this._irs.has(seconds)) this._irs.set(seconds, makeIR(this.ctx, seconds));
    return this._irs.get(seconds);
  }
  /** Feed a voice destination into the reverb at this enclosure's wet gain. */
  _wetSend(fromNode, enc) {
    if (!this.conv || !fromNode) return;
    try {
      if (this.conv.buffer !== this._irs.get(irSecondsFor(enc))) this.conv.buffer = this._ir(irSecondsFor(enc));
      const wg = this.ctx.createGain(); wg.gain.value = reverbWet(enc);
      fromNode.connect(wg); wg.connect(this.conv);
    } catch { /* reverb is garnish; dry path already connected */ }
  }
  resume() { return !!this._ensure(); }

  _log(cls, intensity, kind) { this.lastEvents.push({ cls, intensity: clamp01(intensity), kind, at: Date.now() }); if (this.lastEvents.length > 64) this.lastEvents.shift(); }
  _silenceLoops() {
    this.amb = { fire: 0, water: 0, wind: 0, steam: 0 };
    for (const L of this.loops.values()) { L.target = 0; L.amb = 0; try { L.gain.gain.setTargetAtTime(0, this.ctx ? this.ctx.currentTime : 0, 0.05); } catch { /* noop */ } }
    if (this._loopWet) { try { this._loopWet.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); } catch { /* noop */ } } // reverb tail gated too
  }

  _makeLoop(cls) {
    const ctx = this.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0;
    let dest = gain;
    let pan = null;
    if (typeof ctx.createStereoPanner === 'function') { pan = ctx.createStereoPanner(); pan.pan.value = 0; gain.connect(pan); dest = pan; }
    dest.connect(this.master);
    if (this._loopWet) { try { dest.connect(this._loopWet); } catch { /* noop */ } } // beds: low fixed wet
    const L = { gain, pan, target: 0, amb: 0, pitch: 0.5, panCur: 0, panTarget: 0, walk: 1, walk2: 1, phase: Math.random() * 6.28, nodes: [], filter: null, enc: DEFAULT_ENC, am: null, amLfo: null };
    const spec = LOOP_FILTER[cls];
    if (spec) {
      const s = noiseSrc(ctx, true); const f = ctx.createBiquadFilter(); f.type = spec[0]; f.frequency.value = loopFreq(cls, 0.3, 0.5); f.Q.value = spec[1];
      // amplitude modulation node: oil glug (slow) / gas flutter (fast) / scrape stick-slip
      let head = gain;
      if (cls === 'pour-oil' || cls === 'vent' || cls === 'steam' || cls === 'scrape') {
        const am = ctx.createGain(); am.gain.value = 1; am.connect(gain); head = am; L.am = am;
        const lfo = ctx.createOscillator(); const lg = ctx.createGain();
        lfo.frequency.value = cls === 'pour-oil' ? 2.6 : cls === 'scrape' ? 7 : 11;   // glug ~2.6 Hz, flutter ~11 Hz
        lg.gain.value = cls === 'pour-oil' ? 0.38 : 0.16;
        lfo.connect(lg).connect(am.gain); lfo.start(); L.nodes.push(lfo); L.amLfo = lfo;
      }
      const bed = ctx.createGain(); bed.gain.value = BED_GAIN[cls] != null ? BED_GAIN[cls] : 1;
      s.connect(f).connect(bed).connect(head); s.start(); L.nodes.push(s); L.filter = f;
    }
    this.loops.set(cls, L);
    return L;
  }

  /** Continuous classes: setLoop(cls, intensity01, pitch01?, x01?, enc?). */
  setLoop(cls, intensity, pitch, x, enc) {
    const i = clamp01(intensity);
    this._log(cls, i, 'loop');
    if (!LOOP_CLASSES.includes(cls)) return;
    if (!this._gate()) { const L = this.loops.get(cls); if (L) L.target = 0; return; }
    if (i <= 0.003) { const L = this.loops.get(cls); if (L) L.target = 0; return; }
    if (!this._ensure()) return;
    if (this._loopWet) { try { this._loopWet.gain.setTargetAtTime(AMBIENT_WET, this.ctx.currentTime, 0.2); } catch { /* noop */ } }
    const L = this.loops.get(cls) || this._makeLoop(cls);
    L.target = i; if (pitch != null) L.pitch = clamp01(pitch);
    if (enc != null) L.enc = clampEnc(enc);
    if (x != null) L.panTarget = Math.max(-0.8, Math.min(0.8, (clamp01(x) - 0.5) * 1.6));
  }

  /** Ambient bed: setAmbient({fire, water, wind, steam}) — presence 0..1, UI-fed ~250 ms from real engine counters. */
  setAmbient(a = {}) {
    if (!this._gate()) { this.amb = { fire: 0, water: 0, wind: 0, steam: 0 }; return; }
    this.amb = { fire: clamp01(a.fire), water: clamp01(a.water), wind: clamp01(a.wind), steam: clamp01(a.steam) };
    if ((this.amb.fire > 0.02 || this.amb.water > 0.02 || this.amb.wind > 0.02 || this.amb.steam > 0.02) && this._ensure()) {
      const map = { fire: 'fire', water: 'lap', wind: 'wind', steam: 'steam' };
      for (const k of Object.keys(map)) if (this.amb[k] > 0.02 && !this.loops.has(map[k])) this._makeLoop(map[k]);
    }
  }

  /** Engine-event adapter: accepts the engine's event object directly,
   * including the parallel pass's `enc` field (ev.enc ?? 0.15). */
  handleEvent(ev) {
    if (!ev) return false;
    const enc = clampEnc(ev.enc);
    if (ev.type === 'loop') { this.setLoop(ev.cls, ev.intensity, ev.pitch, ev.x, enc); return true; }
    return this.event(ev.cls, ev.intensity, ev.pitch, ev.x, enc);
  }

  /** One-shot classes: event(cls, intensity01, pitch01?, x01?, enc?) */
  event(cls, intensity, pitch, x, enc) {
    let i = clamp01(intensity);
    // splash size split — sound-module internal, no engine change
    if (cls === 'splash') cls = i < 0.25 ? 'dropsplash' : i >= 0.7 ? 'bigsplash' : 'splash';
    this._log(cls, i, 'event');
    if (!ONESHOT_CLASSES.includes(cls) || i <= 0) return false;
    if (!this._gate()) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - (this.lastAt.get(cls) || -1e9) < (MIN_MS[cls] || 60)) return false;
    if (!this._ensure()) return false;
    return this._play(cls, i, pitch, x, now, clampEnc(enc));
  }

  _play(cls, i, pitch, x, now, enc = DEFAULT_ENC) {
    // pool cap ≤8: drop quietest (lowest priority) when full
    this.voices = this.voices.filter((v) => now - v.at < 1200);
    if (this.voices.length >= 8) { this.voices.sort((a, b) => a.gain - b.gain); this.voices.shift(); }
    let g = testGain(cls, i);
    // per-voice bus: bus → (pan) → master dry; bus → wet gain → convolver
    const bus = this.ctx.createGain(); bus.gain.value = 1;
    let dest = bus;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const pan = this.ctx.createStereoPanner();
      const pv = (x == null || CENTERED.has(cls)) ? 0 : Math.max(-0.8, Math.min(0.8, (clamp01(x) - 0.5) * 1.6));
      pan.pan.value = pv;
      if (!CENTERED.has(cls)) g *= 1 - 0.25 * Math.abs(pv); // mild distance attenuation
      bus.connect(pan); pan.connect(this.master);
    } else bus.connect(this.master);
    this._wetSend(bus, enc);
    try { VOICES[cls](this.ctx, dest, this.ctx.currentTime + 0.01, g / MASTER * 0.9, i, pitch != null ? clamp01(pitch) : null, vary(), profileForClass(cls)); } catch { return false; }
    if ((cls === 'boom' || cls === 'thunder' || cls === 'bigsplash' || cls === 'glassbreak') && i > 0.5) this._duckAt = this.ctx.currentTime;
    this.voices.push({ cls, gain: g, at: now });
    this.lastAt.set(cls, now);
    return true;
  }

  /** Per-frame tick: loop gain/pan/filter evolution, stochastic bubble/fire
   * scheduling, ambient floors, bubblepop driver. */
  frame(dt = 0.016) {
    if (!this.ctx || !this._gate()) return;
    const t = this.ctx.currentTime;
    const duck = (t - this._duckAt < 0.45) ? DUCK_FACTOR : 1;
    // ambient floors (≥1 s crossfade via slow timeConstant below)
    const ambMap = { fire: this.amb.fire * 0.55, lap: this.amb.water, wind: this.amb.wind, steam: this.amb.steam * 0.6 };
    for (const [cls, L] of this.loops) {
      L.amb = ambMap[cls] != null ? ambMap[cls] * duck : 0;
      const eff = Math.max(L.target, L.amb);
      // evolution: random-walk + slow LFO on cutoff and stochastic rate
      L.walk = Math.max(0.78, Math.min(1.28, L.walk + (Math.random() - 0.5) * 0.03));
      L.walk2 = Math.max(0.7, Math.min(1.4, L.walk2 + (Math.random() - 0.5) * 0.04));
      L.panCur += (L.panTarget - L.panCur) * 0.06;
      if (L.pan) { try { L.pan.pan.setTargetAtTime(L.panCur, t, 0.12); } catch { /* noop */ } }
      const ambDriven = L.amb > L.target;
      let g = eff > 0.003 ? testGain(cls, eff) : 0;
      if (cls === 'lap' && eff > 0.003) g *= 0.62 + 0.38 * Math.sin(t * 0.55 + L.phase); // slow swell
      try { L.gain.gain.setTargetAtTime(g, t, ambDriven ? 0.55 : 0.09); } catch { /* noop */ }
      if (L.filter && eff > 0.003) {
        const gust = cls === 'wind' ? 1 + 0.16 * Math.sin(t * 0.4 + L.phase) : 1;
        const shaped = loopFreqFor(cls, eff, L.pitch);
        try {
          L.filter.type = shaped[0]; L.filter.Q.setTargetAtTime(shaped[1], t, 0.12);
          L.filter.frequency.setTargetAtTime(shaped[2] * L.walk * gust, t, 0.12);
        } catch { /* noop */ }
        if (L.amLfo && cls === 'pour-oil') { try { L.amLfo.frequency.setTargetAtTime(1.8 + 2.4 * eff, t, 0.2); } catch { /* noop */ } } // glug rate follows flow
      }
      if (eff <= 0.003) continue;
      const gi = eff, gg = testGain(cls, gi) / MASTER, rate = L.walk2;
      /* Bubble-resonance loops: stochastic Minnaert pings at rate ∝ intensity. */
      if (BUBBLE_KIND[cls]) {
        const { bp } = loopBubbleParams(cls, gi);
        if (Math.random() < bp.rate * gi * rate * dt) {
          bubblePing(this.ctx, L.gain, t + 0.01, gg * rnd(0.35, 0.95), { rMm: drawBubbleR(bp), durMs: bp.durMs * rnd(0.7, 1.4), V: NEUTRAL_V });
        }
      }
      /* Fire: stochastic micro-pops — many small, rare large (rate+size ∝ intensity). */
      if (cls === 'fire') {
        if (Math.random() < (2 + 16 * gi) * rate * dt) firePop(this.ctx, L.gain, t + 0.01, gg * rnd(0.25, 0.8), false);
        if (Math.random() < 1.6 * gi * gi * rate * dt) firePop(this.ctx, L.gain, t + 0.01, gg * rnd(0.7, 1.1), true);
      }
      /* Grain pour: dense micro-transients over the noise bed. */
      if (cls === 'pour-grain' && Math.random() < (14 + 30 * gi) * rate * dt) {
        noiseHit(this.ctx, L.gain, t + 0.01, gg * rnd(0.15, 0.45), { type: 'highpass', f: rnd(2400, 4600), dur: 0.015, V: NEUTRAL_V });
      }
      // bubblepop: surface pops driven by the bubble stream when bubbling is strong
      if (cls === 'bubble' && gi > 0.35 && Math.random() < (gi - 0.35) * 14 * dt) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (now - (this.lastAt.get('bubblepop') || -1e9) >= (MIN_MS.bubblepop || 45) && this.voices.length < 8) {
          this._play('bubblepop', 0.3 + gi * 0.6, null, L.panCur != null ? L.panCur / 1.6 + 0.5 : null, now, L.enc);
        }
      }
    }
  }

  dispose() {
    this._silenceLoops();
    if (this._poll) clearInterval(this._poll);
    if (this._unsub) { try { this._unsub(); } catch { /* noop */ } }
    for (const L of this.loops.values()) for (const n of L.nodes) { try { n.stop(); } catch { /* noop */ } }
    this.loops.clear();
    if (this.ctx) { try { this.ctx.close(); } catch { /* noop */ } this.ctx = null; }
  }
}
export default MatterSound;
