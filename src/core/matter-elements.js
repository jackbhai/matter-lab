/**
 * Matter Lab Ultra — unified substance table assembler.
 *
 * Imports the per-category data modules under ./matter/, applies class/family
 * defaults, assigns numeric ids, resolves state-change key references to ids,
 * validates the table, and runs the anti-padding audit (spec W32U §3.1):
 * an entry counts only if it differs from every other entry in at least one
 * behavioural/thermal/reaction field — colour-only duplicates are reported
 * in AUDIT.duplicates and are a build failure.
 *
 * Pure ESM, no DOM — Node-importable (scripts/matter-coverage.mjs uses it).
 */
import elEarth from './matter/el-earth.js';
import elLiquids from './matter/el-liquids.js';
import elGases from './matter/el-gases.js';
import elMetals from './matter/el-metals.js';
import elNature from './matter/el-nature.js';
import elChem from './matter/el-chem.js';
import elExplosives from './matter/el-explosives.js';
import elElectric from './matter/el-electric.js';
import elBuilding from './matter/el-building.js';
import elPolymers from './matter/el-polymers.js';
import elLab from './matter/el-lab.js';
import elSpecial from './matter/el-special.js';
import { LIQUID_PROPS, LIQUID_FAM_HSP, LIQUID_HSP_FALLBACK, SOLWATER, SOLWATER_FAM, LIQUID_SOLWATER_FALLBACK } from './matter-props.js';

export const CAT_ORDER = [
  ['earth', 'Earth & Powders'],
  ['liquids', 'Liquids'],
  ['gases', 'Gases, Fire & Plasma'],
  ['metals', 'Metals & Alloys'],
  ['nature', 'Nature & Life'],
  ['chem', 'Acids & Chemicals'],
  ['explosives', 'Explosives & Fuels'],
  ['electric', 'Electric & Energy'],
  ['building', 'Building & Solids'],
  ['polymers', 'Rubber & Polymers'],
  ['lab', 'Lab & Indicators'],
  ['special', 'Special & Fun'],
];
const CAT_IDS = new Set(CAT_ORDER.map(([id]) => id));
const CLASSES = new Set(['powder', 'liquid', 'gas', 'solid', 'fire', 'electric', 'life', 'special']);

const CLASS_DEFAULTS = {
  powder:   { density: 1.6, dispersion: 0, viscosity: 0, conductivity: 0.15, blastResistance: 0.3 },
  liquid:   { density: 1.0, dispersion: 4, viscosity: 0.2, conductivity: 0.35, blastResistance: 0.1 },
  gas:      { density: 0.12, dispersion: 6, viscosity: 0, conductivity: 0.05, blastResistance: 0.0 },
  solid:    { density: 2.6, dispersion: 0, viscosity: 0, conductivity: 0.3, blastResistance: 0.8 },
  fire:     { density: 0.05, dispersion: 3, viscosity: 0, conductivity: 0.1, blastResistance: 0.0 },
  electric: { density: 0.08, dispersion: 5, viscosity: 0, conductivity: 0.2, blastResistance: 0.0 },
  life:     { density: 0.9, dispersion: 0, viscosity: 0, conductivity: 0.2, blastResistance: 0.2 },
  special:  { density: 2.0, dispersion: 0, viscosity: 0, conductivity: 0.3, blastResistance: 0.9 },
};

const BASE = {
  formula: null, col: [0x888888, 0xaaaaaa],
  flammability: 0, ignitionTemp: null, electric: 0, hardness: 0.5, elasticity: 0,
  solubility: 0, ph: null, phEffect: 0, acidStrength: 0, activityRank: 0,
  tintStrength: 0, foamStabiliser: false, emulsifier: false, volatility: 0,
  meltPoint: null, meltTo: null, freezePoint: null, freezeTo: null,
  boilPoint: null, boilTo: null, condensePoint: null, condenseTo: null,
  burnTo: null, burnTime: 0, flameColour: null, sourceTemp: null, lifeSpan: null,
  blast: 0, fams: [], profile: 'generic', cation: null, anion: null,
  saltKey: null, oxideKey: null, marquee: false, hook: null, desc: '',
  hsp: null, pka: null, solWater: null,
};

const MODULES = [elEarth, elLiquids, elGases, elMetals, elNature, elChem,
  elExplosives, elElectric, elBuilding, elPolymers, elLab, elSpecial];

const errors = [];
const raw = [];
for (const mod of MODULES) {
  if (!Array.isArray(mod)) { errors.push('a category module did not export an array'); continue; }
  for (const e of mod) raw.push(e);
}

