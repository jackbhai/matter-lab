// matter-reactions.js — RX builder, Matter Lab Ultra (W32U).
// Tier 1: named pairs + per-substance profiles. Tier 2: family rules.
// Pure ESM; imports only matter-elements.js. All keys verified against the
// real table at load: anything missing is collected into RX_WARNINGS and the
// offending record is dropped or its product nulled — the build never crashes.
//
// RATE SEMANTICS (realism directive): every `rate` here is the rate at a
// 25 °C reference with the pair in its most common form. The ENGINE scales
// applied rates Arrhenius-style from the pair's actual temperature and by a
// surface-area factor from the pair's forms — so temperature acceleration is
// NOT baked into these base rates. tempBand / needs:'heated' / 'ignited' are
// reserved for genuinely gated reactions (ignition thresholds, thermite,
// sugar + conc. H2SO4). Where powder and solid forms of one substance truly
// behave differently (metal powder + acid, iron powder burning), the forms
// carry their own entries with distinct rates — see GEN.metal's form factor
// and the powder named-pair loop.
import { SUBSTANCES, BY_KEY, FAMS, famMembers } from './matter-elements.js';
import { e0ForCation, e0ForElement, kspFor, solubilityClass, PKA_BY_KEY, KSP_PRECIP_MAX } from './matter-chemdata.js';

export const RX_WARNINGS = [];
const warn = (m) => { RX_WARNINGS.push(m); };
const has = (k) => typeof k === 'string' && BY_KEY.has(k);
const R = (k) => BY_KEY.get(k) || null;
const need = (k, where) => { if (!has(k)) { warn(`missing key '${k}' referenced in ${where}`); return null; } return k; };
// product key or null (with warning) — never invent keys
const P = (k, where) => (k == null ? null : need(k, where));

const ALL = SUBSTANCES.slice(1);
const baseKey = (k) => k.replace(/-(powder|molten)$/, '').replace(/-ribbon$/, '');
const famsOf = (s) => s.fams || [];
const hasFam = (s, f) => famsOf(s).includes(f);
const tempOf = (s) => (s.sourceTemp != null ? s.sourceTemp : (s.meltPoint != null ? s.meltPoint : 25));

// sol key for a metal base + anion word ('chloride'|'sulfate'|'nitrate'), with table exceptions
const SOL_EXCEPTIONS = {
  'iron:sulfate': 'iron2-sulfate-sol', 'iron:nitrate': 'iron3-nitrate-sol',
  'iron:chloride': 'iron-chloride-sol', 'magnesium:sulfate': 'epsom-sol',
};
function solFor(metalRec, anionWord) {
  if (!metalRec) return null;
  const b = baseKey(metalRec.key);
  const ex = SOL_EXCEPTIONS[`${b}:${anionWord}`];
  if (ex && has(ex)) return ex;
  const cand = `${b}-${anionWord}-sol`;
  if (has(cand)) return cand;
  return metalRec.saltKey && has(metalRec.saltKey) ? metalRec.saltKey : null;
}
// hydroxide-style sol formed when an alkali/alkaline metal meets water
const HYDROXIDE_SOL = { sodium: 'sodium-hydroxide', potassium: 'potassium-hydroxide', lithium: 'lithium-hydroxide-sol', calcium: 'limewater', magnesium: 'milk-of-magnesia' };

// ---- cation tables (from the solutions' own cation fields) ----
const CATION_RANK = { k: 100, na: 95, li: 90, ba: 88, sr: 86, ca: 85, mg: 80, be2: 75, al3: 70, zn2: 60, mn2: 58, cr3: 55, fe3: 50, fe2: 50, cd2: 48, ni2: 45, co2: 42, sn2: 40, pb2: 35, cu2: 25, bi3: 20, sb3: 18, ag: 15, pd2: 12, hg2: 10, pt4: 8, au3: 5 };
const CATION_METAL = { cu2: 'copper', ag: 'silver', fe3: 'iron', fe2: 'iron', ni2: 'nickel', co2: 'cobalt', zn2: 'zinc', al3: 'aluminium', sn2: 'tin', mg: 'magnesium', ca: 'calcium', pb2: 'lead', mn2: 'manganese', cr3: 'chromium', cd2: 'cadmium', bi3: 'bismuth', sb3: 'antimony', be2: 'beryllium', hg2: 'mercury', au3: 'gold', pd2: 'palladium', pt4: 'platinum' };
const INSOL_OH = new Set(['cu2', 'fe2', 'fe3', 'ni2', 'co2', 'zn2', 'al3', 'mn2', 'cr3', 'cd2', 'pb2', 'bi3', 'sb3', 'be2', 'sn2', 'hg2', 'ag', 'au3', 'pd2', 'pt4', 'mg']);
const HYDROX_TINT = { cu2: 0x7FB2E0, fe3: 0xA85B2A, fe2: 0x4A6741, ni2: 0x7AC87A, co2: 0x5B7FD8, zn2: 0xF0F0EA, al3: 0xF0F0EA, mg: 0xF5F5F0, cr3: 0x5B7A5B, pb2: 0xF0EDE6, ag: 0x6B4A2A };
function oxideOfCation(cat) {
  const mk = CATION_METAL[cat]; if (!mk) return null;
  const m = R(mk); return m && m.oxideKey && has(m.oxideKey) ? m.oxideKey : null;
}
// cross-ion precipitation: cation -> anion -> [productKey, tint]
// (product = closest real solid in the table where no exact salt entry exists)
const PRECIP = {
  ag: { cl: ['silver-chloride', 0xF5F5F0], br: ['silver-oxide', 0xF0EAD0], i: ['silver-iodide', 0xF2C230], cro4: ['silver-oxide', 0xB03A2E], po4: ['silver-oxide', 0xF2C230] },
  pb2: { cl: ['lead-oxide', 0xF0EDE6], br: ['lead-oxide', 0xF0EDE6], i: ['lead-iodide', 0xFFC93C], so4: ['lead-oxide', 0xF5F5F0], cro4: ['lead-oxide', 0xF2B81E], co3: ['lead-carbonate', 0xF5F5F0] },
  ba: { so4: ['barium-sulfate', 0xF5F5F0], cro4: ['barium-chloride', 0xE8D44D], co3: ['barium-chloride', 0xF5F5F0], po4: ['barium-chloride', 0xF5F5F0] },
  sr: { so4: ['chalk-powder', 0xF5F5F0], co3: ['chalk-powder', 0xF5F5F0] },
  ca: { co3: ['chalk-powder', 0xF5F5F0], po4: ['calcium-phosphate', 0xF5F5F0], so4: ['chalk-powder', 0xF0EDE6] },
  cu2: { co3: ['copper-carbonate', 0x3FA37A], po4: ['copper-oxide', 0x3A6EA5] },
  fe3: { po4: ['iron-oxide', 0xE8DCC0], co3: ['iron-oxide', 0x8A4A2A] },
  fe2: { co3: ['iron-oxide', 0x4A6741], po4: ['iron-oxide', 0x5B6B4A] },
  zn2: { co3: ['zinc-carbonate', 0xF5F5F0], po4: ['zinc-oxide', 0xF5F5F0] },
  al3: { po4: ['aluminium-oxide', 0xF5F5F0] },
  mg: { co3: ['magnesium-oxide', 0xF5F5F0], po4: ['magnesium-oxide', 0xF5F5F0] },
  co2: { co3: ['cobalt-oxide', 0xD87A9A], po4: ['cobalt-oxide', 0x8A5B8A] },
  ni2: { co3: ['nickel-oxide', 0x7AC87A], po4: ['nickel-oxide', 0x6B9E6B] },
  mn2: { co3: ['manganese-oxide', 0xE8C8B0], po4: ['manganese-oxide', 0xD8B898] },
  cd2: { co3: ['cadmium-oxide', 0xF5F5F0] },
  hg2: { i: ['mercury-oxide', 0xE23B2E] },
  bi3: { cl: ['bismuth-oxide', 0xF5F5F0], i: ['bismuth-oxide', 0x3A2A1A] },
};
function precipFor(catA, anA, catB, anB) {
  return (PRECIP[catA] && PRECIP[catA][anB]) || (PRECIP[catB] && PRECIP[catB][anA]) || null;
}

// ---- igniters / electric sources (computed from the table) ----
const FIRE_KEYS = ALL.filter((s) => s.cls === 'fire').map((s) => s.key);
const SPARK_KEYS = ['spark', 'arc-spark', 'static-spark', 'lightning-bolt', 'plasma', 'plasma-arc-cell', 'arc-flash', 'tesla-arc', 'corona-discharge', 'heater-cell'].filter(has);
export const IGNITER_KEYS = [...new Set([...FIRE_KEYS, ...SPARK_KEYS])];
const IGNITER_SET = new Set(IGNITER_KEYS);
const isIgniter = (s) => s.cls === 'fire' || IGNITER_SET.has(s.key);
const isSparkSource = (s) => s.cls === 'electric' || ['plasma', 'lightning-bolt', 'arc-flash', 'spark', 'arc-spark', 'static-spark', 'tesla-arc', 'plasma-arc-cell', 'corona-discharge'].includes(s.key);
const REACTIVE_HALOGENS = ['chlorine-gas', 'fluorine-gas', 'bromine', 'iodine', 'chlorine-trifluoride', 'oxygen-difluoride', 'chlorine-dioxide', 'iodine-tincture'].filter(has);
const HALOGEN_ANION = { 'chlorine-gas': 'chloride', bromine: 'bromide', 'fluorine-gas': 'fluoride', iodine: 'iodide', 'chlorine-trifluoride': 'chloride', 'chlorine-dioxide': 'chloride', 'oxygen-difluoride': 'fluoride', 'iodine-tincture': 'iodide' };
// special-cls cells that are pure field effects (gravity/portal/void/clone/
// radiation/luck hooks) — liquids must NOT wet or react with them; the
// special-surface family only touches physical cells (sponge, bulb, fuse…).
const FIELD_SPECIALS = new Set(['void', 'clone', 'gravity-well-fun', 'one-way-wall', 'vacuum-cell', 'neutron-source-fun', 'lucky-block-fun', 'antigravity-cell', 'antimatter-fun', 'portal-a', 'portal-b']);
function oxPower(s) {
  if (s.acidStrength) return s.acidStrength;
  if (s.key === 'potassium-permanganate' || s.key === 'potassium-permanganate-sol') return 0.95;
  if (s.key === 'potassium-dichromate-sol' || s.key === 'potassium-dichromate') return 0.9;
  if (hasFam(s, 'peroxide')) return 0.8;
  if (s.key === 'bleach' || s.key === 'bleaching-powder') return 0.75;
  if (s.key === 'oxygen') return 0.55;
  if (hasFam(s, 'halogen')) return 0.7;
  return 0.45;
}

// ---- indicator colours (school-lab scales, simplified) ----
const RAINBOW = [[0, 0xE23B2E], [2, 0xF08A24], [4, 0xF5C81E], [6, 0x9ACD32], [7, 0x3FA34D], [8, 0x2E9E8A], [10, 0x2456C8], [12, 0x5B3FA3], [14, 0x8A2BE2]];
const CABBAGE = [[1, 0xE84A7A], [3, 0xC04A8A], [5, 0x8A4FA3], [7, 0x5B5FA3], [9, 0x2E7AC8], [11, 0x2E9E6B], [13, 0x9ACD32], [14, 0xE8D81E]];
function scalePick(stops, ph) { let best = stops[0][1], bd = 1e9; for (const [p, c] of stops) { const d = Math.abs(p - ph); if (d < bd) { bd = d; best = c; } } return best; }
export function indicatorColour(indKey, ph) {
  if (ph == null) return 0xB8B8C0;
  switch (indKey) {
    case 'universal-indicator': case 'ph-paper': return scalePick(RAINBOW, ph);
    case 'red-cabbage-juice': return scalePick(CABBAGE, ph);
    case 'phenolphthalein': return ph < 8.2 ? 0xEDEDF2 : (ph < 10 ? 0xF78FB8 : 0xE91E8C);
    case 'methyl-orange': return ph < 3.1 ? 0xE23B2E : (ph < 4.4 ? 0xF08A24 : 0xF5C81E);
    case 'litmus': case 'litmus-paper': return ph < 4.5 ? 0xD8402E : (ph > 8.3 ? 0x2E5FD8 : 0x7A4FA3);
    case 'bromothymol-blue': return ph < 6 ? 0xF2C81E : (ph < 7.6 ? 0x3FA34D : 0x2456C8);
    case 'methyl-red': return ph < 4.4 ? 0xD82E2E : (ph < 6.2 ? 0xF08A24 : 0xF2D81E);
    case 'thymol-blue': return ph < 1.2 ? 0xD82E2E : (ph < 2.8 ? 0xF2C81E : (ph < 8 ? 0xF2E14C : (ph < 9.6 ? 0x3FA34D : 0x2456C8)));
    case 'turmeric-solution': case 'turmeric-powder': return ph < 7.4 ? 0xE8B400 : (ph < 8.6 ? 0xD88A1E : 0xA03A1E);
    case 'hibiscus-dye': return ph < 3 ? 0xE84A7A : (ph < 7 ? 0xB04A8A : 0x4A7A3A);
    case 'methylene-blue': return 0x2456C8;
    default: return scalePick(RAINBOW, ph);
  }
}

// ---- CARDS ----
export const CARDS = new Map();
function C(id, name, eq, line, watch) { CARDS.set(id, { name, eq, line, watch }); }
// The W33 §5.3 forty-two (in-world forms) + close variants
C('vinegar-baking-soda', 'Vinegar + Baking Soda', 'CH3COOH + NaHCO3 → CO2↑ + H2O + CH3COONa', 'The acid gives its hydrogen to the bicarbonate, which breaks down into carbon dioxide gas.', 'Watch the foam erupt — every bubble is CO2 escaping.');
C('neutralisation-hcl-naoh', 'Hydrochloric Acid + Sodium Hydroxide', 'HCl + NaOH → NaCl + H2O', 'Acid and alkali cancel each other out, leaving salty water — and the mixture warms up.', 'Watch the temperature climb about 6 °C: neutralisation releases heat.');
C('phenolphthalein-flip', 'Phenolphthalein Flip', 'phenolphthalein: colourless (acid) ⇄ pink (alkali)', 'Phenolphthalein is colourless in acid but turns pink the moment the liquid turns alkaline.', 'Add alkali for pink, then acid drop by drop — the pink vanishes at the flip point.');
C('sodium-water', 'Sodium + Water', '2Na + 2H2O → 2NaOH + H2↑', 'Sodium rips oxygen from water so eagerly that the hydrogen released can catch fire.', 'Watch it dart around on its own cushion of hydrogen, trailing orange flame licks.');
C('potassium-water', 'Potassium + Water', '2K + 2H2O → 2KOH + H2↑', 'Potassium is even more reactive than sodium — the hydrogen ignites instantly with a lilac flame.', 'Watch for the violet flame and the final pop as the last hydrogen burns.');
C('lithium-water', 'Lithium + Water', '2Li + 2H2O → 2LiOH + H2↑', 'Lithium fizzes steadily, melting into a silvery bead from its own reaction heat.', 'Watch the bead skate slowly — lithium is the calmest of the alkali metals.');
C('calcium-water', 'Calcium + Water', 'Ca + 2H2O → Ca(OH)2 + H2↑', 'Calcium bubbles steadily and the water clouds as sparingly-soluble calcium hydroxide forms.', 'Watch the water turn milky — that cloud is slaked lime forming.');
C('slaking', 'Quicklime + Water (Slaking)', 'CaO + H2O → Ca(OH)2', 'Quicklime grabs water violently, swelling and steaming as it becomes slaked lime.', 'Watch for hissing steam — slaking can boil the water it touches.');
C('mg-hcl', 'Magnesium + Hydrochloric Acid', 'Mg + 2HCl → MgCl2 + H2↑', 'The acid dissolves the magnesium, freeing hydrogen gas.', 'Watch the ribbon shrink away in a storm of bubbles — collect the gas and it pops at a flame.');
C('zn-cuso4', 'Zinc + Copper Sulfate', 'Zn + CuSO4 → ZnSO4 + Cu', 'Zinc is more reactive than copper, so it pushes copper out of its solution and takes its place.', 'Watch the blue fade and the zinc darken with a coat of pink copper.');
C('cu-agno3', 'Copper + Silver Nitrate', 'Cu + 2AgNO3 → Cu(NO3)2 + 2Ag', 'Copper displaces silver, growing real silver crystals while the solution turns blue.', 'Watch the silver fuzz grow like frost on the copper surface.');
C('agcl', 'Silver Nitrate + Salt Solution', 'AgNO3 + NaCl → AgCl↓ + NaNO3', 'Silver and chloride ions lock together into insoluble silver chloride.', 'Watch the instant white cloud settle into a white sediment.');
C('agi', 'Silver Nitrate + Potassium Iodide', 'AgNO3 + KI → AgI↓ + KNO3', 'Silver iodide is even less soluble than the chloride — a yellow solid crashes out.', 'Watch the yellow cloud bloom and drift down.');
C('golden-rain', 'Golden Rain (Lead Nitrate + Potassium Iodide)', 'Pb(NO3)2 + 2KI → PbI2↓ + 2KNO3', 'Lead iodide forms sparkling golden crystals that rain slowly through the liquid.', 'Watch the glittering yellow crystals drift down like golden rain.');
C('baso4', 'Barium Chloride + Sodium Sulfate', 'BaCl2 + Na2SO4 → BaSO4↓ + 2NaCl', 'Barium sulfate is one of the least soluble salts known — it precipitates instantly and densely.', 'Watch the thick white precipitate sink fast.');
C('limewater-co2', 'Limewater + Carbon Dioxide', 'Ca(OH)2 + CO2 → CaCO3↓ + H2O', 'CO2 turns clear limewater milky — the classic breath test for carbon dioxide.', 'Watch the clear liquid cloud over: the milkiness is chalk forming.');
C('cuoh2', 'Copper Sulfate + Sodium Hydroxide', 'CuSO4 + 2NaOH → Cu(OH)2↓ + Na2SO4', 'Copper hydroxide crashes out as a pale-blue jelly.', 'Watch the gel-like blue precipitate hang in the liquid before settling.');
C('feoh3', 'Iron(III) Chloride + Sodium Hydroxide', 'FeCl3 + 3NaOH → Fe(OH)3↓ + 3NaCl', 'Iron(III) hydroxide forms a rust-brown jelly — rust chemistry in a beaker.', 'Watch the brown clouds billow: that is the colour of rust being born.');
C('cu-ammonia', 'Copper Sulfate + Ammonia', 'CuSO4 + 4NH3 → [Cu(NH3)4]SO4', 'Excess ammonia wraps each copper ion in four ammonia molecules, making a deep royal-blue complex.', 'Watch pale blue deepen to an intense royal blue.');
C('kmno4-glycerin', 'Permanganate + Glycerin', 'KMnO4 + glycerin → Mn2O3 + K2CO3 + CO2 + H2O (simplified)', 'Permanganate is a ferocious oxidiser: it attacks glycerin so hard the mixture self-ignites after a pause.', 'Wait for it… smoke, then a sudden purple flame — never rush this one.');
C('elephant-toothpaste', 'Elephant Toothpaste', '2H2O2 → 2H2O + O2↑ (iodide catalyst)', 'Iodide makes peroxide decompose explosively fast; soap traps the oxygen into a foam geyser.', 'Watch the foam column erupt and overflow — that is oxygen, foaming.');
C('luminol-glow', 'Luminol Glow', 'luminol + H2O2 → light (catalyst: iron in fake blood)', 'Luminol releases its reaction energy as cold blue light instead of heat — chemiluminescence.', 'Watch the eerie blue glow bloom in the dark.');
C('ethanol-flame', 'Ethanol Burns', 'C2H5OH + 3O2 → 2CO2 + 3H2O', 'Ethanol burns with a calm, pale-blue, almost smokeless flame.', 'Watch the steady blue flame eat the pool down evenly.');
C('methanol-flame', 'Methanol Burns', '2CH3OH + 3O2 → 2CO2 + 4H2O', 'Methanol flames are nearly invisible in bright light — a real-world hazard of this fuel.', 'Look for the heat shimmer and greenish edge: the flame hides.');
C('h2-o2-pop', 'Hydrogen + Oxygen POP', '2H2 + O2 → 2H2O', 'A spark gives hydrogen and oxygen the energy to combine all at once — a pop, not a burn.', 'Lid on, spark… POP! The flash makes water out of two gases.');
C('h2-pop-test', 'Pop Test for Hydrogen', '2H2 + O2 → 2H2O', 'A tiny pocket of hydrogen at a flame gives the classic squeaky pop — the school test for H2.', 'Listen for the squeak: that sound means hydrogen was here.');
C('thermite', 'Thermite', 'Fe2O3 + 2Al → 2Fe + Al2O3', 'Aluminium steals oxygen from iron oxide so violently that the iron produced melts.', 'Watch the blinding white glow and molten iron dripping — 2500 °C chemistry.');
C('iodine-sublime', 'Iodine Sublimation', 'I2 (solid) → I2 (purple vapour)', 'Iodine skips the liquid stage: heat turns it straight into a purple vapour.', 'Watch violet clouds rise and re-crystallise on cool surfaces above.');
C('chalk-hcl', 'Chalk + Hydrochloric Acid', 'CaCO3 + 2HCl → CaCl2 + H2O + CO2↑', 'Acid eats carbonate rock, releasing carbon dioxide as fizz.', 'Watch the lump shrink in a jacket of bubbles.');
C('fe-cuso4', 'Iron + Copper Sulfate', 'Fe + CuSO4 → FeSO4 + Cu', 'Iron is more reactive than copper, so it takes copper\'s place in solution.', 'Watch grey iron turn copper-pink while the blue fades to pale green.');
C('sulfur-burn', 'Sulfur Burns', 'S + O2 → SO2', 'Sulfur burns with a pure blue flame, making choking sulfur dioxide gas.', 'Watch the blue flame and pale, sharp-smelling smoke.');
C('black-snake', 'Black Snake (Sugar + Sulfuric Acid)', 'C12H22O11 → 12C + 11H2O (acid dehydrates)', 'Concentrated sulfuric acid rips the water out of sugar, leaving a growing column of pure carbon.', 'Watch the black snake of carbon push up, steaming.');
C('kmno4-hcl', 'Permanganate + Hydrochloric Acid', '2KMnO4 + 16HCl → 2KCl + 2MnCl2 + 8H2O + 5Cl2↑', 'Permanganate oxidises chloride to chlorine gas — the purple dies as green gas rises.', 'Watch greenish wisps: that is chlorine. Beautiful and dangerous.');
C('dry-ice-water', 'Dry Ice + Water', 'CO2 (solid) → CO2 (gas) + fog', 'Dry ice sublimes furiously in water, and the cold gas condenses air moisture into fog.', 'Watch fog spill over the rim and crawl across the surface.');
C('dry-ice-soap', 'Dry Ice Bubble Dome', 'CO2 + soap film → fog-filled dome', 'Subliming CO2 inflates a soap film into a dome packed with fog.', 'Watch the dome grow… then burst in a puff of fog.');
C('ln2-water', 'Liquid Nitrogen + Water', 'N2 (liquid) → N2 (gas), water → ice', 'Liquid nitrogen boils explosively on warm water while freezing the surface it touches.', 'Watch the white cloud burst and ice crust form.');
C('cobalt-chloride', 'Cobalt Chloride Colour Change', 'CoCl2·6H2O (pink) ⇄ CoCl2 (blue) + water', 'Hydrated cobalt chloride is pink; drive the water off with heat and it turns blue — add water, pink returns.', 'Heat it blue, wet it pink: a reversible humidity indicator.');
C('starch-iodine', 'Starch + Iodine', 'starch + I2 → deep blue-black complex', 'Iodine slips inside the starch helix and the pair turns an intense blue-black.', 'Watch the blue-black bloom spread — the classic food test for starch.');
C('blue-bottle', 'The Blue Bottle', 'methylene blue ⇄ leuco form (glucose + alkali)', 'Glucose quietly reduces blue methylene blue to its colourless form; shaking mixes in oxygen and the blue returns.', 'Rest it colourless, shake it blue — repeat as long as glucose lasts.');
C('al-bromine', 'Aluminium + Bromine', '2Al + 3Br2 → 2AlBr3', 'Bromine attacks aluminium in bursts of sparks and orange flame — no gentle start, it erupts.', 'Watch for sparks and orange flashes as the reaction catches.');
C('gold-aqua-regia', 'Gold + Aqua Regia', 'Au + HNO3 + 4HCl → HAuCl4 + NO↑ + 2H2O (simplified)', 'Neither acid alone touches gold, but together they dissolve the king of metals into a yellow solution.', 'Watch the gold slowly vanish — this mixture is called "royal water" for a reason.');
// core template cards (family + profile outcomes reference these)
C('combustion', '{a} + {b} → Combustion', 'fuel + O2 → CO2 + H2O (simplified)', 'The fuel burns with its own flame colour, set by what it is made of.', 'Watch the flame colour — it is a fingerprint of the fuel.');
C('detonation', '{a} + {b} → Detonation', 'explosive → gases + heat (very fast)', 'The explosive decomposes faster than the gases can escape — that is the blast.', 'Watch for chain reactions: one blast can set off its neighbours.');
C('acid-metal', '{a} + {b} → Metal Salt + Hydrogen', 'metal + acid → salt + H2↑', 'The acid dissolves the metal; hydrogen gas bubbles off and the metal\'s salt stays in solution.', 'Watch the bubble rate — it ranks the metal\'s reactivity for you.');
C('acid-carbonate', '{a} + {b} → CO2 Fizz', 'carbonate + acid → salt + H2O + CO2↑', 'Any acid meeting a carbonate releases carbon dioxide.', 'Watch the fizz: CO2 bubbles are the signature.');
C('neutralisation', '{a} + {b} → Neutralisation', 'acid + base → salt + water', 'The acid and base cancel out; the mixture warms as they do.', 'Watch the temperature rise and any indicator sweep toward neutral.');
C('precipitation', '{a} + {b} → Precipitate', 'ions meet → insoluble solid ↓', 'Two soluble salts swap partners and one insoluble solid crashes out.', 'Watch the cloud form, then settle as sediment.');
C('displacement', '{a} + {b} → Displacement', 'reactive metal + salt → new salt + less reactive metal', 'The more reactive metal pushes the less reactive one out of its compound.', 'Watch the plating coat grow and the solution colour fade.');
C('electrolysis', 'Electrolysis of {a}', '2H2O → 2H2↑ + O2↑ (electricity)', 'Electric current splits the electrolyte: hydrogen at one electrode, oxygen or chlorine at the other.', 'Watch bubbles stream from the submerged conductors.');
C('steam-burst', '{a} + {b} → Steam Burst', 'liquid + intense heat → steam', 'The liquid flashes to steam, expanding ~1600× in an instant.', 'Watch the white burst and listen for the hiss-pop.');
C('deep-freeze', '{a} + {b} → Deep Freeze', 'cryogen boils, neighbour freezes', 'The cryogen drinks heat so fast that its neighbour freezes solid.', 'Watch frost creep across the contact surface.');
C('bleaching', '{a} + {b} → Bleaching', 'oxidiser breaks dye molecules', 'The oxidiser snaps the dye\'s colour-giving bonds, leaving it colourless.', 'Watch the colour drain away.');
C('oxidation', '{a} + {b} → Oxidation', 'substance + oxidiser → oxide products', 'The oxidiser hands over oxygen (or steals electrons); heat and colour change follow.', 'Watch the surface darken or glow as oxidation bites.');
C('oxidiser-fuel', '{a} + {b} → Vigorous Burn', 'oxidiser + fuel → rapid combustion', 'An oxidiser carries its own oxygen, so the fuel burns far harder than in air.', 'Watch how much fiercer this burns than the fuel alone.');
C('saponification', '{a} + {b} → Soap Making', 'fat/oil + alkali → soap + glycerol', 'Strong alkali chops fat molecules into soap — how soap has been made for millennia.', 'Watch the oily layer turn cloudy and thicken into soap.');
C('emulsion', '{a} + {b} → Emulsion', 'oil + water + soap → stable emulsion', 'Soap molecules hold oil and water together in a milky emulsion that refuses to separate.', 'Stir, then rest: with soap present, the layers never come back.');
C('growth', '{a} + {b} → Growth Support', 'water + light + nutrients → new growth', 'Living things use the water and nutrients to build new tissue.', 'Watch green spread slowly — growth is the slowest reaction here.');
C('fermentation', '{a} + {b} → Fermentation', 'sugar → ethanol + CO2↑ (microbes)', 'Yeast and microbes eat sugars and breathe out carbon dioxide.', 'Watch the slow, steady bubbling — something is alive in there.');
C('amalgam', 'Mercury + {b} → Amalgam', 'Hg + metal → amalgam (alloy)', 'Mercury dissolves many metals into a soft, silvery alloy called an amalgam.', 'Watch the hard metal soften and slump into the mercury.');
C('gas-dissolve', '{a} Dissolves in {b}', 'gas + water ⇄ dissolved gas', 'The gas dissolves into the liquid — pressure and stirring speed it up.', 'Watch the fizz when pressure releases: dissolved gas escaping.');
C('carbonation', '{a} + {b} → Carbonation', 'CO2 + alkali → carbonate', 'Alkalis absorb carbon dioxide and become carbonates.', 'Watch limewater-style clouding as carbonate forms.');
C('chlorine-danger', '{a} + {b} → Chlorine Gas!', 'bleach + acid → Cl2↑ (toxic)', 'Mixing bleach with acid releases chlorine gas — a genuinely dangerous household mistake.', 'Watch the greenish wisps. In real life: never mix these. Ever.');
C('chloramine', '{a} + {b} → Chloramine', 'bleach + ammonia → chloramine (toxic)', 'Bleach plus ammonia makes chloramine vapour — another mixture to never make in real life.', 'Watch the sharp fumes rise — simulated here, dangerous in reality.');
C('oxygen-release', '{a} + {b} → Oxygen Release', 'peroxide / bleach → O2↑', 'The two oxidisers destroy each other and release their oxygen as gas.', 'Watch the vigorous bubbling — pure oxygen streaming out.');
C('peroxide-catalyst', '{a} + {b} → Peroxide Breakdown', '2H2O2 → 2H2O + O2↑ (catalyst)', 'The catalyst surface tears peroxide apart without being used up itself.', 'Watch the fizz start the instant they touch.');
C('halogen-metal', '{a} + {b} → Metal Halide', 'metal + halogen → metal halide', 'Halogens are hungry for electrons and seize them from metals, often violently.', 'Watch sparks and coloured fumes as the halide forms.');
C('sulfide', '{a} + {b} → Metal Sulfide', 'metal + S → metal sulfide (heated)', 'Hot sulfur combines directly with metals into dark sulfides.', 'Watch the dark crust spread over the hot metal.');
C('amphoteric', '{a} + {b} → Amphoteric Dissolve', 'metal + strong alkali → salt + H2↑', 'A few metals (aluminium, zinc, tin, lead) dissolve in strong alkali as well as acid.', 'Watch hydrogen bubbles rise from a metal in "base" — it surprises everyone.');
C('smoke-ring', '{a} + {b} → White Smoke', 'NH3 + HCl → NH4Cl (white smoke)', 'Ammonia and hydrogen chloride gases meet and instantly form solid ammonium chloride smoke.', 'Watch white smoke appear from two invisible gases.');
C('freezing-mixture', '{a} + {b} → Freezing Mixture', 'salt + ice → brine below 0 °C', 'Salt forces ice to melt, and melting steals heat — the mixture plunges below zero.', 'Watch the temperature fall past 0 °C: how ice-cream was made before freezers.');
C('soap-scum', '{a} + {b} → Soap Scum', 'soap + Ca/Mg ions → insoluble scum', 'Hard-water ions grab soap into a grey, insoluble scum — why hard water kills lather.', 'Watch the lather die and grey curds form.');
C('dye-dissolve', '{a} Dissolves {b}', 'dye + solvent → coloured solution', 'The solvent pulls the dye apart molecule by molecule.', 'Watch colour bleed into the solvent.');
C('solvent-attack', '{a} Attacks {b}', 'polymer + solvent → softened / dissolved', 'The solvent wedges between polymer chains, softening or dissolving the solid.', 'Watch the surface go tacky, then slump.');
C('ph-tint', '{a} Tints {b}', 'dye colour depends on pH', 'Many dyes are natural pH indicators — acid and alkali bend their colour.', 'Watch the hue swing as the pH changes.');
C('hf-etch', 'Hydrofluoric Acid Etches {b}', 'SiO2 + 4HF → SiF4 + 2H2O', 'HF is the one common acid that eats glass — it dissolves the silica itself.', 'Watch the glass frost over where the acid touches.');
C('base-etch', 'Strong Alkali Etches {b}', 'SiO2 + 2NaOH → Na2SiO3 + H2O (slow)', 'Hot strong alkali slowly dissolves glass — why caustic is never stored in glass for long.', 'Watch a slow frost creep over the surface.');
C('acid-etch', '{a} Etches {b}', 'acid + mineral → slow attack', 'Even stone loses to acid given time — this is acid rain in miniature.', 'Watch the surface roughen and pale.');
C('acid-char', '{a} Chars {b}', 'concentrated acid dehydrates organics → carbon', 'Concentrated acid rips water out of organic matter, leaving black carbon behind.', 'Watch it blacken and steam as it chars.');
C('acid-organic', '{a} + {b} → Slow Attack', 'acid + organic → gradual breakdown', 'The acid slowly hydrolyses and dissolves the organic material.', 'Watch edges fray and colour leach out.');
C('caustic', '{a} + {b} → Caustic Attack', 'alkali + organic → breakdown', 'Strong alkali digests organic matter — fats, fibres, even hair.', 'Watch the material soften and fall apart.');
C('electric-heating', '{a} Heats {b}', 'current → resistance → heat', 'Electric current fighting through resistance turns into heat.', 'Watch the conductor glow as current flows.');
C('arc-ignition', '{a} Ignites {b}', 'arc + fuel vapour → flame', 'An electric arc is thousands of degrees — fuel vapour cannot resist it.', 'Watch the flash as vapour catches.');
C('steam-ring', '{a} + {b} → Steam Ring', 'lightning-class heat + water → steam', 'The discharge superheats a skin of water into a ring of steam.', 'Watch the white ring bloom outward.');
C('thermal-shock', '{a} + {b} → Thermal Shock', 'extreme ΔT → cracks', 'One side expands (or shrinks) faster than the other — the solid cracks itself apart.', 'Watch cracks spider across the surface.');
C('hot-ignition', '{a} Ignites {b}', 'molten heat + fuel → ignition', 'Anything flammable touching metal at 1000 °C does not wait for a spark.', 'Watch it catch the instant it touches.');
C('steam-metal', 'Steam + {b} → Hydrogen', '3Fe + 4H2O → Fe3O4 + 4H2↑ (hot iron)', 'Red-hot iron splits steam, taking the oxygen and freeing hydrogen.', 'Watch the metal darken as hydrogen streams off.');
C('gas-pop', '{a} + {b} → Gas Pop', 'fuel gas + oxidiser + spark → pop', 'Confined fuel gas and oxidiser combine all at once when sparked.', 'Watch the flash and feel the pop.');
C('indicator-ph', '{a} Shows the pH of {b}', 'indicator + H+/OH− → colour', 'The indicator molecule changes shape — and colour — with acidity.', 'Watch the colour: it is reading the pH for you.');
C('halogen-displacement', '{a} + {b} → Halogen Displacement', 'stronger halogen frees weaker halogen', 'A more reactive halogen steals the metal from a less reactive halogen\'s salt.', 'Watch iodine\'s brown colour bloom in the solution.');
C('cement-setting', 'Cement + {b} → It Sets', 'cement + water → hydrated silicates (hard)', 'Cement does not dry — it reacts with water and grows interlocking crystals.', 'Watch the slurry stiffen into stone over time.');
C('alkali-water', '{a} + {b} → Violent Reaction', 'alkali metal + water → hydroxide + H2↑ + heat', 'Alkali metals tear water apart; the heat can ignite the hydrogen.', 'Watch the fizzing, darting metal — bigger piece, bigger bang.');
C('acid-oxide', '{a} + {b} → Salt + Water', 'metal oxide + acid → salt + water', 'Oxides are bases in disguise: acid neutralises them into a salt solution.', 'Watch the powder dissolve as the salt forms.');
C('indicator-guide', 'Indicator Colour Guide', 'colour ⇄ pH', 'Each indicator has its own pH range and its own two colours.', 'Compare the same liquid across indicators — each tells the story differently.');
// indicator cards
for (const [k, nm, rng] of [
  ['universal-indicator', 'Universal Indicator', 'full rainbow, pH 0–14'], ['phenolphthalein', 'Phenolphthalein', 'colourless → pink above pH 8.2'],
  ['methyl-orange', 'Methyl Orange', 'red → yellow between pH 3.1–4.4'], ['litmus', 'Litmus', 'red in acid, blue in alkali'],
  ['bromothymol-blue', 'Bromothymol Blue', 'yellow → green → blue, pH 6–7.6'], ['methyl-red', 'Methyl Red', 'red → yellow, pH 4.4–6.2'],
  ['thymol-blue', 'Thymol Blue', 'two ranges: red→yellow, then yellow→blue'], ['turmeric-solution', 'Turmeric Solution', 'yellow → red-brown in alkali'],
  ['turmeric-powder', 'Turmeric Powder', 'yellow → red-brown in alkali'], ['red-cabbage-juice', 'Red Cabbage Juice', 'a whole rainbow from one vegetable'],
  ['hibiscus-dye', 'Hibiscus Dye', 'pink in acid, green in alkali'], ['ph-paper', 'pH Paper', 'rainbow scale, pH 0–14'],
]) C('ind-' + k, nm + ' + {b}', 'indicator colour ⇄ pH', `${nm}: ${rng}. The colour you see is this liquid's pH, translated.`, 'Watch the exact shade — it pins the pH down.');

