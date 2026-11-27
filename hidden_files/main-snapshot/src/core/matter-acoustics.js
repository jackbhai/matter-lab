/**
 * matter-acoustics.js — Matter Lab Ultra (W32U) SND3 ULTRA-REALISM pass.
 *
 * Acoustic profiles derived from substance records. A profile is the ONLY
 * thing the synthesis models in matter-sound.js read about a material:
 *   { hardness, viscosity, grain, density, resonance, wetness, bubble }
 * all normalised ~0..1. Derivation uses the record's existing fields
 * (density, viscosity, hardness, elasticity, cls, fams, boilPoint,
 * volatility, profile); an explicit OVERRIDES table pins the materials
 * those fields underdetermine (water, oils by grade, acids, honey, sand,
 * gravel, metals by family/key, wood, ice, glass, rubber, wax, lava…).
 *
 * Pure ESM, no DOM, no AudioContext — Node-importable for the verify and
 * count harnesses (scripts/matter-sound-count.mjs).
 */
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ *
 * OVERRIDES — keyed first, then by record.profile, then by family.
 * Only the fields physics-from-table gets wrong are pinned.
 * ------------------------------------------------------------------ */
const KEY_OVERRIDES = {
  water:            { hardness: 0.04, viscosity: 0.10, grain: 0.0, resonance: 0.18, wetness: 1.0, bubble: 0.62 },
  'distilled-water':{ hardness: 0.04, viscosity: 0.10, grain: 0.0, resonance: 0.18, wetness: 1.0, bubble: 0.60 },
  seawater:         { hardness: 0.04, viscosity: 0.12, grain: 0.02, resonance: 0.18, wetness: 1.0, bubble: 0.58 },
  honey:            { hardness: 0.05, viscosity: 0.97, grain: 0.0, resonance: 0.08, wetness: 0.85, bubble: 0.05 },
  milk:             { hardness: 0.04, viscosity: 0.28, grain: 0.0, resonance: 0.15, wetness: 0.95, bubble: 0.40 },
  mercury:          { hardness: 0.10, viscosity: 0.14, grain: 0.0, resonance: 0.55, wetness: 0.9, bubble: 0.30 },
  lava:             { hardness: 0.30, viscosity: 0.88, grain: 0.25, resonance: 0.12, wetness: 0.35, bubble: 0.34 },
  magma:            { hardness: 0.30, viscosity: 0.90, grain: 0.25, resonance: 0.12, wetness: 0.35, bubble: 0.32 },
  sand:             { hardness: 0.55, viscosity: 0.0, grain: 0.92, resonance: 0.06, wetness: 0.0, bubble: 0.0 },
  gravel:           { hardness: 0.78, viscosity: 0.0, grain: 0.98, resonance: 0.14, wetness: 0.0, bubble: 0.0 },
  ice:              { hardness: 0.62, viscosity: 0.0, grain: 0.30, resonance: 0.82, wetness: 0.55, bubble: 0.0 },
  glass:            { hardness: 0.92, viscosity: 0.0, grain: 0.05, resonance: 0.96, wetness: 0.05, bubble: 0.0 },
  // metals by key — same family, audibly different bodies
  iron:             { hardness: 0.78, resonance: 0.86 },
  steel:            { hardness: 0.84, resonance: 0.92 },
  gold:             { hardness: 0.52, resonance: 0.62 },   // soft + very dense → lower, deader ring
  silver:           { hardness: 0.58, resonance: 0.88 },
  copper:           { hardness: 0.55, resonance: 0.80 },
  aluminium:        { hardness: 0.50, resonance: 0.78 },   // light → higher, thinner ring
  aluminum:         { hardness: 0.50, resonance: 0.78 },
  lead:             { hardness: 0.30, resonance: 0.28 },   // famously dead thud
  tin:              { hardness: 0.42, resonance: 0.66 },
  zinc:             { hardness: 0.55, resonance: 0.60 },
  brass:            { hardness: 0.62, resonance: 0.90 },
  bronze:           { hardness: 0.66, resonance: 0.94 },   // bell metal
};
const PROFILE_OVERRIDES = {
  water:  { hardness: 0.05, resonance: 0.18, wetness: 0.95, bubble: 0.55 },
  oil:    { hardness: 0.05, resonance: 0.10, wetness: 0.9 },              // viscosity pinned by grade below
  acid:   { hardness: 0.05, resonance: 0.14, wetness: 0.95, bubble: 0.92 },// fizz is the acid's voice
  food:   { hardness: 0.05, resonance: 0.12, wetness: 0.9, bubble: 0.35 },
  fuel:   { hardness: 0.04, resonance: 0.10, wetness: 0.9, bubble: 0.48 },
  solvent:{ hardness: 0.04, resonance: 0.10, wetness: 0.9, bubble: 0.45 },
  metal:  { hardness: 0.72, resonance: 0.85, wetness: 0.0, bubble: 0.0 },
  glass:  { hardness: 0.92, resonance: 0.96, wetness: 0.05, bubble: 0.0 },
  wood:   { hardness: 0.55, resonance: 0.44, wetness: 0.05, bubble: 0.0, grain: 0.35 },
  stone:  { hardness: 0.85, resonance: 0.30, wetness: 0.0, bubble: 0.0, grain: 0.55 },
  rubber: { hardness: 0.22, resonance: 0.14, wetness: 0.0, bubble: 0.0 },
  polymer:{ hardness: 0.35, resonance: 0.22, wetness: 0.0, bubble: 0.0 },
  wax:    { hardness: 0.18, resonance: 0.10, wetness: 0.05, bubble: 0.0 },
  soap:   { hardness: 0.10, resonance: 0.10, wetness: 0.8, bubble: 0.85 }, // foam loves bubbles
  cryogen:{ hardness: 0.05, resonance: 0.16, wetness: 0.9, bubble: 0.88 }, // violent boil-off
};
const FAM_OVERRIDES = {
  glass:  PROFILE_OVERRIDES.glass,
  frozen: { hardness: 0.62, resonance: 0.82, wetness: 0.55, bubble: 0.0 },
  metal:  PROFILE_OVERRIDES.metal,
  wood:   PROFILE_OVERRIDES.wood,
  rubber: PROFILE_OVERRIDES.rubber,
  wax:    PROFILE_OVERRIDES.wax,
  acid:   { bubble: 0.9, wetness: 0.95 },
  'strong-acid': { bubble: 0.97 },
  oil:    { wetness: 0.9, resonance: 0.10 },
  'hot-liquid': { viscosity: 0.88, bubble: 0.32, resonance: 0.12, wetness: 0.35, grain: 0.25 },
  stone:  { grain: 0.55, resonance: 0.30 },
};