// ---- assemble -------------------------------------------------------------
const empty = { ...BASE, id: 0, key: 'empty', name: 'Empty', cat: 'special', cls: 'empty', col: [0, 0], desc: '' };
const SUBSTANCES = [empty];
const BY_KEY = new Map([['empty', empty]]);

for (const e of raw) {
  if (!e || !e.key || !e.name || !e.cls) { errors.push(`entry missing key/name/cls: ${JSON.stringify(e && e.key)}`); continue; }
  if (BY_KEY.has(e.key)) { errors.push(`duplicate key: ${e.key}`); continue; }
  if (!CLASSES.has(e.cls)) { errors.push(`${e.key}: bad cls ${e.cls}`); continue; }
  if (!CAT_IDS.has(e.cat)) { errors.push(`${e.key}: bad cat ${e.cat}`); continue; }
  const rec = { ...BASE, ...(CLASS_DEFAULTS[e.cls] || {}), ...e, id: SUBSTANCES.length };
  SUBSTANCES.push(rec);
  BY_KEY.set(rec.key, rec);
}

// ---- liquid property overlay (W32U-2): HSP + pKa ---------------------------
for (const rec of SUBSTANCES) {
  const entry = LIQUID_PROPS[rec.key];
  if (rec.cls === 'liquid') {
    if (!rec.hsp) {
      if (entry && entry.hsp) rec.hsp = entry.hsp;
      else {
        let famHsp = null;
        for (const fam of rec.fams || []) if (LIQUID_FAM_HSP[fam]) { famHsp = LIQUID_FAM_HSP[fam]; break; }
        rec.hsp = famHsp || LIQUID_HSP_FALLBACK;
      }
    }
    if (rec.pka == null && entry && entry.pka != null) rec.pka = entry.pka;
    if (!rec.solWater) {
      let famSol = null;
      for (const fam of rec.fams || []) if (SOLWATER_FAM[fam]) { famSol = SOLWATER_FAM[fam]; break; }
      rec.solWater = (entry && entry.solWater) || SOLWATER[rec.key] || famSol || LIQUID_SOLWATER_FALLBACK;
    }
  } else if (entry && entry.hsp && !rec.hsp) rec.hsp = entry.hsp;
  if (rec.cls !== 'liquid' && entry && entry.pka != null && rec.pka == null) rec.pka = entry.pka;
}

// resolve state-change / product key references to ids
const KEY_FIELDS = ['meltTo', 'freezeTo', 'boilTo', 'condenseTo', 'burnTo', 'saltKey', 'oxideKey'];
for (const rec of SUBSTANCES) {
  for (const f of KEY_FIELDS) {
    const k = rec[f];
    rec[f + 'Id'] = null;
    if (k == null) continue;
    const target = BY_KEY.get(k);
    if (!target) { errors.push(`${rec.key}: ${f} -> unknown key '${k}'`); continue; }
    rec[f + 'Id'] = target.id;
  }
}

// ---- family index -----------------------------------------------------------
const FAMS = new Map();
for (const rec of SUBSTANCES) {
  for (const fam of rec.fams || []) {
    if (!FAMS.has(fam)) FAMS.set(fam, []);
    FAMS.get(fam).push(rec.id);
  }
}
const famMembers = (fam) => FAMS.get(fam) || [];

// ---- category counts --------------------------------------------------------
const CATS = CAT_ORDER.map(([id, name]) => ({
  id, name, count: SUBSTANCES.filter((s) => s.cat === id).length,
}));