// ---- NAMED PAIRS (Tier 1, authored) ----
const _pairs = [];
function np(a, b, f, where) {
  if (!has(a) || !has(b)) { warn(`named pair dropped (${where || a + '+' + b}): missing ${!has(a) ? a : b}`); return; }
  if (a === b) return;
  const rec = { ...f };
  for (const fld of ['outA', 'outB', 'gas']) if (rec[fld] != null) rec[fld] = P(rec[fld], `pair ${a}+${b}`);
  _pairs.push([a, b, rec]);
}
// === W33 §5.3 — the 42, in-world ===
np('acetic-acid', 'baking-soda-sol', { rate: 0.09, gas: 'co2', gasN: 2, heat: -2, needs: 'mixed', card: 'vinegar-baking-soda', note: 'vinegar (acetic acid) + bicarbonate fizz' }, 'w33-1');
np('hydrochloric-acid', 'sodium-hydroxide', { rate: 0.12, heat: 6, outA: 'salt-water', outB: 'salt-water', needs: 'mixed', card: 'neutralisation-hcl-naoh' }, 'w33-2');
np('phenolphthalein', 'sodium-hydroxide', { rate: 0.12, tintTo: 0xE91E8C, consumeA: false, consumeB: false, card: 'phenolphthalein-flip' }, 'w33-3a');
np('phenolphthalein', 'hydrochloric-acid', { rate: 0.12, tintTo: 0xEDEDF2, consumeA: false, consumeB: false, card: 'phenolphthalein-flip' }, 'w33-3b');
np('phenolphthalein', 'ammonia-solution', { rate: 0.1, tintTo: 0xF78FB8, consumeA: false, consumeB: false, card: 'phenolphthalein-flip' }, 'w33-3c');
np('sodium', 'water', { rate: 0.2, gas: 'hydrogen', gasN: 2, heat: 30, outA: 'sodium-hydroxide', tintTo: 0xF08A24, card: 'sodium-water' }, 'w33-4');
np('potassium', 'water', { rate: 0.3, gas: 'hydrogen', gasN: 3, heat: 55, outA: 'potassium-hydroxide', tintTo: 0x9A4FE0, card: 'potassium-water' }, 'w33-5');
np('lithium', 'water', { rate: 0.1, gas: 'hydrogen', gasN: 1, heat: 15, outA: 'lithium-hydroxide-sol', card: 'lithium-water' }, 'w33-6');
np('calcium', 'water', { rate: 0.06, gas: 'hydrogen', gasN: 1, heat: 10, outA: 'limewater', tintTo: 0xEDEDE6, card: 'calcium-water' }, 'w33-7');
np('quicklime', 'water', { rate: 0.12, outA: 'slaked-lime', gas: 'steam', gasN: 1, heat: 40, card: 'slaking' }, 'w33-8');
np('magnesium', 'hydrochloric-acid', { rate: 0.09, gas: 'hydrogen', gasN: 2, heat: 10, outA: 'magnesium-chloride-sol', card: 'mg-hcl' }, 'w33-9');
np('magnesium-ribbon', 'hydrochloric-acid', { rate: 0.07, gas: 'hydrogen', gasN: 2, heat: 10, outA: 'magnesium-chloride-sol', card: 'mg-hcl' }, 'w33-9b');
np('zinc', 'copper-sulfate-sol', { rate: 0.05, outA: 'copper', outB: 'zinc-sulfate-sol', heat: 5, needs: 'mixed', tintTo: 0xB87333, card: 'zn-cuso4' }, 'w33-10');
np('copper', 'silver-nitrate-sol', { rate: 0.04, outA: 'silver', outB: 'copper-nitrate-sol', tintTo: 0xD8DDE3, card: 'cu-agno3' }, 'w33-11');
np('silver-nitrate-sol', 'sodium-chloride-sol', { rate: 0.14, outA: 'silver-chloride', tintTo: 0xF5F5F0, needs: 'mixed', card: 'agcl', note: 'white AgCl precipitate — real silver-chloride entry' }, 'w33-12');
np('silver-nitrate-sol', 'potassium-iodide-sol', { rate: 0.14, outA: 'silver-iodide', tintTo: 0xF2C230, needs: 'mixed', card: 'agi', note: 'yellow AgI precipitate — real silver-iodide entry' }, 'w33-13');
np('lead-nitrate-sol', 'potassium-iodide-sol', { rate: 0.12, outA: 'lead-iodide', tintTo: 0xFFC93C, needs: 'mixed', card: 'golden-rain', note: 'golden PbI2 crystals — real lead-iodide entry' }, 'w33-14');
np('barium-chloride-sol', 'sodium-sulfate-sol', { rate: 0.14, outA: 'barium-sulfate', tintTo: 0xF5F5F0, needs: 'mixed', card: 'baso4', note: 'dense white BaSO4 precipitate — real barium-sulfate entry' }, 'w33-15');
np('barium-chloride', 'sodium-sulfate-sol', { rate: 0.1, outB: 'barium-sulfate', tintTo: 0xF5F5F0, needs: 'mixed', card: 'baso4' }, 'w33-15b');
np('limewater', 'co2', { rate: 0.08, outA: 'chalk-powder', tintTo: 0xEDEDE6, card: 'limewater-co2' }, 'w33-16');
np('copper-sulfate-sol', 'sodium-hydroxide', { rate: 0.12, outA: 'copper-hydroxide', tintTo: 0x7FB2E0, needs: 'mixed', card: 'cuoh2', note: 'pale-blue Cu(OH)2 jelly — real copper-hydroxide entry' }, 'w33-17');
np('iron3-chloride-sol', 'sodium-hydroxide', { rate: 0.12, outA: 'iron-oxide', tintTo: 0xA85B2A, needs: 'mixed', card: 'feoh3' }, 'w33-18');
np('copper-sulfate-sol', 'ammonia-solution', { rate: 0.08, tintTo: 0x1B3FA0, consumeA: false, consumeB: false, needs: 'mixed', card: 'cu-ammonia' }, 'w33-19');
np('potassium-permanganate', 'glycerol', { rate: 0.02, heat: 120, outA: 'flame', gas: 'smoke', gasN: 1, tintTo: 0x9A4FE0, card: 'kmno4-glycerin', note: 'delayed self-ignition: smoke first, then purple flame' }, 'w33-20');
np('hydrogen-peroxide', 'potassium-iodide-sol', { rate: 0.1, gas: 'oxygen', gasN: 3, needs: 'mixed', card: 'elephant-toothpaste', note: 'add soap and the oxygen becomes a foam geyser' }, 'w33-21');
np('hydrogen-peroxide', 'potassium-iodide', { rate: 0.08, gas: 'oxygen', gasN: 3, needs: 'mixed', card: 'elephant-toothpaste' }, 'w33-21b');
np('hydrogen-peroxide', 'soap-solution', { rate: 0.03, gas: 'oxygen', gasN: 1, tintTo: 0xF5F5F0, needs: 'mixed', card: 'elephant-toothpaste', note: 'soap alone only fizzes gently — the iodide catalyst makes the geyser' }, 'w33-21c');
np('luminol-sol', 'hydrogen-peroxide', { rate: 0.05, tintTo: 0x3A6BFF, consumeA: false, consumeB: false, needs: 'mixed', card: 'luminol-glow', note: 'blue chemiluminescent glow' }, 'w33-22');
np('luminol-sol', 'fake-blood', { rate: 0.05, tintTo: 0x3A6BFF, consumeA: false, consumeB: false, needs: 'mixed', card: 'luminol-glow', note: 'iron in fake blood catalyses the glow — the forensic trick' }, 'w33-22b');
np('ethanol', 'fire', { rate: 0.12, outA: 'alcohol-flame', heat: 60, needs: 'ignited', card: 'ethanol-flame' }, 'w33-23');
np('methanol', 'fire', { rate: 0.12, outA: 'alcohol-flame', heat: 55, tintTo: 0xB8E6C8, needs: 'ignited', card: 'methanol-flame' }, 'w33-24');
np('hydrogen', 'oxygen', { rate: 0.3, blast: 6, outA: 'steam', heat: 150, needs: 'ignited', card: 'h2-o2-pop' }, 'w33-25');
np('hydrogen', 'oxygen', { rate: 0.2, blast: 4, outA: 'steam', heat: 120, needs: 'pressurised', card: 'h2-o2-pop' }, 'w33-25b');
np('hydrogen', 'spark', { rate: 0.2, blast: 1, heat: 60, needs: 'ignited', card: 'h2-pop-test', note: 'squeaky pop — the test for hydrogen (needs air/oxygen around)' }, 'w33-26');
np('iron-oxide', 'aluminium-powder', { rate: 0.06, outA: 'aluminium-oxide', outB: 'iron-molten', heat: 900, gas: 'smoke', gasN: 1, needs: 'ignited', tempBand: [600, null], card: 'thermite' }, 'w33-27');
np('thermite', 'magnesium-ribbon', { rate: 0.1, heat: 300, needs: 'ignited', card: 'thermite', note: 'the magnesium ribbon is the fuse' }, 'w33-27b');
np('thermite', 'spark', { rate: 0.08, heat: 300, needs: 'ignited', card: 'thermite' }, 'w33-27c');
np('iodine', 'heater-cell', { rate: 0.06, outA: 'iodine-vapour', tintTo: 0x7A2E8A, card: 'iodine-sublime' }, 'w33-28');
np('iodine', 'fire', { rate: 0.05, outA: 'iodine-vapour', tintTo: 0x7A2E8A, card: 'iodine-sublime' }, 'w33-28b');
np('chalk', 'hydrochloric-acid', { rate: 0.08, gas: 'co2', gasN: 2, card: 'chalk-hcl' }, 'w33-29');
np('iron', 'copper-sulfate-sol', { rate: 0.04, outA: 'copper', outB: 'iron2-sulfate-sol', tintTo: 0x9AC87A, card: 'fe-cuso4' }, 'w33-30');
np('sulfur-powder', 'fire', { rate: 0.08, outA: 'sulfur-flame', gas: 'sulfur-dioxide', gasN: 1, heat: 40, needs: 'ignited', card: 'sulfur-burn' }, 'w33-31');
np('sugar', 'sulfuric-acid', { rate: 0.05, outA: 'charcoal-powder', gas: 'steam', gasN: 1, heat: 40, card: 'black-snake' }, 'w33-32');
np('potassium-permanganate-sol', 'hydrochloric-acid', { rate: 0.07, gas: 'chlorine-gas', gasN: 1, tintTo: 0xC8E86B, needs: 'mixed', card: 'kmno4-hcl' }, 'w33-33');
np('dry-ice', 'water', { rate: 0.15, outA: 'co2', gas: 'fog', gasN: 2, heat: -20, card: 'dry-ice-water' }, 'w33-34');
np('dry-ice', 'soap-solution', { rate: 0.12, outA: 'co2', gas: 'fog', gasN: 2, heat: -15, needs: 'mixed', card: 'dry-ice-soap' }, 'w33-35');
np('liquid-nitrogen', 'water', { rate: 0.18, gas: 'fog', gasN: 3, heat: -60, outB: 'ice', card: 'ln2-water' }, 'w33-36');
np('soap-solution', 'olive-oil', { rate: 0.07, tintTo: 0xEDEDE6, consumeA: false, consumeB: false, needs: 'mixed', card: 'emulsion' }, 'w33-37');
np('cobalt-chloride-sol', 'water', { rate: 0.08, tintTo: 0xF2A0B5, consumeA: false, consumeB: false, card: 'cobalt-chloride', note: 'hydrated cobalt chloride is pink' }, 'w33-38a');
np('cobalt-chloride-sol', 'heater-cell', { rate: 0.05, tintTo: 0x2E5FD8, consumeA: false, consumeB: false, card: 'cobalt-chloride', note: 'heat drives the water off — blue anhydrous form' }, 'w33-38b');
np('starch-sol', 'iodine-tincture', { rate: 0.12, tintTo: 0x101038, consumeA: false, consumeB: false, card: 'starch-iodine' }, 'w33-39');
np('starch-sol', 'iodine', { rate: 0.1, tintTo: 0x101038, consumeA: false, consumeB: false, card: 'starch-iodine' }, 'w33-39b');
np('methylene-blue', 'glucose-sol', { rate: 0.04, tintTo: 0xD8DEE8, consumeA: false, consumeB: false, needs: 'mixed', card: 'blue-bottle', note: 'blue bottle: glucose + alkali reduce it colourless; shaking in air re-blues it' }, 'w33-40');
np('aluminium', 'bromine', { rate: 0.07, outA: 'aluminium-oxide', gas: 'smoke', gasN: 1, heat: 80, tintTo: 0xF08A24, card: 'al-bromine', note: 'aluminium bromide forms (table has no AlBr3 entry; oxide is the stand-in solid)' }, 'w33-41');
np('aluminium-powder', 'bromine', { rate: 0.1, outA: 'aluminium-oxide', gas: 'smoke', gasN: 1, heat: 100, tintTo: 0xF08A24, card: 'al-bromine' }, 'w33-41b');
np('gold', 'aqua-regia', { rate: 0.015, outA: 'gold-chloride-sol', tintTo: 0xF2C81E, card: 'gold-aqua-regia' }, 'w33-42');
// === indicator × named pH liquids (specific colour per pair, from the liquid's own pH) ===
const INDICATORS = ['universal-indicator', 'phenolphthalein', 'methyl-orange', 'litmus', 'bromothymol-blue', 'methyl-red', 'thymol-blue', 'turmeric-solution', 'turmeric-powder', 'red-cabbage-juice', 'hibiscus-dye', 'ph-paper'].filter(has);
const PH_LIQUIDS = ['hydrochloric-acid', 'sulfuric-acid', 'nitric-acid', 'acetic-acid', 'lemon-juice', 'cola', 'orange-juice', 'tomato-juice', 'honey', 'coffee', 'tea', 'rainwater', 'soda-water', 'beer', 'buttermilk', 'coconut-water', 'grape-juice', 'apple-juice', 'urine-fun', 'saliva-fun', 'milk', 'blood', 'distilled-water', 'salt-water', 'baking-soda-sol', 'soap-sol', 'detergent-water', 'milk-of-magnesia', 'washing-soda-sol', 'ammonia-solution', 'bleach', 'limewater', 'sodium-hydroxide', 'potassium-hydroxide'].filter(has);
for (const ind of INDICATORS) for (const lq of PH_LIQUIDS) {
  const rec = R(lq); if (!rec || rec.ph == null) continue;
  np(ind, lq, { rate: 0.12, tintTo: indicatorColour(ind, rec.ph), consumeA: false, consumeB: false, card: 'ind-' + ind, note: `${R(ind).name} reads pH ${rec.ph} in ${rec.name}` }, 'indicator');
}
// indicator test papers with their own famous partners
np('lead-acetate-paper', 'hydrogen-sulfide', { rate: 0.1, tintTo: 0x1A1A1A, consumeA: false, consumeB: false, card: 'indicator-guide', note: 'lead acetate paper blackens with H2S — the sulfide test' }, 'paper-h2s');
np('cobalt-chloride-paper', 'water', { rate: 0.1, tintTo: 0xF2A0B5, consumeA: false, consumeB: false, card: 'cobalt-chloride', note: 'blue cobalt paper turns pink in water — the water test' }, 'paper-co');
np('starch-paper', 'iodine-tincture', { rate: 0.1, tintTo: 0x101038, consumeA: false, consumeB: false, card: 'starch-iodine' }, 'paper-starch');
np('universal-indicator', 'ammonia-gas', { rate: 0.1, tintTo: 0x2456C8, consumeA: false, consumeB: false, card: 'ind-universal-indicator', note: 'alkaline gas turns it blue — the ammonia test' }, 'ind-gas-nh3');
np('ph-paper', 'ammonia-gas', { rate: 0.1, tintTo: 0x2456C8, consumeA: false, consumeB: false, card: 'ind-ph-paper', note: 'damp pH paper blues over ammonia' }, 'paper-gas-nh3');
np('ph-paper', 'hydrogen-chloride-gas', { rate: 0.1, tintTo: 0xE23B2E, consumeA: false, consumeB: false, card: 'ind-ph-paper', note: 'acid gas reddens damp pH paper' }, 'paper-gas-hcl');
// === marquee metals × the four bench acids (per-pair rate / product / passivation) ===
const BENCH_ACIDS = ['hydrochloric-acid', 'sulfuric-acid', 'nitric-acid', 'acetic-acid'];
const ACID_ANION = { 'hydrochloric-acid': 'chloride', 'sulfuric-acid': 'sulfate', 'nitric-acid': 'nitrate', 'acetic-acid': 'acetate' };
const MARQUEE_METALS = ['potassium', 'sodium', 'lithium', 'calcium', 'magnesium', 'aluminium', 'zinc', 'chromium', 'iron', 'manganese', 'nickel', 'tin', 'lead', 'copper', 'silver', 'gold', 'platinum', 'mercury', 'cobalt', 'titanium'];
const PASSIVE_NITRIC = new Set(['iron', 'aluminium', 'chromium']);
for (const mk of MARQUEE_METALS) {
  const m = R(mk); if (!m) continue;
  for (const ak of BENCH_ACIDS) {
    const a = R(ak); if (!a) continue;
    const rank = m.activityRank || 0, str = a.acidStrength || 0;
    if (ak === 'nitric-acid' && PASSIVE_NITRIC.has(mk)) { np(mk, ak, { kind: 'inert', note: 'passivation: concentrated nitric acid grows a protective oxide film — no reaction', card: 'acid-metal' }, 'passivation'); continue; }
    if (rank < 15 && !a.fams.includes('oxidiser')) { np(mk, ak, { kind: 'inert', note: 'too noble for this acid — no reaction', card: 'acid-metal' }, 'noble'); continue; }
    if (mk === 'copper' && ak === 'sulfuric-acid') { np(mk, ak, { rate: 0.02, gas: 'sulfur-dioxide', gasN: 1, outA: 'copper-sulfate-sol', outB: 'copper-sulfate-sol', heat: 12, tempBand: [120, null], card: 'acid-metal', note: 'only hot concentrated acid bites copper, giving SO2' }, 'cu-h2so4'); continue; }
    if (mk === 'copper' && ak === 'nitric-acid') { np(mk, ak, { rate: 0.05, gas: 'nitrogen-dioxide', gasN: 1, outA: 'copper-nitrate-sol', outB: 'copper-nitrate-sol', heat: 10, tintTo: 0x8A5B2A, card: 'acid-metal', note: 'nitric acid oxidises copper — brown NO2 fumes' }, 'cu-hno3'); continue; }
    if (mk === 'silver' && ak === 'nitric-acid') { np(mk, ak, { rate: 0.03, outA: 'silver-nitrate-sol', outB: 'silver-nitrate-sol', heat: 6, card: 'acid-metal' }, 'ag-hno3'); continue; }
    if (mk === 'mercury' && ak === 'nitric-acid') { np(mk, ak, { rate: 0.02, gas: 'nitrogen-dioxide', gasN: 1, tintTo: 0x8A5B2A, card: 'acid-metal', note: 'mercury dissolves in nitric acid with brown fumes' }, 'hg-hno3'); continue; }
    const prod = solFor(m, ACID_ANION[ak]);
    np(mk, ak, { rate: Math.min(0.16, 0.012 + 0.11 * str * (rank / 100) + (mk === 'magnesium' && ak === 'hydrochloric-acid' ? 0.03 : 0)), gas: 'hydrogen', gasN: rank >= 80 ? 3 : (rank >= 45 ? 2 : 1), heat: Math.round(4 + 14 * str * (rank / 100)), outA: prod, outB: prod, tintTo: null, card: 'acid-metal', note: `${m.name} + ${a.name} → ${prod ? R(prod).name : 'metal salt'} + H2` }, 'metal-acid');
  }
}
// gold / platinum vs aqua regia & single acids
np('platinum', 'aqua-regia', { rate: 0.008, outA: 'platinum-chloride-sol', tintTo: 0xF2C81E, card: 'gold-aqua-regia', note: 'even platinum yields to aqua regia, very slowly' }, 'pt-aqua');
np('gold', 'hydrochloric-acid', { kind: 'inert', note: 'gold laughs at single acids — only aqua regia dissolves it', card: 'gold-aqua-regia' }, 'gold-hcl');
np('gold', 'nitric-acid', { kind: 'inert', note: 'gold is untouched by nitric acid alone', card: 'gold-aqua-regia' }, 'gold-hno3');
// === powder forms × bench acids: same chemistry, genuinely faster (surface
// area) — distinct rates from the solid-chunk pairs above, per form. ===
for (const mk of MARQUEE_METALS) {
  const pk = mk + '-powder'; const m = R(pk); if (!m) continue;
  const rank = m.activityRank || 0;
  for (const ak of BENCH_ACIDS) {
    const a = R(ak); if (!a) continue;
    const str = a.acidStrength || 0;
    if (ak === 'nitric-acid' && PASSIVE_NITRIC.has(mk)) { np(pk, ak, { kind: 'inert', note: 'passivation holds even for the powder in concentrated nitric acid', card: 'acid-metal' }, 'powder-passivation'); continue; }
    if (rank < 15 && !a.fams.includes('oxidiser')) { np(pk, ak, { kind: 'inert', note: 'noble even as powder — no reaction', card: 'acid-metal' }, 'powder-noble'); continue; }
    if (mk === 'copper' && ak === 'sulfuric-acid') { np(pk, ak, { rate: 0.04, gas: 'sulfur-dioxide', gasN: 1, outA: 'copper-sulfate-sol', outB: 'copper-sulfate-sol', heat: 12, tempBand: [120, null], card: 'acid-metal', note: 'powder form: hot acid bites faster than on chunk copper' }, 'powder-cu-h2so4'); continue; }
    if (mk === 'copper' && ak === 'nitric-acid') { np(pk, ak, { rate: 0.1, gas: 'nitrogen-dioxide', gasN: 1, outA: 'copper-nitrate-sol', outB: 'copper-nitrate-sol', heat: 10, tintTo: 0x8A5B2A, card: 'acid-metal', note: 'powder form fizzes twice as fast as chunk copper' }, 'powder-cu-hno3'); continue; }
    if (mk === 'silver' && ak === 'nitric-acid') { np(pk, ak, { rate: 0.06, outA: 'silver-nitrate-sol', outB: 'silver-nitrate-sol', heat: 6, card: 'acid-metal', note: 'powder silver dissolves briskly' }, 'powder-ag-hno3'); continue; }
    const prod = solFor(m, ACID_ANION[ak]);
    np(pk, ak, { rate: Math.min(0.3, (0.012 + 0.11 * str * (rank / 100)) * 2.2), gas: 'hydrogen', gasN: rank >= 80 ? 3 : (rank >= 45 ? 2 : 1), heat: Math.round(4 + 14 * str * (rank / 100)), outA: prod, outB: prod, card: 'acid-metal', note: `powder form of ${m.name}: same salt, ~2× the rate of the chunk (surface area)` }, 'powder-metal-acid');
  }
}
// powder-form singles where the form itself changes the behaviour
np('magnesium-powder', 'water', { rate: 0.04, gas: 'hydrogen', gasN: 1, heat: 8, outA: 'milk-of-magnesia', card: 'steam-metal', note: 'powder magnesium reacts with cold water where ribbon barely does' }, 'powder-mg-water');
np('iron-powder', 'oxygen', { rate: 0.08, outA: 'iron-oxide', heat: 120, tintTo: 0xFFD8A0, needs: 'ignited', card: 'combustion', note: 'iron powder burns — sparks like steel wool; a nail would not' }, 'powder-fe-o2');
np('zinc-powder', 'sulfur-powder', { rate: 0.06, tintTo: 0x2A2A2A, heat: 60, needs: 'ignited', card: 'sulfide', note: 'zinc + sulfur: the classic rocket-fuel pair — both must be powders' }, 'powder-zn-s');
np('aluminium-powder', 'water', { rate: 0.02, gas: 'hydrogen', gasN: 1, outA: 'aluminium-oxide', tempBand: [200, null], card: 'steam-metal', note: 'hot water/steam strips the oxide skin — powder aluminium then reacts' }, 'powder-al-water');
np('calcium-powder', 'water', { rate: 0.12, gas: 'hydrogen', gasN: 2, heat: 20, outA: 'limewater', tintTo: 0xEDEDE6, card: 'calcium-water', note: 'powder calcium fizzes far faster than the lump' }, 'powder-ca-water');
// === marquee metals × famous salt solutions (displacement with plating) ===
const FAMOUS_SOLS = ['copper-sulfate-sol', 'copper-chloride-sol', 'silver-nitrate-sol', 'iron3-chloride-sol', 'zinc-sulfate-sol', 'nickel-sulfate-sol', 'lead-nitrate-sol', 'cobalt-chloride-sol', 'gold-chloride-sol', 'iron2-sulfate-sol'];
for (const mk of MARQUEE_METALS) {
  const m = R(mk); if (!m) continue;
  for (const sk of FAMOUS_SOLS) {
    const s = R(sk); if (!s || !s.cation) continue;
    const cr = CATION_RANK[s.cation]; if (cr == null || (m.activityRank || 0) <= cr) continue;
    const plated = CATION_METAL[s.cation]; if (!plated || !has(plated)) continue;
    if ((mk === 'zinc' && sk === 'copper-sulfate-sol') || (mk === 'iron' && sk === 'copper-sulfate-sol') || (mk === 'copper' && sk === 'silver-nitrate-sol')) continue; // already in the 42
    const anionWord = s.anion === 'so4' ? 'sulfate' : (s.anion === 'no3' ? 'nitrate' : 'chloride');
    np(mk, sk, { rate: 0.02 + 0.05 * (((m.activityRank || 0) - cr) / 100), outA: plated, outB: solFor(m, anionWord), heat: 4, tintTo: R(plated).col ? R(plated).col[1] : null, card: 'displacement', note: `${m.name} plates out ${R(plated).name} from ${s.name}` }, 'displacement');
  }
}
// === acids × named carbonates (CO2 with per-pair products) ===
const NAMED_ACIDS = ['hydrochloric-acid', 'sulfuric-acid', 'nitric-acid', 'acetic-acid', 'citric-acid-sol', 'phosphoric-acid'];
const NAMED_CARBONATES = ['chalk', 'limestone', 'marble', 'washing-soda', 'soda-ash', 'potassium-carbonate', 'copper-carbonate', 'lead-carbonate', 'zinc-carbonate', 'eggshell', 'coral', 'seashell', 'bone', 'baking-soda-sol', 'washing-soda-sol', 'ammonium-carbonate-sol'];
for (const ak of NAMED_ACIDS) {
  const a = R(ak); if (!a) continue;
  for (const ck of NAMED_CARBONATES) {
    const c = R(ck); if (!c) continue;
    if (ak === 'hydrochloric-acid' && ck === 'chalk') continue; // w33-29
    if (ak === 'acetic-acid' && ck === 'baking-soda-sol') continue; // w33-1
    np(ak, ck, { rate: 0.02 + 0.09 * (a.acidStrength || 0.2), gas: 'co2', gasN: 2, heat: -1, card: 'acid-carbonate', note: `${a.name} fizzes on ${c.name} — CO2 released` }, 'acid-carbonate');
  }
}
// === halogen × metal named pairs ===
const HAL_PAIRS = [
  ['bromine', 'iron', 0.06, 60], ['bromine', 'zinc', 0.06, 50], ['bromine', 'sodium', 0.15, 90], ['bromine', 'potassium', 0.18, 100], ['bromine', 'copper', 0.04, 40], ['bromine', 'magnesium', 0.08, 60],
  ['chlorine-gas', 'iron', 0.07, 60], ['chlorine-gas', 'sodium', 0.16, 90], ['chlorine-gas', 'copper', 0.05, 50], ['chlorine-gas', 'aluminium', 0.06, 60], ['chlorine-gas', 'zinc', 0.06, 50], ['chlorine-gas', 'potassium', 0.18, 100],
  ['fluorine-gas', 'iron', 0.12, 80], ['fluorine-gas', 'copper', 0.1, 70], ['fluorine-gas', 'zinc', 0.11, 75],
  ['iodine', 'aluminium-powder', 0.05, 50], ['iodine', 'iron-powder', 0.04, 40], ['iodine', 'zinc-powder', 0.04, 40],
];
for (const [hk, mk, rate, heat] of HAL_PAIRS) {
  const m = R(mk); if (!m || !has(hk)) continue;
  np(hk, mk, { rate, heat, outB: solFor(m, HALOGEN_ANION[hk] || 'chloride'), gas: 'smoke', gasN: 1, tintTo: 0xF08A24, needs: hk === 'iodine' ? 'heated' : 'contact', card: 'halogen-metal', note: `${R(hk).name} + ${m.name} → metal halide, sparks and fumes` }, 'halogen-metal');
}
// === bleach pairs ===
np('bleach', 'hydrochloric-acid', { rate: 0.1, gas: 'chlorine-gas', gasN: 2, heat: 5, card: 'chlorine-danger' }, 'bleach-hcl');
np('bleach', 'acetic-acid', { rate: 0.06, gas: 'chlorine-gas', gasN: 1, card: 'chlorine-danger', note: 'even vinegar frees chlorine from bleach' }, 'bleach-vinegar');
np('bleaching-powder', 'hydrochloric-acid', { rate: 0.09, gas: 'chlorine-gas', gasN: 2, card: 'chlorine-danger' }, 'bleachpowder-hcl');
np('bleach', 'ammonia-solution', { rate: 0.06, tintTo: 0xE8E8D0, card: 'chloramine' }, 'bleach-nh3');
np('bleach', 'hydrogen-peroxide', { rate: 0.09, gas: 'oxygen', gasN: 2, card: 'oxygen-release' }, 'bleach-peroxide');
np('chlorine-gas', 'sodium-hydroxide', { rate: 0.07, outA: 'bleach', tintTo: 0xEDEDD8, card: 'bleaching', note: 'chlorine into caustic soda makes bleach — the industrial recipe' }, 'cl2-naoh');
np('bleach', 'methylene-blue', { rate: 0.07, tintTo: 0xEDEDE6, consumeB: false, card: 'bleaching' }, 'bleach-mb');
np('bleach', 'ink', { rate: 0.05, tintTo: 0xEDEDE6, card: 'bleaching' }, 'bleach-ink');
np('bleach', 'turmeric-solution', { rate: 0.06, tintTo: 0xEDEDE6, card: 'bleaching' }, 'bleach-turmeric');
// === peroxide × catalysts ===
for (const ck of ['manganese-dioxide', 'iron3-chloride-sol', 'iron2-sulfate-sol', 'copper-sulfate-sol', 'yeast']) {
  if (!has(ck)) continue;
  np('hydrogen-peroxide', ck, { rate: ck === 'manganese-dioxide' ? 0.12 : 0.07, gas: 'oxygen', gasN: 2, card: 'peroxide-catalyst', note: `${R(ck).name} catalyses peroxide breakdown` }, 'peroxide-cat');
}
np('peroxide-conc', 'manganese-dioxide', { rate: 0.16, gas: 'oxygen', gasN: 3, card: 'peroxide-catalyst' }, 'peroxide-conc');
np('sodium-peroxide', 'water', { rate: 0.1, outA: 'sodium-hydroxide', gas: 'oxygen', gasN: 1, heat: 20, card: 'oxygen-release' }, 'na2o2-water');
// === famous singles ===
np('lightning-bolt', 'sand', { rate: 0.2, outB: 'glass', heat: 200, card: 'thermal-shock', note: 'fulgurite: lightning fuses sand into glass' }, 'fulgurite');
np('lightning-bolt', 'water', { rate: 0.15, outB: 'steam', gas: 'steam', gasN: 2, blast: 1, heat: 100, card: 'steam-ring' }, 'lightning-water');
for (const mk of ['iron-molten', 'steel-molten', 'copper-molten', 'aluminium-molten', 'lead-molten', 'zinc-molten', 'gold-molten', 'silver-molten']) {
  if (!has(mk)) continue;
  np(mk, 'water', { rate: 0.14, outB: 'steam', gas: 'steam', gasN: 3, heat: -120, blast: mk === 'iron-molten' || mk === 'steel-molten' ? 2 : 0, card: 'steam-burst', note: 'molten metal + water: violent steam burst' }, 'molten-water');
}
np('hydrofluoric-acid', 'glass', { rate: 0.03, outB: 'frosted-glass', tintTo: 0xE8ECEE, card: 'hf-etch' }, 'hf-glass');
np('hydrofluoric-acid', 'borosilicate-glass', { rate: 0.02, outB: 'frosted-glass', tintTo: 0xE8ECEE, card: 'hf-etch' }, 'hf-boro');
np('hydrofluoric-acid', 'silicon-oxide', { rate: 0.04, tintTo: 0xE8ECEE, card: 'hf-etch', note: 'HF dissolves silica itself' }, 'hf-silica');
np('calcium-carbide', 'water', { rate: 0.09, outA: 'slaked-lime', gas: 'acetylene', gasN: 2, heat: 15, card: 'gas-pop', note: 'carbide + water → acetylene, the old lamp gas' }, 'carbide');
np('phosphorus-pentoxide', 'water', { rate: 0.1, outA: 'phosphoric-acid', gas: 'steam', gasN: 1, heat: 35, card: 'acid-organic', note: 'P2O5 devours water to become phosphoric acid' }, 'p2o5');
np('sodium', 'ethanol', { rate: 0.08, gas: 'hydrogen', gasN: 1, heat: 12, card: 'alkali-water', note: 'sodium in ethanol: steadier than water, still hydrogen' }, 'na-ethanol');
np('potassium', 'ethanol', { rate: 0.12, gas: 'hydrogen', gasN: 2, heat: 20, card: 'alkali-water' }, 'k-ethanol');
np('aluminium', 'sodium-hydroxide', { rate: 0.05, gas: 'hydrogen', gasN: 2, outB: 'aluminium-chloride-sol', card: 'amphoteric', note: 'aluminium dissolves in caustic soda (stand-in product: its chloride sol)' }, 'al-naoh');
np('zinc', 'sodium-hydroxide', { rate: 0.03, gas: 'hydrogen', gasN: 1, outB: 'zinc-chloride-sol', card: 'amphoteric' }, 'zn-naoh');
np('ammonium-nitrate', 'water', { rate: 0.05, heat: -12, consumeA: false, consumeB: false, card: 'freezing-mixture', note: 'dissolving ammonium nitrate drinks heat — the instant cold pack' }, 'coldpack');
np('salt', 'ice', { rate: 0.07, heat: -12, outB: 'salt-water', card: 'freezing-mixture' }, 'salt-ice');
np('calcium-chloride', 'ice', { rate: 0.08, heat: -18, card: 'freezing-mixture', note: 'calcium chloride + ice reaches −40 °C in real freezing mixtures' }, 'cacl2-ice');
np('iron-powder', 'sulfur-powder', { rate: 0.04, tintTo: 0x2A2A2A, heat: 30, needs: 'heated', card: 'sulfide', note: 'heated iron + sulfur → black iron sulfide (tint carries it; no FeS entry in table)' }, 'fe-s');
np('magnesium', 'oxygen', { rate: 0.1, outA: 'magnesium-oxide', heat: 150, tintTo: 0xFFFFFF, needs: 'ignited', card: 'combustion', note: 'magnesium burns blinding white in oxygen' }, 'mg-o2');
np('copper', 'oxygen', { rate: 0.02, outA: 'copper-oxide', tintTo: 0x1A1A1A, tempBand: [300, null], card: 'oxidation', note: 'hot copper blackens to copper oxide' }, 'cu-o2');
np('iron', 'steam', { rate: 0.03, outA: 'iron-oxide', gas: 'hydrogen', gasN: 1, tempBand: [400, null], card: 'steam-metal' }, 'fe-steam');
np('magnesium', 'steam', { rate: 0.05, outA: 'magnesium-oxide', gas: 'hydrogen', gasN: 1, tempBand: [300, null], card: 'steam-metal' }, 'mg-steam');
np('chlorine-gas', 'hydrogen', { rate: 0.2, outA: 'hydrogen-chloride-gas', blast: 3, heat: 80, needs: 'ignited', card: 'gas-pop', note: 'sunlight or a spark sets off H2 + Cl2 explosively' }, 'h2-cl2');
np('ammonia-gas', 'hydrogen-chloride-gas', { rate: 0.12, outA: 'ammonium-chloride', tintTo: 0xF5F5F0, card: 'smoke-ring' }, 'nh3-hcl');
np('co2', 'sodium-hydroxide', { rate: 0.06, outB: 'washing-soda-sol', card: 'carbonation' }, 'co2-naoh');
np('methane', 'oxygen', { rate: 0.15, outA: 'co2', gas: 'steam', gasN: 1, heat: 100, needs: 'ignited', card: 'combustion' }, 'ch4-o2');
np('acetylene', 'oxygen', { rate: 0.15, outA: 'co2', gas: 'steam', gasN: 1, heat: 180, needs: 'ignited', tintTo: 0xFFFFFF, card: 'combustion', note: 'oxy-acetylene: the welder\'s 3100 °C flame' }, 'c2h2-o2');
np('silver', 'sulfur-powder', { rate: 0.01, tintTo: 0x2A2A2A, card: 'sulfide', note: 'silver tarnishes black with sulfur — Ag2S' }, 'ag-tarnish');
np('mercury', 'sulfur-powder', { rate: 0.05, tintTo: 0x3A3A3A, card: 'sulfide', note: 'sulfur binds mercury — the classic spill cleanup' }, 'hg-s');
np('cement', 'water', { rate: 0.04, outA: 'cement-solid', heat: 6, card: 'cement-setting' }, 'cement-water');
np('dry-ice', 'ethanol', { rate: 0.1, outA: 'co2', gas: 'fog', gasN: 1, heat: -40, card: 'deep-freeze', note: 'dry ice in ethanol: a −72 °C cold bath' }, 'dryice-ethanol');
np('liquid-nitrogen', 'ethanol', { rate: 0.12, gas: 'fog', gasN: 2, heat: -70, outB: 'frozen-vinegar', tintTo: 0xDCEFF5, card: 'deep-freeze', note: 'ethanol freezes solid in liquid nitrogen (stand-in frozen form)' }, 'ln2-ethanol');

