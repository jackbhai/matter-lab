// Matter Lab Ultra — CHEMDATA: real chemistry data layers for the property /
// verdict engine. Pure ESM, no imports, no DOM.
//
// All values are standard textbook values (standard reduction potentials at
// 25 °C vs SHE, standard Ksp tables, standard pKa tables, standard solubility
// rules), textbook-rounded. Good enough for verdict-grade chemistry in the
// sandbox; not a substitute for primary literature data.

// ---------------------------------------------------------------------------
// Standard reduction potentials E° (volts) for M^n+ / M, keyed by the base
// element substance key.
// ---------------------------------------------------------------------------
export const E0_ELEMENT = {
  lithium: -3.04,
  potassium: -2.93,
  sodium: -2.71,
  calcium: -2.87,
  strontium: -2.90,
  barium: -2.91,
  magnesium: -2.37,
  beryllium: -1.85,
  aluminium: -1.66,
  titanium: -1.63,
  manganese: -1.18,
  zinc: -0.76,
  chromium: -0.74,
  iron: -0.44,
  cadmium: -0.40,
  cobalt: -0.28,
  nickel: -0.25,
  tin: -0.14,
  lead: -0.13,
  copper: 0.34,
  silver: 0.80,
  mercury: 0.85,
  antimony: 0.15,
  bismuth: 0.31,
  palladium: 0.95,
  platinum: 1.20,
  gold: 1.50,
};

// ---------------------------------------------------------------------------
// Same potentials keyed by the cation codes used in substance records'
// `cation` field. Aliases ca2 / mg2 / sr2 are included because some records
// use the charged spelling.
// ---------------------------------------------------------------------------
export const E0_ION = {
  li: -3.04,
  k: -2.93,
  na: -2.71,
  ca: -2.87,
  ca2: -2.87,
  sr: -2.90,
  sr2: -2.90,
  ba: -2.91,
  mg: -2.37,
  mg2: -2.37,
  be2: -1.85,
  al3: -1.66,
  ti2: -1.63, // Ti2+/Ti; titanium records carry no cation code yet
  mn2: -1.18,
  zn2: -0.76,
  cr3: -0.74,
  fe2: -0.44,
  fe3: -0.04, // Fe3+/Fe overall (Fe3+/Fe2+ +0.77 V, Fe2+/Fe -0.44 V combined)
  cd2: -0.40,
  co2: -0.28,
  ni2: -0.25,
  sn2: -0.14,
  pb2: -0.13,
  cu2: 0.34,
  ag: 0.80,
  hg2: 0.85,
  sb3: 0.15,
  bi3: 0.31,
  pd2: 0.95,
  pt4: 1.20,
  au3: 1.50,
};

// ---------------------------------------------------------------------------
// Solubility products Ksp at 25 °C, keyed 'cation|anion' (anion codes as in
// substance records). `solid` is the substance key of the precipitate where
// that substance exists in the table, otherwise null.
// ---------------------------------------------------------------------------
export const KSP = {
  'ag|cl': { ksp: 1.8e-10, solid: 'silver-chloride' },
  'ag|i': { ksp: 8.3e-17, solid: 'silver-iodide' },
  'ag|br': { ksp: 5.0e-13, solid: null },
  'ag|cro4': { ksp: 1.1e-12, solid: null },
  'ag|po4': { ksp: 8.9e-17, solid: null },
  'ba|so4': { ksp: 1.1e-10, solid: 'barium-sulfate' },
  'ba|cro4': { ksp: 1.2e-10, solid: null },
  'ba|co3': { ksp: 2.6e-9, solid: null },
  'sr|so4': { ksp: 3.4e-7, solid: null },
  'sr|co3': { ksp: 5.6e-10, solid: null },
  'ca|co3': { ksp: 3.3e-9, solid: 'chalk-powder' },
  'ca|po4': { ksp: 2.8e-29, solid: 'calcium-phosphate' },
  'ca|so4': { ksp: 4.9e-5, solid: null },
  'ca|f': { ksp: 3.9e-11, solid: null },
  'ca|oh': { ksp: 5.5e-6, solid: 'slaked-lime' },
  'pb2|i': { ksp: 9.8e-9, solid: 'lead-iodide' },
  'pb2|so4': { ksp: 2.5e-8, solid: null },
  'pb2|cl': { ksp: 1.7e-5, solid: null },
  'pb2|co3': { ksp: 7.4e-14, solid: 'lead-carbonate' },
  'pb2|cro4': { ksp: 2.8e-13, solid: null },
  'cu2|oh': { ksp: 2.2e-20, solid: 'copper-hydroxide' },
  'cu2|co3': { ksp: 1.4e-10, solid: 'copper-carbonate' },
  'zn2|co3': { ksp: 1.5e-10, solid: 'zinc-carbonate' },
  'mg|oh': { ksp: 5.6e-12, solid: null },
  'fe3|po4': { ksp: 9.9e-16, solid: null },
  'fe3|oh': { ksp: 2.8e-39, solid: null },
  'al3|oh': { ksp: 3.0e-34, solid: null },
  'ni2|oh': { ksp: 5.5e-16, solid: null },
  'co2|oh': { ksp: 5.9e-15, solid: null },
  'zn2|oh': { ksp: 3.0e-17, solid: null },
  'mn2|oh': { ksp: 1.9e-13, solid: null },
  'cd2|oh': { ksp: 7.2e-15, solid: null },
  'hg2|i': { ksp: 2.9e-29, solid: null },
  'bi3|oh': { ksp: 2.9e-32, solid: null },
};