/** Derive the acoustic profile for a substance record (or a partial stub). */
export function profileFor(rec) {
  if (!rec) return { hardness: 0.5, viscosity: 0.2, grain: 0.2, density: 0.45, resonance: 0.4, wetness: 0.3, bubble: 0.3 };
  const cls = rec.cls || 'solid';
  const fams = rec.fams || [];
  const dens = rec.density != null ? rec.density : 1;
  // log-scale density: gas ~0.15, water ~0.43, stone ~0.65, iron ~0.82, gold ~0.99
  let p = {
    density: clamp01((Math.log10(Math.max(0.02, dens) + 0.1) + 1) / 2.3),
    viscosity: clamp01(rec.viscosity != null ? rec.viscosity : 0),
    hardness: clamp01(rec.hardness != null ? rec.hardness : 0.5),
    grain: 0.1,
    resonance: 0.35,
    wetness: 0,
    bubble: 0,
  };
  if (cls === 'liquid') {
    p.hardness = 0.04 + 0.10 * p.viscosity;                    // a liquid has no strike hardness
    p.wetness = 0.95;
    p.resonance = 0.12 + 0.25 * p.density;                     // dense liquids (Hg) ring a little
    p.bubble = clamp01(0.62 * (1 - p.viscosity) + 0.35 * clamp01(rec.volatility || 0));
    if (rec.boilPoint != null && rec.boilPoint < 90) p.bubble = Math.max(p.bubble, 0.5); // volatile
  } else if (cls === 'gas' || cls === 'fire' || cls === 'electric') {
    p.hardness = 0.02; p.viscosity = 0; p.wetness = fams.includes('aqueous') ? 0.6 : 0.05; p.resonance = 0.08; p.bubble = 0;
  } else if (cls === 'powder') {
    p.grain = clamp01(0.55 + 0.4 * p.hardness);
    p.resonance = 0.05 + 0.12 * p.hardness;
    p.wetness = fams.includes('aqueous') ? 0.4 : 0;
  } else { // solid / life / special
    p.grain = fams.includes('stone') ? 0.55 : 0.15;
    p.resonance = clamp01(0.15 + 0.55 * p.hardness + 0.35 * clamp01(rec.elasticity || 0));
    p.wetness = fams.includes('aqueous') || fams.includes('frozen') ? 0.5 : 0.02;
  }
  // layer: family → record.profile → key (most specific wins, field-wise)
  const apply = (o) => { if (o) for (const k of Object.keys(o)) p[k] = o[k]; };
  for (const f of fams) apply(FAM_OVERRIDES[f]);
  apply(PROFILE_OVERRIDES[rec.profile]);
  apply(KEY_OVERRIDES[rec.key]);
  // oils by grade: viscosity IS the grade — thin oil still glugs a little,
  // heavy oil barely bubbles and pours low/wide.
  if (fams.includes('oil') || rec.profile === 'oil') {
    p.bubble = clamp01(0.30 * (1 - p.viscosity));
    p.wetness = 0.9;
  }
  for (const k of Object.keys(p)) p[k] = clamp01(p[k]);
  return p;
}