// === W32U-2 famous-pair audit additions (were tier2-only or null) ===
np('potassium-permanganate', 'hydrogen-peroxide', { rate: 0.09, gas: 'oxygen', gasN: 3, tintTo: 0x4A3220, needs: 'mixed', card: 'oxygen-release', note: 'permanganate + peroxide destroy each other: oxygen streams out and the purple dies to brown MnO2' }, 'w32u2-kmno4-h2o2');
np('potassium-permanganate-sol', 'hydrogen-peroxide', { rate: 0.09, gas: 'oxygen', gasN: 3, tintTo: 0x4A3220, needs: 'mixed', card: 'oxygen-release', note: 'purple permanganate solution decolourises as oxygen pours out' }, 'w32u2-kmno4sol-h2o2');
np('silver-nitrate-sol', 'salt-water', { rate: 0.12, outA: 'silver-chloride', tintTo: 0xF5F5F0, needs: 'mixed', card: 'agcl', note: 'white AgCl precipitate — salt water carries the chloride' }, 'w32u2-agno3-saltwater');
np('aluminium-powder', 'copper-oxide', { rate: 0.07, outA: 'aluminium-oxide', outB: 'copper', heat: 700, gas: 'smoke', gasN: 1, needs: 'ignited', tempBand: [400, null], card: 'thermite', note: 'copper thermite: aluminium strips CuO, molten copper sprays — fiercer than iron thermite' }, 'w32u2-cu-thermite');
// === W32U-3 named-pair audit #2: famous pairs whose family outcome was
// null, wrong, or missing the distinct named product ===
C('ostwald', 'Ostwald Process', '4NH3 + 5O2 → 4NO + 6H2O (Pt catalyst, ~850 °C)', 'Ammonia burns over a platinum gauze to nitric oxide — the first step of industrial nitric acid.', 'Watch the ammonia burn pale and the NO drift off to brown in air.');
C('contact-process', 'Contact Process', '2SO2 + O2 ⇌ 2SO3 (V2O5 catalyst, ~450 °C)', 'Sulfur dioxide oxidises to sulfur trioxide over a vanadium catalyst — the heart of sulfuric-acid manufacture.', 'Watch the choking SO2 thicken toward SO3 fumes.');
C('blast-furnace', 'Blast Furnace Reduction', 'Fe2O3 + 3CO → 2Fe + 3CO2', 'Carbon monoxide strips the oxygen from iron ore — how iron has been won for centuries.', 'Watch the red ore darken to iron as CO2 streams away.');
C('water-gas-shift', 'Water-Gas Shift', 'CO + H2O ⇌ CO2 + H2 (iron-oxide catalyst)', 'Steam over hot carbon monoxide swaps to carbon dioxide and extra hydrogen — a hydrogen-boosting step.', 'Watch hydrogen stream off as the CO disappears.');
C('haber', 'Haber Process', 'N2 + 3H2 ⇌ 2NH3 (iron catalyst, ~450 °C, ~200 atm)', 'Nitrogen and hydrogen combine only under fierce pressure and heat — the reaction that feeds half the world.', 'It needs the pressure: at ordinary pressure nothing happens at all.');
C('reforming', 'Steam Reforming', 'CH4 + H2O → CO + 3H2 (~800 °C, Ni catalyst)', 'Methane and steam over hot nickel give syngas — the world\'s main hydrogen source.', 'Watch hydrogen pour off the hot mixture.');
C('hydration-ethene', 'Ethene Hydration', 'C2H4 + H2O → C2H5OH (~300 °C, 60 atm, H3PO4 catalyst)', 'Steam adds across ethene\'s double bond under pressure to make industrial ethanol.', 'Needs pressure and heat together — neither alone will do it.');
C('bayer', 'Bayer Process', 'Al2O3·xH2O + 2NaOH → 2NaAlO2 + water', 'Hot caustic soda dissolves the alumina out of bauxite, leaving the red mud behind — aluminium starts here.', 'Watch the red-brown mud settle as the alumina dissolves away.');
C('tarnish-clean', 'Tarnish Cleaning', 'citric acid + Cu tarnish → clean copper', 'The citric acid in lemon juice dissolves the dark oxide tarnish on copper — the classic kitchen shine.', 'Watch the copper brighten back to salmon pink.');
C('ni3', 'Nitrogen Triiodide', 'NH3 + iodine → NI3·NH3 (contact explosive when dry)', 'Ammonia and iodine make a black solid so touchy that a feather sets it off dry — a famous, dangerous demo.', 'Wet it is a stain; the purple puff only comes when it dries.');
C('respiration', 'Respiration / Glucose Combustion', 'C6H12O6 + 6O2 → 6CO2 + 6H2O', 'Glucose oxidised completely gives carbon dioxide and water — in cells it is respiration, lit it is a clean burn.', 'Watch it burn steadily, breathing out CO2.');
C('baking-fizz', 'Baking Powder + Water', 'NaHCO3 + acid salt + H2O → CO2↑', 'Baking powder carries its own acid — plain water wakes it and the CO2 fizz rises.', 'Watch the bubbles start the moment it gets wet.');
C('rust', 'Rust', '4Fe + 3O2 + water → Fe2O3·xH2O', 'Salt water rusts iron far faster than fresh: chloride breaks the protective film and the orange rot spreads.', 'Watch the orange crust creep from every wet edge.');
C('acid-mine', 'Acid Mine Drainage', '4FeS2 + 15O2 + water → iron oxides + sulfuric acid', 'Pyrite exposed to air and water slowly oxidises, staining streams orange and souring them with acid.', 'Watch the brassy gold dull to rust-orange.');
C('lightning-fixation', 'Lightning Fixes Nitrogen', 'N2 + O2 → 2NO (in the arc channel)', 'A lightning channel is hot enough to force nitrogen and oxygen together — rain then carries the fixed nitrogen down.', 'Watch the arc channel glow where the NO forms.');
C('carbothermic', 'Carbothermic Silicon', 'SiO2 + 2C → Si + 2CO (~2000 °C)', 'At furnace heat carbon steals sand\'s oxygen, leaving silicon — how metallurgical silicon is made.', 'It needs real furnace heat; below that, sand and charcoal just sit.');
np('ammonia-gas', 'oxygen', { rate: 0.12, outA: 'nitric-oxide', gas: 'steam', gasN: 1, heat: 80, needs: 'ignited', card: 'ostwald', note: 'Ostwald: ammonia burns over platinum to nitric oxide' }, 'w32u3-ostwald');
np('sulfur-dioxide', 'oxygen', { rate: 0.03, outA: 'sulfur-trioxide', heat: 20, needs: 'heated', tempBand: [400, null], card: 'contact-process', note: 'Contact process: SO2 oxidises to SO3 over a catalyst' }, 'w32u3-contact');
np('carbon-monoxide', 'iron-oxide', { rate: 0.05, outB: 'iron', gas: 'co2', gasN: 2, heat: 30, needs: 'heated', tempBand: [400, null], card: 'blast-furnace', note: 'blast furnace: CO reduces iron ore to iron' }, 'w32u3-blast');
np('carbon-monoxide', 'steam', { rate: 0.04, outA: 'co2', gas: 'hydrogen', gasN: 1, heat: 10, needs: 'heated', tempBand: [300, null], card: 'water-gas-shift', note: 'water-gas shift: CO + steam → CO2 + hydrogen' }, 'w32u3-shift');
np('hydrogen', 'nitrogen', { rate: 0.02, outA: 'ammonia-gas', heat: 15, needs: 'pressurised', tempBand: [400, null], card: 'haber', note: 'Haber process: needs pressure, heat and an iron catalyst' }, 'w32u3-haber');
np('methane', 'steam', { rate: 0.05, outA: 'carbon-monoxide', gas: 'hydrogen', gasN: 3, heat: -20, needs: 'heated', tempBand: [700, null], card: 'reforming', note: 'steam reforming: methane + steam → syngas' }, 'w32u3-reforming');
np('ethylene', 'steam', { rate: 0.03, outA: 'ethanol', heat: 5, needs: 'pressurised', tempBand: [250, null], card: 'hydration-ethene', note: 'ethene hydration: steam adds across the double bond under pressure' }, 'w32u3-hydration');
np('bauxite', 'sodium-hydroxide', { rate: 0.03, tintTo: 0x8A4A2A, heat: 8, needs: 'heated', card: 'bayer', note: 'Bayer process: caustic soda dissolves the alumina, red mud remains' }, 'w32u3-bayer');
np('lemon-juice', 'copper', { rate: 0.02, tintTo: 0xD88A5B, consumeA: false, consumeB: false, card: 'tarnish-clean', note: 'citric acid strips the tarnish — the copper brightens' }, 'w32u3-lemon-copper');
np('ammonia-solution', 'iodine-tincture', { rate: 0.04, tintTo: 0x2A1A2A, card: 'ni3', note: 'nitrogen triiodide forms — a contact explosive when dry (kept wet and safe here)' }, 'w32u3-ni3');
np('glucose-powder', 'oxygen', { rate: 0.1, gas: 'co2', gasN: 2, heat: 60, needs: 'ignited', card: 'respiration', note: 'glucose oxidises completely — respiration chemistry, CO2 and water' }, 'w32u3-respiration');
np('yeast', 'glucose-powder', { rate: 0.03, outB: 'ethanol', gas: 'co2', gasN: 2, needs: 'mixed', card: 'fermentation', note: 'fermentation: yeast turns glucose to ethanol and CO2' }, 'w32u3-ferment-powder');
np('yeast', 'glucose-sol', { rate: 0.035, outB: 'ethanol', gas: 'co2', gasN: 2, needs: 'mixed', card: 'fermentation', note: 'fermentation: yeast turns dissolved glucose to ethanol and CO2' }, 'w32u3-ferment-sol');
np('baking-powder', 'water', { rate: 0.08, gas: 'co2', gasN: 2, heat: -1, needs: 'mixed', card: 'baking-fizz', note: 'baking powder carries its own acid — water alone wakes the fizz' }, 'w32u3-baking-powder');
np('iron', 'salt-water', { rate: 0.008, outA: 'iron-oxide', tintTo: 0xA85B2A, card: 'rust', note: 'salt water rusts iron far faster than fresh water' }, 'w32u3-rust');
np('hydrogen-peroxide', 'baking-soda-sol', { rate: 0.05, gas: 'oxygen', gasN: 1, tintTo: 0xEDEDE6, card: 'oxygen-release', note: 'the cleaning fizz: bicarbonate buffers while peroxide lets go of its oxygen' }, 'w32u3-peroxide-soda');
np('sulfur-powder', 'oxygen', { rate: 0.09, outA: 'fire', gas: 'sulfur-dioxide', gasN: 1, heat: 60, tintTo: 0x2456C8, needs: 'ignited', card: 'oxidiser-fuel', note: 'sulfur burns in oxygen with a blue flame → SO2' }, 'w32u3-sulfur-o2');
np('pyrite', 'oxygen', { rate: 0.006, tintTo: 0x8A5B2A, consumeA: false, consumeB: false, tempBand: [null, 200], card: 'acid-mine', note: 'pyrite weathers in air — acid mine drainage in miniature' }, 'w32u3-pyrite');
np('nitrogen', 'oxygen', { rate: 0.05, outA: 'nitric-oxide', heat: 40, needs: 'electrified', card: 'lightning-fixation', note: 'the arc forces N2 + O2 → NO — lightning fixes nitrogen' }, 'w32u3-n-fixation');
np('sand', 'charcoal-powder', { rate: 0.02, outA: 'silicon', gas: 'carbon-monoxide', gasN: 2, heat: 100, needs: 'heated', tempBand: [1200, null], card: 'carbothermic', note: 'carbothermic: carbon strips sand to silicon at furnace heat' }, 'w32u3-carbothermic');

// ===========================================================================
// === W32U-4 SYSTEMATIC GRIDS ===
// Systematic authored grids built from chemdata (E°, Ksp, pKa) and the
// table's own cation/anion fields. Every record routes through gnp(), which
// dedupes against ALL pairs authored so far (any axis) — a grid never
// overrides a famous pair, and never duplicates another grid. Products are
// real table keys only (cation|anion solution map, solFor, kspFor solids,
// oxideKey); where no honest product exists the outcome is tint/gas/heat
// only. Fun fluids (keys ending -fun) are not real chemicals and are
// excluded from every grid.
C('decomposition', '{a} Breaks Down (Heat)', 'compound + heat → simpler products + gas', 'Heat alone breaks the compound apart into simpler substances — thermal decomposition.', 'Watch gas stream off as the hot solid crumbles into its oxide.');
C('esterification', '{a} + {b} → Esterification', 'carboxylic acid + alcohol ⇌ ester + water (warm, acid catalyst)', 'A carboxylic acid and an alcohol slowly join into an ester — the fruity-smelling family behind many flavours.', 'Warm it gently: a faint fruity smell is the ester forming (trace amounts).');
const _gridSeen = new Set();
for (const [a, b] of _pairs) { const ia = R(a).id, ib = R(b).id; _gridSeen.add(Math.min(ia, ib) * 4096 + Math.max(ia, ib)); }
export const GRID_COUNTS = {};
function gnp(gid, a, b, f) {
  if (!a || !b || a === b) return;
  const ra = R(a), rb = R(b); if (!ra || !rb) return;
  const k = Math.min(ra.id, rb.id) * 4096 + Math.max(ra.id, rb.id);
  if (_gridSeen.has(k)) return;
  const before = _pairs.length;
  np(a, b, { ...f, grid: gid }, 'grid-' + gid);
  if (_pairs.length > before) { _gridSeen.add(k); GRID_COUNTS[gid] = (GRID_COUNTS[gid] || 0) + 1; }
}
const reactiveNow = () => _pairs.reduce((n, p) => n + (p[2].kind !== 'inert' ? 1 : 0), 0);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// cation|anion -> solution key, from the salt-sol records themselves
const SOL_MAP = new Map();
for (const s of ALL) if (s.profile === 'salt-sol' && s.cation && s.anion) {
  const k = s.cation + '|' + s.anion;
  if (!SOL_MAP.has(k) || SOL_MAP.get(k) === 'brine') SOL_MAP.set(k, s.key);
}
const solMapGet = (cat, an) => { if (!cat || !an) return null; const k = SOL_MAP.get(cat + '|' + an); return k && has(k) ? k : null; };
// acid key -> anion code / anion word (for the solution map and solFor)
const ACID_ANION_CODE = { 'hydrochloric-acid': 'cl', 'sulfuric-acid': 'so4', 'nitric-acid': 'no3', 'acetic-acid': 'acetate', 'phosphoric-acid': 'po4', 'hydrobromic-acid': 'br', 'hydrofluoric-acid': 'f', 'apple-cider-vinegar': 'acetate', 'toilet-cleaner': 'cl', 'sulfurous-acid': 'so3', 'carbonic-acid': 'co3' };
const ACID_ANION_WORD = { 'hydrochloric-acid': 'chloride', 'sulfuric-acid': 'sulfate', 'nitric-acid': 'nitrate', 'acetic-acid': 'acetate', 'phosphoric-acid': 'phosphate', 'hydrobromic-acid': 'bromide', 'hydrofluoric-acid': 'fluoride', 'apple-cider-vinegar': 'acetate', 'toilet-cleaner': 'chloride' };
const OXIDISING_ACIDS = new Set(['nitric-acid', 'aqua-regia', 'perchloric-acid', 'chromic-acid']);
const acidPka = (s) => (s.pka != null ? s.pka : (PKA_BY_KEY[s.key] != null ? PKA_BY_KEY[s.key] : null));
const acidStr = (s) => { if (s.acidStrength != null) return s.acidStrength; const p = acidPka(s); return p != null ? clampN((5 - p) / 8, 0.05, 0.5) : 0.2; };
const ACID_LIQUIDS = ALL.filter((s) => s.profile === 'acid' && s.cls === 'liquid' && !s.key.endsWith('-fun'));
const SALT_SOLS = ALL.filter((s) => s.profile === 'salt-sol' && s.cation && s.anion);
// metal forms for the metal grids: chunk (solid) + powder + ribbon, molten out
const METAL_FORMS = ALL.filter((s) => s.profile === 'metal' && (s.cls === 'solid' || s.cls === 'powder' || s.key.endsWith('-ribbon')) && !s.key.endsWith('-molten'));
const formF = (s) => (s.cls === 'powder' ? 1.8 : (s.key.endsWith('-ribbon') ? 1.2 : 1));
const ATTACKER_CATION = { titanium: 'ti2', beryllium: 'be2', manganese: 'mn2', chromium: 'cr3', cadmium: 'cd2', cobalt: 'co2', nickel: 'ni2', tin: 'sn2', lead: 'pb2', zinc: 'zn2', iron: 'fe2', magnesium: 'mg', aluminium: 'al3', copper: 'cu2', silver: 'ag' };
function attackerCation(m) {
  const salt = m.saltKey && has(m.saltKey) ? R(m.saltKey) : null;
  if (salt && salt.cation) return salt.cation;
  return ATTACKER_CATION[baseKey(m.key)] || null;
}
function e0ForMetal(m) {
  const e = e0ForElement(baseKey(m.key));
  if (e != null) return e;
  const cat = attackerCation(m);
  return cat ? e0ForCation(cat) : null;
}
const fmtE2 = (v) => (v > 0 ? '+' : '') + v.toFixed(2);
// base pool shared by grids (d)/(h)/(o): real bases, not carbonate solutions
// (grid c owns those), not bleach (acid+bleach is chlorine chemistry), not fun.
const BASE_CATION = { 'sodium-hydroxide': 'na', 'potassium-hydroxide': 'k', 'caustic-soda': 'na', 'caustic-potash': 'k', limewater: 'ca', 'slaked-lime': 'ca', quicklime: 'ca', 'lime-powder': 'ca', 'barium-hydroxide-sol': 'ba', 'lithium-hydroxide-sol': 'li', 'ammonia-solution': 'nh4', 'milk-of-magnesia': 'mg' };
const BASE_POOL = ALL.filter((s) => s.profile === 'base' && BASE_CATION[s.key]);
const baseStr = (s) => (s.ph != null ? clampN((s.ph - 7) / 7, 0.1, 1) : 0.6);