// ---- custom substances (runtime registration) -------------------------------
// Customs join SUBSTANCES / BY_KEY / FAMS / CATS at runtime so the engine,
// picker and verdict engine can use them. They are registered after the
// static build above, so they never enter the audit below.
export const CUSTOM_SUBSTANCES = [];
const CUSTOM_CLASSES = new Set(['powder', 'liquid', 'gas', 'solid']);
const _finiteOr = (v, fallback) => {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const _nullableNum = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const _clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function registerCustomSubstance(def) {
  try {
    if (!def || typeof def !== 'object') return null;
    if (typeof def.name !== 'string' || !def.name.trim()) return null;
    if (!CUSTOM_CLASSES.has(def.cls)) return null;
    const cls = def.cls;
    const name = def.name.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return null;
    let key = `custom-${slug}`;
    if (BY_KEY.has(key)) {
      let n = 2;
      while (BY_KEY.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    const density = _finiteOr(def.density, 1);
    const flammability = _clamp(_finiteOr(def.flammability, 0), 0, 1);
    const acidStrength = _clamp(_finiteOr(def.acidStrength, 0), 0, 1);
    const solubility = _clamp(_finiteOr(def.solubility, 0.2), 0, 1);
    const rawPh = _nullableNum(def.ph);
    const ph = rawPh == null ? null : _clamp(rawPh, 0, 14);
    const col = (Array.isArray(def.col) && def.col.length >= 2 &&
      Number.isFinite(Number(def.col[0])) && Number.isFinite(Number(def.col[1])))
      ? [Number(def.col[0]) & 0xffffff, Number(def.col[1]) & 0xffffff]
      : [...BASE.col];
    const fams = [];
    if (cls === 'liquid') {
      fams.push('aqueous');
      if (ph != null && ph < 6.5) {
        fams.push('acid');
        if (acidStrength >= 0.6) fams.push('strong-acid');
      } else if (ph != null && ph > 7.5) {
        fams.push('base');
        if (acidStrength >= 0.6) fams.push('strong-base');
      }
    }
    if (flammability >= 0.35 && !fams.includes('fuel')) fams.push('fuel');
    const rec = {
      ...BASE,
      ...(CLASS_DEFAULTS[cls] || {}),
      id: SUBSTANCES.length,
      key, name, cat: 'custom', cls, col,
      density, flammability, solubility, ph, acidStrength,
      ignitionTemp: _nullableNum(def.ignitionTemp),
      meltPoint: _nullableNum(def.meltPoint),
      boilPoint: _nullableNum(def.boilPoint),
      desc: typeof def.desc === 'string' ? def.desc : '',
      profile: 'generic',
      conductivity: cls === 'liquid' ? 0.3 : 0.1,
      electric: 0, hardness: 0.3, elasticity: 0,
      volatility: cls === 'gas' ? 0.3 : 0,
      meltTo: null, freezeTo: null, boilTo: null, condenseTo: null, burnTo: null,
      sourceTemp: null, lifeSpan: null, blast: 0, blastResistance: 0.5,
      cation: null, anion: null, saltKey: null, oxideKey: null,
      meltToId: null, freezeToId: null, boilToId: null, condenseToId: null,
      burnToId: null, saltKeyId: null, oxideKeyId: null,
      fams, custom: true,
    };
    SUBSTANCES.push(rec);
    CUSTOM_SUBSTANCES.push(rec);
    BY_KEY.set(key, rec);
    for (const fam of fams) {
      if (!FAMS.has(fam)) FAMS.set(fam, []);
      FAMS.get(fam).push(rec.id);
    }
    let catEntry = CATS.find((c) => c.id === 'custom');
    if (!catEntry) { catEntry = { id: 'custom', name: 'Custom', count: 0 }; CATS.push(catEntry); }
    catEntry.count++;
    return rec;
  } catch {
    return null;
  }
}

export const isCustomKey = (key) => {
  const rec = BY_KEY.get(key);
  return !!(rec && rec.custom);
};

// ---- anti-padding audit -----------------------------------------------------
// Behavioural signature: everything except identity/colour/copy fields.
const sigOf = (s) => [
  s.cls, Math.round((s.density || 0) * 20), s.dispersion, s.viscosity,
  s.flammability, s.ignitionTemp, s.conductivity, s.electric, s.hardness,
  s.elasticity, s.solubility, s.ph, s.phEffect, s.acidStrength, s.activityRank,
  s.tintStrength, s.foamStabiliser ? 1 : 0, s.emulsifier ? 1 : 0, s.volatility,
  s.meltPoint, s.meltTo, s.freezePoint, s.freezeTo, s.boilPoint, s.boilTo,
  s.condensePoint, s.condenseTo, s.burnTo, s.burnTime, s.flameColour,
  s.sourceTemp, JSON.stringify(s.lifeSpan), s.blast, s.blastResistance,
  (s.fams || []).slice().sort().join(','), s.profile, s.cation, s.anion, s.hook,
  s.hsp ? s.hsp.join(',') : '', s.pka, s.solWater,
].join('|');
const sigSeen = new Map();
const duplicates = [];
for (const rec of SUBSTANCES) {
  if (rec.id === 0) continue;
  const sig = sigOf(rec);
  if (sigSeen.has(sig)) duplicates.push([sigSeen.get(sig), rec.key]);
  else sigSeen.set(sig, rec.key);
}

export const AUDIT = { errors, duplicates };
export { SUBSTANCES, BY_KEY, FAMS, CATS, famMembers };
export const SUBSTANCE_COUNT = SUBSTANCES.length - 1;
export const byId = (id) => SUBSTANCES[id];
export const byKey = (key) => BY_KEY.get(key);
export const isCls = (id, cls) => SUBSTANCES[id] && SUBSTANCES[id].cls === cls;