/* ------------------------------------------------------------------ *
 * Class → representative profile. Sound events carry a class, not a
 * substance id; the engine already routes break sounds by family
 * (clank=metal, knock=wood, rockbreak=stone, ice/glass by family) and
 * pour/splash by liquid kind (water vs oil vs grain are distinct
 * classes), so each class maps to the material it implies.
 * ------------------------------------------------------------------ */
const STUB = (o) => ({ cls: 'liquid', density: 1, viscosity: 0.18, hardness: 0.5, elasticity: 0, volatility: 0, boilPoint: 100, fams: [], profile: 'generic', ...o });
export const CLASS_PROFILE_STUBS = {
  boil: STUB({ key: 'water' }), bubble: STUB({ key: 'water' }), pour: STUB({ key: 'water' }),
  splash: STUB({ key: 'water' }), dropsplash: STUB({ key: 'water' }), bigsplash: STUB({ key: 'water' }),
  lap: STUB({ key: 'water' }), bubblepop: STUB({ key: 'water' }),
  'pour-oil': STUB({ density: 0.9, viscosity: 0.6, fams: ['oil'], profile: 'oil' }),
  'pour-grain': STUB({ cls: 'powder', density: 2.65, viscosity: 0, hardness: 0.55, fams: ['stone'], profile: 'stone' }),
  shush: STUB({ cls: 'powder', density: 1.6, viscosity: 0, hardness: 0.4, fams: [], profile: 'powder' }),
  acidfizz: STUB({ density: 1.4, viscosity: 0.4, fams: ['acid', 'strong-acid'], profile: 'acid' }),
  fizz: STUB({ density: 1.0, viscosity: 0.2, fams: ['aqueous'], profile: 'water' }),
  sizzle: STUB({ density: 0.9, viscosity: 0.55, fams: ['oil'], profile: 'oil' }), // food frying in oil
  lava: STUB({ key: 'lava', density: 2.9, viscosity: 0.88, fams: ['hot-liquid', 'stone'] }),
  steam: STUB({ cls: 'gas', density: 0.12, fams: ['aqueous'] }),
  vent: STUB({ cls: 'gas', density: 0.12, fams: [] }),
  wind: STUB({ cls: 'gas', density: 0.12, fams: [] }),
  fire: STUB({ cls: 'fire', density: 0.05, fams: ['organic'], profile: 'fire' }),
  scrape: STUB({ cls: 'solid', density: 2.6, hardness: 0.8, fams: ['stone'], profile: 'stone' }),
  clank: STUB({ cls: 'solid', density: 7.85, hardness: 0.65, fams: ['metal'], profile: 'metal', key: 'steel' }),
  clink: STUB({ cls: 'solid', density: 2.5, hardness: 0.65, fams: ['glass'], profile: 'glass', key: 'glass' }),
  chime: STUB({ cls: 'solid', density: 8.5, hardness: 0.66, fams: ['metal'], profile: 'metal', key: 'bronze' }),
  knock: STUB({ cls: 'solid', density: 0.7, hardness: 0.55, fams: ['wood'], profile: 'wood' }),
  rockbreak: STUB({ cls: 'solid', density: 2.75, hardness: 0.9, fams: ['stone'], profile: 'stone', key: 'granite' }),
  ice: STUB({ cls: 'solid', density: 0.92, hardness: 0.3, fams: ['frozen', 'aqueous'], profile: 'water', key: 'ice' }),
  icebreak: STUB({ cls: 'solid', density: 0.92, hardness: 0.3, fams: ['frozen', 'aqueous'], profile: 'water', key: 'ice' }),
  glassbreak: STUB({ cls: 'solid', density: 2.5, hardness: 0.65, fams: ['glass'], profile: 'glass', key: 'glass' }),
  creak: STUB({ cls: 'solid', density: 0.7, hardness: 0.55, fams: ['wood'], profile: 'wood' }),
  boom: STUB({ cls: 'special', density: 2.0, hardness: 0.8, fams: ['stone', 'metal'], profile: 'explosive' }),
  pop: STUB({ cls: 'gas', density: 0.12, fams: [] }),
  zap: STUB({ cls: 'electric', density: 0.08, fams: [], profile: 'electric' }),
  thunder: STUB({ cls: 'gas', density: 0.12, fams: [] }),
  whoosh: STUB({ cls: 'gas', density: 0.12, fams: [] }),
};
const _classCache = new Map();
export function profileForClass(cls) {
  if (!_classCache.has(cls)) _classCache.set(cls, profileFor(CLASS_PROFILE_STUBS[cls] || STUB({})));
  return _classCache.get(cls);
}