// --- grid (c) acid-carbonate: acid liquids × carbonate/bicarbonate fam ---
{
  const carbs = ALL.filter((s) => (hasFam(s, 'carbonate') || hasFam(s, 'bicarbonate')) && s.key !== 'co2' && s.key !== 'soda-water');
  for (const a of ACID_LIQUIDS) for (const cb of carbs) {
    const prod = cb.cation ? solMapGet(cb.cation, ACID_ANION_CODE[a.key]) : null;
    gnp('acid-carbonate', a.key, cb.key, { rate: 0.02 + 0.1 * acidStr(a), gas: 'co2', gasN: 2, heat: -1, outB: prod, card: 'acid-carbonate', note: `${a.name} + ${cb.name}: carbonate fizz — CO2 released${prod ? `, leaving ${R(prod).name}` : ''}` });
  }
}
// --- grid (d) acid-base: acid liquids × base pool ---
for (const a of ACID_LIQUIDS) for (const b of BASE_POOL) {
  const prod = solMapGet(BASE_CATION[b.key], ACID_ANION_CODE[a.key]);
  gnp('acid-base', a.key, b.key, { rate: 0.08 + 0.06 * acidStr(a), heat: Math.round(4 + 10 * acidStr(a) * baseStr(b)), outB: prod, card: 'neutralisation', note: `neutralisation: ${a.name} + ${b.name} → ${prod ? R(prod).name : 'a salt'} + water, heat released` });
}
// --- grid (a) displacement: eligible metal forms × salt solutions ---
for (const m of METAL_FORMS) {
  const eM = e0ForMetal(m); if (eM == null || eM >= -0.1) continue;
  const cat = attackerCation(m); if (!cat) continue;
  const rank = CATION_RANK[cat];
  if (rank != null && rank >= 85) continue; // alkali/alkaline-earth attack water first
  for (const s of SALT_SOLS) {
    const eC = e0ForCation(s.cation); if (eC == null) continue;
    const dE = eC - eM; if (dE < 0.05) continue;
    const plated = CATION_METAL[s.cation]; if (!plated || !has(plated)) continue;
    const prod = solMapGet(cat, s.anion);
    gnp('displacement', m.key, s.key, { rate: clampN((0.02 + 0.25 * Math.min(1, dE)) * formF(m), 0.005, 0.3), outA: plated, outB: prod, heat: 4, tintTo: R(plated).col ? R(plated).col[1] : null, card: 'displacement', note: `displacement: E° ${baseKey(m.key)} ${fmtE2(eM)} V < E° ${s.cation} ${fmtE2(eC)} V — ${m.name} displaces ${R(plated).name} from ${s.name}` });
  }
}
// --- grid (b) metal-acid: metal forms × acid liquids ---
for (const m of METAL_FORMS) {
  const eM = e0ForMetal(m); if (eM == null) continue;
  for (const a of ACID_LIQUIDS) {
    const str = acidStr(a), word = ACID_ANION_WORD[a.key];
    const prod = word ? solFor(m, word) : null;
    if (a.key === 'sulfuric-acid') { // hot concentrated sulfuric is oxidising
      if (eM >= 1.6) continue;
      gnp('metal-acid', m.key, a.key, { rate: clampN((0.01 + 0.1 * str) * formF(m), 0.005, 0.3), gas: 'sulfur-dioxide', gasN: 1, outA: prod, outB: prod, heat: 12, tempBand: [120, null], card: 'acid-metal', note: `hot concentrated sulfuric acid oxidises ${m.name} — SO2 gas, E° ${fmtE2(eM)} V` });
    } else if (OXIDISING_ACIDS.has(a.key)) {
      if (eM >= 1.6) continue;
      const gas = (a.key === 'nitric-acid' || a.key === 'aqua-regia') && has('nitrogen-dioxide') ? 'nitrogen-dioxide' : null;
      gnp('metal-acid', m.key, a.key, { rate: clampN((0.01 + 0.11 * str * (0.3 + 0.7 * Math.min(1, (1.6 - eM) / 1.6))) * formF(m), 0.005, 0.3), gas, gasN: gas ? 1 : 0, outA: prod, outB: prod, heat: 10, tintTo: gas ? 0x8A5B2A : null, card: 'acid-metal', note: `oxidising acid dissolves ${m.name} (E° ${fmtE2(eM)} V)${gas ? ' — brown NO2 fumes' : ''}` });
    } else {
      if (eM >= 0) continue; // non-oxidising acids cannot touch E° >= 0 metals
      const gap = Math.min(1, -eM / 1.8);
      gnp('metal-acid', m.key, a.key, { rate: clampN((0.01 + 0.13 * str * (0.25 + 0.75 * gap)) * formF(m), 0.005, 0.3), gas: 'hydrogen', gasN: gap > 0.5 ? 2 : 1, outA: prod, outB: prod, heat: Math.round(4 + 10 * str), card: 'acid-metal', note: `${m.name} + ${a.name} → ${prod ? R(prod).name : 'metal salt (dissolves)'} + H2↑ (E° ${fmtE2(eM)} V)` });
    }
  }
}
// --- grid (e) base-precipitation: soluble hydroxides × salt solutions ---
{
  const HYDROX_TINT_X = { ...HYDROX_TINT, sn2: 0xE8E4DA, be2: 0xF0F0EA, sb3: 0xF5F5F0, bi3: 0xF5F5F0, hg2: 0xE23B2E, cd2: 0xF5F5F0, mn2: 0xE8C8B0 };
  const AMMONIA_COMPLEX = new Set(['cu2', 'zn2', 'ni2', 'co2', 'ag']);
  const HYDROX_SOURCES = ['sodium-hydroxide', 'potassium-hydroxide', 'limewater', 'barium-hydroxide-sol', 'lithium-hydroxide-sol', 'ammonia-solution'].filter(has);
  for (const bk of HYDROX_SOURCES) {
    const b = R(bk), bCat = BASE_CATION[bk]; if (!bCat) continue;
    for (const s of SALT_SOLS) {
      if (solubilityClass(s.cation, 'oh') !== 'insoluble') continue;
      const spectator = solMapGet(bCat, s.anion);
      if (bk === 'ammonia-solution' && AMMONIA_COMPLEX.has(s.cation)) {
        gnp('base-precipitation', bk, s.key, { rate: 0.07, tintTo: HYDROX_TINT_X[s.cation] || 0xE8E8E8, outB: spectator, card: 'precipitation', note: `${s.cation} hydroxide forms, then dissolves in excess ammonia as a complex` });
        continue;
      }
      const k = kspFor(s.cation, 'oh');
      const solid = k && k.solid && has(k.solid) ? k.solid : null;
      gnp('base-precipitation', bk, s.key, { rate: 0.09, outA: solid, outB: spectator, tintTo: solid ? null : (HYDROX_TINT_X[s.cation] || 0xE8E8E8), card: 'precipitation', note: `${b.name} precipitates ${s.cation} hydroxide from ${s.name}${k ? ` (Ksp ${k.ksp.toExponential(1)})` : ''}${solid ? ` — ${R(solid).name}` : ''}` });
    }
  }
}
// --- grid (f) metathesis: salt solution × salt solution ion swap ---
for (let i = 0; i < SALT_SOLS.length; i++) for (let j = i + 1; j < SALT_SOLS.length; j++) {
  const A = SALT_SOLS[i], B = SALT_SOLS[j];
  if (A.cation === B.cation || A.anion === B.anion) continue;
  const combos = [[A.cation, B.anion], [B.cation, A.anion]];
  const info = combos.map(([cat, an]) => { const k = kspFor(cat, an); return { cat, an, k, precip: solubilityClass(cat, an) === 'insoluble' || (k != null && k.ksp <= KSP_PRECIP_MAX) }; });
  const prec = info.filter((x) => x.precip);
  if (!prec.length) continue;
  prec.sort((x, y) => ((x.k ? x.k.ksp : 1e-9) - (y.k ? y.k.ksp : 1e-9)));
  const win = prec[0], other = info.find((x) => x !== win);
  const solid = win.k && win.k.solid && has(win.k.solid) ? win.k.solid : null;
  const tint = (PRECIP[win.cat] && PRECIP[win.cat][win.an]) ? PRECIP[win.cat][win.an][1] : 0xF5F5F0;
  const outB = other ? solMapGet(other.cat, other.an) : null;
  gnp('metathesis', A.key, B.key, { rate: 0.09, outA: solid, outB, tintTo: solid ? null : tint, card: 'precipitation', note: `metathesis: ${win.cat}|${win.an} precipitates${win.k ? ` (Ksp ${win.k.ksp.toExponential(1)})` : ''}${solid ? ` — ${R(solid).name} crashes out` : ' as an insoluble salt'}${prec.length > 1 ? `; ${prec[1].cat}|${prec[1].an} is also insoluble` : ''}` });
}
// --- grid (f2) sulfite/thiosulfate solutions+solids × acids → SO2 ---
for (const s of ALL) {
  if (!(s.anion === 'so3' || s.anion === 's2o3') || !(s.cls === 'liquid' || s.cls === 'powder' || s.cls === 'solid')) continue;
  for (const a of ACID_LIQUIDS) gnp('sulfite-acid', a.key, s.key, { rate: 0.04 + 0.08 * acidStr(a), gas: 'sulfur-dioxide', gasN: 1, tintTo: 0xE8E8B0, card: 'acid-carbonate', note: `acid frees SO2 from ${s.name} (${s.anion === 'so3' ? 'sulfite' : 'thiosulfate'})` });
}
// --- grid (g) halogen-displacement ---
{
  const HAL_EL = { 'fluorine-gas': 'f', 'oxygen-difluoride': 'f', 'chlorine-gas': 'cl', 'chlorine-trifluoride': 'cl', 'chlorine-dioxide': 'cl', bromine: 'br', iodine: 'i', 'iodine-tincture': 'i' };
  const HAL_ORDER = { f: 0, cl: 1, br: 2, i: 3 };
  const HAL_TINT = { br: 0xB84A1E, i: 0x6B3A8A, cl: 0xC8E86B };
  const halogens = REACTIVE_HALOGENS.filter((k) => HAL_EL[k]);
  for (const hk of halogens) {
    const el = HAL_EL[hk];
    for (const s of SALT_SOLS) {
      if (!['cl', 'br', 'i'].includes(s.anion)) continue;
      if (HAL_ORDER[el] >= HAL_ORDER[s.anion]) continue;
      const prod = solMapGet(s.cation, el);
      gnp('halogen-displacement', hk, s.key, { rate: 0.06, tintTo: HAL_TINT[s.anion], outB: prod, card: 'halogen-displacement', note: `${R(hk).name} displaces ${s.anion === 'cl' ? 'chlorine' : s.anion === 'br' ? 'bromine' : 'iodine'} from ${s.name} — the freed halogen colours the solution` });
    }
  }
}
// --- grid (h) oxide-acid / acidic-oxide-base ---
{
  const oxideMetal = new Map(); // oxide key -> metal record (chunk form preferred)
  for (const m of ALL) if (m.profile === 'metal' && m.oxideKey && has(m.oxideKey)) {
    if (!oxideMetal.has(m.oxideKey) || m.cls === 'solid') oxideMetal.set(m.oxideKey, m);
  }
  const basicOxides = ALL.filter((s) => s.key.endsWith('-oxide') && (s.cls === 'solid' || s.cls === 'powder') && oxideMetal.has(s.key));
  for (const ox of basicOxides) {
    const m = oxideMetal.get(ox.key), cat = attackerCation(m);
    for (const a of ACID_LIQUIDS) {
      const prod = (cat && ACID_ANION_CODE[a.key]) ? (solMapGet(cat, ACID_ANION_CODE[a.key]) || (ACID_ANION_WORD[a.key] ? solFor(m, ACID_ANION_WORD[a.key]) : null)) : null;
      gnp('oxide-acid', a.key, ox.key, { rate: 0.03 + 0.06 * acidStr(a), heat: 3, outB: prod, card: 'acid-oxide', note: `${ox.name} (a basic oxide) neutralises ${a.name}${prod ? ` → ${R(prod).name}` : ' — dissolves to its salt'}` });
    }
  }
  const ACIDIC_OXIDE_ANION = { 'sulfur-dioxide': 'so3', 'sulfur-trioxide': 'so4', 'nitrogen-dioxide': 'no3', 'phosphorus-pentoxide': 'po4', 'silicon-oxide': null };
  for (const ok of Object.keys(ACIDIC_OXIDE_ANION)) {
    if (!has(ok)) continue;
    for (const b of BASE_POOL) {
      const prod = ACIDIC_OXIDE_ANION[ok] ? solMapGet(BASE_CATION[b.key], ACIDIC_OXIDE_ANION[ok]) : null;
      gnp('oxide-base', ok, b.key, { rate: 0.03, heat: 2, outB: prod, tintTo: prod ? null : 0xE8E8D8, card: 'neutralisation', note: `acidic oxide ${R(ok).name} is absorbed by ${b.name}${prod ? ` → ${R(prod).name}` : ' — a salt forms slowly'}` });
    }
  }
}
// --- grid (i) thermal decomposition: heater-cell / fire × decomposables ---
{
  const CA_OXIDE = { chalk: 'quicklime', limestone: 'quicklime', marble: 'quicklime', eggshell: 'quicklime', coral: 'quicklime', seashell: 'quicklime', pearl: 'quicklime', bone: 'quicklime', malachite: 'copper-oxide', azurite: 'copper-oxide' };
  const GROUP1_CARBONATES = new Set(['washing-soda', 'soda-ash', 'potassium-carbonate', 'sodium-percarbonate', 'lithium-carbonate']);
  const heatSrc = ['heater-cell', 'fire'].filter(has);
  const decomp = []; // [key, outKey|null, gas|null, band, note]
  for (const s of ALL) {
    if (!(s.cls === 'solid' || s.cls === 'powder')) continue;
    if (hasFam(s, 'carbonate') && !hasFam(s, 'bicarbonate') && !GROUP1_CARBONATES.has(s.key)) {
      let ox = CA_OXIDE[s.key] || null;
      if (!ox && s.key.endsWith('-carbonate')) { const m = R(s.key.slice(0, -'-carbonate'.length)); if (m && m.oxideKey && has(m.oxideKey)) ox = m.oxideKey; }
      if (ox && has(ox)) decomp.push([s.key, ox, 'co2', [300, null], `thermal decomposition: ${s.name} → ${R(ox).name} + CO2↑`]);
    } else if (hasFam(s, 'bicarbonate')) {
      if (s.key === 'sodium-bicarbonate') decomp.push([s.key, has('washing-soda') ? 'washing-soda' : null, 'co2', [300, null], 'baking soda decomposes to washing soda + CO2 + steam']);
      else if (s.key === 'ammonium-bicarbonate') decomp.push([s.key, null, 'ammonia-gas', [300, null], 'ammonium bicarbonate decomposes fully to gases (NH3 + CO2 + steam)']);
    } else if (s.key.includes('nitrate')) {
      if (s.key === 'sodium-nitrate') decomp.push([s.key, has('sodium-nitrite') ? 'sodium-nitrite' : null, 'oxygen', [500, null], 'sodium nitrate decomposes to the nitrite + oxygen']);
      else if (s.key === 'ammonium-nitrate') { if (has('nitrous-oxide')) decomp.push([s.key, null, 'nitrous-oxide', [500, null], 'ammonium nitrate decomposes to nitrous oxide + steam']); }
      else if (s.key === 'urea-nitrate') { /* organic nitrate — no honest oxide product */ }
      else {
        let ox = CA_OXIDE[s.key] || null;
        if (!ox && s.key.endsWith('-nitrate')) { const m = R(s.key.slice(0, -'-nitrate'.length)); if (m && m.oxideKey && has(m.oxideKey)) ox = m.oxideKey; }
        decomp.push([s.key, ox && has(ox) ? ox : null, 'nitrogen-dioxide', [500, null], `nitrate decomposition: ${s.name} → ${ox && has(ox) ? R(ox).name : 'its oxide'} + NO2↑ + O2`]);
      }
    } else if (s.key.endsWith('-hydroxide')) {
      const m = ALL.find((x) => x.profile === 'metal' && x.oxideKey === s.key.replace('-hydroxide', '-oxide'));
      const ox = s.key === 'slaked-lime' ? 'quicklime' : s.key.replace('-hydroxide', '-oxide');
      if (has(ox)) decomp.push([s.key, ox, 'steam', [300, null], `hydroxide decomposition: ${s.name} → ${R(ox).name} + steam`]);
    } else if (s.key.startsWith('ammonium-')) {
      decomp.push([s.key, null, 'ammonia-gas', [300, null], `${s.name} releases ammonia gas on heating`]);
    }
  }
  for (const hk of heatSrc) for (const [key, out, gas, band, note] of decomp) {
    gnp('thermal-decomposition', hk, key, { rate: 0.04, outB: out, gas, gasN: gas ? 1 : 0, heat: 10, needs: 'heated', tempBand: band, card: 'decomposition', note });
  }
}
// --- grid (j) organic: combustion / esterification / saponification ---
for (const s of ALL) {
  if ((s.flammability || 0) < 0.4) continue;
  if (!((s.fams || []).includes('organic') || ['fuel', 'oil', 'food', 'wax', 'wood', 'plant', 'soap', 'solvent'].includes(s.profile))) continue;
  gnp('combustion', s.key, 'oxygen', { rate: 0.05 + 0.1 * s.flammability, outA: s.burnTo && has(s.burnTo) ? s.burnTo : null, gas: s.flammability >= 0.8 ? 'smoke' : 'co2', gasN: 1, heat: Math.round(40 + 80 * s.flammability), needs: 'ignited', card: 'combustion', note: `${s.name} burns in pure oxygen far fiercer than in air` });
}
{
  const CARBOXYLIC = ['acetic-acid', 'formic-acid', 'lactic-acid', 'citric-acid-sol'].filter(has);
  const ALCOHOLS = ['ethanol', 'methanol', 'isopropanol', 'glycerol', 'ethylene-glycol', 'propylene-glycol'].filter((k) => has(k) && R(k).cls === 'liquid');
  for (const a of CARBOXYLIC) for (const al of ALCOHOLS) {
    gnp('esterification', a, al, { rate: 0.02, tintTo: 0xF2E8D8, heat: 2, needs: 'heated', card: 'esterification', note: `esterification: ${R(a).name} + ${R(al).name} ⇌ a fruity-smelling ester forms (trace) + water` });
  }
  const NON_SAPONIFIABLE = new Set(['mineral-oil', 'motor-oil', 'crude-oil', 'transformer-oil', 'silicone-oil', 'hydraulic-oil', 'brake-fluid', 'turpentine', 'liquid-paraffin', 'immersion-oil', 'sunscreen-lotion', 'face-cream']);
  const oils = ALL.filter((s) => s.profile === 'oil' && s.cls === 'liquid' && !NON_SAPONIFIABLE.has(s.key));
  for (const o of oils) for (const bk of ['sodium-hydroxide', 'potassium-hydroxide', 'caustic-soda', 'caustic-potash'].filter(has)) {
    gnp('saponification', o.key, bk, { rate: 0.04, outA: has('soap-solution') ? 'soap-solution' : null, heat: 5, needs: 'heated', card: 'saponification', note: `saponification: hot ${R(bk).name} chops ${o.name} into soap + glycerol` });
  }
}
// --- grid (k) reduction: CO / H2 / charcoal × reducible metal oxides ---
{
  const oxideMetal = new Map();
  for (const m of ALL) if (m.profile === 'metal' && m.oxideKey && has(m.oxideKey)) {
    if (!oxideMetal.has(m.oxideKey) || m.cls === 'solid') oxideMetal.set(m.oxideKey, m);
  }
  for (const red of ['carbon-monoxide', 'hydrogen', 'charcoal-powder'].filter(has)) {
    for (const [oxKey, m] of oxideMetal) {
      const ox = R(oxKey); if (!ox || !(ox.cls === 'solid' || ox.cls === 'powder')) continue;
      const eM = e0ForMetal(m);
      // CO/H2/C cannot reduce very electropositive oxides (CaO, MgO, Al2O3):
      // honest window is E° in [-1.2, 0.9).
      if (eM == null || eM >= 0.9 || eM < -1.2) continue;
      const metalKey = baseKey(m.key); if (!has(metalKey)) continue;
      gnp('reduction', red, oxKey, { rate: 0.04, outB: metalKey, gas: red === 'hydrogen' ? 'steam' : 'co2', gasN: 1, heat: 20, needs: 'heated', tempBand: [400, null], card: red === 'carbon-monoxide' ? 'blast-furnace' : 'oxidation', note: `${R(red).name} reduces ${ox.name} to ${R(metalKey).name} at furnace heat (E° ${fmtE2(eM)} V)` });
    }
  }
}
// --- grid (l) electrolysis: salt solutions × electrodes ---
{
  const ELECTRODES = ['graphite', 'carbon-rod', 'copper', 'platinum'].filter(has);
  const ANODE_GAS = { cl: ['chlorine-gas', 'chlorine'], br: ['bromine', 'bromine'] };
  for (const s of ALL) {
    if (s.profile !== 'salt-sol' || s.profile === 'water') continue;
    const [gas, gasName] = ANODE_GAS[s.anion] || ['oxygen', 'oxygen'];
    for (const el of ELECTRODES) {
      gnp('electrolysis', s.key, el, { rate: 0.06, gas, gasN: 2, consumeA: false, consumeB: false, needs: 'electrified', tintTo: s.anion === 'br' ? 0xB84A1E : null, card: 'electrolysis', note: `electrolysis of ${s.name} at ${R(el).name} electrodes: ${gasName} at the anode, hydrogen at the cathode` });
    }
  }
}
// --- grid (m) gap closers — only while the 12,000 reactive floor is unmet ---
if (reactiveNow() < 12000) {
  for (const m of METAL_FORMS) {
    const eM = e0ForMetal(m); if (eM == null || eM >= 0) continue;
    if (m.oxideKey && has(m.oxideKey) && has('steam')) {
      gnp('metal-steam', m.key, 'steam', { rate: 0.03, outA: m.oxideKey, gas: 'hydrogen', gasN: 1, tempBand: [300, null], card: 'steam-metal', note: `red-hot ${m.name} splits steam → ${R(m.oxideKey).name} + H2↑ (E° ${fmtE2(eM)} V)` });
    }
  }
  for (const m of METAL_FORMS) {
    const bk = baseKey(m.key);
    if (['silver', 'gold', 'platinum'].includes(bk)) continue;
    if (has('sulfur-powder')) gnp('metal-sulfur', m.key, 'sulfur-powder', { rate: 0.03, tintTo: 0x2A2A2A, heat: 15, needs: 'heated', card: 'sulfide', note: `heated ${m.name} + sulfur → dark metal sulfide crust` });
    const eM = e0ForMetal(m);
    if (m.oxideKey && has(m.oxideKey) && (eM == null || eM < 0.8)) {
      gnp('metal-oxygen', m.key, 'oxygen', { rate: 0.02, outA: m.oxideKey, heat: 30, needs: 'heated', card: 'oxidation', note: `hot ${m.name} oxidises in pure oxygen → ${R(m.oxideKey).name}` });
    }
  }
}
// --- grids (n)/(o) — only while the floor is still unmet ---
if (reactiveNow() < 12000) {
  const GAS_ANION = { s: 'hydrogen-sulfide', so3: 'sulfur-dioxide', hso3: 'sulfur-dioxide', no2: 'nitrogen-dioxide' };
  for (const s of ALL) {
    const gas = GAS_ANION[s.anion]; if (!gas || !has(gas)) continue;
    if (!(s.profile === 'salt-sol' || s.profile === 'salt-solid')) continue;
    for (const a of ACID_LIQUIDS) gnp('acid-gas-salts', a.key, s.key, { rate: 0.04 + 0.08 * acidStr(a), gas, gasN: 1, card: 'acid-carbonate', note: `acid on ${s.name} releases ${R(gas).name} gas` });
  }
  const ammoniumSubs = ALL.filter((s) => (s.cation === 'nh4' && s.key !== 'electrolyte-paste') || (s.key.startsWith('ammonium-') && (s.cls === 'solid' || s.cls === 'powder')));
  for (const b of BASE_POOL) for (const s of ammoniumSubs) {
    gnp('base-ammonium', b.key, s.key, { rate: 0.05, gas: 'ammonia-gas', gasN: 1, needs: 'mixed', card: 'ammonia-release', note: `${b.name} frees ammonia gas from ${s.name} — the classic ammonium test` });
  }
}
// === W32U-4 GAP-CLOSING GRIDS (X1–X10) ===
// Same counting law: gnp dedupes against every pair authored so far, so each
// block below only ever adds pairs no earlier grid or famous pair covered.
// Products are real table keys only; where no exact product key exists the
// outcome is tint/gas/heat only and the note names the real product.
const ANION_WORD_ALL = { cl: 'chloride', so4: 'sulfate', no3: 'nitrate', br: 'bromide', i: 'iodide', acetate: 'acetate', co3: 'carbonate', hco3: 'bicarbonate', po4: 'phosphate', oh: 'hydroxide', s: 'sulfide', so3: 'sulfite', f: 'fluoride', cro4: 'chromate', scn: 'thiocyanate', s2o3: 'thiosulfate', b4o7: 'borate', ocl: 'hypochlorite', no2: 'nitrite', hso3: 'bisulfite' };
// --- (X1) displacement-full: E° rule with CATION_RANK fallback, product sol optional ---
for (const m of METAL_FORMS) {
  const cat = attackerCation(m); if (!cat) continue;
  const attRank = CATION_RANK[cat];
  if (attRank != null && attRank >= 85) continue; // alkali/alkaline-earth attack water first
  const eM = e0ForMetal(m);
  for (const s of SALT_SOLS) {
    if (s.cation === cat) continue;
    const plated = CATION_METAL[s.cation]; if (!plated || !has(plated)) continue;
    const eC = e0ForCation(s.cation), solRank = CATION_RANK[s.cation];
    let valid = false, citeM, citeC;
    if (eM != null && eC != null) { valid = (eC - eM) >= 0.05; citeM = fmtE2(eM) + ' V'; citeC = fmtE2(eC) + ' V'; }
    else if (attRank != null && solRank != null) { valid = attRank > solRank; citeM = eM != null ? fmtE2(eM) + ' V' : `rank ${attRank}`; citeC = eC != null ? fmtE2(eC) + ' V' : `rank ${solRank}`; }
    if (!valid) continue;
    const outB = solMapGet(cat, s.anion);
    const saltName = outB ? R(outB).name : `${baseKey(m.key)} ${ANION_WORD_ALL[s.anion] || 'salt'}`;
    gnp('displacement-full', m.key, s.key, { rate: clampN(0.03 * formF(m), 0.005, 0.3), outA: plated, outB, heat: 4, tintTo: R(plated).col ? R(plated).col[1] : null, card: 'displacement', note: `displacement: E° ${baseKey(m.key)} ${citeM} < E° ${s.cation} ${citeC} — ${m.name} displaces ${R(plated).name} from ${s.name}; ${saltName} forms in solution` });
  }
}
// --- (X2) metal-acid-full: (i) weak acids × reactive metals, (ii) alloys × bench acids ---
for (const a of ACID_LIQUIDS) {
  if (!((a.acidStrength || 0) > 0 || (PKA_BY_KEY[a.key] != null && PKA_BY_KEY[a.key] < 7))) continue;
  const word = ACID_ANION_WORD[a.key];
  for (const m of METAL_FORMS) {
    const eM = e0ForMetal(m); if (eM == null || eM >= -0.1) continue;
    const prod = word ? solFor(m, word) : null;
    gnp('metal-acid-full', m.key, a.key, { rate: clampN(0.004 + 0.05 * acidStr(a) * formF(m), 0.003, 0.12), gas: 'hydrogen', gasN: 1, outA: prod, outB: prod, heat: 3, card: 'acid-metal', note: 'slow fizz: weak acid + metal -> salt + H2' });
  }
}
{
  const ALLOY_CONSTITUENT = { steel: 'iron', 'stainless-steel': 'iron', brass: 'copper', bronze: 'copper', solder: 'lead', pewter: 'tin', duralumin: 'aluminium', magnalium: 'magnesium', amalgam: 'mercury', nichrome: 'nickel', kanthal: 'iron', 'cast-iron': 'iron', 'wrought-iron': 'iron' };
  const BENCH_ACIDS = ['hydrochloric-acid', 'sulfuric-acid', 'nitric-acid', 'acetic-acid'].filter(has);
  for (const m of ALL) {
    if (m.profile !== 'metal') continue;
    const bk = baseKey(m.key), cons = ALLOY_CONSTITUENT[bk];
    if (!cons || !has(cons) || e0ForElement(bk) != null) continue;
    const eC0 = e0ForElement(cons); if (eC0 == null) continue;
    const consRec = R(cons);
    for (const ak of BENCH_ACIDS) {
      const a = R(ak), word = ACID_ANION_WORD[ak];
      const prod = word ? solFor(consRec, word) : null;
      if (ak === 'nitric-acid') {
        if (eC0 >= 1.6) continue;
        gnp('metal-acid-full', m.key, ak, { rate: clampN(0.03 * formF(m), 0.005, 0.3), gas: has('nitrogen-dioxide') ? 'nitrogen-dioxide' : null, gasN: 1, outA: prod, outB: prod, heat: 10, tintTo: 0x8A5B2A, card: 'acid-metal', note: `alloy (behaves like ${cons}): oxidising nitric acid dissolves ${m.name} (E° ${fmtE2(eC0)} V) — brown NO2 fumes` });
      } else {
        if (eC0 >= 0) continue;
        gnp('metal-acid-full', m.key, ak, { rate: clampN(0.03 * formF(m), 0.005, 0.3), gas: 'hydrogen', gasN: 1, outA: prod, outB: prod, heat: 5, card: 'acid-metal', note: `alloy (behaves like ${cons}): ${m.name} + ${a.name} → ${prod ? R(prod).name : 'metal salt (dissolves)'} + H2↑ (E° ${fmtE2(eC0)} V)` });
      }
    }
  }
}
// --- (X3) acid-carbonate-full: all acid liquids × carbonate/bicarbonate by fam OR anion ---
{
  const carbs = ALL.filter((s) => (hasFam(s, 'carbonate') || hasFam(s, 'bicarbonate') || s.anion === 'co3' || s.anion === 'hco3') && s.key !== 'co2' && s.key !== 'soda-water' && !s.key.endsWith('-fun'));
  for (const a of ACID_LIQUIDS) for (const cb of carbs) {
    const prod = cb.cation ? solMapGet(cb.cation, ACID_ANION_CODE[a.key]) : null;
    gnp('acid-carbonate-full', a.key, cb.key, { rate: clampN((0.02 + 0.1 * acidStr(a)) * (cb.cls === 'liquid' ? 1.4 : 1), 0.005, 0.3), gas: 'co2', gasN: 2, heat: -1, outA: prod, outB: prod, card: 'acid-carbonate', note: `${a.name} + ${cb.name}: carbonate fizz — CO2 released${prod ? `, leaving ${R(prod).name}` : ''}` });
  }
}
// --- (X4) precipitant-solutions: co3/hco3/po4 liquids (any profile) × salt solutions ---
{
  const sources = ALL.filter((s) => s.cls === 'liquid' && s.cation && ['co3', 'hco3', 'po4'].includes(s.anion) && !s.key.endsWith('-fun'));
  for (const src of sources) for (const s of SALT_SOLS) {
    if (src.anion === s.anion || src.cation === s.cation) continue;
    const k = kspFor(s.cation, src.anion);
    if (!(solubilityClass(s.cation, src.anion) === 'insoluble' || (k != null && k.ksp <= KSP_PRECIP_MAX))) continue;
    const solid = k && k.solid && has(k.solid) ? k.solid : null;
    const pTint = (PRECIP[s.cation] && PRECIP[s.cation][src.anion]) ? PRECIP[s.cation][src.anion][1] : (src.anion === 'po4' ? 0xEDEDE6 : 0xF5F5F0);
    const outB = solMapGet(src.cation, s.anion);
    gnp('precipitant-solutions', src.key, s.key, { rate: 0.09, outA: solid, outB, tintTo: solid ? null : pTint, card: 'precipitation', note: `precipitation: ${s.cation}|${src.anion} crashes out of ${s.name} on adding ${src.name}${k ? ` (Ksp ${k.ksp.toExponential(1)})` : ''}${solid ? ` — ${R(solid).name}` : ' as an insoluble salt'}` });
  }
}
// --- (X5) oxidiser-fuel: oxidisers × flammable organic/fuel substances ---
{
  const OX_TOKENS = ['nitrate', 'chlorate', 'perchlorate', 'permanganate', 'dichromate', 'peroxide', 'percarbonate'];
  const oxidisers = ALL.filter((s) => ['powder', 'solid', 'liquid'].includes(s.cls) && (hasFam(s, 'oxidiser') || OX_TOKENS.some((t) => s.key.includes(t))) && !(s.cls === 'liquid' && s.key.includes('-sol')) && !s.key.endsWith('-fun'));
  const fuels = ALL.filter((s) => (s.flammability || 0) >= 0.35 && (s.blast || 0) === 0 && ['powder', 'solid', 'liquid'].includes(s.cls) && (hasFam(s, 'organic') || hasFam(s, 'fuel') || ['fuel', 'oil', 'food', 'wax', 'wood', 'solvent', 'polymer', 'rubber'].includes(s.profile)) && !s.key.endsWith('-fun'));
  for (const ox of oxidisers) for (const f of fuels) {
    if (ox.key === f.key) continue;
    const liquidFuel = f.cls === 'liquid';
    gnp('oxidiser-fuel', ox.key, f.key, { rate: 0.03 + 0.08 * f.flammability, heat: Math.round(40 + 120 * f.flammability), gas: liquidFuel ? 'co2' : 'smoke', gasN: 1, outB: f.burnTo && has(f.burnTo) ? f.burnTo : null, needs: liquidFuel ? 'mixed' : 'ignited', card: 'oxidiser-fuel', note: `pyrotechnic mix: ${ox.name} feeds oxygen to ${f.name} — burns far fiercer than in air` });
  }
}
// --- (X6) halogen-metal-full: reactive halogens × all metal forms ---
{
  const HAL_RATE = { fluoride: 0.14, chloride: 0.08, bromide: 0.06, iodide: 0.04 };
  for (const hk of REACTIVE_HALOGENS) {
    const word = HALOGEN_ANION[hk]; if (!word) continue;
    const isIodine = word === 'iodide';
    for (const m of METAL_FORMS) {
      const eM = e0ForMetal(m);
      if (eM != null) {
        if (isIodine && eM > 0) continue;
        if (!isIodine && word !== 'fluoride' && eM > 1.2) continue;
      }
      gnp('halogen-metal-full', hk, m.key, { rate: clampN((HAL_RATE[word] || 0.05) * formF(m), 0.003, 0.3), outB: solFor(m, word), gas: 'smoke', gasN: 1, tintTo: 0xF08A24, needs: isIodine ? 'heated' : 'contact', card: 'halogen-metal', note: `${R(hk).name} + ${m.name} → metal ${word}, sparks and fumes` });
    }
  }
}
// --- (X7) electrolysis-full: salt solutions × the full electrode set ---
{
  const ELECTRODES_FULL = ['graphite', 'carbon-rod', 'copper', 'platinum', 'iron', 'zinc', 'aluminium', 'silver', 'gold', 'lead', 'tin', 'nickel'].filter(has);
  const ACTIVE_ELECTRODES = new Set(['copper', 'iron', 'zinc', 'aluminium', 'nickel', 'tin', 'lead']);
  for (const s of SALT_SOLS) {
    const gas = s.anion === 'cl' ? 'chlorine-gas' : (s.anion === 'br' ? null : 'oxygen');
    const gasName = s.anion === 'cl' ? 'chlorine' : (s.anion === 'br' ? 'bromine' : 'oxygen');
    for (const el of ELECTRODES_FULL) {
      if (ACTIVE_ELECTRODES.has(el)) {
        gnp('electrolysis-full', s.key, el, { rate: 0.02, gas, gasN: 2, consumeA: false, consumeB: false, needs: 'electrified', tintTo: s.anion === 'br' ? 0xB84A1E : null, card: 'electrolysis', note: `electrolysis of ${s.name} with ${R(el).name} electrodes: active electrode: the anode itself dissolves — products differ from inert-electrode electrolysis` });
      } else {
        gnp('electrolysis-full', s.key, el, { rate: 0.06, gas, gasN: 2, consumeA: false, consumeB: false, needs: 'electrified', tintTo: s.anion === 'br' ? 0xB84A1E : null, card: 'electrolysis', note: `electrolysis of ${s.name} at inert ${R(el).name} electrodes: ${gasName} at the anode, hydrogen at the cathode` });
      }
    }
  }
}
// --- (X8) acid-salt-full: strong acids × salts of weaker acids ---
{
  const strongAcids = ACID_LIQUIDS.filter((a) => acidStr(a) >= 0.6);
  const WEAK_ANIONS = new Set(['acetate', 'no2', 'po4', 'b4o7', 'ocl', 'f', 's2o3', 'hso3', 'scn']);
  const salts = ALL.filter((s) => s.cation && s.anion && WEAK_ANIONS.has(s.anion) && ['liquid', 'powder', 'solid'].includes(s.cls) && !s.key.endsWith('-fun'));
  for (const a of strongAcids) for (const s of salts) {
    if (ACID_ANION_CODE[a.key] && ACID_ANION_CODE[a.key] === s.anion) continue;
    const card = s.anion === 'acetate' ? 'acid-organic' : 'neutralisation';
    const rate = 0.05 + 0.05 * acidStr(a);
    if (s.anion === 'no2') {
      gnp('acid-salt-full', a.key, s.key, { rate, gas: has('nitrogen-dioxide') ? 'nitrogen-dioxide' : null, gasN: 1, tintTo: 0x8A5B2A, card, note: `${a.name} on ${s.name} (nitrite) frees brown nitrogen dioxide fumes` });
    } else if (s.anion === 'ocl') {
      if (a.key === 'hydrochloric-acid') gnp('acid-salt-full', a.key, s.key, { rate, gas: 'chlorine-gas', gasN: 2, tintTo: 0xC8E86B, card, note: `${a.name} on ${s.name} (hypochlorite) frees chlorine gas — never mix bleach with acid` });
      else gnp('acid-salt-full', a.key, s.key, { rate, tintTo: 0xC8E86B, card, note: `${a.name} protonates ocl: hypochlorous acid forms in solution — chlorine risk, handle with care` });
    } else if (s.anion === 'f') {
      gnp('acid-salt-full', a.key, s.key, { rate, tintTo: 0xE8ECEE, card, note: `DANGER: ${a.name} on ${s.name} (fluoride) forms hydrofluoric acid in solution — it etches glass and is deeply toxic` });
    } else {
      gnp('acid-salt-full', a.key, s.key, { rate, tintTo: 0xEDEDE6, card, note: `${a.name} protonates ${s.anion}: the weaker acid forms in solution` });
    }
  }
}
// --- (X9) gas-absorption: soluble gases × neutral aqueous liquids ---
{
  const GAS_TINT = { 'ammonia-gas': 0xD8E8D8, 'hydrogen-chloride-gas': 0xE8D8D8, 'sulfur-dioxide': 0xE8E8B0, 'chlorine-gas': 0xC8E86B, 'nitrogen-dioxide': 0xC88A5B, 'hydrogen-sulfide': 0xD8D8C8, co2: null, 'sulfur-trioxide': null };
  const gases = ['co2', 'ammonia-gas', 'hydrogen-chloride-gas', 'sulfur-dioxide', 'chlorine-gas', 'nitrogen-dioxide', 'hydrogen-sulfide', 'sulfur-trioxide'].filter(has);
  const liquids = ALL.filter((s) => s.cls === 'liquid' && (s.profile === 'water' || hasFam(s, 'aqueous')) && s.profile !== 'acid' && s.profile !== 'base' && !s.key.endsWith('-fun'));
  for (const g of gases) for (const l of liquids) {
    gnp('gas-absorption', g, l.key, { rate: 0.04, tintTo: GAS_TINT[g] != null ? GAS_TINT[g] : null, consumeA: false, card: 'gas-dissolve', note: `${R(g).name} dissolves into ${l.name} (physical absorption)` });
  }
}
// --- (X10) combustion-full: everything flammable × oxygen ---
for (const s of ALL) {
  if ((s.flammability || 0) < 0.5) continue;
  if (!['powder', 'liquid', 'solid', 'gas'].includes(s.cls)) continue;
  if (s.key === 'oxygen' || s.key.endsWith('-fun')) continue;
  gnp('combustion-full', s.key, 'oxygen', { rate: 0.05 + 0.1 * s.flammability, outA: s.burnTo && has(s.burnTo) ? s.burnTo : null, gas: s.flammability >= 0.8 ? 'smoke' : 'co2', gasN: 1, heat: Math.round(40 + 120 * s.flammability), tintTo: s.flameColour != null ? s.flameColour : null, needs: 'ignited', card: 'combustion', note: `${s.name} burns in pure oxygen far faster than in air` });
}
// === W32U-5 REACTIONS-MAX EXTENSIONS (Workstream 2) ===
// Same counting law as X1–X10: every record routes through gnp(), which
// dedupes against ALL pairs authored so far — each block below only adds
// pairs no earlier grid or famous pair covered. Extensions reuse the
// existing grid ids (and their CARDS) wherever the chemistry is the same
// family, so GRID_COUNTS grow inside the established grids.
C('alcohol-metal', '{a} + {b} → Metal Alkoxide + Hydrogen', 'metal + alcohol → alkoxide + H2↑', 'Reactive metals tear the hydroxyl hydrogen off alcohols just as they do off water — slower, but the same hydrogen gas comes off.', 'Watch the steady fizz: the metal is dissolving into an alkoxide solution.');
// --- (Y1) thermal-decomposition extension: chlorates, per-salts, unstable
// oxides, hydrated salts, slaked lime — × the grid's own heat sources ---
{
  const heatSrc = ['heater-cell', 'fire'].filter(has);
  const decomp2 = [
    // [key, outKey|null, gas|null, band, note]
    ['potassium-chlorate', 'potassium-chloride', 'oxygen', [400, null], 'thermal decomposition: potassium chlorate → potassium chloride + O2↑ — the classic lab oxygen prep (MnO2 catalyses it)'],
    ['sodium-chlorate', null, 'oxygen', [400, null], 'thermal decomposition: sodium chlorate → sodium chloride + O2↑ (the chloride stays dissolved/molten in the melt)'],
    ['potassium-perchlorate', 'potassium-chloride', 'oxygen', [550, null], 'thermal decomposition: potassium perchlorate → potassium chloride + O2↑ — needs fiercer heat than the chlorate'],
    ['mercury-oxide', 'mercury', 'oxygen', [450, null], 'thermal decomposition: mercury oxide → mercury + O2↑ — Priestley\'s 1774 oxygen experiment'],
    ['silver-oxide', 'silver', 'oxygen', [300, null], 'thermal decomposition: silver oxide → silver + O2↑ — gentle heat is enough for this noble oxide'],
    ['potassium-permanganate', null, 'oxygen', [240, null], 'thermal decomposition: permanganate → potassium manganate + MnO2 + O2↑ — heating it is another lab oxygen source'],
    ['potassium-dichromate', 'chromium-oxide', 'oxygen', [500, null], 'thermal decomposition: potassium dichromate → potassium chromate + chromium oxide + O2↑ at strong heat'],
    ['sodium-percarbonate', 'soda-ash', 'oxygen', [300, null], 'thermal decomposition: sodium percarbonate → soda ash + O2↑ — it is a solid hydrogen-peroxide carrier'],
    ['sodium-perborate', null, 'oxygen', [300, null], 'thermal decomposition: sodium perborate releases its active oxygen on heating, leaving borate behind'],
    ['washing-soda', 'soda-ash', 'steam', [200, null], 'hydrated salt: washing soda (Na2CO3·10H2O) effloresces on heating → soda ash + steam — it loses its water of crystallisation'],
    ['epsom-salt', null, 'steam', [200, null], 'hydrated salt: Epsom salt (MgSO4·7H2O) drives off its water of crystallisation as steam on heating'],
    ['green-vitriol', null, 'steam', [200, null], 'hydrated salt: green vitriol (FeSO4·7H2O) loses its water of crystallisation as steam; stronger heat then breaks the sulfate down'],
    ['white-vitriol', null, 'steam', [200, null], 'hydrated salt: white vitriol (ZnSO4·7H2O) loses its water of crystallisation as steam on heating'],
    ['ferrous-sulfate', null, 'steam', [200, null], 'hydrated salt: ferrous sulfate heptahydrate dehydrates on heating, steam leaving the pale anhydrous salt'],
    ['copper-sulfate', null, 'steam', [200, null], 'hydrated salt: blue vitriol (CuSO4·5H2O) turns white as its water of crystallisation leaves as steam — add water and the blue returns'],
    ['borax', null, 'steam', [200, null], 'hydrated salt: borax (Na2B4O7·10H2O) swells and froths as its water of crystallisation boils off, then fuses to a glassy bead'],
    ['alum', null, 'steam', [200, null], 'hydrated salt: potash alum melts in its own water of crystallisation on heating and dries to burnt alum, steam escaping'],
    ['gypsum-powder', null, 'steam', [160, null], 'hydrated salt: gypsum (CaSO4·2H2O) loses most of its water near 160 °C → plaster of Paris + steam — that is how plaster is made'],
    ['sodium-sulfate', null, 'steam', [200, null], 'hydrated salt: Glauber\'s salt (Na2SO4·10H2O) melts and dehydrates on gentle heating, steam leaving anhydrous sodium sulfate'],
    ['slaked-lime', 'quicklime', 'steam', [450, null], 'hydroxide decomposition: slaked lime → quicklime + steam — strong heat reverses the slaking'],
    ['baking-powder', null, 'co2', [200, null], 'baking powder\'s bicarbonate breaks down in the oven heat, releasing the CO2 that raises the bake'],
    ['urea', null, 'ammonia-gas', [160, null], 'thermal decomposition: urea melts then breaks down above ~160 °C, releasing ammonia gas (biuret remains)'],
  ];
  for (const hk of heatSrc) for (const [key, out, gas, band, note] of decomp2) {
    if (!has(key)) continue;
    gnp('thermal-decomposition', hk, key, { rate: 0.04, outB: out && has(out) ? out : null, gas: gas && has(gas) ? gas : null, gasN: gas ? 1 : 0, heat: 10, needs: 'heated', tempBand: band, card: 'decomposition', note });
  }
}
// --- (Y2) oxide-acid extension: oxides the metal-oxideKey map misses
// (cuprous/ferric/ferrous oxides, amphoteric + noble-metal oxides) and the
// one acid that eats silica; plus copper hydroxide × every acid liquid ---
{
  const OXIDE_CATION2 = { 'cuprous-oxide': 'cu2', 'ferric-oxide': 'fe3', 'ferrous-oxide': 'fe2', 'cadmium-oxide': 'cd2', 'bismuth-oxide': 'bi3', 'antimony-oxide': 'sb3', 'manganese-oxide': 'mn2', 'vanadium-oxide': null, 'beryllium-oxide': 'be2' };
  for (const ok of Object.keys(OXIDE_CATION2)) {
    if (!has(ok)) continue;
    const ox = R(ok), cat = OXIDE_CATION2[ok];
    for (const a of ACID_LIQUIDS) {
      const prod = cat && ACID_ANION_CODE[a.key] ? solMapGet(cat, ACID_ANION_CODE[a.key]) : null;
      gnp('oxide-acid', a.key, ok, { rate: 0.025 + 0.05 * acidStr(a), heat: 3, outB: prod, tintTo: prod ? null : 0xE8E0D0, card: 'acid-oxide', note: `${ox.name} neutralises ${a.name}${prod ? ` → ${R(prod).name}` : ' — it dissolves slowly to its salt'} + water` });
    }
  }
  if (has('silicon-oxide') && has('hydrofluoric-acid')) {
    gnp('oxide-acid', 'hydrofluoric-acid', 'silicon-oxide', { rate: 0.03, heat: 2, tintTo: 0xE8ECEE, card: 'hf-etch', note: 'hydrofluoric acid is the one bench acid that dissolves silica: SiO2 + 4HF → SiF4 + 2H2O — how glass is etched' });
  }
  if (has('copper-hydroxide')) {
    for (const a of ACID_LIQUIDS) {
      const prod = ACID_ANION_CODE[a.key] ? solMapGet('cu2', ACID_ANION_CODE[a.key]) : null;
      gnp('oxide-acid', a.key, 'copper-hydroxide', { rate: 0.04 + 0.06 * acidStr(a), heat: 4, outB: prod, card: 'acid-oxide', note: `copper hydroxide (a basic hydroxide) + ${a.name} → ${prod ? R(prod).name : 'a copper salt'} + water — the blue jelly dissolves` });
    }
  }
}
// --- (Y3) oxide-base extension: CO2 carbonation of the whole base pool +
// acidic transition-metal oxides (MoO3 / WO3 / V2O5 / SiO2) × bases ---
{
  if (has('co2')) for (const b of BASE_POOL) {
    const prod = solMapGet(BASE_CATION[b.key], 'co3');
    gnp('oxide-base', 'co2', b.key, { rate: 0.035, heat: 2, outB: prod, tintTo: b.key === 'limewater' ? 0xEDEDE6 : null, card: 'carbonation', note: `carbonation: CO2 is an acidic oxide — ${b.name} absorbs it${prod ? ` → ${R(prod).name}` : ' → its carbonate'}` });
  }
  for (const ok of ['molybdenum-oxide', 'tungsten-oxide', 'vanadium-oxide', 'silicon-oxide'].filter(has)) {
    for (const b of BASE_POOL) {
      gnp('oxide-base', ok, b.key, { rate: 0.02, heat: 2, tintTo: 0xE8E8D8, card: 'neutralisation', note: `acidic oxide ${R(ok).name} is absorbed by hot ${b.name}, forming its oxo-salt (molybdate/tungstate/vanadate/silicate chemistry)` });
    }
  }
}
// --- (Y4) alkali completions: (i) powder/solid alkalis precipitate metal
// hydroxides just like their solutions do; (ii) warm secondary alkalis free
// ammonia from ammonium salts; (iii) borate/phosphate alkalis × acids ---
{
  const HYDROX_TINT_Y = { ...HYDROX_TINT, sn2: 0xE8E4DA, be2: 0xF0F0EA, sb3: 0xF5F5F0, bi3: 0xF5F5F0, hg2: 0xE23B2E, cd2: 0xF5F5F0, mn2: 0xE8C8B0 };
  const SOLID_ALKALIS = ['caustic-soda', 'caustic-potash', 'slaked-lime', 'quicklime', 'lime-powder'].filter(has);
  for (const bk of SOLID_ALKALIS) {
    const b = R(bk), bCat = BASE_CATION[bk]; if (!bCat) continue;
    for (const s of SALT_SOLS) {
      if (solubilityClass(s.cation, 'oh') !== 'insoluble') continue;
      const spectator = solMapGet(bCat, s.anion);
      const k = kspFor(s.cation, 'oh');
      const solid = k && k.solid && has(k.solid) ? k.solid : null;
      gnp('base-precipitation', bk, s.key, { rate: 0.07, outA: solid, outB: spectator, tintTo: solid ? null : (HYDROX_TINT_Y[s.cation] || 0xE8E8E8), card: 'precipitation', note: `${b.name} (solid alkali — it dissolves, then acts as its hydroxide) precipitates ${s.cation} hydroxide from ${s.name}${k ? ` (Ksp ${k.ksp.toExponential(1)})` : ''}${solid ? ` — ${R(solid).name}` : ''}` });
    }
  }
  const ammoniumSubs = ALL.filter((s) => (s.cation === 'nh4' && s.key !== 'electrolyte-paste') || (s.key.startsWith('ammonium-') && (s.cls === 'solid' || s.cls === 'powder')));
  for (const bk of ['washing-soda-sol', 'borax-sol', 'sodium-phosphate-sol', 'baking-soda-sol'].filter(has)) {
    const b = R(bk);
    for (const s of ammoniumSubs) {
      gnp('base-ammonium', bk, s.key, { rate: 0.03, gas: 'ammonia-gas', gasN: 1, needs: 'heated', tempBand: [60, null], card: 'ammonia-release', note: `warm ${b.name} (a mild alkali) slowly frees ammonia gas from ${s.name} — weaker than caustic, but the same ammonium test chemistry` });
    }
  }
  for (const bk of ['borax-sol', 'sodium-phosphate-sol'].filter(has)) {
    for (const a of ACID_LIQUIDS) {
      const prod = solMapGet('na', ACID_ANION_CODE[a.key]);
      gnp('acid-base', a.key, bk, { rate: 0.05 + 0.05 * acidStr(a), heat: 3, outB: prod, card: 'neutralisation', note: `neutralisation: ${a.name} + ${R(bk).name} (an alkaline salt solution) → ${prod ? R(prod).name : 'a salt'} + water, heat released` });
    }
  }
}
// --- (Y5) precipitant-full: halide / chromate source liquids × salt
// solutions whose swapped salt is insoluble (Ksp-verified) ---
{
  const sources = ALL.filter((s) => s.cls === 'liquid' && s.cation && ['cl', 'br', 'i', 'cro4'].includes(s.anion) && !s.key.endsWith('-fun'));
  for (const src of sources) for (const s of SALT_SOLS) {
    if (src.anion === s.anion || src.cation === s.cation) continue;
    const k = kspFor(s.cation, src.anion);
    if (!(solubilityClass(s.cation, src.anion) === 'insoluble' || (k != null && k.ksp <= KSP_PRECIP_MAX))) continue;
    const pf = precipFor(s.cation, src.anion, src.cation, s.anion);
    const solid = (k && k.solid && has(k.solid)) ? k.solid : (pf && has(pf[0]) ? pf[0] : null);
    const tint = pf ? pf[1] : 0xF5F5F0;
    const outB = solMapGet(src.cation, s.anion);
    gnp('precipitant-solutions', src.key, s.key, { rate: 0.1, outA: solid, outB, tintTo: solid ? null : tint, card: 'precipitation', note: `precipitation: ${s.cation}|${src.anion} crashes out of ${s.name} on adding ${src.name}${k ? ` (Ksp ${k.ksp.toExponential(1)})` : ''}${solid ? ` — ${R(solid).name}` : ' as an insoluble salt'}` });
  }
}
// --- (Y6) electrolysis extension: acid liquids + alkali liquids × the full
// electrode set, and salt solutions × the remaining inert electrodes ---
{
  const ELECTRODES_FULL = ['graphite', 'carbon-rod', 'copper', 'platinum', 'iron', 'zinc', 'aluminium', 'silver', 'gold', 'lead', 'tin', 'nickel'].filter(has);
  const ELECTRODES_EXTRA = ['carbon-electrode', 'graphite-block'].filter(has);
  const ACTIVE_ELECTRODES = new Set(['copper', 'iron', 'zinc', 'aluminium', 'nickel', 'tin', 'lead']);
  const electrolyse = (s, el, gas, gasName) => {
    if (ACTIVE_ELECTRODES.has(el)) {
      gnp('electrolysis', s.key, el, { rate: 0.02, gas, gasN: 2, consumeA: false, consumeB: false, needs: 'electrified', card: 'electrolysis', note: `electrolysis of ${s.name} with ${R(el).name} electrodes: active electrode: the anode itself dissolves — products differ from inert-electrode electrolysis` });
    } else {
      gnp('electrolysis', s.key, el, { rate: 0.06, gas, gasN: 2, consumeA: false, consumeB: false, needs: 'electrified', card: 'electrolysis', note: `electrolysis of ${s.name} at inert ${R(el).name} electrodes: ${gasName} at the anode, hydrogen at the cathode` });
    }
  };
  for (const a of ACID_LIQUIDS) {
    const isChloride = ACID_ANION_CODE[a.key] === 'cl';
    for (const el of ELECTRODES_FULL) electrolyse(a, el, isChloride && has('chlorine-gas') ? 'chlorine-gas' : 'oxygen', isChloride ? 'chlorine' : 'oxygen');
  }
  for (const b of BASE_POOL) {
    if (b.cls !== 'liquid') continue;
    for (const el of ELECTRODES_FULL) electrolyse(b, el, 'oxygen', 'oxygen');
  }
  for (const s of SALT_SOLS) {
    const gas = s.anion === 'cl' ? 'chlorine-gas' : (s.anion === 'br' ? null : 'oxygen');
    const gasName = s.anion === 'cl' ? 'chlorine' : (s.anion === 'br' ? 'bromine' : 'oxygen');
    for (const el of ELECTRODES_EXTRA) electrolyse(s, el, gas, gasName);
  }
}
// --- (Y7) metal-steam completion: reactive metal forms the gap grid's
// conditional block never reached ---
for (const m of METAL_FORMS) {
  const eM = e0ForMetal(m); if (eM == null || eM >= 0) continue;
  if (m.oxideKey && has(m.oxideKey) && has('steam')) {
    gnp('metal-steam', m.key, 'steam', { rate: 0.03, outA: m.oxideKey, gas: 'hydrogen', gasN: 1, tempBand: [300, null], card: 'steam-metal', note: `red-hot ${m.name} splits steam → ${R(m.oxideKey).name} + H2↑ (E° ${fmtE2(eM)} V)` });
  }
}
// --- (Y8) reduction extension: aluminothermic (aluminium powder) +
// graphite carbon reduction over the same honest E° window as grid (k) ---
{
  const oxideMetal = new Map();
  for (const m of ALL) if (m.profile === 'metal' && m.oxideKey && has(m.oxideKey)) {
    if (!oxideMetal.has(m.oxideKey) || m.cls === 'solid') oxideMetal.set(m.oxideKey, m);
  }
  for (const [oxKey, m] of oxideMetal) {
    const ox = R(oxKey); if (!ox || !(ox.cls === 'solid' || ox.cls === 'powder')) continue;
    const eM = e0ForMetal(m);
    if (eM == null || eM >= 0.9 || eM < -1.2) continue;
    const metalKey = baseKey(m.key); if (!has(metalKey)) continue;
    if (has('graphite-powder')) {
      gnp('reduction', 'graphite-powder', oxKey, { rate: 0.035, outB: metalKey, gas: 'co2', gasN: 1, heat: 20, needs: 'heated', tempBand: [500, null], card: 'blast-furnace', note: `graphite (carbon) reduces ${ox.name} to ${R(metalKey).name} at furnace heat (E° ${fmtE2(eM)} V)` });
    }
    if (has('aluminium-powder') && oxKey !== 'aluminium-oxide') {
      gnp('reduction', 'aluminium-powder', oxKey, { rate: 0.05, outA: 'aluminium-oxide', outB: metalKey, gas: 'smoke', gasN: 1, heat: 300, needs: 'ignited', tempBand: [600, null], card: 'thermite', note: `aluminothermic (Goldschmidt) reduction: aluminium powder strips ${ox.name} to ${R(metalKey).name}, itself becoming alumina — thermite chemistry` });
    }
  }
}
// --- (Y9) organic completions: wider esterification matrix (incl. solid
// carboxylic acids × liquid alcohols, and ethyl acetate where it exists),
// saponification of butter fat / stearic acid / lime-soaped oils, the
// 0.3–0.5 flammability combustion band, and reactive metals × alcohols ---
{
  const CARBOXYLIC2 = ['acetic-acid', 'formic-acid', 'lactic-acid', 'citric-acid-sol', 'oleic-acid', 'citric-acid', 'tartaric-acid', 'oxalic-acid', 'benzoic-acid', 'salicylic-acid'].filter(has);
  const ALCOHOLS2 = ['ethanol', 'methanol', 'isopropanol', 'butanol', 'glycerol', 'ethylene-glycol', 'propylene-glycol'].filter((k) => has(k) && R(k).cls === 'liquid');
  for (const a of CARBOXYLIC2) for (const al of ALCOHOLS2) {
    const esterOut = (a === 'acetic-acid' && al === 'ethanol' && has('ethyl-acetate')) ? 'ethyl-acetate' : null;
    gnp('esterification', a, al, { rate: 0.02, outB: esterOut, tintTo: 0xF2E8D8, heat: 2, needs: 'heated', card: 'esterification', note: `esterification: ${R(a).name} + ${R(al).name} ⇌ ${esterOut ? 'ethyl acetate (a real ester in the table)' : 'a fruity-smelling ester'} + water (warm, acid catalyst)` });
  }
  const SAPONIFIABLE_EXTRA = ['molten-butter', 'stearic-acid'].filter(has);
  for (const o of SAPONIFIABLE_EXTRA) for (const bk of ['sodium-hydroxide', 'potassium-hydroxide', 'caustic-soda', 'caustic-potash'].filter(has)) {
    gnp('saponification', o, bk, { rate: 0.04, outA: has('soap-solution') ? 'soap-solution' : null, heat: 5, needs: 'heated', card: 'saponification', note: `saponification: hot ${R(bk).name} converts ${R(o).name} into soap${o === 'stearic-acid' ? ' — sodium stearate IS the classic hard soap' : ' + glycerol'}` });
  }
  const oilsY = ALL.filter((s) => s.profile === 'oil' && s.cls === 'liquid' && !['mineral-oil', 'motor-oil', 'crude-oil', 'transformer-oil', 'silicone-oil', 'hydraulic-oil', 'brake-fluid', 'turpentine', 'liquid-paraffin', 'immersion-oil', 'sunscreen-lotion', 'face-cream'].includes(s.key));
  for (const o of oilsY) for (const bk of ['limewater', 'slaked-lime'].filter(has)) {
    gnp('saponification', o.key, bk, { rate: 0.025, tintTo: 0xE8E4DA, heat: 3, needs: 'heated', card: 'saponification', note: `lime saponification: hot ${R(bk).name} chops ${o.name} into an insoluble calcium soap (grease, not lather — the historical lime-soap reaction)` });
  }
  for (const s of ALL) {
    if ((s.flammability || 0) < 0.3) continue;
    if (!['powder', 'liquid', 'solid', 'gas'].includes(s.cls)) continue;
    if (s.key === 'oxygen' || s.key.endsWith('-fun')) continue;
    gnp('combustion-full', s.key, 'oxygen', { rate: 0.04 + 0.08 * s.flammability, outA: s.burnTo && has(s.burnTo) ? s.burnTo : null, gas: 'co2', gasN: 1, heat: Math.round(30 + 80 * s.flammability), tintTo: s.flameColour != null ? s.flameColour : null, needs: 'ignited', card: 'combustion', note: `${s.name} burns in pure oxygen — even reluctant fuels catch when oxygen is this rich` });
  }
  for (const mk of ['sodium', 'potassium', 'lithium'].filter(has)) {
    for (const al of ALCOHOLS2) {
      gnp('alcohol-metal', mk, al, { rate: mk === 'potassium' ? 0.14 : (mk === 'sodium' ? 0.08 : 0.03), gas: 'hydrogen', gasN: 1, heat: mk === 'potassium' ? 25 : 12, card: 'alcohol-metal', note: `${R(mk).name} + ${R(al).name} → metal alkoxide + H2↑ — the alcohol's hydroxyl hydrogen is displaced, just as in water but calmer` });
    }
  }
}
export const NAMED_GRID_COUNTS = GRID_COUNTS;
export const NAMED_REACTIVE_COUNT = _pairs.filter((p) => p[2].kind !== 'inert').length;
export const NAMED_PAIRS = _pairs;
export const NAMED_PAIR_COUNT = _pairs.length;
// pair lookup: key = minId*4096 + maxId -> [records with orientation flag]
const PAIR_MAP = new Map();
for (const [a, b, f] of _pairs) {
  const ia = R(a).id, ib = R(b).id;
  const key = Math.min(ia, ib) * 4096 + Math.max(ia, ib);
  if (!PAIR_MAP.has(key)) PAIR_MAP.set(key, []);
  PAIR_MAP.get(key).push({ f, ia });
}