// Precipitation threshold: at or below this Ksp a salt counts as insoluble
// (i.e. it precipitates out of a typical bench-strength solution).
export const KSP_PRECIP_MAX = 1e-6;

// ---------------------------------------------------------------------------
// Solubility classification from the standard solubility rules, with Ksp
// taking precedence where a Ksp entry exists.
// Returns 'soluble' | 'slight' | 'insoluble'.
// ---------------------------------------------------------------------------
const GROUP1_CATIONS = new Set(['k', 'na', 'li', 'nh4']);
const ALWAYS_SOLUBLE_ANIONS = new Set(['no3', 'acetate', 'clo3', 'clo4', 'chlorate', 'perchlorate']);

export function solubilityClass(cat, an) {
  // Ksp data wins where present (ca|oh stays 'slight' — slaked lime is the
  // classic slightly-soluble hydroxide despite its small Ksp).
  const entry = KSP[cat + '|' + an];
  if (entry) {
    if (cat === 'ca' && an === 'oh') return 'slight';
    if (entry.ksp <= KSP_PRECIP_MAX) return 'insoluble';
    if (entry.ksp <= 1e-3) return 'slight';
    return 'soluble';
  }

  // (1) Nitrates, acetates, chlorates, perchlorates: always soluble.
  if (ALWAYS_SOLUBLE_ANIONS.has(an)) return 'soluble';

  // (2) Chlorides / bromides / iodides: soluble except Ag, Pb, Hg
  //     (HgCl2 is only slightly soluble rather than fully insoluble here).
  if (an === 'cl' || an === 'br' || an === 'i') {
    if (cat === 'ag' || cat === 'pb2') return 'insoluble';
    if (cat === 'hg2') return an === 'cl' ? 'slight' : 'insoluble';
    return 'soluble';
  }

  // (3) Sulfates: soluble except Ba, Sr, Pb (insoluble); Ca, Ag slight.
  if (an === 'so4') {
    if (cat === 'ba' || cat === 'sr' || cat === 'sr2' || cat === 'pb2') return 'insoluble';
    if (cat === 'ca' || cat === 'ca2' || cat === 'ag') return 'slight';
    return 'soluble';
  }

  // (4) Carbonates, phosphates, sulfides, chromates: insoluble except
  //     group-1 cations and ammonium.
  if (an === 'co3' || an === 'po4' || an === 's' || an === 'cro4') {
    return GROUP1_CATIONS.has(cat) ? 'soluble' : 'insoluble';
  }

  // (5) Hydroxides: insoluble except group 1 (soluble) and Ca/Sr/Ba (slight).
  if (an === 'oh') {
    if (cat === 'k' || cat === 'na' || cat === 'li') return 'soluble';
    if (cat === 'ca' || cat === 'ca2' || cat === 'sr' || cat === 'sr2' || cat === 'ba') return 'slight';
    return 'insoluble';
  }

  // (6) Fluorides: insoluble except group-1 cations and Ag (soluble).
  if (an === 'f') {
    if (GROUP1_CATIONS.has(cat) || cat === 'ag') return 'soluble';
    return 'insoluble';
  }

  return 'soluble';
}

// ---------------------------------------------------------------------------
// pKa values (first / principal dissociation) for substances that lack a pKa
// in the substance table, keyed by substance key. Negative values are strong
// acids (essentially fully dissociated).
// ---------------------------------------------------------------------------
export const PKA_BY_KEY = {
  'acetic-acid': 4.76,
  'citric-acid': 3.13,
  'citric-acid-sol': 3.13,
  'formic-acid': 3.75,
  'lactic-acid': 3.86,
  'boric-acid': 9.24,
  'phenol': 9.95,
  'oxalic-acid': 1.25,
  'tartaric-acid': 2.98,
  'ascorbic-acid': 4.17,
  'benzoic-acid': 4.20,
  'salicylic-acid': 2.97,
  'sulfurous-acid': 1.81,
  'carbonic-acid': 6.35,
  'hydrobromic-acid': -9, // strong acid
  'perchloric-acid': -10, // strong acid
  'chromic-acid': -0.8,
  'oleic-acid': 9.85,
  'tannic-acid': 6.0,
  'bleach': 7.53, // HOCl
  'ammonia-solution': 9.25, // conjugate acid NH4+
  'apple-cider-vinegar': 4.76, // acetic-acid based
};

// ---------------------------------------------------------------------------
// Lookup helpers. Return null when the code / key is unknown.
// ---------------------------------------------------------------------------
export function e0ForCation(cat) {
  return Object.prototype.hasOwnProperty.call(E0_ION, cat) ? E0_ION[cat] : null;
}

export function e0ForElement(key) {
  return Object.prototype.hasOwnProperty.call(E0_ELEMENT, key) ? E0_ELEMENT[key] : null;
}

export function kspFor(cat, an) {
  const entry = KSP[cat + '|' + an];
  return entry === undefined ? null : entry;
}