/* ------------------------------------------------------------------ *
 * BUBBLE-RESONANCE MODEL (Minnaert). A bubble of radius r mm rings at
 * f ≈ 3260 / r Hz (f·r ≈ 3.26 m·s⁻¹ in water at 1 atm, clamped to the
 * audible band). Radius distribution: mean/spread from temperature +
 * the liquid profile — hotter water nucleates larger, faster bubbles;
 * viscous oil makes fewer, larger (→ lower), longer-lived bubbles;
 * acid fizz is a storm of sub-mm bubbles (→ very high, very fast).
 * kind: 'boil' | 'fizz' | 'acid' | 'bubble' (gas rising) | 'lava' | 'sizzle'
 * ------------------------------------------------------------------ */
export const minnaertHz = (rMm) => Math.max(280, Math.min(9500, 3260 / Math.max(0.25, rMm)));
export function bubbleParams(profile, { temp = 100, kind = 'boil' } = {}) {
  const visc = profile.viscosity, bub = profile.bubble;
  let meanR, spread, rate, durMs;
  if (kind === 'acid') {           // chemical fizz: tiny bubbles, furious rate
    meanR = 0.45 + 0.25 * visc; spread = 0.45; rate = 26 + 60 * bub; durMs = 14;
  } else if (kind === 'fizz') {
    meanR = 0.7 + 0.4 * visc; spread = 0.5; rate = 14 + 34 * bub; durMs = 18;
  } else if (kind === 'sizzle') {  // water droplets flashing in hot oil
    meanR = 0.55 + 0.3 * visc; spread = 0.55; rate = 30 + 55 * bub; durMs = 12;
  } else if (kind === 'lava') {    // gas escaping a very viscous melt
    meanR = 3.4 + 2.2 * visc; spread = 0.5; rate = 1.5 + 4 * bub; durMs = 190;
  } else if (kind === 'bubble') {  // gas bubbling up through liquid
    meanR = 1.6 + 1.6 * visc; spread = 0.45; rate = 5 + 13 * bub; durMs = 70;
  } else {                          // boil: temperature drives size + rate
    const heat = clamp01((temp - 55) / 65);                    // 55 °C simmer → 120 °C rolling
    meanR = lerp(0.8, 2.3, heat) * (0.65 + 0.85 * visc);       // viscosity fattens bubbles
    spread = 0.4 + 0.2 * heat;
    rate = lerp(3, 30, heat) * (0.25 + 0.75 * bub) / (1 + 1.6 * visc); // viscous = fewer
    durMs = lerp(38, 75, heat) * (1 + 1.8 * visc);             // viscous = longer
  }
  return { meanR, spread, rate, durMs, meanFreq: minnaertHz(meanR) };
}
/** Draw one bubble radius (log-normal-ish around the mean). */
export function drawBubbleR(bp, rnd = Math.random) {
  const u = (rnd() + rnd() + rnd()) / 3;                       // bell-ish 0..1
  return Math.max(0.25, bp.meanR * (1 - bp.spread + 2 * bp.spread * u));
}

/* ------------------------------------------------------------------ *
 * MODAL IMPACT MODEL. 3–5 decaying sine modes; ratios/gains/decays
 * from the profile: metal = inharmonic, high, long ring; wood = low,
 * near-harmonic, fast damp; glass = very high brittle cluster; stone =
 * dull, modes die almost immediately (+ noise does the talking); ice =
 * bright with short ring; rubber/wax = one dead mode.
 * baseHz scales with density (dense body → lower fundamental).
 * ------------------------------------------------------------------ */