// ---- Tier-2 helpers (W32U-2): Hansen distance + colour blending ----
export function hansenDist(a, b) {
  if (!a || !b || !Array.isArray(a.hsp) || !Array.isArray(b.hsp)) return null;
  const dD = a.hsp[0] - b.hsp[0], dP = a.hsp[1] - b.hsp[1], dH = a.hsp[2] - b.hsp[2];
  return Math.sqrt(4 * dD * dD + dP * dP + dH * dH);
}
const _ch = (hex, i) => (hex >> (16 - 8 * i)) & 0xff;
const _mk = (r, g, b) => ((Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b))));
export function blendCol(a, b) {
  const ca = a && a.col ? a.col[1] : 0x808080, cb = b && b.col ? b.col[1] : 0x808080;
  return _mk((_ch(ca, 0) + _ch(cb, 0)) / 2, (_ch(ca, 1) + _ch(cb, 1)) / 2, (_ch(ca, 2) + _ch(cb, 2)) / 2);
}
export function blendToward(hex, target, f) {
  return _mk(_ch(hex, 0) + (_ch(target, 0) - _ch(hex, 0)) * f, _ch(hex, 1) + (_ch(target, 1) - _ch(hex, 1)) * f, _ch(hex, 2) + (_ch(target, 2) - _ch(hex, 2)) * f);
}
export function darken(hex, f) { return _mk(_ch(hex, 0) * f, _ch(hex, 1) * f, _ch(hex, 2) * f); }
export function lighten(hex, f) { return _mk(_ch(hex, 0) * f, _ch(hex, 1) * f, _ch(hex, 2) * f); }

// ---- FAMILIES (Tier 2) ----
// resolve(sa, sb, ctx): sa matches the a-side, sb the b-side; returns outcome
// fields from the a-side perspective, or null. Pure + deterministic.
const F = (id, m, resolve, card, cardName) => ({ id, ...m, resolve, card, cardName });
export const FAMILIES = [
  F('gas-pop', { aTest: (s) => s.cls === 'gas' && (s.flammability || 0) > 0, bTest: (s) => s.cls === 'gas' && hasFam(s, 'oxidiser') },
    (sa, sb, ctx) => (ctx.ignited || ctx.pressure >= 2) ? { rate: 0.3, blast: 4, gas: 'steam', gasN: 1, heat: 150, outA: sa.key === 'hydrogen' ? 'steam' : null } : null, 'gas-pop', '{a} + {b} → Gas Pop'),
  F('bleach-acid', { aFam: 'bleach', bFam: 'acid' },
    (sa, sb) => ({ rate: 0.05 + 0.06 * (sb.acidStrength || 0.3), gas: 'chlorine-gas', gasN: 2, heat: 5 }), 'chlorine-danger', '{a} + {b} → Chlorine Gas!'),
  F('acid-ammonia', { aFam: 'acid', bTest: (s) => s.key === 'ammonia-gas' },
    () => ({ rate: 0.1, outB: 'ammonium-chloride', tintTo: 0xF5F5F0 }), 'smoke-ring', '{a} + {b} → White Smoke'),
  F('alkali-water', { aFam: 'alkali-metal', bTest: (s) => s.profile === 'water' },
    (sa) => ({ rate: 0.22, gas: 'hydrogen', gasN: 3, heat: 45, outB: P(HYDROXIDE_SOL[baseKey(sa.key)] || null, 'alkali-water'), tintTo: 0xF08A24 }), 'alkali-water', '{a} + {b} → Violent Reaction'),
  F('mercury-amalgam', { aTest: (s) => s.key === 'mercury', bFam: 'metal' },
    (sa, sb) => ['iron', 'platinum', 'tungsten', 'iron-powder', 'platinum-powder', 'tungsten-powder'].includes(sb.key) ? null : { rate: 0.05, outB: 'amalgam' }, 'amalgam', 'Mercury + {b} → Amalgam'),
  F('cement-water', { aTest: (s) => s.key === 'cement', bTest: (s) => s.profile === 'water' },
    () => ({ rate: 0.03, outA: 'cement-solid', heat: 6 }), 'cement-setting', 'Cement + {b} → It Sets'),
  F('oxide-water', { aTest: (s) => s.profile === 'water', bTest: (s) => /^(sodium|potassium|lithium|barium)-oxide$/.test(s.key) || s.key === 'quicklime' },
    (sa, sb) => ({ rate: 0.06, outB: P({ 'sodium-oxide': 'sodium-hydroxide', 'potassium-oxide': 'potassium-hydroxide', 'lithium-oxide': 'lithium-hydroxide-sol', 'barium-oxide': 'barium-hydroxide-sol', quicklime: 'limewater' }[sb.key] || null, 'oxide-water'), heat: 25, gas: 'steam', gasN: 1 }), 'slaking', '{a} + {b} → Slaking'),
  F('co2-base', { aTest: (s) => s.key === 'co2', bFam: 'base' },
    (sa, sb) => ({ rate: 0.05, outB: sb.key === 'sodium-hydroxide' ? 'washing-soda-sol' : null, tintTo: sb.key === 'limewater' ? 0xEDEDE6 : null }), 'carbonation', '{a} + {b} → Carbonation'),
  F('acidgas-base', { aTest: (s) => s.cls === 'gas' && hasFam(s, 'acid'), bFam: 'base' },
    () => ({ rate: 0.08, heat: 6, tintTo: 0xD8E8D8 }), 'neutralisation', '{a} + {b} → Neutralisation'),
  F('electrolysis', { aTest: (s) => hasFam(s, 'ionic-sol') || s.profile === 'water', bTest: (s) => (s.electric || 0) >= 0.3 },
    // plain water: the engine's polarity-signed fallback owns the gases (it
    // knows cathode from anode; this family cannot) — here the current only
    // warms the water at the electrode, non-consuming. Ionic solutions keep
    // the authored hydrogen outcome, also non-consuming (electrodes survive).
    (sa, sb, ctx) => !ctx.electrified ? null : sa.profile === 'water'
      ? { rate: 0.03, heat: 2, consumeA: false, consumeB: false, note: 'current passes; gases form at the signed electrodes' }
      : { rate: 0.03, gas: 'hydrogen', gasN: 2, heat: 5, consumeA: false, consumeB: false }, 'electrolysis', 'Electrolysis of {a}'),
  F('electric-explosive', { aTest: isSparkSource, bTest: (s) => (s.blast || 0) > 0 },
    (sa, sb) => ({ rate: 0.15, blast: sb.blast, outB: 'fire', heat: 120 }), 'detonation', '{a} + {b} → Detonation'),
  F('combustion', { aTest: isIgniter, bTest: (s) => (s.flammability || 0) > 0 || (s.blast || 0) > 0 },
    (sa, sb) => (sb.blast || 0) > 0
      ? { rate: 0.3, blast: sb.blast, outB: 'fire', gas: 'smoke', gasN: 2, heat: 200 }
      : { rate: 0.02 + 0.03 * (sb.flammability || 0), outB: sb.burnTo || null, gas: (sb.flammability || 0) >= 0.7 ? 'smoke' : 'co2', gasN: 1, heat: 60, tintTo: sb.flameColour != null ? sb.flameColour : null }, 'combustion', '{a} + {b} → Combustion'),
  F('electric-flammable', { aTest: isSparkSource, bTest: (s) => (s.flammability || 0) >= 0.4 && (s.blast || 0) === 0 },
    () => ({ rate: 0.12, outB: 'fire', heat: 40 }), 'arc-ignition', '{a} Ignites {b}'),
  F('fire-water', { aTest: isIgniter, bFam: 'aqueous' },
    (sa, sb) => ({ rate: 0.15, outB: sb.cls === 'liquid' ? 'steam' : null, gas: 'steam', gasN: 1, heat: -50 }), 'steam-burst', '{a} + {b} → Steam'),
  F('electric-aqueous', { aTest: isSparkSource, bTest: (s) => hasFam(s, 'aqueous') && s.cls === 'liquid' },
    () => ({ rate: 0.08, outB: 'steam', gas: 'steam', gasN: 1, heat: 30 }), 'steam-ring', '{a} + {b} → Steam Ring'),
  F('hot-steam', { aFam: 'hot-liquid', bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => { const t = tempOf(sa); if (t < 150) return null; if (hasFam(sb, 'aqueous') || (sb.boilPoint != null && sb.boilPoint <= 120)) return { rate: 0.12, outB: 'steam', gas: 'steam', gasN: 2, heat: -40 }; if (sb.boilPoint != null && t > sb.boilPoint) return { rate: 0.06, outB: 'steam', gas: 'steam', gasN: 1, heat: -25 }; return null; }, 'steam-burst', '{a} + {b} → Steam Burst'),
  F('hot-ignition', { aFam: 'hot-liquid', bTest: (s) => s.cls !== 'liquid' && ((s.flammability || 0) >= 0.25 || (s.blast || 0) > 0) },
    (sa, sb) => { if (tempOf(sa) < 400) return null; return (sb.blast || 0) > 0 ? { rate: 0.2, blast: sb.blast, outB: 'fire', heat: 150 } : { rate: 0.1, outB: sb.burnTo || 'fire', gas: 'smoke', gasN: 1, heat: 50 }; }, 'hot-ignition', '{a} Ignites {b}'),
  F('hot-glass', { aFam: 'hot-liquid', bFam: 'glass' },
    (sa) => tempOf(sa) >= 500 ? { rate: 0.03, outB: 'cracked-glass' } : null, 'thermal-shock', '{a} + {b} → Thermal Shock'),
  F('hot-frozen', { aFam: 'hot-liquid', bFam: 'frozen' },
    (sa, sb) => tempOf(sa) >= 200 ? { rate: 0.1, outB: sb.meltTo && has(sb.meltTo) ? sb.meltTo : null, gas: 'steam', gasN: 1, heat: -30 } : null, 'steam-burst', '{a} + {b} → Steam Burst'),
  F('steam-metal', { aTest: (s) => s.key === 'steam', bFam: 'metal' },
    (sa, sb, ctx) => (ctx.temp >= 300 && ['iron', 'magnesium', 'zinc', 'aluminium', 'steel', 'carbon-steel', 'cast-iron'].includes(baseKey(sb.key))) ? { rate: 0.03, outB: sb.oxideKey && has(sb.oxideKey) ? sb.oxideKey : null, gas: 'hydrogen', gasN: 1 } : null, 'steam-metal', 'Steam + {b} → Hydrogen'),
  F('cryogen-liquid', { aFam: 'cryogen', bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => ({ rate: 0.05, outB: sb.freezeTo && has(sb.freezeTo) ? sb.freezeTo : null, gas: 'fog', gasN: 1, heat: -60, tintTo: 0xDCEFF5 }), 'deep-freeze', '{a} + {b} → Deep Freeze'),
  F('cryogen-glass', { aFam: 'cryogen', bFam: 'glass' },
    () => ({ rate: 0.02, outB: 'cracked-glass' }), 'thermal-shock', '{a} + {b} → Thermal Shock'),
  F('cryogen-life', { aFam: 'cryogen', bTest: (s) => s.profile === 'life' || s.profile === 'plant' || s.profile === 'food' },
    () => ({ rate: 0.05, heat: -40, tintTo: 0xDCEFF5, note: 'frozen solid — life stops' }), 'deep-freeze', '{a} + {b} → Deep Freeze'),
  F('acid-glass', { aFam: 'acid', bFam: 'glass' },
    (sa) => sa.key === 'hydrofluoric-acid' ? { rate: 0.02, outB: 'frosted-glass', tintTo: 0xE8ECEE } : null, 'hf-etch', 'Hydrofluoric Acid Etches {b}'),
  F('acid-carbonate', { aFam: 'acid', bFam: 'carbonate' },
    (sa) => ({ rate: 0.04 + 0.1 * (sa.acidStrength || 0.2), gas: 'co2', gasN: 2, heat: -1 }), 'acid-carbonate', '{a} + {b} → CO2 Fizz'),
  F('acid-bicarbonate', { aFam: 'acid', bFam: 'bicarbonate' },
    (sa) => ({ rate: 0.06 + 0.1 * (sa.acidStrength || 0.2), gas: 'co2', gasN: 3, heat: -2 }), 'acid-carbonate', '{a} + {b} → CO2 Eruption'),
  F('acid-carbonate-rock', { aFam: 'acid', bFam: 'carbonate-rock' },
    (sa) => ({ rate: 0.02 + 0.06 * (sa.acidStrength || 0.2), gas: 'co2', gasN: 1, heat: 0 }), 'acid-carbonate', '{a} + {b} → CO2 Fizz'),
  F('acid-salt-sol', { aFam: 'acid', bFam: 'salt-sol' },
    (sa, sb) => {
      const an = sb.anion;
      if (an === 'co3') return { rate: 0.08, gas: 'co2', gasN: 2 };
      if (an === 'so3' || an === 's2o3') return { rate: 0.06, gas: 'sulfur-dioxide', gasN: 1, tintTo: 0xE8E8B0 };
      if (sa.key === 'hydrochloric-acid' && (an === 'mno4' || an === 'cr2o7' || an === 'cro4')) return { rate: 0.06, gas: 'chlorine-gas', gasN: 1, tintTo: 0xC8E86B };
      if ((sa.acidStrength || 0) >= 0.9 && ['acetate', 'po4', 'b4o7', 'edta'].includes(an)) return { rate: 0.03, tintTo: 0xE8DCC0, note: 'strong acid protonates the anion — the weaker acid forms' };
      return null;
    }, 'acid-carbonate', '{a} + {b} → Weaker Acid Displaced'),
  F('acid-salt-solid', { aFam: 'acid', bTest: (s) => s.profile === 'salt-solid' },
    (sa, sb) => {
      if (hasFam(sb, 'carbonate')) return null; // acid-carbonate handles it, faster
      if (sb.key === 'potassium-cyanide') return { rate: 0.08, gas: 'hydrogen-cyanide-gas', gasN: 1, note: 'acid + cyanide → HCN gas — lethal in real life' };
      if (['potassium-chlorate', 'sodium-chlorate', 'potassium-perchlorate'].includes(sb.key) && (sa.acidStrength || 0) >= 0.9) return { rate: 0.06, gas: 'chlorine-dioxide', gasN: 1, tintTo: 0xE8D44D };
      if (sb.key.endsWith('-oxide')) { const m = R(baseKey(sb.key.replace('-oxide', ''))); const prod = m ? solFor(m, 'chloride') : null; if (prod) return { rate: 0.05, outB: prod, note: 'oxide neutralised to a salt solution' }; }
      if ((sb.solubility || 0) >= 0.3) return { rate: 0.02, tintTo: 0xE8DCC0, note: 'acid dissolves the salt, changing its anion' };
      return null;
    }, 'acid-oxide', '{a} + {b} → Salt + Water'),
  F('base-salt-sol', { aFam: 'base', bFam: 'salt-sol' },
    (sa, sb) => {
      if (sa.key === 'ammonia-solution' && sb.cation === 'cu2') return { rate: 0.08, tintTo: 0x1B3FA0, consumeA: false, consumeB: false, note: 'deep-blue tetraammine copper complex' };
      if (sa.key === 'barium-hydroxide-sol' && sb.anion === 'so4') return { rate: 0.1, outB: 'barium-sulfate', tintTo: 0xF5F5F0, note: 'white BaSO4 precipitate' };
      if (sb.cation === 'cu2') return { rate: 0.07, outB: 'copper-hydroxide', tintTo: 0x7FB2E0, note: 'pale-blue Cu(OH)2 jelly precipitates' };
      if (sb.cation && INSOL_OH.has(sb.cation)) { const prod = oxideOfCation(sb.cation); return { rate: 0.07, outB: prod, tintTo: HYDROX_TINT[sb.cation] || 0xE8E8E8, note: 'insoluble metal hydroxide precipitates (shown as its oxide)' }; }
      if (sb.cation === 'ca') return { rate: 0.02, tintTo: 0xEDEDE6, note: 'slightly soluble Ca(OH)2 — faint milkiness' };
      return null;
    }, 'precipitation', '{a} + {b} → Precipitate'),
  F('salt-sol-precip', { aFam: 'salt-sol', bFam: 'salt-sol' },
    (sa, sb) => { const p = precipFor(sa.cation, sa.anion, sb.cation, sb.anion); return p && has(p[0]) ? { rate: 0.08, outA: p[0], tintTo: p[1] } : null; }, 'precipitation', '{a} + {b} → Precipitate'),
  F('peroxide-catalyst-sol', { aFam: 'peroxide', bFam: 'salt-sol' },
    (sa, sb) => (sb.anion === 'i' || ['fe2', 'fe3', 'mn2', 'cu2'].includes(sb.cation)) ? { rate: 0.07, gas: 'oxygen', gasN: 2 } : null, 'peroxide-catalyst', '{a} + {b} → Peroxide Breakdown'),
  F('halogen-sols', { aTest: (s) => REACTIVE_HALOGENS.includes(s.key), bFam: 'salt-sol' },
    (sa, sb) => ['i', 'br', 's2o3', 'so3'].includes(sb.anion) ? { rate: 0.05, tintTo: 0x7A4A1E, note: 'the stronger halogen frees the weaker one' } : null, 'halogen-displacement', '{a} + {b} → Halogen Displacement'),
  F('bleach-dye', { aFam: 'bleach', bFam: 'dye' },
    () => ({ rate: 0.06, tintTo: 0xEDEDE6 }), 'bleaching', '{a} + {b} → Bleaching'),
  F('bleach-organic', { aFam: 'bleach', bFam: 'organic' },
    (sa, sb) => (hasFam(sb, 'dye') || hasFam(sb, 'food') || hasFam(sb, 'plant-matter') || sb.cls === 'liquid') ? { rate: 0.02, tintTo: 0xEDEDE6, note: 'bleach attacks colours and organic matter' } : null, 'bleaching', '{a} + {b} → Bleaching'),
  F('bleach-ammonium', { aFam: 'bleach', bFam: 'ammonium' },
    () => ({ rate: 0.05, tintTo: 0xE8E8D0, note: 'chloramine vapour forms — toxic' }), 'chloramine', '{a} + {b} → Chloramine'),
  F('bleach-peroxide', { aFam: 'bleach', bFam: 'peroxide' },
    () => ({ rate: 0.08, gas: 'oxygen', gasN: 2 }), 'oxygen-release', '{a} + {b} → Oxygen Release'),
  F('peroxide-organic', { aFam: 'peroxide', bFam: 'organic' },
    (sa, sb) => ((sb.flammability || 0) > 0 || hasFam(sb, 'food') || hasFam(sb, 'dye')) ? { rate: 0.02 + 0.05 * (sb.flammability || 0), gas: 'oxygen', gasN: 1, tintTo: 0xEDEDE6, heat: 10 } : null, 'peroxide-catalyst', '{a} + {b} → Peroxide Attack'),
  F('peroxide-metal', { aFam: 'peroxide', bFam: 'metal' },
    () => ({ rate: 0.03, gas: 'oxygen', gasN: 1, note: 'metal surface catalyses peroxide breakdown' }), 'peroxide-catalyst', '{a} + {b} → Peroxide Breakdown'),
  F('metal-salt-sol', { aFam: 'metal', bFam: 'salt-sol' },
    (sa, sb) => {
      const cr = sb.cation ? CATION_RANK[sb.cation] : null;
      if (cr == null || (sa.activityRank || 0) <= cr) return null;
      const plated = CATION_METAL[sb.cation]; if (!plated || !has(plated)) return null;
      const anionWord = sb.anion === 'so4' ? 'sulfate' : (sb.anion === 'no3' ? 'nitrate' : 'chloride');
      return { rate: 0.02 + 0.05 * (((sa.activityRank || 0) - cr) / 100), outA: plated, outB: solFor(sa, anionWord), heat: 4, note: 'displacement: the metal plates out the solution\'s metal' };
    }, 'displacement', '{a} + {b} → Displacement'),
  F('metal-halogen', { aTest: (s) => REACTIVE_HALOGENS.includes(s.key), bFam: 'metal' },
    (sa, sb, ctx) => {
      if (sa.key === 'iodine' && ctx.temp < 150) return null;
      return { rate: 0.02 + 0.06 * ((sb.activityRank || 0) / 100), outB: solFor(sb, HALOGEN_ANION[sa.key] || 'chloride'), gas: 'smoke', gasN: 1, heat: 40, tintTo: 0xF08A24 };
    }, 'halogen-metal', '{a} + {b} → Metal Halide'),
  F('metal-sulfur', { aTest: (s) => hasFam(s, 'sulfur-bearing'), bFam: 'metal' },
    (sa, sb, ctx) => ctx.temp >= 150 ? { rate: 0.03, tintTo: 0x2A2A2A, heat: 15, note: 'dark metal sulfide forms' } : null, 'sulfide', '{a} + {b} → Metal Sulfide'),
  F('acid-metal', { aFam: 'acid', bFam: 'metal' },
    (sa, sb) => {
      const rank = sb.activityRank || 0, str = sa.acidStrength || 0;
      if (sa.key === 'nitric-acid' && PASSIVE_NITRIC.has(baseKey(sb.key))) return { kind: 'inert', note: 'passivation: protective oxide film stops the attack' };
      if (rank < 15 && !hasFam(sa, 'oxidiser')) return null;
      if (rank < 15) return { rate: 0.008, gas: 'hydrogen', gasN: 1, outB: sb.saltKey && has(sb.saltKey) ? sb.saltKey : null, heat: 3, note: 'only an oxidising acid bites this noble metal' };
      return { rate: 0.015 + 0.05 * str * (rank / 100), gas: 'hydrogen', gasN: rank >= 80 ? 3 : (rank >= 45 ? 2 : 1), outB: sb.saltKey && has(sb.saltKey) ? sb.saltKey : null, heat: Math.round(8 * str) };
    }, 'acid-metal', '{a} + {b} → Metal Salt + Hydrogen'),
  F('acid-base', { aFam: 'acid', bFam: 'base' },
    (sa, sb) => { const bs = sb.ph != null ? (sb.ph - 7) / 7 : (hasFam(sb, 'strong-base') ? 0.9 : 0.4); return { rate: 0.12, heat: Math.round(4 + 10 * ((sa.acidStrength || 0.2) + Math.max(0, bs))), outA: (sa.cls === 'liquid' && sb.cls === 'liquid') ? 'salt-water' : null }; }, 'neutralisation', '{a} + {b} → Neutralisation'),
  F('base-ammonium', { aFam: 'base', bFam: 'ammonium' },
    (sa) => { const bs = sa.ph != null ? (sa.ph - 7) / 7 : (hasFam(sa, 'strong-base') ? 0.9 : 0.3); return bs >= 0.3 ? { rate: 0.05, gas: 'ammonia-gas', gasN: 1, heat: 4 } : null; }, 'ammonia-release', '{a} + {b} → Ammonia Released'),
  F('base-metal', { aFam: 'base', bFam: 'metal' },
    (sa, sb) => { const bs = sa.ph != null ? (sa.ph - 7) / 7 : (hasFam(sa, 'strong-base') ? 0.9 : 0.3); return (bs >= 0.7 && ['aluminium', 'zinc', 'tin', 'lead'].includes(baseKey(sb.key))) ? { rate: 0.02, gas: 'hydrogen', gasN: 1, outB: sb.saltKey && has(sb.saltKey) ? sb.saltKey : null } : null; }, 'amphoteric', '{a} + {b} → Amphoteric Dissolve'),
  F('base-halogen', { aTest: (s) => hasFam(s, 'strong-base'), bTest: (s) => s.key === 'chlorine-gas' || s.key === 'bromine' },
    () => ({ rate: 0.05, outB: 'bleach', tintTo: 0xEDEDD8, note: 'halogen disproportionates in alkali — bleach forms' }), 'bleaching', '{a} + {b} → Bleach Forms'),
  F('oxidiser-fuel', { aFam: 'oxidiser', bFam: 'fuel' },
    (sa, sb, ctx) => { if ((sb.flammability || 0) < 0.6 && ctx.temp < 150 && !ctx.ignited) return null; return { rate: 0.02 + 0.08 * (sb.flammability || 0), outB: sb.burnTo || 'fire', gas: 'smoke', gasN: 1, heat: 40 }; }, 'oxidiser-fuel', '{a} + {b} → Vigorous Burn'),
  F('oxidiser-organic', { aFam: 'oxidiser', bFam: 'organic' },
    (sa, sb, ctx) => { const p = oxPower(sa); if (ctx.temp < 150 && p < 0.6 && (sb.flammability || 0) < 0.3) return null; return { rate: 0.008 + 0.05 * p * Math.max(sb.flammability || 0, 0.3), tintTo: 0x3A2A1A, heat: Math.round(10 + 30 * p) }; }, 'oxidation', '{a} + {b} → Oxidation'),
  F('oxidiser-metal', { aFam: 'oxidiser', bFam: 'metal' },
    (sa, sb, ctx) => { if (ctx.temp < 200 && sb.cls !== 'powder') return null; const prod = sb.oxideKey && has(sb.oxideKey) ? sb.oxideKey : null; return { rate: 0.01 + 0.04 * oxPower(sa), outB: prod, tintTo: prod ? null : 0x3A2A1A, heat: 20 }; }, 'oxidation', '{a} + {b} → Oxidation'),
  F('oxidiser-sulfur', { aFam: 'oxidiser', bFam: 'sulfur-bearing' },
    (sa, sb, ctx) => (ctx.temp >= 150 || oxPower(sa) >= 0.7) ? { rate: 0.06, outB: 'fire', gas: 'sulfur-dioxide', gasN: 1, heat: 60 } : null, 'oxidiser-fuel', '{a} + {b} → Vigorous Burn'),
  F('phosphorus-oxidiser', { aFam: 'phosphorus-bearing', bFam: 'oxidiser' },
    () => ({ rate: 0.08, outA: 'fire', gas: 'smoke', gasN: 1, heat: 80 }), 'phosphorus-fire', '{a} + {b} → Phosphorus Fire'),
  F('acid-organic', { aFam: 'acid', bFam: 'organic' },
    (sa, sb) => { const str = sa.acidStrength || 0; if (str >= 0.85) return { rate: 0.03, outB: sb.cls === 'liquid' ? null : 'charcoal-powder', gas: 'steam', gasN: 1, heat: 15, tintTo: 0x2A2A2A }; if (str >= 0.4) return { rate: 0.012, tintTo: 0x4A3A2A, note: 'acid slowly attacks the organic matter' }; return { rate: 0.005, tintTo: 0x6B5B4A, note: 'weak acid: slow marinade / curdle / leach' }; }, 'acid-organic', '{a} + {b} → Slow Attack'),
  F('base-organic', { aFam: 'base', bFam: 'organic' },
    (sa, sb) => { const bs = sa.ph != null ? (sa.ph - 7) / 7 : (hasFam(sa, 'strong-base') ? 0.9 : 0.35); if (bs < 0.35) return null; if (hasFam(sb, 'oil')) return { rate: 0.025, outB: 'soap-sol', note: 'saponification: oil + alkali → soap' }; return { rate: 0.01, tintTo: 0xD8D0C0, note: 'alkali digests organic matter' }; }, 'caustic', '{a} + {b} → Caustic Attack'),
  F('acid-stone', { aFam: 'acid', bFam: 'stone' },
    (sa) => (sa.acidStrength || 0) >= 0.15 ? { rate: 0.006 + 0.02 * (sa.acidStrength || 0), tintTo: 0xC8C0B0, note: 'acid weathering — stone etches slowly' } : null, 'acid-etch', '{a} Etches {b}'),
  F('acid-dye', { aFam: 'acid', bFam: 'dye' },
    (sa) => ({ rate: 0.06, tintTo: indicatorColour('universal-indicator', sa.ph != null ? sa.ph : 2), consumeA: false, consumeB: false }), 'ph-tint', '{a} Tints {b}'),
  F('base-dye', { aFam: 'base', bFam: 'dye' },
    (sa) => ({ rate: 0.06, tintTo: indicatorColour('universal-indicator', sa.ph != null ? sa.ph : 12), consumeA: false, consumeB: false }), 'ph-tint', '{a} Tints {b}'),
  F('indicator-ph', { aFam: 'indicator', bTest: (s) => s.cls === 'liquid' && s.ph != null },
    (sa, sb) => sa.key === 'methylene-blue' ? null : { rate: 0.1, tintTo: indicatorColour(sa.key, sb.ph), consumeA: false, consumeB: false }, 'indicator-ph', '{a} Shows the pH of {b}'),
  F('solvent-polymer', { aFam: 'solvent', bFam: 'polymer' },
    (sa, sb) => ((sb.solubility || 0) >= 0.15 || ['acetone', 'chloroform', 'dichloromethane', 'turpentine'].includes(sa.key)) ? { rate: 0.02 + 0.06 * (sb.solubility || 0), tintTo: sb.col ? sb.col[0] : null, note: 'solvent softens / dissolves the polymer' } : null, 'solvent-attack', '{a} Attacks {b}'),
  F('solvent-rubber', { aFam: 'solvent', bFam: 'rubber' },
    (sa, sb) => ((sb.solubility || 0) >= 0.1 || hasFam(sa, 'fuel')) ? { rate: 0.02 + 0.05 * (sb.solubility || 0), tintTo: sb.col ? sb.col[0] : null, note: 'solvent swells and softens the rubber' } : null, 'solvent-attack', '{a} Attacks {b}'),
  F('solvent-wax', { aFam: 'solvent', bFam: 'wax' },
    (sa, sb) => ({ rate: 0.05, tintTo: sb.col ? sb.col[0] : null, note: 'wax dissolves in the solvent' }), 'solvent-attack', '{a} Dissolves {b}'),
  F('solvent-dye', { aFam: 'solvent', bFam: 'dye' },
    (sa, sb) => ({ rate: 0.05, tintTo: sb.col ? sb.col[0] : null }), 'dye-dissolve', '{a} Dissolves {b}'),
  F('soap-oil', { aFam: 'soap', bFam: 'oil' },
    (sa, sb, ctx) => ctx.mixed >= 0.5 ? { rate: 0.07, tintTo: 0xEDEDE6, consumeA: false, consumeB: false, note: 'stable emulsion — oil and water stay mixed' } : null, 'emulsion', '{a} + {b} → Emulsion'),
  F('soap-hardwater', { aFam: 'soap', bFam: 'salt-sol' },
    (sa, sb) => ['ca', 'mg', 'fe2', 'fe3'].includes(sb.cation) ? { rate: 0.05, tintTo: 0xE8E4DA, note: 'hard-water ions kill the lather — scum forms' } : null, 'soap-scum', '{a} + {b} → Soap Scum'),
  F('life-water', { aTest: (s) => s.profile === 'life' || s.profile === 'plant', bTest: (s) => s.profile === 'water' },
    () => ({ rate: 0.02, tintTo: 0x3FA34D, note: 'water supports growth' }), 'growth', '{a} + {b} → Growth Support'),
  F('plant-soil', { aTest: (s) => s.profile === 'life' || s.profile === 'plant', bFam: 'soil' },
    () => ({ rate: 0.015, tintTo: 0x3FA34D, note: 'roots take hold — growth support' }), 'growth', '{a} + {b} → Growth Support'),
  F('nutrient-plant', { aFam: 'nutrient', bTest: (s) => s.profile === 'life' || s.profile === 'plant' },
    () => ({ rate: 0.03, tintTo: 0x3FA34D, note: 'fertiliser feeds growth' }), 'growth', '{a} + {b} → Growth Support'),
  F('ferment', { aTest: (s) => ['yeast', 'microbes', 'fungus'].includes(s.key), bFam: 'food' },
    (sa, sb, ctx) => (ctx.mixed > 0 || ctx.temp >= 30) ? { rate: 0.015, gas: 'co2', gasN: 1, tintTo: 0xE8D44D } : null, 'fermentation', '{a} + {b} → Fermentation'),
  F('gas-aqueous', { aTest: (s) => s.cls === 'gas' && (s.solubility || 0) >= 0.45, bTest: (s) => hasFam(s, 'aqueous') && s.cls === 'liquid' },
    (sa) => { const phHint = { co2: 5, 'sulfur-dioxide': 3, 'ammonia-gas': 11, 'hydrogen-chloride-gas': 1, 'hydrogen-sulfide': 4, 'chlorine-gas': 3 }[sa.key] ?? 7; return { rate: 0.05, tintTo: indicatorColour('universal-indicator', phHint), note: 'gas dissolves into the liquid' }; }, 'gas-dissolve', '{a} Dissolves in {b}'),
  F('salt-frozen', { aTest: (s) => (hasFam(s, 'salt-sol') && s.cls === 'liquid') || s.key === 'salt' || s.key === 'calcium-chloride', bFam: 'frozen' },
    (sa, sb) => ({ rate: 0.06, heat: -14, outB: sb.meltTo && has(sb.meltTo) ? sb.meltTo : 'water', tintTo: 0xEAF4FF }), 'freezing-mixture', '{a} + {b} → Freezing Mixture'),
  F('electric-conductive', { aTest: isSparkSource, bTest: (s) => (s.electric || 0) >= 0.3 && s.cls !== 'electric' },
    (sa, sb) => ({ rate: 0.1, heat: Math.round(20 + 40 * (sb.electric || 0)) }), 'electric-heating', '{a} Heats {b}'),
  F('base-glass', { aTest: (s) => hasFam(s, 'strong-base'), bFam: 'glass' },
    () => ({ rate: 0.004, outB: 'frosted-glass', tintTo: 0xE8ECEE, note: 'strong alkali etches glass, slowly' }), 'base-etch', 'Strong Alkali Etches {b}'),
  // plant-bloc families: wood / fibre / paper / plant-matter are NOT in the
  // 'organic' fam, so the organic rules above never reach them — these do.
  F('life-aqueous', { aTest: (s) => s.profile === 'life' || s.profile === 'plant', bTest: (s) => hasFam(s, 'aqueous') && s.cls === 'liquid' },
    (sa, sb) => {
      if (sb.profile === 'water') return { rate: 0.02, tintTo: 0x3FA34D, note: 'growth support' };
      if (hasFam(sb, 'salt-sol')) return { rate: 0.015, tintTo: 0x8A7A2A, note: 'salty liquid — osmotic wilt' };
      if (sb.ph != null && (sb.ph < 4 || sb.ph > 10)) return { rate: 0.015, tintTo: 0x8A5B2A, note: 'harsh pH scorches living tissue' };
      if (hasFam(sb, 'food')) return { rate: 0.015, tintTo: 0x9ACD32, note: 'microbes and algae colonise food liquids — spoilage and growth' };
      return { rate: 0.01, tintTo: 0x3FA34D, note: 'moisture supports it' };
    }, 'growth', '{a} + {b} → Growth / Spoilage'),
  F('hot-fuel-liquid', { aFam: 'hot-liquid', bTest: (s) => s.cls === 'liquid' && (s.flammability || 0) >= 0.4 },
    (sa) => tempOf(sa) >= 400 ? { rate: 0.12, outB: 'fire', gas: 'smoke', gasN: 1, heat: 40 } : null, 'hot-ignition', '{a} Ignites {b}'),
  F('oxidiser-plant', { aFam: 'oxidiser', bTest: (s) => hasFam(s, 'plant-matter') || hasFam(s, 'fibre') || hasFam(s, 'paper') || hasFam(s, 'wood') },
    (sa, sb, ctx) => { const p = oxPower(sa); if (ctx.temp < 150 && p < 0.6 && (sb.flammability || 0) < 0.3) return null; return { rate: 0.008 + 0.04 * p * Math.max(sb.flammability || 0, 0.3), tintTo: 0x3A2A1A, heat: Math.round(8 + 24 * p) }; }, 'oxidation', '{a} + {b} → Oxidation'),
  F('acid-plant', { aFam: 'acid', bTest: (s) => hasFam(s, 'plant-matter') || hasFam(s, 'fibre') || hasFam(s, 'paper') || hasFam(s, 'wood') },
    (sa, sb) => { const str = sa.acidStrength || 0; if (str >= 0.85) return { rate: 0.025, outB: sb.cls === 'liquid' ? null : 'charcoal-powder', tintTo: 0x2A2A2A, heat: 10, gas: 'steam', gasN: 1 }; if (str >= 0.4) return { rate: 0.012, tintTo: 0x4A3A2A, note: 'acid withers and chars plant matter' }; return { rate: 0.006, tintTo: 0x6B5B4A, note: 'weak acid pickles / withers slowly' }; }, 'acid-organic', '{a} + {b} → Slow Attack'),
  F('base-plant', { aFam: 'base', bTest: (s) => hasFam(s, 'plant-matter') || hasFam(s, 'fibre') || hasFam(s, 'paper') || hasFam(s, 'wood') },
    (sa) => { const bs = sa.ph != null ? (sa.ph - 7) / 7 : (hasFam(sa, 'strong-base') ? 0.9 : 0.35); return bs >= 0.35 ? { rate: 0.012, tintTo: 0xD8C8A8, note: 'alkali pulps and digests plant matter' } : null; }, 'caustic', '{a} + {b} → Caustic Attack'),
  F('peroxide-plant', { aFam: 'peroxide', bTest: (s) => hasFam(s, 'plant-matter') || hasFam(s, 'fibre') || hasFam(s, 'paper') || hasFam(s, 'wood') },
    () => ({ rate: 0.02, tintTo: 0xEDEDE6, note: 'peroxide scorches and bleaches plant matter' }), 'bleaching', '{a} + {b} → Bleaching'),
  F('dye-fibre', { aFam: 'dye', bTest: (s) => hasFam(s, 'fibre') || hasFam(s, 'wood') || hasFam(s, 'paper') },
    (sa, sb) => ({ rate: 0.04, tintTo: sa.col ? sa.col[0] : null, note: 'the fibre drinks the dye — dyeing' }), 'dyeing', '{a} Dyes {b}'),
  F('oil-wood', { aFam: 'oil', bFam: 'wood' },
    () => ({ rate: 0.03, tintTo: 0x8A6B42, note: 'oil soaks in — the wood finish' }), 'dyeing', '{a} Finishes {b}'),
  F('oil-dye', { aFam: 'oil', bFam: 'dye' },
    (sa, sb) => ({ rate: 0.04, tintTo: sb.col ? sb.col[0] : null, note: 'dye disperses in oil — oil paint' }), 'dye-dissolve', '{a} + {b} → Oil Paint'),
  F('solvent-food', { aFam: 'solvent', bFam: 'food' },
    (sa, sb) => (sb.cls === 'liquid' || (sb.solubility || 0) >= 0.3) ? { rate: 0.04, tintTo: sb.col ? sb.col[0] : null, note: 'solvent extracts flavours and oils — a tincture' } : null, 'tincture', '{a} Extracts {b}'),
  F('gas-solvent', { aTest: (s) => s.cls === 'gas' && (s.solubility || 0) >= 0.5, bTest: (s) => (hasFam(s, 'oil') || hasFam(s, 'solvent')) && s.cls === 'liquid' },
    () => ({ rate: 0.04, tintTo: 0xD8E8D8, note: 'gas scrubbed into the solvent' }), 'gas-dissolve', '{a} Dissolves in {b}'),
  F('oxidiser-sols', { aFam: 'oxidiser', bFam: 'salt-sol' },
    (sa, sb) => (['i', 'br', 's2o3', 'so3', 'acetate'].includes(sb.anion) || ['fe2', 'mn2'].includes(sb.cation)) ? { rate: 0.05, tintTo: 0x7A4A1E, note: 'oxidiser attacks the reducing ion' } : null, 'oxidation', '{a} + {b} → Oxidation'),
  F('mordant-dye', { aTest: (s) => hasFam(s, 'salt-sol') && ['al3', 'fe3', 'fe2', 'cu2', 'cr3'].includes(s.cation), bFam: 'dye' },
    () => ({ rate: 0.04, tintTo: 0x4A2A6B, note: 'mordant ions fix and deepen the dye' }), 'ph-tint', '{a} Fixes {b}'),
  F('cryogen-stone', { aFam: 'cryogen', bFam: 'stone' },
    () => ({ rate: 0.02, heat: -30, tintTo: 0xDCEFF5, note: 'frost wedging in the pores' }), 'deep-freeze', '{a} + {b} → Frost Wedging'),
  F('hot-polymer', { aFam: 'hot-liquid', bTest: (s) => hasFam(s, 'polymer') || hasFam(s, 'rubber') },
    (sa) => tempOf(sa) >= 200 ? { rate: 0.04, tintTo: 0x2A2A2A, note: 'heat deforms and chars it' } : null, 'thermal-shock', '{a} + {b} → Heat Damage'),
  F('acid-ceramic', { aFam: 'acid', bFam: 'ceramic' },
    (sa) => (sa.acidStrength || 0) >= 0.6 ? { rate: 0.008, tintTo: 0xC8C0B0, note: 'strong acid etches glazes and ceramics slowly' } : null, 'acid-etch', '{a} Etches {b}'),
  F('solvent-explosive', { aFam: 'solvent', bFam: 'explosive' },
    (sa, sb) => ((sb.solubility || 0) >= 0.25 || ['nitroglycerin', 'nitrocellulose', 'tatp'].includes(sb.key)) ? { rate: 0.04, tintTo: sb.col ? sb.col[0] : null, note: 'solvent dissolves the explosive — dynamite chemistry' } : null, 'dye-dissolve', '{a} Dissolves {b}'),
  F('halogen-aqueous', { aTest: (s) => REACTIVE_HALOGENS.includes(s.key), bTest: (s) => hasFam(s, 'aqueous') && s.cls === 'liquid' },
    (sa) => ({ rate: 0.05, tintTo: sa.key === 'bromine' ? 0xF08A24 : 0xE8E86B, note: 'halogen water — the halogen dissolves and hydrolyses' }), 'gas-dissolve', '{a} + {b} → Halogen Water'),
  F('sulfur-base', { aTest: (s) => hasFam(s, 'sulfur-bearing'), bFam: 'base' },
    (sa, sb, ctx) => ctx.temp >= 150 ? { rate: 0.03, tintTo: 0x8A2A1A, note: 'hot alkali + sulfur → liver of sulfur (polysulfides)' } : null, 'sulfide', '{a} + {b} → Liver of Sulfur'),
  F('water-wood', { aTest: (s) => s.profile === 'water', bFam: 'wood' },
    () => ({ rate: 0.01, tintTo: 0x8A6B42, note: 'water leaches tannins — tea-brown' }), 'tincture', '{a} Leaches {b}'),
  F('water-carbonate-rock', { aTest: (s) => s.profile === 'water', bFam: 'carbonate-rock' },
    () => ({ rate: 0.004, tintTo: 0xD8E8E8, note: 'karst: water slowly dissolves limestone — how caves form' }), 'karst', '{a} + {b} → Karst Dissolve'),
  // pH-as-data families: a liquid's measured pH drives real chemistry even
  // when it carries no 'acid'/'base' fam (lemon juice etches marble, cola
  // corrodes iron, alkaline cleaners bite aluminium). Rates scale with the
  // distance from neutral and the partner's own data.
  F('ph-metal', { aTest: (s) => s.cls === 'liquid' && s.ph != null, bFam: 'metal' },
    (sa, sb) => {
      const rank = sb.activityRank || 0;
      if (sa.ph <= 4.2 && rank >= 35) return { rate: 0.004 + 0.004 * (4.2 - sa.ph) * (rank / 50), gas: 'hydrogen', gasN: 1, outB: sb.saltKey && has(sb.saltKey) ? sb.saltKey : null, tintTo: 0x6B5B4A, note: 'the liquid\'s own acidity corrodes the metal — slow fizz' };
      if (sa.ph >= 11.5 && ['aluminium', 'zinc', 'tin', 'lead'].includes(baseKey(sb.key))) return { rate: 0.008, gas: 'hydrogen', gasN: 1, outB: sb.saltKey && has(sb.saltKey) ? sb.saltKey : null, note: 'strongly alkaline liquid dissolves this amphoteric metal' };
      return null;
    }, 'acid-metal', '{a} + {b} → Slow Corrosion'),
  F('ph-carbonate', { aTest: (s) => s.cls === 'liquid' && s.ph != null && s.ph <= 4.5, bTest: (s) => hasFam(s, 'carbonate') || hasFam(s, 'carbonate-rock') || hasFam(s, 'bicarbonate') },
    (sa) => ({ rate: 0.01 + 0.01 * (4.5 - sa.ph), gas: 'co2', gasN: 1, note: 'even a food acid fizzes on carbonate' }), 'acid-carbonate', '{a} + {b} → CO2 Fizz'),
  F('ph-stone', { aTest: (s) => s.cls === 'liquid' && s.ph != null, bFam: 'stone' },
    (sa) => {
      if (sa.ph <= 4.5) return { rate: 0.004 + 0.004 * (4.5 - sa.ph), tintTo: 0xC8C0B0, note: 'acidic liquid etches stone — acid rain in miniature' };
      if (sa.ph >= 12) return { rate: 0.003, tintTo: 0xD8D0C0, note: 'strongly alkaline liquid attacks the stone surface' };
      return null;
    }, 'acid-etch', '{a} Etches {b}'),
  F('ph-plant', { aTest: (s) => s.cls === 'liquid' && s.ph != null && (s.ph <= 4.5 || s.ph >= 10.5), bTest: (s) => hasFam(s, 'plant-matter') || hasFam(s, 'fibre') || hasFam(s, 'paper') || hasFam(s, 'wood') },
    (sa) => ({ rate: 0.008, tintTo: 0x8A7A2A, note: sa.ph <= 4.5 ? 'acid-rain scorch' : 'alkaline scorch' }), 'acid-organic', '{a} + {b} → Scorch'),
  F('ph-dye', { aTest: (s) => s.cls === 'liquid' && s.ph != null, bFam: 'dye' },
    (sa) => ({ rate: 0.03 + 0.01 * Math.abs(sa.ph - 7), tintTo: indicatorColour('universal-indicator', sa.ph), consumeA: false, consumeB: false, note: 'any pH liquid bends a dye\'s colour' }), 'ph-tint', '{a} Tints {b}'),
  F('ph-food', { aTest: (s) => s.cls === 'liquid' && s.ph != null && s.ph <= 4.5, bFam: 'food' },
    (sa) => ({ rate: 0.008, tintTo: 0xD8C8A8, note: 'acidic liquid marinates / curdles / leaches the food' }), 'acid-organic', '{a} + {b} → Marinade'),
  F('ph-glass', { aTest: (s) => s.cls === 'liquid' && s.ph != null && s.ph >= 12, bFam: 'glass' },
    () => ({ rate: 0.002, tintTo: 0xE8ECEE, note: 'strongly alkaline liquids slowly frost glass' }), 'base-etch', '{a} Frosts {b}'),
  F('lava-earth', { aFam: 'hot-liquid', bTest: (s) => s.cat === 'earth' && hasFam(s, 'stone') },
    (sa, sb) => tempOf(sa) >= 1100 ? { rate: 0.03, outB: sb.key === 'sand' ? 'molten-glass' : 'lava', note: 'the earth melts into the melt' } : null, 'thermal-shock', '{a} Melts {b}'),
  F('hot-shock-solid', { aFam: 'hot-liquid', bTest: (s) => hasFam(s, 'ceramic') || hasFam(s, 'stone') },
    (sa) => tempOf(sa) >= 700 ? { rate: 0.015, tintTo: 0x5B5B5B, heat: -20, note: 'thermal shock — the surface crazes and cracks' } : null, 'thermal-shock', '{a} + {b} → Thermal Shock'),
  F('oil-polymer', { aFam: 'oil', bTest: (s) => hasFam(s, 'polymer') || hasFam(s, 'rubber') },
    (sa, sb) => ({ rate: 0.02, tintTo: sb.col ? sb.col[0] : null, note: 'oils swell and soften polymers and rubbers' }), 'solvent-attack', '{a} Swells {b}'),
  F('sol-soil', { aFam: 'salt-sol', bFam: 'soil' },
    (sa) => (['k', 'nh4', 'ca', 'mg'].includes(sa.cation) || ['po4', 'no3', 'so4'].includes(sa.anion)) ? { rate: 0.02, tintTo: 0x3FA34D, note: 'fertiliser ions feed the soil' } : null, 'growth', '{a} Feeds {b}'),
  F('base-soil', { aFam: 'base', bFam: 'soil' },
    () => ({ rate: 0.015, tintTo: 0xD8C8A8, note: 'liming: alkali neutralises sour soil' }), 'growth', '{a} Limes {b}'),
  F('ph-ceramic', { aTest: (s) => s.cls === 'liquid' && s.ph != null && s.ph <= 4.5, bFam: 'ceramic' },
    (sa) => ({ rate: 0.004 + 0.003 * (4.5 - sa.ph), tintTo: 0xC8C0B0, note: 'acidic liquid etches glazes slowly' }), 'acid-etch', '{a} Etches {b}'),
  F('ph-salt-solid', { aTest: (s) => s.cls === 'liquid' && s.ph != null && s.ph <= 4, bTest: (s) => s.profile === 'salt-solid' },
    (sa, sb) => {
      if (hasFam(sb, 'carbonate')) return null; // ph-carbonate handles it
      if (sb.key.endsWith('-oxide')) { const m = R(baseKey(sb.key.replace('-oxide', ''))); const prod = m ? solFor(m, 'chloride') : null; if (prod) return { rate: 0.02, outB: prod, note: 'the liquid\'s acidity neutralises the oxide to a salt' }; }
      if ((sb.solubility || 0) >= 0.3) return { rate: 0.008, tintTo: 0xE8DCC0, note: 'acidic liquid re-anions the salt slowly' };
      return null;
    }, 'acid-oxide', '{a} + {b} → Salt + Water'),
  F('hot-melt-metal', { aFam: 'hot-liquid', bFam: 'metal' },
    (sa, sb) => { const t = tempOf(sa); return (sb.meltPoint != null && t >= 600 && sb.meltPoint <= t - 200 && sb.meltTo && has(sb.meltTo)) ? { rate: 0.04, outB: sb.meltTo, note: 'the fiercer melt swallows the softer metal' } : null; }, 'thermal-shock', '{a} Melts {b}'),
  F('hot-wax', { aFam: 'hot-liquid', bFam: 'wax' },
    (sa, sb) => tempOf(sa) >= 150 ? { rate: 0.05, outB: sb.meltTo && has(sb.meltTo) ? sb.meltTo : 'molten-wax', note: 'wax melts into the hot liquid' } : null, 'thermal-shock', '{a} Melts {b}'),
  F('acidgas-rock', { aTest: (s) => s.cls === 'gas' && hasFam(s, 'acid'), bTest: (s) => hasFam(s, 'carbonate-rock') || hasFam(s, 'carbonate') },
    () => ({ rate: 0.006, tintTo: 0xC8C0B0, note: 'acid gas weathers carbonate stone — acid rain damage' }), 'acid-etch', '{a} Weathers {b}'),
  F('cryogen-polymer', { aFam: 'cryogen', bTest: (s) => hasFam(s, 'polymer') || hasFam(s, 'rubber') },
    () => ({ rate: 0.025, tintTo: 0xDCEFF5, note: 'deep cold makes it glass-brittle' }), 'deep-freeze', '{a} + {b} → Deep Freeze'),
  F('sol-hydrolysis', { aFam: 'salt-sol', bTest: (s) => s.profile === 'water' },
    (sa) => (sa.cation === 'bi3' || sa.cation === 'sb3') ? { rate: 0.05, outA: sa.cation === 'bi3' ? 'bismuth-oxide' : 'antimony-oxide', tintTo: 0xF5F5F0, note: 'hydrolyses in water — white oxychloride precipitates (shown as oxide)' } : null, 'precipitation', '{a} + {b} → Hydrolysis'),
  F('oxygen-sols', { aTest: (s) => s.key === 'oxygen', bFam: 'salt-sol' },
    (sa, sb) => (sb.cation === 'fe2' || ['so3', 's2o3', 'i'].includes(sb.anion)) ? { rate: 0.01, tintTo: sb.cation === 'fe2' ? 0xA85B2A : 0x7A4A1E, note: 'air slowly oxidises this ion — the tint deepens' } : null, 'oxidation', '{a} + {b} → Air Oxidation'),
  F('base-ceramic', { aTest: (s) => hasFam(s, 'strong-base'), bFam: 'ceramic' },
    () => ({ rate: 0.004, tintTo: 0xD8D0C0, note: 'strong alkali attacks glazes slowly' }), 'base-etch', '{a} Etches {b}'),
  F('halogen-dye', { aTest: (s) => REACTIVE_HALOGENS.includes(s.key) || s.key === 'sulfur-dioxide', bFam: 'dye' },
    (sa) => ({ rate: 0.04, tintTo: 0xEDEDE6, note: sa.key === 'sulfur-dioxide' ? 'SO2 bleaches dyes and flowers — the classic demo' : 'halogen gas bleaches the dye' }), 'bleaching', '{a} Bleaches {b}'),
  // ---- W32U-2 Tier-2 deepening families (appended last: every family above
  // keeps priority; these are parameterised residual/physical rules) ----
  F('miscibility', { aTest: (s) => s.cls === 'liquid', bTest: (s) => s.cls === 'liquid' },
    (sa, sb, ctx) => {
      if (hasFam(sa, 'hot-liquid') || hasFam(sb, 'hot-liquid')) return null;
      const dyeKeys = new Set(['iodine-tincture', 'iodine', 'bromine']);
      const isDyeSide = (s) => hasFam(s, 'dye') || dyeKeys.has(s.key);
      const oilA = hasFam(sa, 'oil'), oilB = hasFam(sb, 'oil');
      const aqA = hasFam(sa, 'aqueous'), aqB = hasFam(sb, 'aqueous');
      // measured water-miscibility (solWater, FIX-A data) beats Hansen Ra
      // whenever one side is water-like — Ra misreads strong H-bonders
      // (ethanol/water Ra≈24 yet fully miscible).
      const wlA = sa.profile === 'water' || aqA, wlB = sb.profile === 'water' || aqB;
      const swOther = wlA && sb.solWater != null ? sb : (wlB && sa.solWater != null ? sa : null);
      const swBlend = () => 0.04 + 0.02 * (1 / (1 + (sa.viscosity || 0) + (sb.viscosity || 0)));
      if ((oilA && aqB) || (oilB && aqA)) {
        if (isDyeSide(sa) || isDyeSide(sb)) {
          const dye = isDyeSide(sa) ? sa : sb;
          return { rate: 0.05, tintTo: dye.col ? dye.col[1] : 0x7A4A1E, consumeA: false, consumeB: false, note: 'partition — the colour migrates into the oil layer' };
        }
        if (swOther && swOther.solWater === 'immiscible' && (ctx.mixed || 0) >= 0.5) {
          return { rate: 0.05, tintTo: blendToward(blendCol(sa, sb), 0xFFFFFF, 0.35), consumeA: false, consumeB: false, note: `immiscible with water (measured miscibility) — shaken into a temporary emulsion that separates again` };
        }
        return null; // plain oil/water layering is the verdict layer's call
      }
      if (swOther) {
        if ((ctx.mixed || 0) < 0.5) return null; // contact alone does not blend liquids
        if (swOther.solWater === 'miscible') {
          const hot = (((sa.acidStrength || 0) >= 0.8 || hasFam(sa, 'strong-base')) && aqB) || (((sb.acidStrength || 0) >= 0.8 || hasFam(sb, 'strong-base')) && aqA);
          return { rate: swBlend(), tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, heat: hot ? 8 : 0, note: `fully miscible with water (measured miscibility) — ${swOther.name} blends freely with water` };
        }
        if (swOther.solWater === 'partial') {
          return { rate: swBlend() / 2, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: `partially miscible with water (measured miscibility) — ${swOther.name} blends with water only where stirred / in part` };
        }
        if (swOther.solWater === 'immiscible') {
          return { rate: 0.05, tintTo: blendToward(blendCol(sa, sb), 0xFFFFFF, 0.35), consumeA: false, consumeB: false, note: `immiscible with water (measured miscibility) — shaken into a temporary emulsion that separates again` };
        }
      }
      const Ra = hansenDist(sa, sb);
      if (Ra == null) return null;
      if ((ctx.mixed || 0) < 0.5) return null; // contact alone does not blend liquids
      const viscSum = (sa.viscosity || 0) + (sb.viscosity || 0);
      const blendRate = 0.04 + 0.02 * (1 / (1 + viscSum));
      if (Ra <= 8) {
        const hot = (((sa.acidStrength || 0) >= 0.8 || hasFam(sa, 'strong-base')) && aqB) || (((sb.acidStrength || 0) >= 0.8 || hasFam(sb, 'strong-base')) && aqA);
        return { rate: blendRate, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, heat: hot ? 8 : 0, note: `miscible — Hansen distance Ra=${Ra.toFixed(1)} (<=8), the liquids blend freely` };
      }
      if (Ra <= 14) return { rate: blendRate / 2, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'partly miscible — blends where stirred' };
      return { rate: 0.05, tintTo: blendToward(blendCol(sa, sb), 0xFFFFFF, 0.35), consumeA: false, consumeB: false, note: 'immiscible — shaken into a temporary emulsion that separates again' };
    }, 'miscibility', '{a} + {b} → Miscibility'),
  F('ph-neutralisation', { aTest: (s) => s.cls === 'liquid' && s.ph != null, bTest: (s) => s.cls === 'liquid' && s.ph != null },
    (sa, sb) => {
      const dPh = Math.abs(sa.ph - sb.ph);
      const opp = (sa.ph < 7 && sb.ph > 7) || (sa.ph > 7 && sb.ph < 7);
      if (!opp) return null;
      const acidSide = sa.ph < 7 ? sa : sb, baseSide = sa.ph < 7 ? sb : sa;
      const note = (acidSide.pka != null && baseSide.pka != null)
        ? `proton transfer: the stronger acid wins the proton (pKa ${acidSide.pka} vs ${baseSide.pka}) — pH ${sa.ph} meets pH ${sb.ph}`
        : `acid meets alkali in solution — pH ${sa.ph} neutralises pH ${sb.ph}`;
      return { rate: 0.06 + 0.04 * Math.min(1, dPh / 8), heat: Math.round(dPh * 1.2), outA: Math.abs(sa.ph - 7) >= 2.5 ? 'salt-water' : null, outB: Math.abs(sb.ph - 7) >= 2.5 ? 'salt-water' : null, note };
    }, 'ph-neutralisation', '{a} + {b} → pH Neutralisation'),
  F('dissolution-fam', { aTest: (s) => s.cls === 'liquid', bTest: (s) => s.cls === 'powder' || s.cls === 'solid' },
    (sa, sb) => {
      // sa is the liquid (familyOutcome orients via aTest/bTest), sb the partner
      const sol = sb.solubility || 0;
      if (sol < 0.3) return null;
      if (hasFam(sb, 'metal') || hasFam(sb, 'carbonate') || hasFam(sb, 'bicarbonate') || hasFam(sb, 'explosive')) return null;
      if (sb.cls === 'powder') return { rate: 0.03 + 0.05 * sol, outB: sa.key, tintTo: blendCol(sa, sb), note: 'dissolves — rate and saturation from its solubility data' };
      return { rate: (0.03 + 0.05 * sol) / 2, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'surface dissolves slowly' };
    }, 'dissolution-fam', '{a} Dissolves {b}'),
  F('wetting', { aTest: (s) => s.cls === 'liquid', bTest: (s) => s.cls === 'solid' || s.cls === 'powder' },
    (sa, sb) => {
      const v = sa.viscosity || 0;
      return { rate: 0.03 + 0.02 * (1 / (1 + v)), tintTo: darken(sb.col ? sb.col[0] : 0x808080, 0.82), consumeA: false, consumeB: false, note: v <= 0.35 ? `spreads and wets the surface (viscosity ${v})` : (v >= 0.6 ? `beads and creeps slowly (viscosity ${v})` : `wets the surface, creeping at viscosity ${v}`) };
    }, 'wetting', '{a} Wets {b}'),
  F('powder-blend', { aTest: (s) => s.cls === 'powder', bTest: (s) => s.cls === 'powder' },
    (sa, sb) => {
      const avgDisp = ((sa.dispersion || 0) + (sb.dispersion || 0)) / 2;
      const dispF = avgDisp / (avgDisp + 4);
      return { rate: 0.02 + 0.02 * dispF, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: `dry blend — mixed by density and grain (densities ${sa.density} / ${sb.density})` };
    }, 'powder-blend', '{a} + {b} → Dry Blend'),
  F('powder-coat', { aTest: (s) => s.cls === 'powder', bTest: (s) => s.cls === 'solid' },
    (sa, sb) => {
      const gap = Math.abs((sa.hardness || 0) - (sb.hardness || 0));
      return { rate: 0.03, tintTo: sa.col ? sa.col[0] : null, consumeA: false, consumeB: false, note: gap >= 0.3 ? 'abrasive dust grinds and coats the surface' : 'dust settles and coats the surface' };
    }, 'powder-coat', '{a} Coats {b}'),
  F('solid-contact', { aTest: (s) => s.cls === 'solid', bTest: (s) => s.cls === 'solid' },
    (sa, sb, ctx) => {
      for (const [hot, other, isB] of [[sa, sb, true], [sb, sa, false]]) {
        const st = hot.sourceTemp != null ? hot.sourceTemp : -1;
        if (st >= 200 && other.meltPoint != null && st >= other.meltPoint && other.meltTo && has(other.meltTo)) {
          return isB ? { rate: 0.03, outB: other.meltTo, note: 'contact melting' } : { rate: 0.03, outA: other.meltTo, note: 'contact melting' };
        }
      }
      if (hasFam(sa, 'metal') && hasFam(sb, 'metal') && (ctx.temp || 0) >= 300) return { rate: 0.01, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'hot metals alloy at the contact face' };
      const ha = sa.hardness || 0, hb = sb.hardness || 0;
      if (Math.abs(ha - hb) >= 0.35) {
        const softer = ha < hb ? sa : sb, harder = ha < hb ? sb : sa;
        const tint = blendToward(blendCol(sa, sb), softer.col ? softer.col[1] : 0x808080, 0.4);
        return { rate: 0.015, tintTo: tint, consumeA: false, consumeB: false, note: `the harder face abrades the softer (hardness ${harder.hardness} vs ${softer.hardness})` };
      }
      return null;
    }, 'solid-contact', '{a} + {b} → Solid Contact'),
  F('gas-surface', { aTest: (s) => s.cls === 'gas', bTest: (s) => s.cls === 'solid' || s.cls === 'powder' },
    (sa, sb) => {
      if ((hasFam(sa, 'oxidiser') || sa.key === 'oxygen') && hasFam(sb, 'metal')) return { rate: 0.008, tintTo: 0x6B4A2A, consumeA: false, consumeB: false, note: 'surface oxidation film' };
      if (hasFam(sa, 'acid') && hasFam(sb, 'stone')) return { rate: 0.006 + 0.02 * (sa.acidStrength || 0.2), tintTo: 0xC8C0B0, consumeA: false, consumeB: false, note: 'acid gas etches the stone surface' };
      if (REACTIVE_HALOGENS.includes(sa.key) && (hasFam(sb, 'organic') || hasFam(sb, 'plant-matter') || hasFam(sb, 'paper'))) return { rate: 0.012, tintTo: 0xEDEDE6, consumeA: false, consumeB: false, note: 'halogen gas bleaches the surface' };
      if (sb.cls === 'powder') return { rate: 0.01, tintTo: lighten(sb.col ? sb.col[0] : 0x808080, 1.1), consumeA: false, consumeB: false, note: 'the gas stream lifts and dusts the powder surface' };
      return null;
    }, 'gas-surface', '{a} + {b} → Gas on Surface'),
  F('gas-absorption', { aTest: (s) => s.cls === 'gas', bTest: (s) => s.cls === 'liquid' },
    (sa) => {
      const sol = sa.solubility || 0;
      if (sol < 0.12) return null;
      const phHint = { co2: 5, 'sulfur-dioxide': 3, 'ammonia-gas': 11, 'hydrogen-chloride-gas': 1, 'hydrogen-sulfide': 4, 'chlorine-gas': 3 }[sa.key] ?? 7;
      return { rate: 0.02 + 0.04 * sol, tintTo: indicatorColour('universal-indicator', phHint), consumeA: false, consumeB: false, note: 'gas absorbs into the liquid — Henry-law solubility' };
    }, 'gas-absorption', '{a} Absorbs into {b}'),
  // ---- W32U-3 coverage squeeze families (appended last: every family above
  // keeps priority; these are parameterised physical floors) ----
  F('gas-absorption-low', { aTest: (s) => s.cls === 'gas', bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => {
      const sol = sa.solubility || 0;
      if (sol < 0.02 || sol >= 0.12) return null;
      return { rate: 0.004 + 0.05 * sol, tintTo: blendToward(sb.col ? sb.col[0] : 0x808080, sa.col ? sa.col[1] : 0xFFFFFF, 0.2), consumeA: false, consumeB: false, note: 'sparingly soluble — dissolves slowly (Henry\'s law)' };
    }, 'gas-absorption', '{a} Absorbs into {b}'),
  F('vapour-condense', { aTest: (s) => s.cls === 'gas' && s.key.endsWith('-vapour'), bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => {
      let bk = sa.key.replace(/-vapour$/, '');
      if (bk === 'alcohol') bk = 'ethanol';
      if (bk === 'ether') bk = 'diethyl-ether';
      const base = R(bk); if (!base) return null;
      if (sa.key === 'mercury-vapour' && sb.profile === 'water') return { rate: 0.006, tintTo: blendToward(sb.col ? sb.col[0] : 0x808080, 0xC0C8D0, 0.2), consumeA: false, consumeB: false, note: 'mercury vapour condenses only sparingly into water — a toxic trace' };
      let soluble = false;
      if (sb.profile === 'water' || hasFam(sb, 'aqueous')) soluble = base.solWater === 'miscible' || base.solWater === 'partial' || (base.solubility || 0) >= 0.3;
      else {
        const Ra = hansenDist(base, sb);
        if (Ra != null) soluble = Ra <= 14;
        else if (hasFam(sb, 'oil') || hasFam(sb, 'solvent')) soluble = base.solWater === 'immiscible' || hasFam(base, 'oil') || hasFam(base, 'fuel') || hasFam(base, 'solvent');
      }
      if (!soluble) return null;
      return { rate: 0.03, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'vapour condenses and dissolves into the liquid' };
    }, 'vapour-condense', '{a} Condenses into {b}'),
  F('molten-quench', { aTest: (s) => s.cls === 'liquid' && ((s.sourceTemp ?? 0) >= 300 || (s.meltPoint ?? 0) >= 300), bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => {
      const t = Math.max(sa.sourceTemp ?? 0, sa.meltPoint ?? 0);
      if (sb.boilPoint != null && sb.boilPoint <= t) return { rate: 0.1, outB: 'steam', gas: 'steam', gasN: 2, heat: -40, note: 'the cooler liquid flashes to steam on the melt' };
      return { rate: 0.02, tintTo: blendToward(sb.col ? sb.col[0] : 0x808080, 0xFFD8A0, 0.15), consumeA: false, consumeB: false, heat: 15, note: 'the melt heats the liquid' };
    }, 'steam-burst', '{a} + {b} → Steam Burst'),
  F('life-liquid-ext', { aTest: (s) => s.profile === 'life' || s.profile === 'plant', bTest: (s) => s.cls === 'liquid' },
    (sa, sb) => {
      if (hasFam(sb, 'aqueous')) return null; // life-aqueous owns watery liquids
      if (hasFam(sb, 'oil')) return { rate: 0.012, tintTo: 0x6B6B4A, consumeA: false, consumeB: false, note: 'oil coats it — suffocation' };
      if (hasFam(sb, 'solvent') || ['ethanol', 'methanol', 'isopropanol'].includes(sb.key)) return { rate: 0.015, tintTo: 0x8A7A5A, consumeA: false, consumeB: false, note: 'the solvent kills and preserves the tissue' };
      if ((sb.sourceTemp ?? 0) >= 80) return { rate: 0.03, tintTo: 0x8A5B2A, consumeA: false, consumeB: false, heat: 10, note: 'the hot liquid scalds it' };
      return null;
    }, 'harsh-liquid', '{a} in {b} → Harsh Liquid'),
  F('special-surface', { aTest: (s) => s.cls === 'liquid', bTest: (s) => s.cls === 'special' && !FIELD_SPECIALS.has(s.key) },
    (sa, sb) => {
      if (sb.key === 'sponge-cell') return { rate: 0.05, tintTo: sa.col ? sa.col[0] : null, consumeA: false, consumeB: false, note: 'the sponge soaks up the liquid' };
      return { rate: 0.03, tintTo: darken(sb.col ? sb.col[0] : 0x808080, 0.85), consumeA: false, consumeB: false, note: 'the liquid wets/coats the cell surface' };
    }, 'wetting', '{a} Wets {b}'),
  F('gas-diffusion', { aTest: (s) => s.cls === 'gas', bTest: (s) => s.cls === 'gas' },
    (sa, sb) => {
      const f = Math.min(1, Math.abs((sa.density || 0) - (sb.density || 0)));
      return { rate: 0.02 + 0.02 * f, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'the gases diffuse into each other — rate from their densities (Graham\'s law)' };
    }, 'gas-diffusion', '{a} + {b} → Diffusion'),
  F('gas-adsorption', { aTest: (s) => s.cls === 'gas' && (s.solubility || 0) >= 0.1, bTest: (s) => s.cls === 'solid' || s.cls === 'powder' },
    (sa, sb) => {
      if (sb.cls !== 'powder' && (sb.dispersion || 0) <= 0) return null;
      if (sb.key.includes('charcoal') || sb.key.includes('activated')) return { rate: 0.02, tintTo: blendToward(sb.col ? sb.col[0] : 0x2A2A2A, sa.col ? sa.col[1] : 0xFFFFFF, 0.2), consumeA: false, consumeB: false, note: 'activated surface adsorbs the gas eagerly' };
      return { rate: 0.008, tintTo: blendToward(sb.col ? sb.col[0] : 0x808080, sa.col ? sa.col[1] : 0xFFFFFF, 0.12), consumeA: false, consumeB: false, note: 'gas adsorbs onto the porous surface' };
    }, 'gas-adsorption', '{a} Adsorbs onto {b}'),
  F('solid-tribochemical', { aTest: (s) => s.cls === 'solid', bTest: (s) => s.cls === 'solid' },
    (sa, sb, ctx) => {
      const t = ctx.temp || 0;
      if (hasFam(sa, 'oxidiser') !== hasFam(sb, 'oxidiser') && t >= 200) {
        const oxIsA = hasFam(sa, 'oxidiser'), met = oxIsA ? sb : sa;
        if (hasFam(met, 'metal')) {
          const prod = met.oxideKey && has(met.oxideKey) ? met.oxideKey : null;
          const out = { rate: 0.05, heat: 60, note: 'tribochemical oxidation — grinding heat drives it' };
          if (prod) { if (oxIsA) out.outB = prod; else out.outA = prod; } else out.tintTo = 0x3A2A1A;
          return out;
        }
      }
      if (hasFam(sa, 'metal') && hasFam(sb, 'metal') && t >= 150) return { rate: 0.006, tintTo: blendCol(sa, sb), consumeA: false, consumeB: false, note: 'warm metal faces diffuse-bond under pressure' };
      return null;
    }, 'oxidation', '{a} + {b} → Oxidation'),
];

C('miscibility', '{a} + {b} → Miscibility', 'liquid + liquid → blend, layers or emulsion (Hansen Ra)', 'Whether two liquids mix is set by how close their Hansen solubility parameters sit: Ra <= 8 blends freely, beyond 14 they refuse and only shake into a temporary emulsion.', 'Watch the frontier: a smooth gradient means miscible, a sharp line means layers.');
C('ph-neutralisation', '{a} + {b} → pH Neutralisation', 'H+ + OH- → H2O (heat released)', 'Any acid-side liquid meeting any alkali-side liquid neutralises — the bigger the pH gap, the faster and warmer it runs.', 'Watch the temperature climb with the pH gap.');
C('dissolution-fam', '{a} Dissolves {b}', 'solid → dissolved (saturation set by solubility)', 'A soluble solid disappears into the liquid at a rate read from its own solubility data — powders fast, chunks only at the surface.', 'Watch the edges shrink first: dissolution is a surface race.');
C('wetting', '{a} Wets {b}', 'liquid spreads on a surface (viscosity decides)', 'Thin liquids spread and darken the surface as they wet it; thick ones bead up and creep.', 'Watch the dark wet patch spread — faster for thinner liquids.');
C('powder-blend', '{a} + {b} → Dry Blend', 'powder + powder → mixture (no reaction)', 'Two powders simply mix: grain size and density decide how even the blend gets and which colour wins.', 'Watch the two colours marble, then even out.');
C('powder-coat', '{a} Coats {b}', 'dust settles / grinds onto a solid', 'Powder dust coats any solid it rests on; a hard, gritty dust abrades as it coats.', 'Watch the solid take on the powder colour at every contact point.');
C('solid-contact', '{a} + {b} → Solid Contact', 'heat / alloying / abrasion at a contact face', 'Solids still talk at a touching face: a hot one can melt its neighbour, hot metals alloy, and a harder face grinds a softer one down.', 'Watch the contact line — that thin frontier is where it all happens.');
C('gas-surface', '{a} + {b} → Gas on Surface', 'gas + surface → film, etch or bleach', 'A gas works on any surface it flows over: oxidisers film metals, acid gases etch stone, halogens bleach, and any stream dusts loose powder.', 'Watch a film creep across the surface from the contact edge.');
C('gas-absorption', '{a} Absorbs into {b}', 'gas + liquid ⇄ dissolved gas (Henry law)', 'Every gas dissolves into a liquid a little — how much is set by its Henry-law solubility, and the liquid tint shifts with the gas.', 'Watch the liquid tint creep as the gas loads in.');
C('vapour-condense', '{a} Condenses into {b}', 'vapour → dissolved in liquid', 'A vapour meeting a liquid it likes condenses straight into it — the same solubility data that governs the liquid form decides.', 'Watch the vapour thin out as the liquid takes it up.');
C('harsh-liquid', '{a} in {b} → Harsh Liquid', 'living tissue + oil / solvent / heat → damage', 'Life that survives water dies in harsher liquids: oil coats and suffocates, solvents kill and preserve, hot liquids scald.', 'Watch the green fade as the liquid does its damage.');
C('gas-diffusion', '{a} + {b} → Diffusion', 'gas + gas → mixture (Graham law)', 'Gases mix by diffusion alone — lighter molecules wander faster, so the rate follows the density gap between the pair.', 'Watch the boundary blur as the two gases become one mixture.');
C('gas-adsorption', '{a} Adsorbs onto {b}', 'gas + porous surface ⇄ adsorbed layer', 'Porous solids drink gas onto their surfaces; activated charcoal, with its vast inner area, adsorbs eagerly — the gas-mask principle.', 'Watch the surface take on a whisper of the gas colour.');
// family cards for any card id not already defined explicitly
for (const f of FAMILIES) if (!CARDS.has(f.card)) C(f.card, f.cardName || f.id, '—', 'A family reaction: the outcome is computed from both substances\' own data (reactivity, strength, solubility…).', 'Watch the frontier where the two meet.');
C('ammonia-release', '{a} + {b} → Ammonia Released', 'NH4+ + OH− → NH3↑ + H2O', 'Alkali frees ammonia gas from any ammonium compound — the sharp smell gives it away.', 'Watch for the pungent wisps rising.');
C('phosphorus-fire', '{a} + {b} → Phosphorus Fire', 'P compounds + oxidiser → fierce flame', 'Phosphorus compounds ignite eagerly with oxidisers — match-head chemistry.', 'Watch it catch almost before you expect it.');
C('dyeing', '{a} Dyes {b}', 'dye + fibre → fixed colour', 'Dye molecules lodge between the fibres and stay — the oldest colour technology there is.', 'Watch the colour soak in and hold.');
C('tincture', '{a} Extracts {b}', 'solvent + plant/food → tincture', 'The solvent pulls out the soluble flavours, oils and colours — how tinctures and extracts are made.', 'Watch the solvent take on the colour.');
C('karst', '{a} + {b} → Karst Dissolve', 'CaCO3 + CO2 + H2O → Ca(HCO3)2 (slow)', 'Water carrying CO2 dissolves limestone grain by grain — caves, stalactites and hard water all start here.', 'Watch nothing happen fast: this is geology-speed chemistry.');

// ---- PROFILES (Tier 1, per-substance) ----
// Entry: {withKey|withFam, kind?, rate?, consumeSelf?, consumeOther?, outSelf?,
// outOther?, gas?, gasN?, heat?, tintTo?, card?, note?, needs?, tempBand?, block?}
// outSelf = what THIS substance's cell becomes; outOther = the partner's cell.
const AGENT_KEYS = ['aqua-regia', 'hydrofluoric-acid', 'sulfuric-acid', 'sodium-hydroxide', 'bleach', 'hydrogen-peroxide', 'lightning-bolt', 'plasma', 'liquid-nitrogen', 'oxygen'].filter(has);
const FAMOUS = ['water', 'ethanol', 'iron', 'copper', 'aluminium', 'zinc', 'gold', 'silver', 'mercury', 'glass', 'sand', 'chalk', 'marble', 'granite', 'ice', 'sugar', 'salt', 'glycerol', 'starch-sol', 'olive-oil', 'petrol', 'kerosene', 'wax', 'paper', 'wood-oak', 'sulfur-powder', 'charcoal-powder', 'co2', 'hydrogen', 'methane', 'oxygen', 'natural-rubber', 'bleach', 'soap-solution', 'limewater', 'ammonia-solution', 'acetic-acid'].filter(has);
const INERT = (note) => ({ kind: 'inert', note: note || 'no reaction — defined negative' });
function agentBlock(s, reactMap) {
  const out = [];
  for (const k of AGENT_KEYS) {
    if (k === s.key) continue; const r = R(k); if (!r) continue;
    if (reactMap && reactMap[k]) out.push({ withKey: k, ...reactMap[k] });
    else out.push({ withKey: k, ...INERT('no reaction with this agent') });
  }
  return out;
}
function igniterEntries(s) {
  if (!((s.flammability || 0) > 0)) return [];
  return IGNITER_KEYS.filter((k) => k !== s.key).map((k) => ({
    withKey: k, rate: 0.05 + 0.11 * (s.flammability || 0), consumeSelf: true,
    outSelf: s.burnTo && has(s.burnTo) ? s.burnTo : ((s.cls === 'liquid' || s.cls === 'gas') ? null : ((hasFam(s, 'organic') || hasFam(s, 'fuel')) && has('ash') ? 'ash' : null)),
    gas: hasFam(s, 'sulfur-bearing') ? 'sulfur-dioxide' : ((s.flammability || 0) >= 0.7 ? 'smoke' : 'co2'),
    gasN: 1, heat: 90, tintTo: s.flameColour != null ? s.flameColour : null, card: 'combustion', note: 'burns with its own flame colour and rate',
  }));
}
const moltenKey = (s) => { const c = s.key + '-molten'; return has(c) ? c : null; };

const GEN = {};
GEN.metal = (s) => {
  const rank = s.activityRank || 0, bk = baseKey(s.key), e = [];
  const salt = s.saltKey && has(s.saltKey) ? s.saltKey : null;
  // form factor: powder surface area reacts much faster; molten metal is
  // skinned with oxide and reacts slower (25 °C-reference base rates — the
  // engine adds temperature scaling on top).
  const formF = s.cls === 'powder' ? 2.2 : (s.cls === 'liquid' ? 0.55 : 1);
  const formNote = s.cls === 'powder' ? ' (powder form: far more surface — much faster)' : (s.cls === 'liquid' ? ' (molten form: oxide skin slows it)' : '');
  if (rank < 15) e.push({ withFam: 'acid', kind: 'inert', block: true, note: 'noble metal — ordinary acids do not bite (aqua regia is the exception)' });
  else e.push({ withFam: 'acid', rate: (0.028 + 0.1 * Math.pow(rank / 100, 1.3)) * formF, gas: 'hydrogen', gasN: rank >= 80 ? 3 : (rank >= 45 ? 2 : 1), outSelf: salt, heat: 10, card: 'acid-metal', note: 'own kinetics from its activity rank; product is its own salt' + formNote });
  if (s.cls === 'powder' && s.oxideKey && rank >= 25) {
    // metal powders burn in air/flame where a solid chunk of the same metal
    // would not — iron powder and steel wool are the school examples.
    for (const k of ['oxygen', 'fire', 'spark']) e.push({ withKey: k, rate: 0.08, outSelf: P(s.oxideKey, 'metal-powder-burn'), heat: 120, tintTo: 0xFFD8A0, needs: 'ignited', card: 'combustion', note: 'powder form burns — the solid chunk of this metal would not' });
  }
  if (PASSIVE_NITRIC.has(bk)) e.push({ withKey: 'nitric-acid', kind: 'inert', block: true, note: 'passivation: nitric acid grows a protective oxide film' });
  e.push({ withFam: 'salt-sol', rate: (0.045 + 0.07 * (rank / 100)) * (s.cls === 'powder' ? 1.8 : 1), heat: 6, card: 'displacement', note: 'displacement kinetics from its rank (family supplies the plated product)' + (s.cls === 'powder' ? ' — powder form plates faster' : '') });
  if (hasFam(s, 'alkali-metal')) e.push({ withKey: 'water', rate: 0.22, gas: 'hydrogen', gasN: 3, heat: 45, outSelf: P(HYDROXIDE_SOL[bk] || null, 'metal-water'), card: 'alkali-water' });
  else if (bk === 'calcium') e.push({ withKey: 'water', rate: 0.06, gas: 'hydrogen', gasN: 1, heat: 10, outSelf: 'limewater', tintTo: 0xEDEDE6, card: 'calcium-water' });
  else if (bk === 'magnesium') e.push({ withKey: 'water', rate: 0.03, gas: 'hydrogen', gasN: 1, outSelf: 'milk-of-magnesia', needs: 'heated', tempBand: [150, null], card: 'steam-metal', note: 'magnesium needs hot water / steam to react' });
  else e.push({ withKey: 'water', ...INERT('protective oxide film — no reaction with cold water') });
  if (['iron', 'magnesium', 'zinc', 'aluminium', 'steel', 'carbon-steel', 'cast-iron'].includes(bk) && s.oxideKey) e.push({ withKey: 'steam', rate: 0.05, gas: 'hydrogen', gasN: 1, outSelf: P(s.oxideKey, 'metal-steam'), tempBand: [300, null], card: 'steam-metal' });
  if (s.oxideKey && rank >= 20) e.push({ withKey: 'oxygen', rate: 0.02, outSelf: P(s.oxideKey, 'metal-o2'), tempBand: [250, null], card: 'oxidation', note: 'hot metal oxidises in oxygen' });
  else e.push({ withKey: 'oxygen', ...INERT('does not oxidise in air at room conditions') });
  e.push({ withKey: 'sulfur-powder', rate: 0.04, tintTo: 0x2A2A2A, heat: 15, tempBand: [150, null], card: 'sulfide', note: 'heated with sulfur → dark sulfide' });
  e.push({ withFam: 'halogen', rate: (0.03 + 0.06 * (rank / 100)) * (s.cls === 'powder' ? 1.8 : 1), heat: 40, card: 'halogen-metal', note: 'halide formation at its own rate (family supplies the product)' });
  if (['aluminium', 'zinc', 'tin', 'lead'].includes(bk)) e.push({ withFam: 'base', rate: 0.04, gas: 'hydrogen', gasN: 1, outSelf: salt, card: 'amphoteric', note: 'amphoteric: strong alkali dissolves it with hydrogen' });
  else e.push({ withFam: 'base', ...INERT('alkali does not attack this metal') });
  e.push({ withFam: 'oxidiser', rate: 0.03, outSelf: P(s.oxideKey, 'metal-ox'), tempBand: s.cls === 'powder' ? null : [200, null], card: 'oxidation', note: 'oxidiser converts the surface to its oxide' });
  e.push({ withFam: 'peroxide', rate: 0.04, gas: 'oxygen', gasN: 1, card: 'peroxide-catalyst', note: 'metal surface catalyses peroxide breakdown' });
  e.push(...igniterEntries(s));
  e.push(...agentBlock(s, {
    'aqua-regia': bk === 'gold' ? { rate: 0.015, outSelf: 'gold-chloride-sol', card: 'gold-aqua-regia' } : (bk === 'platinum' ? { rate: 0.008, outSelf: 'platinum-chloride-sol', card: 'gold-aqua-regia' } : (rank >= 15 && salt ? { rate: 0.02, outSelf: salt, gas: 'hydrogen', gasN: 1, card: 'acid-metal', note: 'aqua regia dissolves it' } : null)),
    'sulfuric-acid': rank >= 25 && salt ? { rate: 0.02 + 0.05 * (rank / 100), gas: 'hydrogen', gasN: 1, outSelf: solFor(s, 'sulfate'), card: 'acid-metal' } : null,
    'sodium-hydroxide': ['aluminium', 'zinc', 'tin', 'lead'].includes(bk) ? { rate: 0.04, gas: 'hydrogen', gasN: 1, outSelf: salt, card: 'amphoteric' } : null,
    'bleach': rank >= 25 ? { rate: 0.01, tintTo: 0x3A3A3A, note: 'bleach corrodes the surface' } : null,
    'hydrogen-peroxide': ['iron', 'copper', 'nickel', 'cobalt', 'manganese', 'silver', 'platinum', 'palladium'].includes(bk) ? { rate: 0.04, gas: 'oxygen', gasN: 1, card: 'peroxide-catalyst' } : null,
    'lightning-bolt': { rate: 0.2, heat: 150, outSelf: moltenKey(s), tintTo: 0xFFD8A0, note: 'arc strike melts a pit' },
    'plasma': { rate: 0.15, heat: 200, outSelf: moltenKey(s), tintTo: 0xFFD8A0, note: 'plasma melts the surface' },
    'liquid-nitrogen': { rate: 0.03, tintTo: 0xDCEFF5, note: 'goes brittle in deep cold' },
  }));
  return e;
};
GEN['salt-sol'] = (s) => {
  const e = [], cat = s.cation, an = s.anion, cr = cat ? CATION_RANK[cat] : null;
  e.push({ withFam: 'metal', rate: cr != null ? 0.04 + 0.05 * ((100 - cr) / 100) : 0.03, heat: 6, card: 'displacement', note: 'displacement kinetics set by its cation (family supplies products)' });
  e.push({ withFam: 'metal', needs: 'electrified', rate: 0.07, gas: an === 'cl' ? 'chlorine-gas' : 'oxygen', gasN: 2, heat: 5, card: 'electrolysis', note: an === 'cl' ? 'electrolysis: chlorine at the anode from its chloride' : 'electrolysis: oxygen at the anode' });
  if (an === 'co3') e.push({ withFam: 'acid', rate: 0.1, gas: 'co2', gasN: 2, card: 'acid-carbonate' });
  else if (an === 'so3' || an === 's2o3') e.push({ withFam: 'acid', rate: 0.07, gas: 'sulfur-dioxide', gasN: 1, tintTo: 0xE8E8B0, card: 'acid-carbonate', note: 'acid frees SO2 from this anion' });
  else if (an === 'acetate') e.push({ withFam: 'acid', rate: 0.05, tintTo: 0xE8DCC0, note: 'acid frees acetic acid — vinegar smell' });
  else if (['mno4', 'cr2o7', 'cro4'].includes(an)) e.push({ withFam: 'acid', rate: 0.04, tintTo: 0xC8E86B, note: 'oxidising anion + strong acid can free chlorine / change colour' });
  else e.push({ withFam: 'acid', rate: 0.03, tintTo: 0xE8DCC0, note: 'acid protonates / re-anions this salt slowly' });
  if (cat && INSOL_OH.has(cat)) e.push({ withFam: 'base', rate: 0.09, outSelf: oxideOfCation(cat), tintTo: HYDROX_TINT[cat] || 0xE8E8E8, card: 'precipitation', note: 'its cation\'s hydroxide is insoluble — precipitates (shown as oxide)' });
  else e.push({ withFam: 'base', ...INERT('its hydroxide is soluble — stays dissolved') });
  e.push({ withFam: 'salt-sol', rate: 0.09, card: 'precipitation', note: 'cross-ion precipitation kinetics (family table supplies the solid)' });
  e.push({ withFam: 'indicator', rate: 0.1, tintTo: indicatorColour('universal-indicator', s.ph != null ? s.ph : 7), consumeSelf: false, consumeOther: false, card: 'indicator-ph', note: 'an indicator reads this solution\'s own pH' });
  if (an === 'i' || ['fe2', 'fe3', 'mn2', 'cu2'].includes(cat)) e.push({ withFam: 'peroxide', rate: 0.08, gas: 'oxygen', gasN: 2, card: 'peroxide-catalyst', note: 'its ions catalyse peroxide breakdown' });
  else e.push({ withFam: 'peroxide', ...INERT('no catalysis of peroxide') });
  if (an === 'i' || an === 'br') e.push({ withFam: 'halogen', rate: 0.06, tintTo: 0x7A4A1E, card: 'halogen-displacement', note: 'stronger halogens free its halogen — brown tint' });
  e.push({ withFam: 'cryogen', rate: 0.05, heat: -30, tintTo: 0xDCEFF5, card: 'deep-freeze', note: 'freezes / salts out in deep cold' });
  e.push(...agentBlock(s, {
    'sodium-hydroxide': (cat && INSOL_OH.has(cat)) ? { rate: 0.09, outSelf: oxideOfCation(cat), tintTo: HYDROX_TINT[cat] || 0xE8E8E8, card: 'precipitation' } : null,
    'bleach': (an === 'i' || an === 'br') ? { rate: 0.05, tintTo: 0x7A4A1E, note: 'bleach oxidises its halide — colour blooms' } : null,
    'hydrogen-peroxide': (an === 'i' || ['fe2', 'fe3', 'mn2', 'cu2'].includes(cat)) ? { rate: 0.08, gas: 'oxygen', gasN: 2, card: 'peroxide-catalyst' } : null,
    'sulfuric-acid': (an === 'i' || an === 'br' || an === 's2o3' || an === 'so3') ? { rate: 0.05, tintTo: 0x7A4A1E, note: 'concentrated acid oxidises this anion' } : null,
    'lightning-bolt': { rate: 0.1, heat: 40, note: 'arc strike boils and sprays it' },
    'plasma': { rate: 0.08, heat: 60, note: 'plasma flash-boils the surface' },
    'liquid-nitrogen': { rate: 0.06, heat: -40, tintTo: 0xDCEFF5, card: 'deep-freeze' },
  }));
  return e;
};
GEN.acid = (s) => {
  const str = s.acidStrength || 0, e = [];
  e.push({ withFam: 'metal', rate: 0.03 + 0.1 * str, gas: 'hydrogen', gasN: 2, heat: 8, card: 'acid-metal', note: 'its own strength sets the kinetics (family/named pairs supply per-metal products)' });
  e.push({ withFam: 'carbonate', rate: 0.06 + 0.12 * str, gas: 'co2', gasN: 2, card: 'acid-carbonate' });
  e.push({ withFam: 'bicarbonate', rate: 0.08 + 0.12 * str, gas: 'co2', gasN: 3, card: 'acid-carbonate' });
  e.push({ withFam: 'carbonate-rock', rate: 0.03 + 0.06 * str, gas: 'co2', gasN: 1, card: 'acid-carbonate' });
  e.push({ withFam: 'base', rate: 0.13, heat: Math.round(6 + 12 * str), outSelf: s.cls === 'liquid' ? 'salt-water' : null, card: 'neutralisation' });
  e.push({ withFam: 'salt-sol', rate: 0.05, card: 'acid-carbonate', note: 'anion-displacement kinetics (family table supplies any gas)' });
  if (str >= 0.85) e.push({ withFam: 'organic', rate: 0.045, outOther: 'charcoal-powder', gas: 'steam', gasN: 1, heat: 15, tintTo: 0x2A2A2A, card: 'acid-char', note: 'concentrated acid dehydrates organics to carbon' });
  else if (str >= 0.4) e.push({ withFam: 'organic', rate: 0.018, tintTo: 0x4A3A2A, card: 'acid-organic' });
  else e.push({ withFam: 'organic', rate: 0.008, tintTo: 0x6B5B4A, card: 'acid-organic', note: 'weak acid: marinade / curdle / leach' });
  if (s.key === 'hydrofluoric-acid') e.push({ withFam: 'glass', rate: 0.03, outOther: 'frosted-glass', tintTo: 0xE8ECEE, card: 'hf-etch' });
  else e.push({ withFam: 'glass', ...INERT('glass resists this acid — HF is the exception') });
  e.push({ withFam: 'dye', rate: 0.07, tintTo: indicatorColour('universal-indicator', s.ph != null ? s.ph : 2), consumeSelf: false, consumeOther: false, card: 'ph-tint' });
  e.push({ withFam: 'indicator', rate: 0.1, tintTo: indicatorColour('universal-indicator', s.ph != null ? s.ph : 2), consumeSelf: false, consumeOther: false, card: 'indicator-ph' });
  e.push({ withFam: 'bleach', rate: 0.08, gas: 'chlorine-gas', gasN: 1, card: 'chlorine-danger' });
  if (['sulfuric-acid', 'perchloric-acid', 'chromic-acid', 'phosphorus-pentoxide'].includes(s.key)) e.push({ withKey: 'water', rate: 0.06, heat: 30, gas: 'steam', gasN: 1, card: 'steam-burst', note: 'dilution heat — can boil violently' });
  else e.push({ withKey: 'water', ...INERT('dilutes — no reaction') });
  if (str >= 0.15) e.push({ withFam: 'stone', rate: 0.01 + 0.03 * str, tintTo: 0xC8C0B0, card: 'acid-etch' });
  e.push(...agentBlock(s, {
    'sodium-hydroxide': { rate: 0.13, heat: 14, outSelf: s.cls === 'liquid' ? 'salt-water' : null, card: 'neutralisation' },
    'bleach': { rate: 0.08, gas: 'chlorine-gas', gasN: 1, card: 'chlorine-danger' },
    'hydrogen-peroxide': str >= 0.9 ? { rate: 0.03, tintTo: 0xE8E8B0, note: 'peracid forms — a stronger oxidiser' } : null,
    'lightning-bolt': { rate: 0.1, heat: 60, gas: 'smoke', gasN: 1, note: 'arc strike fumes the acid' },
    'plasma': { rate: 0.08, heat: 80, gas: 'smoke', gasN: 1, note: 'plasma flash-boils it' },
  }));
  return e;
};
GEN.base = (s) => {
  const bs = s.ph != null ? (s.ph - 7) / 7 : (hasFam(s, 'strong-base') ? 0.9 : 0.35), e = [];
  e.push({ withFam: 'acid', rate: 0.13, heat: Math.round(6 + 12 * Math.max(0, bs)), outSelf: s.cls === 'liquid' ? 'salt-water' : null, card: 'neutralisation' });
  e.push({ withFam: 'salt-sol', rate: 0.09, card: 'precipitation', note: 'precipitation kinetics (family table supplies the solid)' });
  if (bs >= 0.3) e.push({ withFam: 'ammonium', rate: 0.06, gas: 'ammonia-gas', gasN: 1, card: 'ammonia-release' });
  else e.push({ withFam: 'ammonium', ...INERT('too weak to free ammonia') });
  if (hasFam(s, 'strong-base')) e.push({ withFam: 'glass', rate: 0.006, outOther: 'frosted-glass', tintTo: 0xE8ECEE, card: 'base-etch' });
  else e.push({ withFam: 'glass', ...INERT('mild alkali leaves glass alone') });
  if (bs >= 0.5) e.push({ withFam: 'oil', rate: 0.045, card: 'saponification', note: 'saponification kinetics (family supplies the soap)' });
  if (bs >= 0.35) e.push({ withFam: 'organic', rate: 0.015, tintTo: 0xD8D0C0, card: 'caustic' });
  if (s.key === 'sodium-hydroxide') e.push({ withKey: 'co2', rate: 0.06, outSelf: 'washing-soda-sol', card: 'carbonation' });
  else if (s.key === 'limewater') e.push({ withKey: 'co2', rate: 0.07, outSelf: 'chalk-powder', tintTo: 0xEDEDE6, card: 'limewater-co2' });
  else e.push({ withKey: 'co2', rate: 0.04, tintTo: 0xD8E8D8, card: 'carbonation', note: 'absorbs CO2 toward carbonate' });
  if (hasFam(s, 'strong-base')) e.push({ withFam: 'halogen', rate: 0.05, outOther: 'bleach', tintTo: 0xEDEDD8, card: 'bleaching', note: 'halogen + strong alkali → bleach' });
  e.push({ withFam: 'metal', rate: 0.03, card: 'amphoteric', note: 'only amphoteric metals dissolve — the family gate decides' });
  e.push({ withFam: 'indicator', rate: 0.1, tintTo: indicatorColour('universal-indicator', s.ph != null ? s.ph : 12), consumeSelf: false, consumeOther: false, card: 'indicator-ph' });
  e.push({ withFam: 'dye', rate: 0.06, tintTo: indicatorColour('universal-indicator', s.ph != null ? s.ph : 12), consumeSelf: false, consumeOther: false, card: 'ph-tint' });
  e.push(...agentBlock(s, {
    'hydrofluoric-acid': { rate: 0.1, heat: 10, card: 'neutralisation', note: 'neutralises even HF' },
    'hydrogen-peroxide': bs >= 0.7 ? { rate: 0.03, tintTo: 0xE8E8B0, note: 'alkaline peroxide — a stronger bleach' } : null,
    'lightning-bolt': { rate: 0.1, heat: 50, note: 'arc strike boils it' },
    'plasma': { rate: 0.08, heat: 70, note: 'plasma flash-boils the surface' },
  }));
  return e;
};
GEN.indicator = (s) => {
  const e = [];
  for (const lk of ['hydrochloric-acid', 'sulfuric-acid', 'sodium-hydroxide', 'acetic-acid', 'ammonia-solution', 'limewater', 'bleach', 'lemon-juice', 'cola', 'milk', 'blood', 'baking-soda-sol', 'soap-sol', 'distilled-water']) {
    const l = R(lk); if (!l || l.ph == null || lk === s.key) continue;
    e.push({ withKey: lk, rate: 0.12, tintTo: indicatorColour(s.key, l.ph), consumeSelf: false, consumeOther: false, card: 'ind-' + s.key, note: `its exact colour at pH ${l.ph}` });
  }
  e.push({ withFam: 'acid', rate: 0.1, tintTo: indicatorColour(s.key, 1.5), consumeSelf: false, consumeOther: false, card: 'ind-' + s.key });
  e.push({ withFam: 'base', rate: 0.1, tintTo: indicatorColour(s.key, 12.5), consumeSelf: false, consumeOther: false, card: 'ind-' + s.key });
  e.push({ withFam: 'salt-sol', rate: 0.16, card: 'ind-' + s.key, note: 'response speed is its own; the family rule reads the exact shade from the solution pH' });
  if (s.key === 'methylene-blue') e.push({ withKey: 'glucose-sol', rate: 0.04, tintTo: 0xD8DEE8, consumeSelf: false, consumeOther: false, needs: 'mixed', card: 'blue-bottle' });
  e.push(...agentBlock(s, {
    'bleach': { rate: 0.07, tintTo: 0xEDEDE6, consumeSelf: false, note: 'bleach destroys the dye' },
    'lightning-bolt': { rate: 0.05, tintTo: 0xEDEDE6, note: 'arc light bleaches the dye' },
  }));
  return e;
};
GEN.water = (s) => {
  const e = [], fz = s.freezeTo && has(s.freezeTo) ? s.freezeTo : 'ice';
  e.push({ withFam: 'alkali-metal', rate: 0.25, gas: 'hydrogen', gasN: 3, heat: 50, card: 'alkali-water' });
  e.push({ withFam: 'strong-acid', rate: 0.06, heat: 28, gas: 'steam', gasN: 1, card: 'steam-burst', note: 'strong-acid dilution boils' });
  e.push({ withFam: 'hot-liquid', rate: 0.2, outSelf: 'steam', gas: 'steam', gasN: 3, heat: -60, card: 'steam-burst', note: 'flashes to steam on fierce heat — faster than the generic rule' });
  e.push({ withFam: 'cryogen', rate: 0.09, outSelf: fz, heat: -50, card: 'deep-freeze' });
  for (const k of ['fire', 'flame', 'spark', 'lightning-bolt', 'plasma', 'ember']) if (has(k)) e.push({ withKey: k, rate: 0.15, outSelf: 'steam', gas: 'steam', gasN: 1, heat: -30, card: 'steam-burst', note: 'boils off at the flame front' });
  e.push({ withFam: 'plant-matter', rate: 0.03, tintTo: 0x3FA34D, card: 'growth', note: 'watering — growth support' });
  e.push({ withFam: 'soil', rate: 0.05, tintTo: 0x5B4632, note: 'turns soil to mud' });
  e.push({ withKey: 'cement', rate: 0.04, outOther: 'cement-solid', card: 'cement-setting' });
  e.push({ withKey: 'quicklime', rate: 0.1, outOther: 'slaked-lime', heat: 40, gas: 'steam', gasN: 1, card: 'slaking' });
  e.push({ withKey: 'calcium-carbide', rate: 0.08, gas: 'acetylene', gasN: 2, outOther: 'slaked-lime', card: 'gas-pop' });
  e.push({ withKey: 'sodium-peroxide', rate: 0.09, gas: 'oxygen', gasN: 1, outOther: 'sodium-hydroxide', card: 'oxygen-release' });
  e.push({ withKey: 'dry-ice', rate: 0.12, gas: 'fog', gasN: 2, heat: -25, card: 'dry-ice-water' });
  e.push({ withKey: 'liquid-nitrogen', rate: 0.15, outSelf: fz, gas: 'fog', gasN: 2, heat: -60, card: 'ln2-water' });
  e.push({ withFam: 'salt-sol', ...INERT('dilution — no reaction') });
  e.push({ withFam: 'oil', ...INERT('oil and water never mix — density only') });
  e.push({ withFam: 'explosive', ...INERT('water wets and desensitises') });
  e.push(...agentBlock(s, {
    'sulfuric-acid': { rate: 0.08, heat: 35, gas: 'steam', gasN: 1, card: 'steam-burst', note: 'the classic dilution boil' },
    'sodium-hydroxide': { rate: 0.05, heat: 8, note: 'caustic dissolving warms the water' },
    'lightning-bolt': { rate: 0.15, outSelf: 'steam', gas: 'steam', gasN: 2, heat: 60, card: 'steam-ring' },
    'plasma': { rate: 0.12, outSelf: 'steam', gas: 'steam', gasN: 2, heat: 80, card: 'steam-ring' },
  }));
  return e;
};

GEN.fuel = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'oxidiser', rate: 0.03 + 0.09 * (s.flammability || 0), outSelf: s.burnTo && has(s.burnTo) ? s.burnTo : 'fire', gas: 'smoke', gasN: 1, heat: 50, card: 'oxidiser-fuel', note: 'its own burn rate with oxidisers' });
  e.push({ withKey: 'oxygen', rate: 0.15, outSelf: s.burnTo && has(s.burnTo) ? s.burnTo : null, gas: 'co2', gasN: 1, heat: 80, needs: 'ignited', card: 'combustion', note: 'burns far fiercer in pure oxygen' });
  e.push({ withKey: 'water', ...INERT('floats on water — no mix, no reaction') });
  e.push({ withFam: 'acid', ...INERT('fuel resists acids') });
  e.push({ withFam: 'solvent', ...INERT('blends with solvents — physics, no reaction') });
  e.push(...agentBlock(s, {
    'bleach': { rate: 0.02, tintTo: 0x6B5B4A, note: 'bleach slowly oxidises the fuel' },
    'lightning-bolt': { rate: 0.2, outSelf: 'fire', heat: 100, card: 'arc-ignition' },
    'plasma': { rate: 0.18, outSelf: 'fire', heat: 120, card: 'arc-ignition' },
  }));
  return e;
};
GEN.oil = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'soap', rate: 0.08, tintTo: 0xEDEDE6, needs: 'mixed', consumeSelf: false, consumeOther: false, card: 'emulsion', note: 'soap emulsifies it — stays milky' });
  e.push({ withFam: 'base', rate: 0.045, card: 'saponification', note: 'saponification kinetics (family supplies the soap, checks strength)' });
  e.push({ withFam: 'oxidiser', rate: 0.02 + 0.06 * (s.flammability || 0), tintTo: 0x3A2A1A, card: 'oxidation', note: 'oils oxidise — drying oils harden, others go rancid' });
  e.push({ withFam: 'solvent', ...INERT('blends into solvents — physics') });
  e.push({ withKey: 'water', ...INERT('oil and water never mix — density only') });
  e.push(...agentBlock(s, {
    'sulfuric-acid': { rate: 0.02, tintTo: 0x2A2A2A, note: 'strong acid chars and sulfonates oils' },
    'sodium-hydroxide': { rate: 0.04, outSelf: 'soap-sol', card: 'saponification', note: 'caustic soda saponifies it' },
    'bleach': { rate: 0.02, tintTo: 0xEDEDE6, note: 'bleach attacks the oil — rancid fade' },
  }));
  return e;
};
GEN.food = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'acid', rate: 0.02, tintTo: 0xD8C8A8, card: 'acid-organic', note: 'acid cooks, curdles or leaches it' });
  e.push({ withFam: 'base', rate: 0.015, tintTo: 0xC8B898, card: 'caustic', note: 'alkali softens and saponifies traces of fat' });
  e.push({ withFam: 'bleach', rate: 0.04, tintTo: 0xEDEDE6, card: 'bleaching' });
  e.push({ withKey: 'yeast', rate: 0.02, gas: 'co2', gasN: 1, needs: 'mixed', card: 'fermentation', note: 'yeast ferments its sugars' });
  e.push({ withKey: 'microbes', rate: 0.01, gas: 'co2', gasN: 1, tintTo: 0x9ACD32, card: 'fermentation', note: 'microbes spoil it — slow souring' });
  e.push({ withFam: 'oxidiser', rate: 0.015, tintTo: 0x3A2A1A, card: 'oxidation', note: 'oxidises — browning and staleness' });
  e.push({ withFam: 'salt-sol', ...INERT('seasoning contact — no reaction') });
  e.push(...agentBlock(s, {
    'sulfuric-acid': { rate: 0.04, outSelf: s.cls === 'liquid' ? null : 'charcoal-powder', tintTo: 0x2A2A2A, card: s.key === 'sugar' ? 'black-snake' : 'acid-char', note: 'concentrated acid chars it' },
    'liquid-nitrogen': s.freezeTo ? { rate: 0.08, outSelf: P(s.freezeTo, 'food-freeze'), heat: -40, tintTo: 0xDCEFF5, card: 'deep-freeze' } : null,
    'lightning-bolt': { rate: 0.1, outSelf: s.cls === 'liquid' ? null : 'charcoal-powder', heat: 80, note: 'arc strike chars a spot' },
    'plasma': { rate: 0.08, outSelf: s.cls === 'liquid' ? null : 'charcoal-powder', heat: 100, note: 'plasma sears it' },
    'sodium-hydroxide': { rate: 0.02, tintTo: 0xC8B898, note: 'caustic digests it slowly' },
  }));
  return e;
};
GEN.gas = (s) => {
  const e = [], fl = s.flammability || 0;
  if (fl > 0) {
    for (const k of ['spark', 'fire', 'lightning-bolt', 'plasma']) if (has(k)) e.push({ withKey: k, rate: 0.2, blast: s.key === 'hydrogen' ? 3 : 2, outSelf: s.key === 'hydrogen' ? 'steam' : 'co2', heat: 100, needs: 'ignited', card: 'gas-pop', note: 'sparks set it off' });
    e.push({ withKey: 'oxygen', rate: 0.2, blast: s.key === 'hydrogen' ? 5 : 2, outSelf: s.key === 'hydrogen' ? 'steam' : 'co2', heat: 120, needs: 'ignited', card: 'gas-pop' });
  }
  if (hasFam(s, 'oxidiser')) e.push({ withFam: 'fuel', rate: 0.15, heat: 80, needs: 'ignited', card: 'combustion', note: 'feeds fuel flames fiercely' });
  if ((s.solubility || 0) >= 0.45) e.push({ withFam: 'aqueous', rate: 0.07, tintTo: indicatorColour('universal-indicator', { co2: 5, 'sulfur-dioxide': 3, 'ammonia-gas': 11, 'hydrogen-chloride-gas': 1, 'hydrogen-sulfide': 4, 'chlorine-gas': 3 }[s.key] ?? 7), card: 'gas-dissolve', note: 'dissolves readily in watery liquids' });
  else e.push({ withFam: 'aqueous', ...INERT('barely soluble — bubbles through unchanged') });
  if (hasFam(s, 'acid')) e.push({ withFam: 'base', rate: 0.09, heat: 6, card: 'neutralisation', note: 'acid gas neutralised by alkali' });
  if (s.key === 'ammonia-gas') e.push({ withFam: 'acid', rate: 0.1, outSelf: 'ammonium-chloride', tintTo: 0xF5F5F0, card: 'smoke-ring' });
  if (hasFam(s, 'halogen')) e.push({ withFam: 'metal', rate: 0.07, heat: 50, card: 'halogen-metal', note: 'attacks hot metals (family supplies products)' });
  e.push({ withFam: 'cryogen', rate: 0.04, tintTo: 0xDCEFF5, note: 'condenses at cryogenic cold' });
  e.push(...agentBlock(s, {
    'plasma': { rate: 0.08, heat: 80, tintTo: 0xB8D8E8, note: 'plasma ionises and excites it — it glows' },
    'lightning-bolt': { rate: 0.1, heat: 100, tintTo: 0xB8D8E8, note: 'the arc ionises a channel through it' },
    'liquid-nitrogen': { rate: 0.05, tintTo: 0xDCEFF5, note: 'chills toward its boiling point' },
    'oxygen': fl > 0 ? null : { rate: 0.03, tintTo: 0xB8D8E8, note: 'discharge in oxygen-rich gas makes ozone traces' },
  }));
  return e;
};
GEN.fire = (s) => {
  const e = [];
  e.push({ withFam: 'fuel', rate: 0.15, heat: 60, card: 'combustion', note: 'spreads flame to fuels at its own pace' });
  e.push({ withFam: 'explosive', rate: 0.25, heat: 150, card: 'detonation', note: 'sets explosives off (family supplies the blast size)' });
  e.push({ withFam: 'aqueous', rate: 0.15, outOther: 'steam', gas: 'steam', gasN: 1, heat: -50, card: 'steam-burst' });
  e.push({ withKey: 'co2', rate: 0.2, outSelf: 'smoke', heat: -80, note: 'CO2 smothers the flame' });
  e.push({ withFam: 'metal', rate: 0.05, heat: 40, note: 'heats metal toward its melt point' });
  e.push({ withFam: 'glass', rate: 0.03, outOther: (s.sourceTemp || 0) >= 800 ? 'cracked-glass' : null, card: 'thermal-shock', note: 'fierce flame can crack glass' });
  e.push({ withKey: 'oxygen', rate: 0.2, heat: 100, tintTo: 0xFFFFFF, note: 'oxygen feeds it — brighter and hotter' });
  e.push({ withFam: 'cryogen', rate: 0.2, outSelf: 'smoke', heat: -100, note: 'cryogen snuffs it' });
  e.push(...agentBlock(s, {
    'sulfuric-acid': { rate: 0.05, gas: 'smoke', gasN: 1, note: 'acid fumes in the flame' },
    'nitric-acid': { rate: 0.05, gas: 'smoke', gasN: 1, tintTo: 0x8A5B2A, note: 'brown fumes in the flame' },
    'liquid-nitrogen': { rate: 0.2, outSelf: 'smoke', heat: -100, note: 'frozen out' },
  }));
  return e;
};
GEN.electric = (s) => {
  const sourceish = s.sourceTemp != null || s.cls === 'electric' || s.cls === 'gas';
  const e = [];
  e.push({ withFam: 'salt-sol', rate: 0.06, gas: 'hydrogen', gasN: 2, needs: 'electrified', card: 'electrolysis', note: 'current splits electrolytes' });
  // steam-ring is a DISCHARGE effect (bolt/plasma/spark superheating a skin of
  // water, consuming itself). Passive conductors (electrodes, wires) must NOT
  // self-consume in water — gated to sourceish like the arc-ignition entry.
  if (sourceish) e.push({ withKey: 'water', rate: 0.1, outOther: 'steam', heat: 40, card: 'steam-ring' });
  e.push({ withFam: 'metal', rate: 0.08, heat: 35, card: 'electric-heating', note: 'resistance heating' });
  if (sourceish) e.push({ withFam: 'fuel', rate: 0.1, outOther: 'fire', card: 'arc-ignition' });
  else e.push({ withFam: 'fuel', ...INERT('passive conductor — carries current, strikes no arcs') });
  e.push({ withFam: 'explosive', rate: 0.15, heat: 100, card: 'detonation', note: 'a spark is all a detonator needs (family supplies the blast)' });
  for (const gk of ['hydrogen', 'methane', 'propane-gas', 'acetylene']) if (has(gk)) e.push({ withKey: gk, rate: 0.12, heat: 60, card: 'gas-pop', note: 'arcs through flammable gas pop it' });
  e.push(...agentBlock(s, {
    'oxygen': sourceish ? { rate: 0.05, tintTo: 0xB8D8E8, note: 'discharge in oxygen makes ozone — sharp smell' } : null,
    'plasma': sourceish ? null : { rate: 0.1, heat: 80, note: 'plasma strike heats it' },
  }));
  return e;
};
GEN.explosive = (s) => {
  const sens = s.ignitionTemp != null ? Math.max(0.03, Math.min(0.3, 0.3 - s.ignitionTemp / 3000)) : 0.08;
  const e = IGNITER_KEYS.filter((k) => k !== s.key).map((k) => ({ withKey: k, rate: sens, blast: s.blast || 4, outSelf: 'fire', gas: 'smoke', gasN: 2, heat: 200, card: 'detonation', note: 'its own yield, its own sensitivity' }));
  e.push({ withFam: 'oxidiser', rate: 0.06, heat: 30, card: 'oxidiser-fuel', note: 'extra oxidiser makes it deflagrate harder' });
  e.push({ withFam: 'acid', ...INERT('stable to acids') });
  e.push({ withFam: 'base', ...(s.key === 'nitroglycerin' ? { rate: 0.01, tintTo: 0x6B5B4A, note: 'alkali slowly hydrolyses nitroglycerin' } : INERT('no reaction with alkali')) });
  e.push({ withKey: 'water', ...INERT('wet explosive is desensitised — defined negative') });
  e.push({ withFam: 'cryogen', ...INERT('cold makes it sluggish, never safe') });
  e.push({ withFam: 'metal', ...INERT('inert to cold metal') });
  e.push(...agentBlock(s, { 'oxygen': { rate: 0.04, note: 'oxygen enrichment raises its burn rate' } }));
  return e;
};
GEN['salt-solid'] = (s) => {
  const e = [];
  if (hasFam(s, 'carbonate')) e.push({ withFam: 'acid', rate: 0.08, gas: 'co2', gasN: 2, card: 'acid-carbonate' });
  else if (s.key.endsWith('-oxide')) e.push({ withFam: 'acid', rate: 0.05, card: 'acid-oxide', note: 'neutralises to a salt solution (family supplies it)' });
  else if (['potassium-chlorate', 'sodium-chlorate', 'potassium-perchlorate'].includes(s.key)) e.push({ withFam: 'acid', rate: 0.05, gas: 'chlorine-dioxide', gasN: 1, tintTo: 0xE8D44D, card: 'oxidation', note: 'strong acid frees ClO2 from chlorates' });
  else if (s.key === 'potassium-cyanide') e.push({ withFam: 'acid', rate: 0.07, gas: 'hydrogen-cyanide-gas', gasN: 1, note: 'acid + cyanide → HCN — lethal in real life' });
  else if (s.key === 'potassium-iodide') e.push({ withFam: 'acid', rate: 0.04, tintTo: 0x7A4A1E, note: 'acid + air oxidise iodide to brown iodine' });
  else e.push({ withFam: 'acid', rate: 0.02, tintTo: 0xE8DCC0, note: 'acid dissolves / re-anions the salt' });
  if (hasFam(s, 'ammonium')) e.push({ withFam: 'base', rate: 0.05, gas: 'ammonia-gas', gasN: 1, card: 'ammonia-release' });
  else if (s.key === 'alum') e.push({ withFam: 'base', rate: 0.05, tintTo: 0xF0F0EA, card: 'precipitation', note: 'alum + alkali → aluminium hydroxide jelly' });
  else e.push({ withFam: 'base', ...INERT('alkali leaves this salt alone') });
  if (hasFam(s, 'oxidiser')) e.push({ withFam: 'metal', rate: 0.05, heat: 80, tintTo: 0xFFD8A0, tempBand: [200, null], card: 'oxidiser-fuel', note: 'hot oxidiser salt + metal powder: thermite-class fire' });
  e.push({ withKey: 'water', ...INERT('dissolves in water — saturation physics is the engine\'s floor, not a reaction') });
  if (['potassium-iodide', 'sodium-thiosulfate'].includes(s.key)) e.push({ withFam: 'oxidiser', rate: 0.05, tintTo: 0x7A4A1E, note: 'a reducing salt — oxidisers liberate iodine / decolourise' });
  e.push(...agentBlock(s, {
    'sulfuric-acid': hasFam(s, 'carbonate') ? { rate: 0.08, gas: 'co2', gasN: 2, card: 'acid-carbonate' } : null,
    'sodium-hydroxide': hasFam(s, 'ammonium') ? { rate: 0.05, gas: 'ammonia-gas', gasN: 1, card: 'ammonia-release' } : null,
    'hydrogen-peroxide': s.key === 'potassium-iodide' ? { rate: 0.06, gas: 'oxygen', gasN: 1, tintTo: 0x7A4A1E, note: 'peroxide oxidises iodide — oxygen and iodine' } : null,
    'bleach': s.key === 'potassium-iodide' ? { rate: 0.05, tintTo: 0x7A4A1E, note: 'bleach frees iodine' } : null,
    'lightning-bolt': { rate: 0.05, heat: 60, note: 'arc strike scorches it' },
    'plasma': { rate: 0.05, heat: 80, note: 'plasma sears the surface' },
  }));
  return e;
};
function stoneGen(s, mult) {
  const m = mult || 1, e = [];
  if (hasFam(s, 'carbonate') || hasFam(s, 'carbonate-rock')) e.push({ withFam: 'acid', rate: 0.05 * m, gas: 'co2', gasN: 1, card: 'acid-carbonate', note: 'carbonate stone fizzes in acid' });
  else e.push({ withFam: 'acid', rate: 0.008 * m, tintTo: 0xC8C0B0, card: 'acid-etch', note: 'silicate stone resists — glacial etch only' });
  if (s.key === 'sand' || hasFam(s, 'glass')) e.push({ withKey: 'lightning-bolt', rate: 0.15, outSelf: 'glass', heat: 150, card: 'thermal-shock', note: 'fulgurite: lightning fuses it to glass' });
  else e.push({ withKey: 'lightning-bolt', rate: 0.08, heat: 80, tintTo: 0x2A2A2A, note: 'lightning leaves a scorch scar' });
  e.push({ withFam: 'hot-liquid', rate: 0.02 * m, tintTo: 0x8A8A8A, card: 'thermal-shock', note: 'thermal stress at fierce heat (family gate checks temperature)' });
  e.push({ withFam: 'cryogen', rate: 0.02 * m, tintTo: 0xDCEFF5, note: 'frost wedging begins in the pores' });
  e.push({ withKey: 'water', ...INERT('wet stone — no reaction') });
  e.push({ withFam: 'base', ...INERT('stone resists alkali') });
  e.push(...igniterEntries(s));
  e.push(...agentBlock(s, {
    'hydrofluoric-acid': hasFam(s, 'glass') ? { rate: 0.02, outSelf: 'frosted-glass', card: 'hf-etch' } : null,
    'sulfuric-acid': (hasFam(s, 'carbonate') || hasFam(s, 'carbonate-rock')) ? { rate: 0.05 * m, gas: 'co2', gasN: 1, card: 'acid-carbonate' } : null,
    'plasma': { rate: 0.06, heat: 100, outSelf: moltenKey(s), tintTo: 0xFFD8A0, note: 'plasma melts a pit' },
    'liquid-nitrogen': { rate: 0.03, tintTo: 0xDCEFF5, note: 'frost shattering begins' },
  }));
  return e;
}
GEN.stone = (s) => stoneGen(s, 1);
GEN.powder = (s) => stoneGen(s, 1.5);
GEN.glass = (s) => {
  const e = [];
  e.push({ withKey: 'hydrofluoric-acid', rate: 0.03, outSelf: 'frosted-glass', tintTo: 0xE8ECEE, card: 'hf-etch' });
  e.push({ withFam: 'acid', ...INERT('glass resists acids — HF is the famous exception') });
  e.push({ withFam: 'strong-base', rate: 0.006, outSelf: 'frosted-glass', tintTo: 0xE8ECEE, card: 'base-etch' });
  e.push({ withFam: 'hot-liquid', rate: 0.05, card: 'thermal-shock', note: 'thermal-shock kinetics (family gate checks the heat, supplies the crack)' });
  e.push({ withFam: 'cryogen', rate: 0.02, outSelf: 'cracked-glass', card: 'thermal-shock' });
  e.push({ withKey: 'fire', rate: 0.02, tintTo: 0xF2D8A0, note: 'softens in fierce flame' });
  if (has('molten-glass')) e.push({ withKey: 'plasma', rate: 0.05, outSelf: 'molten-glass', heat: 100, card: 'thermal-shock' });
  e.push({ withKey: 'water', ...INERT('glass is waterproof — that is its whole job') });
  e.push({ withFam: 'metal', ...INERT('no reaction with cold metal') });
  e.push(...agentBlock(s, {
    'sodium-hydroxide': { rate: 0.006, outSelf: 'frosted-glass', card: 'base-etch' },
    'lightning-bolt': { rate: 0.08, heat: 120, outSelf: has('molten-glass') ? 'molten-glass' : null, card: 'thermal-shock', note: 'the arc melts a spot' },
    'liquid-nitrogen': { rate: 0.03, outSelf: 'cracked-glass', card: 'thermal-shock' },
  }));
  return e;
};
GEN.cryogen = (s) => {
  const e = [];
  e.push({ withFam: 'aqueous', rate: 0.1, gas: 'fog', gasN: 2, heat: -70, tintTo: 0xDCEFF5, card: 'deep-freeze', note: 'boils off while freezing watery liquids (their own freeze forms apply)' });
  e.push({ withKey: 'water', rate: 0.12, outOther: 'ice', gas: 'fog', gasN: 2, heat: -60, card: 'deep-freeze' });
  e.push({ withFam: 'metal', rate: 0.04, tintTo: 0xDCEFF5, note: 'metals go brittle at this cold' });
  e.push({ withFam: 'glass', rate: 0.025, outOther: 'cracked-glass', card: 'thermal-shock' });
  e.push({ withFam: 'plant-matter', rate: 0.06, heat: -40, tintTo: 0xDCEFF5, card: 'deep-freeze', note: 'freezes living tissue solid' });
  e.push({ withFam: 'plant-matter', rate: 0.05, heat: -40, tintTo: 0xDCEFF5, card: 'deep-freeze' });
  for (const gk of ['air', 'oxygen', 'co2', 'methane']) if (has(gk)) e.push({ withKey: gk, rate: 0.04, tintTo: 0xDCEFF5, note: 'gases condense at this cold' });
  e.push({ withKey: 'fire', rate: 0.2, outOther: 'smoke', heat: -100, note: 'snuffs flames' });
  e.push({ withKey: 'ethanol', rate: 0.1, heat: -50, gas: 'fog', gasN: 1, card: 'deep-freeze', note: 'the classic cold bath' });
  e.push(...agentBlock(s, {
    'oxygen': s.key === 'liquid-nitrogen' ? { rate: 0.03, tintTo: 0xB8D8E8, note: 'oxygen condenses into it — pale blue and dangerous' } : null,
    'lightning-bolt': { rate: 0.08, heat: 50, note: 'the arc boils it off in a flash' },
    'plasma': { rate: 0.08, heat: 60, note: 'plasma flash-boils it' },
  }));
  return e;
};
GEN.solvent = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'polymer', rate: 0.09, card: 'solvent-attack', note: 'its own softening speed (family scales the outcome by solubility)' });
  e.push({ withFam: 'rubber', rate: 0.07, card: 'solvent-attack', note: 'swells and softens rubber' });
  e.push({ withFam: 'wax', rate: 0.08, card: 'solvent-attack', note: 'dissolves waxes and greases' });
  e.push({ withFam: 'dye', rate: 0.07, card: 'dye-dissolve', note: 'pulls dyes into solution (family supplies the colour)' });
  e.push({ withFam: 'oil', ...INERT('blends with oils — physics') });
  e.push({ withKey: 'water', ...INERT('mixes or layers with water — physics, no reaction') });
  e.push(...agentBlock(s, { 'liquid-nitrogen': { rate: 0.05, tintTo: 0xDCEFF5, note: 'freezes toward a glassy solid' } }));
  return e;
};
function polymerGen(s) {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'solvent', rate: 0.06, card: 'solvent-attack', note: 'its own softening rate in solvents' });
  e.push({ withFam: 'acid', rate: 0.015, tintTo: 0x3A2A1A, card: 'acid-organic', note: 'acids yellow and embrittle it' });
  e.push({ withFam: 'oxidiser', rate: 0.02, tintTo: 0x3A2A1A, card: 'oxidation' });
  e.push({ withFam: 'hot-liquid', rate: 0.05, card: 'thermal-shock', note: 'deform/char kinetics (family gate checks the heat)' });
  e.push({ withFam: 'base', ...INERT('shrugs off alkali') });
  e.push(...agentBlock(s, {
    'sulfuric-acid': { rate: 0.03, tintTo: 0x2A2A2A, card: 'acid-char', note: 'concentrated acid chars it' },
    'bleach': { rate: 0.02, tintTo: 0xEDEDE6, note: 'bleach fades and embrittles it' },
    'liquid-nitrogen': { rate: 0.03, tintTo: 0xDCEFF5, note: 'goes glass-brittle in deep cold' },
    'lightning-bolt': { rate: 0.06, heat: 60, note: 'arc strike melts a hole' },
    'plasma': { rate: 0.06, heat: 80, note: 'plasma sears and melts it' },
  }));
  return e;
}
GEN.polymer = polymerGen;
GEN.rubber = (s) => {
  const e = polymerGen(s);
  e.push({ withFam: 'oil', rate: 0.02, tintTo: 0x2A2A2A, note: 'oils swell rubber — why seals fail' });
  return e;
};
GEN.wood = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'acid', rate: 0.012, tintTo: 0x2A2A2A, card: 'acid-char', note: 'acid chars and weakens the grain' });
  e.push({ withFam: 'base', rate: 0.012, tintTo: 0xD8C8A8, card: 'caustic', note: 'alkali pulps it — paper-making chemistry' });
  e.push({ withKey: 'fungus', rate: 0.008, tintTo: 0x5B6B4A, note: 'rot spreads through damp wood' });
  e.push({ withKey: 'water', ...INERT('soaks and swells — physics') });
  e.push({ withFam: 'oxidiser', rate: 0.015, tintTo: 0x3A2A1A, card: 'oxidation' });
  e.push(...agentBlock(s, {
    'bleach': { rate: 0.03, tintTo: 0xEDEDE6, note: 'bleach whitens wood pulp' },
    'lightning-bolt': { rate: 0.08, outSelf: 'charcoal-powder', card: 'combustion', note: 'a strike chars and splits it' },
    'plasma': { rate: 0.06, outSelf: 'charcoal-powder', card: 'combustion' },
  }));
  return e;
};
function plantGen(s) {
  const e = [...igniterEntries(s)];
  e.push({ withKey: 'water', rate: 0.03, tintTo: 0x3FA34D, card: 'growth', note: 'drinks and grows' });
  e.push({ withFam: 'soil', rate: 0.02, tintTo: 0x3FA34D, card: 'growth' });
  e.push({ withFam: 'nutrient', rate: 0.04, tintTo: 0x3FA34D, card: 'growth', note: 'fertiliser feeds it' });
  e.push({ withFam: 'acid', rate: 0.02, tintTo: 0x8A7A2A, note: 'acid withers it' });
  e.push({ withFam: 'base', rate: 0.015, tintTo: 0x8A7A2A, note: 'alkali scorches it' });
  e.push({ withFam: 'salt-sol', rate: 0.01, tintTo: 0x8A7A2A, note: 'salty water wilts it — osmosis' });
  e.push({ withFam: 'cryogen', rate: 0.05, heat: -30, tintTo: 0xDCEFF5, card: 'deep-freeze', note: 'frost kills the cells' });
  e.push(...agentBlock(s, {
    'bleach': { rate: 0.03, tintTo: 0xEDEDE6, note: 'bleach scorches it white' },
    'hydrogen-peroxide': { rate: 0.02, tintTo: 0xEDEDE6, note: 'peroxide scorches leaves' },
    'sulfuric-acid': { rate: 0.03, tintTo: 0x2A2A2A, card: 'acid-char', note: 'acid chars it' },
  }));
  return e;
}
GEN.plant = plantGen;
GEN.life = (s) => {
  const e = plantGen(s);
  e.push({ withFam: 'food', rate: 0.02, tintTo: 0x3FA34D, note: 'food supports growth' });
  if (s.key === 'fungus') e.push({ withFam: 'wood', rate: 0.01, tintTo: 0x5B6B4A, note: 'fungus spreads through damp wood' });
  return e;
};
GEN.dye = (s) => {
  const e = [];
  e.push({ withFam: 'bleach', rate: 0.07, tintTo: 0xEDEDE6, card: 'bleaching' });
  e.push({ withFam: 'acid', rate: 0.06, tintTo: indicatorColour('universal-indicator', 2), consumeSelf: false, consumeOther: false, card: 'ph-tint' });
  e.push({ withFam: 'base', rate: 0.06, tintTo: indicatorColour('universal-indicator', 12), consumeSelf: false, consumeOther: false, card: 'ph-tint' });
  e.push({ withFam: 'solvent', rate: 0.06, card: 'dye-dissolve', note: 'dissolves into solvents (family supplies the bleed colour)' });
  e.push({ withFam: 'oxidiser', rate: 0.03, tintTo: 0xEDEDE6, card: 'bleaching', note: 'oxidisers fade it' });
  e.push({ withKey: 'water', ...INERT('dilutes — physics') });
  e.push(...igniterEntries(s));
  e.push(...agentBlock(s, {
    'aqua-regia': { rate: 0.04, tintTo: 0xEDEDE6, note: 'aqua regia destroys the dye' },
    'hydrogen-peroxide': { rate: 0.04, tintTo: 0xEDEDE6, card: 'bleaching' },
    'lightning-bolt': { rate: 0.03, tintTo: 0xEDEDE6, note: 'arc light fades it' },
  }));
  return e;
};
GEN.soap = (s) => {
  const e = [];
  e.push({ withFam: 'oil', rate: 0.08, tintTo: 0xEDEDE6, needs: 'mixed', consumeSelf: false, consumeOther: false, card: 'emulsion' });
  e.push({ withFam: 'aqueous', rate: 0.05, tintTo: 0xF5F5F0, note: 'lathers — foam stabilised' });
  e.push({ withFam: 'acid', rate: 0.05, tintTo: 0xE8E4DA, note: 'acid curdles soap into fatty scum' });
  e.push({ withFam: 'salt-sol', rate: 0.06, card: 'soap-scum', note: 'scum kinetics (family gates the hard-water ions)' });
  e.push({ withFam: 'dye', rate: 0.03, tintTo: 0xEDEDE6, note: 'washing lifts dye out' });
  e.push(...agentBlock(s, { 'bleach': { ...INERT('bleach + soap fumes in real life — kept inert in the sim') } }));
  return e;
};
GEN.soil = (s) => {
  const e = [];
  e.push({ withKey: 'water', rate: 0.06, tintTo: 0x4A3826, note: 'turns to mud' });
  e.push({ withFam: 'plant-matter', rate: 0.02, tintTo: 0x3FA34D, card: 'growth', note: 'beds down roots and seeds' });
  e.push({ withFam: 'nutrient', rate: 0.03, tintTo: 0x3FA34D, card: 'growth' });
  e.push({ withFam: 'acid', rate: 0.01, tintTo: 0x8A7A5A, note: 'acid leaches and sours it' });
  e.push({ withKey: 'fire', rate: 0.02, tintTo: 0xA85B2A, note: 'bakes toward terracotta' });
  e.push(...agentBlock(s, {
    'hydrogen-peroxide': { rate: 0.02, gas: 'oxygen', gasN: 1, note: 'peroxide fizzes on soil enzymes — the wound-cleaner effect' },
    'bleach': { rate: 0.02, tintTo: 0xEDEDE6, note: 'bleach sterilises it' },
    'lightning-bolt': { rate: 0.05, heat: 60, tintTo: 0x2A2A2A, note: 'scorched earth' },
    'plasma': { rate: 0.05, heat: 80, tintTo: 0x2A2A2A, note: 'plasma vitrifies a patch' },
  }));
  return e;
};
GEN.wax = (s) => {
  const e = [...igniterEntries(s)];
  e.push({ withFam: 'solvent', rate: 0.07, card: 'solvent-attack', note: 'dissolves in solvents (family supplies the bleed)' });
  e.push({ withFam: 'hot-liquid', rate: 0.04, tintTo: 0xF2E8D8, note: 'melts into hot liquids' });
  e.push({ withFam: 'base', rate: 0.02, tintTo: 0xEDEDE6, card: 'saponification', note: 'alkali slowly saponifies wax' });
  e.push(...agentBlock(s, {}));
  return e;
};
function genericGen(s) {
  const e = [...igniterEntries(s)];
  if (hasFam(s, 'carbonate')) e.push({ withFam: 'acid', rate: 0.06, gas: 'co2', gasN: 1, card: 'acid-carbonate' });
  else if (hasFam(s, 'organic')) e.push({ withFam: 'acid', rate: 0.012, tintTo: 0x4A3A2A, card: 'acid-organic', note: 'acid attacks it slowly' });
  else e.push({ withFam: 'acid', ...INERT('acid leaves it alone') });
  if ((s.flammability || 0) > 0 || hasFam(s, 'organic')) e.push({ withFam: 'oxidiser', rate: 0.02, tintTo: 0x3A2A1A, heat: 10, card: 'oxidation' });
  e.push({ withKey: 'water', ...INERT('no reaction with water') });
  e.push(...agentBlock(s, {
    'hydrofluoric-acid': hasFam(s, 'glass') ? { rate: 0.02, outSelf: 'frosted-glass', card: 'hf-etch' } : null,
    'aqua-regia': (hasFam(s, 'metal') && (s.activityRank || 0) >= 15) ? { rate: 0.02, outSelf: P(s.saltKey, 'generic-aqua'), card: 'acid-metal', note: 'aqua regia dissolves it' } : null,
    'sulfuric-acid': hasFam(s, 'organic') ? { rate: 0.03, tintTo: 0x2A2A2A, card: 'acid-char', note: 'concentrated acid chars it' } : null,
    'bleach': (hasFam(s, 'dye') || hasFam(s, 'organic')) ? { rate: 0.03, tintTo: 0xEDEDE6, card: 'bleaching' } : null,
    'lightning-bolt': { rate: 0.06, heat: 100, outSelf: moltenKey(s), tintTo: 0xFFD8A0, note: 'arc strike superheats a spot' },
    'plasma': { rate: 0.06, heat: 120, outSelf: moltenKey(s), tintTo: 0xFFD8A0, note: 'plasma sears it' },
    'liquid-nitrogen': { rate: 0.03, tintTo: 0xDCEFF5, note: 'deep chill — frost and brittleness' },
  }));
  return e;
}
GEN.generic = genericGen;
GEN.special = genericGen;
GEN.inert = (s) => {
  const e = [
    { withFam: 'acid', ...INERT('chosen for resisting acids') },
    { withFam: 'base', ...INERT('chosen for resisting alkalis') },
    { withFam: 'oxidiser', ...INERT('nothing here for an oxidiser to take') },
    { withKey: 'water', ...INERT('waterproof by design') },
    ...igniterEntries(s),
    ...agentBlock(s, {
      'hydrofluoric-acid': hasFam(s, 'glass') ? { rate: 0.02, outSelf: 'frosted-glass', card: 'hf-etch', note: 'HF is the exception — it eats silica' } : null,
      'lightning-bolt': { rate: 0.04, heat: 60, tintTo: 0xFFD8A0, note: 'even this glows under an arc strike' },
      'plasma': { rate: 0.04, heat: 80, tintTo: 0xFFD8A0, note: 'plasma sears anything, briefly' },
    }),
  ];
  return e;
};
// ---- W32U-3 profile enrichment: data-driven entries computed from each
// substance's OWN fields/fams, appended to every generator's output (the
// generator's own entries come first and win the dedupe in finishProfile).
// Soft chemistry stays tint/heat/note-only; conversions appear only where
// the substance's own data (flammability, sourceTemp) makes them real.
function extraEntries(s) {
  const e = [];
  const own = s.col ? s.col[0] : 0x808080;
  e.push({ withFam: 'cryogen', rate: 0.03, heat: -25, tintTo: 0xDCEFF5, consumeSelf: false, consumeOther: false, note: 'deep-freeze contact — frost creeps over it' });
  e.push({ withFam: 'hot-liquid', rate: 0.025, tintTo: darken(own, 0.8), consumeSelf: false, consumeOther: false, note: 'fierce heat at the contact — steams, scorches or softens by its own melting/boiling data' });
  if ((s.solubility || 0) >= 0.05) e.push({ withFam: 'solvent', rate: 0.01 + 0.05 * (s.solubility || 0), note: 'dissolves into solvents in proportion to its own solubility' });
  else e.push({ withFam: 'solvent', ...INERT('its solubility is near zero — solvents leave it') });
  e.push({ withFam: 'dye', rate: 0.03, consumeSelf: false, consumeOther: false, note: 'takes up dye — stained toward the dye colour' });
  e.push({ withFam: 'soap', rate: 0.02, tintTo: 0xEDEDE6, consumeSelf: false, consumeOther: false, note: 'soap solution wets and degreases the surface' });
  e.push({ withFam: 'nutrient', rate: 0.012, consumeSelf: false, consumeOther: false, note: 'nutrient salts wash over it and deposit' });
  if (s.ph != null) e.push({ withFam: 'indicator', rate: 0.1, tintTo: indicatorColour('universal-indicator', s.ph), consumeSelf: false, consumeOther: false, card: 'indicator-ph', note: 'an indicator reads its own pH' });
  else e.push({ withFam: 'indicator', ...INERT('no pH of its own for an indicator to read') });
  if ((s.flammability || 0) > 0) e.push({ withKey: 'oxygen', rate: 0.12, heat: 70, gas: hasFam(s, 'sulfur-bearing') ? 'sulfur-dioxide' : 'co2', gasN: 1, needs: 'ignited', card: 'combustion', note: 'burns in pure oxygen far fiercer than in air' });
  else if (hasFam(s, 'metal') || hasFam(s, 'organic')) e.push({ withKey: 'oxygen', rate: 0.006, tintTo: darken(own, 0.9), consumeSelf: false, consumeOther: false, note: 'oxygen slowly films the surface — air oxidation' });
  else e.push({ withKey: 'oxygen', ...INERT('oxygen leaves it unchanged') });
  if (s.cls === 'liquid') e.push({ withKey: 'co2', rate: 0.02, tintTo: blendToward(own, 0xD8E8D8, 0.2), consumeSelf: false, consumeOther: false, note: 'CO2 dissolves in — faint carbonation' });
  else e.push({ withKey: 'co2', ...INERT('CO2 washes over it — no reaction') });
  if ((s.sourceTemp ?? 0) >= 400) e.push({ withFam: 'glass', rate: 0.02, outOther: 'cracked-glass', card: 'thermal-shock', note: 'its own heat cracks glass on contact' });
  else e.push({ withFam: 'glass', ...INERT('glassware contact — no reaction') });
  if ((s.sourceTemp ?? 0) >= 400) e.push({ withFam: 'ceramic', rate: 0.015, tintTo: 0x5B5B5B, consumeSelf: false, consumeOther: false, note: 'its heat crazes ceramic glazes' });
  else e.push({ withFam: 'ceramic', ...INERT('ceramic contact — no reaction') });
  if ((s.flammability || 0) === 0) e.push({ withKey: 'spark', rate: 0.02, heat: 10, tintTo: 0xFFD8A0, consumeSelf: false, consumeOther: false, note: 'a spark strikes a hot spot — no ignition' });
  if (hasFam(s, 'food') || hasFam(s, 'plant-matter')) e.push({ withFam: 'food', rate: 0.01, consumeSelf: false, consumeOther: false, note: 'food contact — juices and crumbs exchange, nothing stronger' });
  return e;
}