export function modalParams(profile, baseHz = 400) {
  const res = profile.resonance, hard = profile.hardness;
  const base = baseHz * lerp(1.25, 0.55, profile.density) * (0.7 + 0.6 * hard);
  let ratios, gains, decays;
  if (res > 0.8 && hard > 0.8) {          // glass: brittle high cluster
    ratios = [1, 1.48, 2.09, 2.94, 3.87]; gains = [1, 0.7, 0.55, 0.4, 0.28]; decays = [0.22, 0.17, 0.13, 0.09, 0.06];
  } else if (res > 0.75) {                // metal / ice: inharmonic ring
    ratios = [1, 2.76, 5.40, 8.93]; gains = [1, 0.72, 0.48, 0.30]; decays = [0.55, 0.38, 0.24, 0.14];
  } else if (res > 0.55) {                // hard plastic / tin
    ratios = [1, 2.32, 4.10]; gains = [1, 0.6, 0.35]; decays = [0.28, 0.18, 0.10];
  } else if (res > 0.32) {                // wood: low, woody, quick
    ratios = [1, 2.02, 3.91]; gains = [1, 0.45, 0.20]; decays = [0.13, 0.08, 0.05];
  } else if (res > 0.18) {                // stone: dull thud modes
    ratios = [1, 1.87]; gains = [1, 0.4]; decays = [0.09, 0.05];
  } else {                                 // rubber / wax: dead single mode
    ratios = [1]; gains = [1]; decays = [0.06];
  }
  return ratios.map((r, i) => ({ f: Math.max(30, base * r), gain: gains[i], decay: decays[i] * (0.5 + res) }));
}

/* ------------------------------------------------------------------ *
 * SCENE REVERB. One generated-IR convolver; per-voice wet gain is a
 * function of enclosure enc (0 open … 1 sealed). Anchors from spec:
 * open 0.15 → ~8 % wet, vessel 0.7 → ~30 %, sealed 0.8 → ~40 %.
 * ------------------------------------------------------------------ */
const WET_ANCHORS = [[0, 0.03], [0.15, 0.08], [0.7, 0.30], [0.8, 0.40], [1, 0.48]];
export function reverbWet(enc) {
  const e = clamp01(enc != null ? enc : 0.15);
  for (let i = 1; i < WET_ANCHORS.length; i++) {
    if (e <= WET_ANCHORS[i][0]) {
      const [x0, y0] = WET_ANCHORS[i - 1], [x1, y1] = WET_ANCHORS[i];
      return y0 + (y1 - y0) * ((e - x0) / (x1 - x0));
    }
  }
  return 0.48;
}
/** IR length variant for an enclosure: open 0.4 s, vessel 1.0 s, sealed 1.8 s. */
export const irSecondsFor = (enc) => (enc < 0.35 ? 0.4 : enc < 0.75 ? 1.0 : 1.8);
export const AMBIENT_WET = 0.10;

/* ------------------------------------------------------------------ *
 * Parameter vector per (profile, action) — used ONLY by the count
 * script. Components are the actual synthesis parameters the models
 * above produce, so "distinct rendering" means distinct physics.
 * ------------------------------------------------------------------ */
export function paramVector(profile, action) {
  switch (action) {
    case 'boil': { const b = bubbleParams(profile, { temp: 100, kind: 'boil' }); return [b.meanFreq, b.rate, b.durMs, profile.viscosity]; }
    case 'fizz': { const b = bubbleParams(profile, { kind: 'fizz' }); return [b.meanFreq, b.rate, b.durMs, profile.bubble]; }
    case 'pour': return [500 + 2600 * (1 - profile.viscosity), 0.9 + 2.6 * profile.viscosity, profile.viscosity, 2 + 7 * profile.viscosity]; // centre Hz, Q⁻¹ width, visc, glug Hz
    case 'splash': return [420 + 900 * profile.wetness, minnaertHz(1.4 + profile.viscosity), profile.wetness, profile.density];
    case 'impact': { const m = modalParams(profile, 400); return [m[0].f, m.length, m[0].decay, 900 + 5200 * profile.hardness, profile.resonance]; }
    case 'grain-pour': return [2400 + 1800 * profile.grain, 30 + 90 * profile.grain, profile.grain, profile.hardness];
    default: return [profile.hardness, profile.viscosity, profile.resonance];
  }
}
export const ACTIONS_BY_CLS = {
  liquid: ['boil', 'fizz', 'pour', 'splash'],
  solid: ['impact'],
  special: ['impact'],
  powder: ['grain-pour'],
  life: ['impact'],
  gas: [], fire: [], electric: [],
};