// ---- profile assembly ----
function finishProfile(s, raw) {
  let out = [];
  const seen = new Set();
  for (const e of raw) {
    if (!e || (!e.withKey && !e.withFam)) continue;
    if (e.withKey && !has(e.withKey)) { warn(`profile ${s.key}: partner key '${e.withKey}' missing — entry dropped`); continue; }
    if (e.withFam && !FAMS.has(e.withFam)) { warn(`profile ${s.key}: fam '${e.withFam}' missing — entry dropped`); continue; }
    const dk = (e.withKey ? 'K:' + e.withKey : 'F:' + e.withFam) + '|' + (e.needs || '');
    if (seen.has(dk)) continue; seen.add(dk);
    const c = { ...e };
    for (const fld of ['outSelf', 'outOther', 'gas']) if (c[fld] != null) c[fld] = P(c[fld], `profile ${s.key}`);
    out.push(c);
  }
  if (s.marquee) {
    for (const pk of FAMOUS) {
      if (out.filter((x) => x.withKey).length >= 30) break;
      if (pk === s.key || out.some((x) => x.withKey === pk)) continue;
      const pr = R(pk); if (!pr) continue;
      const famE = out.find((x) => x.withFam && pr.fams.includes(x.withFam) && x.kind !== 'inert');
      if (famE) out.push({ ...famE, withKey: pk, withFam: undefined, rate: Math.min(0.3, (famE.rate || 0.03) * 1.25), note: (famE.note || '') + ' (partner-specific rate)' });
    }
  }
  const target = s.marquee ? 30 : 16;
  for (const pk of [...FAMOUS, ...AGENT_KEYS]) {
    if (out.length >= target) break;
    if (pk === s.key || out.some((x) => x.withKey === pk)) continue;
    if (!R(pk)) continue;
    out.push({ withKey: pk, ...INERT('no reaction — defined negative') });
  }
  const rank = (x) => (x.kind === 'inert' ? 2 : 0) + (x.withKey ? 0 : 1);
  out.sort((a, b) => rank(a) - rank(b));
  return out;
}
export const PROFILES = new Map();
for (const s of ALL) {
  const gen = GEN[s.profile] || genericGen;
  PROFILES.set(s.id, finishProfile(s, [...gen(s), ...extraEntries(s)]));
}
export function profileAudit() {
  let min = Infinity, marqueeMin = Infinity; const below = [], belowMarquee = [];
  for (const s of ALL) {
    const n = (PROFILES.get(s.id) || []).length;
    if (n < min) min = n;
    if (n < 16) below.push(s.key);
    if (s.marquee) { if (n < marqueeMin) marqueeMin = n; if (n < 30) belowMarquee.push(s.key); }
  }
  return { min, marqueeMin, below, belowMarquee };
}

// ---- resolver ----
function axisOk(rec, ctx) {
  if (!rec) return true;
  if (rec.needs) {
    switch (rec.needs) {
      case 'contact': break;
      case 'mixed': if ((ctx.mixed || 0) < 0.5) return false; break;
      case 'heated': if ((ctx.temp || 0) < 150) return false; break;
      case 'electrified': if (!ctx.electrified) return false; break;
      case 'pressurised': if ((ctx.pressure || 0) < 2) return false; break;
      case 'ignited': if (!ctx.ignited && (ctx.temp || 0) < 600) return false; break;
      default: break;
    }
  }
  if (rec.minMixed != null && (ctx.mixed || 0) < rec.minMixed) return false;
  if (rec.tempBand) { const [lo, hi] = rec.tempBand; if (lo != null && (ctx.temp || 0) < lo) return false; if (hi != null && (ctx.temp || 0) > hi) return false; }
  return true;
}
function finalise(f, tier, flip) {
  const o = {
    tier, kind: f.kind || 'react', rate: f.rate != null ? f.rate : 0.03,
    consumeA: f.consumeA != null ? f.consumeA : true, consumeB: f.consumeB != null ? f.consumeB : true,
    outA: f.outA != null ? f.outA : null, outB: f.outB != null ? f.outB : null,
    gas: f.gas != null ? f.gas : null, gasN: f.gasN != null ? f.gasN : 0,
    heat: f.heat != null ? f.heat : 0, tintTo: f.tintTo != null ? f.tintTo : null,
    card: f.card != null ? f.card : null, fam: f.fam != null ? f.fam : null, note: f.note || '',
  };
  if (f.blast) o.blast = f.blast;
  if (f.block) o.block = true;
  if (flip) {
    const t = o.outA; o.outA = o.outB; o.outB = t;
    const c = o.consumeA; o.consumeA = o.consumeB; o.consumeB = c;
  }
  return o;
}
function namedOutcome(a, b, ctx) {
  const key = Math.min(a.id, b.id) * 4096 + Math.max(a.id, b.id);
  const recs = PAIR_MAP.get(key); if (!recs) return null;
  for (const { f, ia } of recs) {
    if (!axisOk(f, ctx)) continue;
    return finalise(f, 1, a.id !== ia); // flip when caller order != authored order
  }
  return null;
}
function swapOutcome(o) {
  if (!o) return null;
  const t = o.outA; o.outA = o.outB; o.outB = t;
  const c = o.consumeA; o.consumeA = o.consumeB; o.consumeB = c;
  return o;
}
function entryOutcome(e, flip) {
  const f = {
    kind: e.kind || 'react', rate: e.rate, gas: e.gas, gasN: e.gasN, heat: e.heat, tintTo: e.tintTo,
    card: e.card, note: e.note, blast: e.blast, block: e.block,
    outA: flip ? e.outOther : e.outSelf, outB: flip ? e.outSelf : e.outOther,
    consumeA: flip ? e.consumeOther : e.consumeSelf, consumeB: flip ? e.consumeSelf : e.consumeOther,
  };
  return finalise(f, 1, false);
}
function profileOutcomeFor(owner, partner, ctx) {
  if (!owner || !partner) return null;
  const list = PROFILES.get(owner.id); if (!list) return null;
  const pfams = partner.fams || [];
  for (const e of list) {
    if (e.withKey ? e.withKey !== partner.key : !pfams.includes(e.withFam)) continue;
    if (!axisOk(e, ctx)) continue;
    return entryOutcome(e, false);
  }
  return null;
}
// profile-only resolution (either direction, oriented to a); used by coverage for the B test
export function profileResolve(aId, bId, ctx) {
  const a = SUBSTANCES[aId], b = SUBSTANCES[bId]; if (!a || !b) return null;
  const c = ctx || { mixed: 0, temp: 25, electrified: false, pressure: 0, ignited: false };
  const pa = profileOutcomeFor(a, b, c);
  if (pa && pa.kind !== 'inert') return pa;
  const pb = profileOutcomeFor(b, a, c);
  if (pb && pb.kind !== 'inert') return swapOutcome(pb);
  return pa || (pb ? swapOutcome(pb) : null);
}
// family candidate index: fam -> families using it; plus predicate families
const FAM_INDEX = new Map(); const PRED_FAMS = [];
FAMILIES.forEach((f, i) => {
  let indexed = false;
  for (const side of ['aFam', 'bFam']) if (f[side]) { if (!FAM_INDEX.has(f[side])) FAM_INDEX.set(f[side], []); FAM_INDEX.get(f[side]).push(i); indexed = true; }
  if (!indexed || f.aTest || f.bTest) PRED_FAMS.push(i);
});
function famMatches(f, sa, sb) {
  const aOk = f.aFam ? (sa.fams || []).includes(f.aFam) : (f.aTest ? !!f.aTest(sa) : true);
  if (!aOk) return false;
  return f.bFam ? (sb.fams || []).includes(f.bFam) : (f.bTest ? !!f.bTest(sb) : true);
}
function familyOutcome(a, b, ctx) {
  if (!a || !b) return null;
  const cand = new Set(PRED_FAMS);
  for (const fm of a.fams || []) for (const i of FAM_INDEX.get(fm) || []) cand.add(i);
  for (const fm of b.fams || []) for (const i of FAM_INDEX.get(fm) || []) cand.add(i);
  const ordered = [...cand].sort((x, y) => x - y);
  for (const i of ordered) {
    const f = FAMILIES[i];
    let r = null, flip = false;
    if (famMatches(f, a, b)) r = f.resolve(a, b, ctx);
    else if (famMatches(f, b, a)) { r = f.resolve(b, a, ctx); flip = true; }
    if (r) { const o = finalise({ ...r, card: r.card || f.card, fam: f.id }, 2, flip); return o; }
  }
  return null;
}
export function familyResolve(aId, bId, ctx) {
  const a = SUBSTANCES[aId], b = SUBSTANCES[bId]; if (!a || !b) return null;
  return familyOutcome(a, b, ctx || { mixed: 0, temp: 25, electrified: false, pressure: 0, ignited: false });
}
function isMaterial(o) {
  return o && o.kind !== 'inert' && (o.outA != null || o.outB != null || o.gas != null || o.tintTo != null || o.blast != null || Math.abs(o.heat || 0) >= 5);
}
export function resolvePair(aId, bId, ctx) {
  const a = SUBSTANCES[aId], b = SUBSTANCES[bId]; if (!a || !b || aId === bId) return null;
  const c = ctx || { mixed: 0, temp: 25, electrified: false, pressure: 0, ignited: false };
  const named = namedOutcome(a, b, c);
  if (named) return named;
  const profA = profileOutcomeFor(a, b, c);
  const profBraw = profileOutcomeFor(b, a, c);
  // authored defined negatives (passivation / nobility) beat generic material rules
  if (profA && profA.kind === 'inert' && profA.block) return profA;
  if (profBraw && profBraw.kind === 'inert' && profBraw.block) return swapOutcome(profBraw);
  const prof = (profA && profA.kind !== 'inert') ? profA : ((profBraw && profBraw.kind !== 'inert') ? swapOutcome(profBraw) : null);
  const fam = familyOutcome(a, b, c);
  if (prof && isMaterial(prof)) {
    if (fam && fam.kind !== 'inert') {
      const merged = { ...fam };
      for (const k of Object.keys(prof)) if (prof[k] != null && k !== 'tier') merged[k] = prof[k];
      if (prof.outA == null && fam.outA != null) merged.outA = fam.outA;
      if (prof.outB == null && fam.outB != null) merged.outB = fam.outB;
      if (prof.gas == null && fam.gas != null) { merged.gas = fam.gas; merged.gasN = fam.gasN; }
      merged.tier = 1; merged.fam = fam.fam; merged.card = prof.card || fam.card;
      return merged;
    }
    return prof;
  }
  if (prof && fam && fam.kind !== 'inert') {
    // parameter-only profile entry: distinct kinetics on top of the family outcome
    const merged = { ...fam, rate: prof.rate, tier: 1, card: prof.card || fam.card, note: prof.note || fam.note };
    return merged;
  }
  if (fam) return fam;
  if (prof && isMaterial(prof)) return prof;
  return null;
}
