// matter-verdicts.js — Tier-3 DECISION layer for Matter Lab Ultra (W32U-2).
// decidePair NEVER returns null: every pair gets a tier and a mechanism.
// Tier 1/2 delegate to resolvePair (matter-reactions.js); Tier 3 explains,
// from both records' own data, WHY nothing stronger happens — dissolution
// and corrosion floors the engine applies itself, miscibility layering,
// the acid/base ladder, the displacement series, ignition and solubility
// checks, state-contact, and finally thermal contact (heat conduction only).
// Pure ESM, deterministic, allocation-light.
import { SUBSTANCES, BY_KEY } from './matter-elements.js';
import { resolvePair, NAMED_PAIRS, hansenDist } from './matter-reactions.js';
import { e0ForCation, e0ForElement, kspFor, solubilityClass, PKA_BY_KEY, KSP_PRECIP_MAX } from './matter-chemdata.js';

export const MECHANISMS = [
  'named-pair', 'profile', 'family:', 'defined-negative',
  'dissolution', 'corrosion', 'miscibility-layering', 'acid-base-ladder',
  'displacement-series', 'ignition-check', 'solubility-check',
  'state-contact', 'thermal-contact',
];

// cation activity ranks — duplicated from matter-reactions.js (not exported there)
const CATION_RANK = { k: 100, na: 95, li: 90, ba: 88, sr: 86, ca: 85, mg: 80, be2: 75, al3: 70, zn2: 60, mn2: 58, cr3: 55, fe3: 50, fe2: 50, cd2: 48, ni2: 45, co2: 42, sn2: 40, pb2: 35, cu2: 25, bi3: 20, sb3: 18, ag: 15, pd2: 12, hg2: 10, pt4: 8, au3: 5 };

const NAMED_SET = new Set();
for (const [ka, kb] of NAMED_PAIRS) {
  const a = BY_KEY.get(ka), b = BY_KEY.get(kb);
  if (a && b) NAMED_SET.add(Math.min(a.id, b.id) * 4096 + Math.max(a.id, b.id));
}

const recOf = (x) => (typeof x === 'string' ? BY_KEY.get(x) : SUBSTANCES[x]) || null;
const hasFam = (s, f) => (s.fams || []).includes(f);
const DEFAULT_CTX = { mixed: 0, temp: 25, electrified: false, pressure: 0, ignited: false };

// ---- W32U-4 chemdata helpers ----
// pKa of a record: its own field, else the chemdata table (records untouched).
const pkaOf = (s) => (s.pka != null ? s.pka : (PKA_BY_KEY[s.key] != null ? PKA_BY_KEY[s.key] : null));
const baseKeyOf = (k) => k.replace(/-(powder|molten)$/, '').replace(/-ribbon$/, '');
// E° of a metal record: element table first, else its salt cation's E°.
function e0ForMetalRec(m) {
  const e = e0ForElement(baseKeyOf(m.key));
  if (e != null) return e;
  const salt = m.saltKey ? BY_KEY.get(m.saltKey) : null;
  return salt && salt.cation ? e0ForCation(salt.cation) : null;
}
const fmtE = (v) => (v == null ? '?' : (v > 0 ? '+' : '') + v.toFixed(2));
const fmtK = (v) => v.toExponential(1);
// The two ion-swap combos of an ionic pair (either side may lack ions).
function swapCombos(a, b) {
  const out = [];
  if (a.cation && b.anion) out.push([a.cation, b.anion]);
  if (b.cation && a.anion) out.push([b.cation, a.anion]);
  return out;
}
function comboPrecipitates(cat, an) {
  const k = kspFor(cat, an);
  return solubilityClass(cat, an) === 'insoluble' || (k != null && k.ksp <= KSP_PRECIP_MAX);
}

export function decidePair(aId, bId, ctx) {
  const a = recOf(aId), b = recOf(bId);
  if (!a || !b || a.id === b.id) {
    return { tier: 3, mechanism: 'thermal-contact', outcome: null, reasons: ['no pair to decide (missing or identical substance)'] };
  }
  const c = ctx || DEFAULT_CTX;
  const temp = c.temp != null ? c.temp : 25;

  // (1) Tier 1 / 2 via the resolver; authored inert = defined negative.
  const o = resolvePair(a.id, b.id, c);
  if (o && o.kind !== 'inert') {
    const named = NAMED_SET.has(Math.min(a.id, b.id) * 4096 + Math.max(a.id, b.id));
    const baseVerdict = {
      tier: o.tier || 2,
      mechanism: o.tier === 1 ? (named ? 'named-pair' : 'profile') : 'family:' + (o.fam || 'unknown'),
      outcome: o,
      reasons: [o.note || `resolves at tier ${o.tier || 2}${o.fam ? ' via family ' + o.fam : ''}`],
    };
    // W32U-4: displacement outcomes are checked against E° — a metal whose
    // E° is not below the solution cation's E° cannot displace it, whatever
    // a generic kinetics entry suggested; when E° agrees, cite both values.
    {
      const [met, sol] = hasFam(a, 'metal') && b.cation ? [a, b]
        : hasFam(b, 'metal') && a.cation ? [b, a] : [null, null];
      if (met && sol) {
        const eM = e0ForMetalRec(met), eC = e0ForCation(sol.cation);
        if (eM != null && eC != null) {
          const cite = `E° ${met.name} ${fmtE(eM)} V vs E° ${sol.cation} ${fmtE(eC)} V`;
          if (eM < eC - 0.05) {
            baseVerdict.reasons.push(`${cite} — the metal's E° is lower, so it displaces ${sol.cation} from ${sol.name}`);
            return baseVerdict;
          }
          if (o.card === 'displacement') {
            return { tier: 3, mechanism: 'displacement-series', outcome: null, reasons: [`no displacement: ${cite} — ${met.name} sits above ${sol.cation} in the electrochemical series, so it cannot displace it from ${sol.name}`] };
          }
        }
      }
    }
    // W32U-4: precipitation outcomes between ionic partners are checked
    // against Ksp — a merely slightly-soluble swap product (Ksp above the
    // precipitation threshold) is NOT a precipitation.
    if (o.card === 'precipitation' || o.card === 'agcl' || o.card === 'baso4') {
      const combos = swapCombos(a, b);
      if (combos.length) {
        const precip = combos.filter(([cat, an]) => comboPrecipitates(cat, an));
        const kspCite = combos.map(([cat, an]) => { const k = kspFor(cat, an); return k ? `${cat}|${an} Ksp ${fmtK(k.ksp)}` : null; }).filter(Boolean);
        if (precip.length) {
          const [pc, pa] = precip[0], pk = kspFor(pc, pa);
          baseVerdict.reasons.push(`precipitation confirmed by Ksp: ${pc}|${pa}${pk ? ` Ksp ${fmtK(pk.ksp)}` : ''} <= threshold ${fmtK(KSP_PRECIP_MAX)} — the swapped salt is insoluble and crashes out`);
          return baseVerdict;
        }
        const slight = combos.find(([cat, an]) => solubilityClass(cat, an) === 'slight' || kspFor(cat, an) != null);
        if (slight) {
          const [sc, sa] = slight, sk = kspFor(sc, sa);
          return { tier: 3, mechanism: 'solubility-check', outcome: null, reasons: [`no full precipitation: the swap product ${sc}|${sa} is only slightly soluble${sk ? ` — Ksp ${fmtK(sk.ksp)}` : ''}, above the precipitation threshold ${fmtK(KSP_PRECIP_MAX)}${kspCite.length ? ` (${kspCite.join('; ')})` : ''} — it stays mostly dissolved`] };
        }
        if (kspCite.length) baseVerdict.reasons.push(`Ksp check: ${kspCite.join('; ')} vs threshold ${fmtK(KSP_PRECIP_MAX)}`);
      }
    }
    return baseVerdict;
  }
  if (o && o.kind === 'inert') {
    return { tier: 3, mechanism: 'defined-negative', outcome: null, reasons: [o.note || 'authored defined negative — no reaction'] };
  }

  // (2) Tier-3 checks, in order; reasons accumulate for the floor verdict.
  const reasons = [];
  const isLiqA = a.cls === 'liquid', isLiqB = b.cls === 'liquid';

  // dissolution floor (mirror of engine _dissolve)
  {
    const [sol, solv] = (a.cls === 'solid' || a.cls === 'powder') && isLiqB ? [a, b]
      : (b.cls === 'solid' || b.cls === 'powder') && isLiqA ? [b, a] : [null, null];
    if (sol && (sol.solubility || 0) > 0) {
      return { tier: 3, mechanism: 'dissolution', outcome: null, reasons: [`${sol.name} dissolves in ${solv.name}: solubility ${sol.solubility} — the engine's dissolution floor handles it, no chemical reaction`, ...reasons] };
    }
    if (sol) reasons.push(`${sol.name} solubility ${sol.solubility || 0} in ${solv.name} — nothing dissolves`);
  }

  // corrosion floor (mirror of engine _corrode)
  {
    const [ox, other] = a.oxideKey ? [a, b] : b.oxideKey ? [b, a] : [null, null];
    if (ox && (other.cls === 'liquid' || other.key === 'oxygen')) {
      const prod = BY_KEY.get(ox.oxideKey);
      return { tier: 3, mechanism: 'corrosion', outcome: null, reasons: [`${ox.name} corrodes toward ${prod ? prod.name : ox.oxideKey} (${ox.oxideKey}) against ${other.name} — the engine's corrosion floor handles it`, ...reasons] };
    }
    if (ox) reasons.push(`${ox.name} carries oxide product ${ox.oxideKey}, but ${other.name} is neither a liquid nor oxygen`);
  }

  // miscibility / layering for liquid pairs the miscibility family left alone
  if (isLiqA && isLiqB) {
    // measured water-miscibility (solWater) beats Hansen Ra when one side
    // is water-like — Ra misreads strong H-bonders (ethanol/water).
    const wlA = a.profile === 'water' || hasFam(a, 'aqueous');
    const wlB = b.profile === 'water' || hasFam(b, 'aqueous');
    const swOther = wlA && b.solWater != null ? b : (wlB && a.solWater != null ? a : null);
    if (swOther) {
      if (swOther.solWater === 'miscible') {
        return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`miscible blend: ${swOther.name} is fully miscible with water (measured miscibility) — the liquids mix with no chemical reaction`, ...reasons] };
      }
      if (swOther.solWater === 'partial') {
        return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`partly miscible: ${swOther.name} shows partial miscibility with water (measured miscibility) — slight mutual solubility, no bulk reaction`, ...reasons] };
      }
      if (swOther.solWater === 'immiscible') {
        const top = a.density <= b.density ? a : b, bottom = top === a ? b : a;
        return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`immiscible with water: ${swOther.name} is immiscible with water (measured miscibility) — the liquids layer by density (${top.name} ${top.density} over ${bottom.name} ${bottom.density})`, ...reasons] };
      }
    }
    const Ra = hansenDist(a, b);
    if (Ra != null && Ra > 14) {
      const top = a.density <= b.density ? a : b, bottom = top === a ? b : a;
      return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`immiscible: Hansen distance Ra=${Ra.toFixed(1)} (>14) — the liquids layer by density (${top.name} ${top.density} over ${bottom.name} ${bottom.density})`, ...reasons] };
    }
    if (Ra != null && Ra > 8) {
      return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`partly miscible (Ra=${Ra.toFixed(1)}): slight mutual solubility, no bulk reaction`, ...reasons] };
    }
    if (Ra != null) {
      return { tier: 3, mechanism: 'miscibility-layering', outcome: null, reasons: [`miscible blend (Ra=${Ra.toFixed(1)}): the liquids mix with no chemical reaction`, ...reasons] };
    }
    reasons.push('both liquids, but Hansen parameters are missing on at least one side — no miscibility verdict');
  }

  // acid/base ladder
  if (a.ph != null && b.ph != null) {
    const sideA = a.ph < 7 ? 'acidic' : a.ph > 7 ? 'basic' : 'neutral';
    const sideB = b.ph < 7 ? 'acidic' : b.ph > 7 ? 'basic' : 'neutral';
    if (sideA !== 'neutral' && sideA === sideB) {
      const extra = (pkaOf(a) != null && pkaOf(b) != null)
        ? `; proton transfer unfavourable: pKa ${pkaOf(a)} vs ${pkaOf(b)}` : '';
      return { tier: 3, mechanism: 'acid-base-ladder', outcome: null, reasons: [`no neutralisation: both ${sideA} (pH ${a.ph} and ${b.ph})${extra}`, ...reasons] };
    }
    if (sideA === 'neutral' || sideB === 'neutral') {
      const n = sideA === 'neutral' ? a : b, other = sideA === 'neutral' ? b : a;
      return { tier: 3, mechanism: 'acid-base-ladder', outcome: null, reasons: [`dilution only: ${n.name} is pH ${n.ph} (neutral) — it dilutes ${other.name} (pH ${other.ph}) without neutralising it`, ...reasons] };
    }
    reasons.push(`pH ${a.ph} vs ${b.ph} sit on opposite sides of 7, yet no neutralisation rule fired`);
  } else {
    reasons.push(`no acid/base character to compare (pH ${a.ph == null ? 'null' : a.ph}/${b.ph == null ? 'null' : b.ph})`);
  }

  // W32U-4: ionic-pair Ksp check — two ionic liquids (or an ionic liquid × a
  // salt) whose swap products are all soluble or only slightly soluble get a
  // defined solubility verdict citing Ksp against the threshold.
  {
    const combos = swapCombos(a, b);
    if (combos.length && (isLiqA || isLiqB)) {
      const precip = combos.filter(([cat, an]) => comboPrecipitates(cat, an));
      if (!precip.length) {
        const slight = combos.find(([cat, an]) => solubilityClass(cat, an) === 'slight' || kspFor(cat, an) != null);
        if (slight) {
          const [sc, sa] = slight, sk = kspFor(sc, sa);
          return { tier: 3, mechanism: 'solubility-check', outcome: null, reasons: [`no precipitation: the swap product ${sc}|${sa} is only slightly soluble${sk ? ` — Ksp ${fmtK(sk.ksp)}` : ''}, above the precipitation threshold ${fmtK(KSP_PRECIP_MAX)} — it stays dissolved`, ...reasons] };
        }
        reasons.push(`ion swap check: both swapped salts (${combos.map(([x, y]) => x + '|' + y).join(', ')}) are soluble — no precipitate forms`);
      } else {
        const [pc, pa] = precip[0], pk = kspFor(pc, pa);
        reasons.push(`ion swap check: ${pc}|${pa}${pk ? ` Ksp ${fmtK(pk.ksp)}` : ''} <= threshold ${fmtK(KSP_PRECIP_MAX)} would precipitate, yet no precipitation rule fired`);
      }
    }
  }

  // displacement series (W32U-4: E° first, activity-rank fallback)
  {
    const [met, sol] = hasFam(a, 'metal') && hasFam(b, 'salt-sol') ? [a, b]
      : hasFam(b, 'metal') && hasFam(a, 'salt-sol') ? [b, a] : [null, null];
    if (met && sol && sol.cation) {
      const eM = e0ForMetalRec(met), eC = e0ForCation(sol.cation);
      if (eM != null && eC != null) {
        const cite = `E° ${met.name} ${fmtE(eM)} V vs E° ${sol.cation} ${fmtE(eC)} V`;
        if (eM >= eC - 0.05) {
          return { tier: 3, mechanism: 'displacement-series', outcome: null, reasons: [`no displacement: ${cite} — ${met.name} sits above ${sol.cation} in the electrochemical series, so it cannot displace it from ${sol.name}`, ...reasons] };
        }
        reasons.push(`${cite} — ${met.name} should displace ${sol.cation}, yet no displacement rule fired`);
      } else if (CATION_RANK[sol.cation] != null) {
        const cr = CATION_RANK[sol.cation];
        if ((met.activityRank || 0) <= cr) {
          return { tier: 3, mechanism: 'displacement-series', outcome: null, reasons: [`no displacement: ${met.name} (activity rank ${met.activityRank || 0}) sits below ${sol.cation} (rank ${cr}) in the activity series (no E° data for this pair — rank fallback)`, ...reasons] };
        }
        reasons.push(`${met.name} (rank ${met.activityRank || 0}) outranks ${sol.cation} (rank ${cr}), yet no displacement rule fired`);
      }
    }
  }

  // ignition check
  {
    const fl = (a.flammability || 0) > 0 ? a : (b.flammability || 0) > 0 ? b : null;
    if (fl) {
      if (fl.ignitionTemp != null && temp < fl.ignitionTemp) {
        return { tier: 3, mechanism: 'ignition-check', outcome: null, reasons: [`no ignition at ${temp} C: ${fl.name} needs ${fl.ignitionTemp} C (flammability ${fl.flammability})`, ...reasons] };
      }
      reasons.push(`${fl.name} is flammable (${fl.flammability})${fl.ignitionTemp != null ? `, ignition ${fl.ignitionTemp} C vs pair temp ${temp} C` : ', no listed ignition temperature'} — no ignition verdict`);
    } else {
      reasons.push(`neither side is flammable (flammability ${a.flammability || 0}/${b.flammability || 0})`);
    }
  }

  // solubility check
  {
    const [sol, liq] = (a.cls === 'solid' || a.cls === 'powder') && isLiqB ? [a, b]
      : (b.cls === 'solid' || b.cls === 'powder') && isLiqA ? [b, a] : [null, null];
    if (sol && (sol.solubility || 0) <= 0.05) {
      return { tier: 3, mechanism: 'solubility-check', outcome: null, reasons: [`insoluble: solubility ${sol.solubility || 0} — ${liq.name} cannot dissolve ${sol.name}`, ...reasons] };
    }
  }

  // state contact
  if (a.meltPoint != null && b.meltPoint != null && temp < Math.min(a.meltPoint, b.meltPoint)) {
    const fz = (s) => (s.freezePoint != null ? ` / freezes at ${s.freezePoint} C` : '');
    return { tier: 3, mechanism: 'state-contact', outcome: null, reasons: [`no state change at ${temp} C (melts at ${a.meltPoint} C${fz(a)} / melts at ${b.meltPoint} C${fz(b)})`, ...reasons] };
  }

  // floor: thermal contact only
  if (!(a.fams && a.fams.length) && !(b.fams && b.fams.length)) reasons.push('neither carries a reactive family (fams: none/none)');
  else reasons.push(`no shared reaction family (fams: ${(a.fams || []).join(',') || 'none'} / ${(b.fams || []).join(',') || 'none'})`);
  reasons.push(`contact exchanges heat only — conduction equalises temperature (conductivity ${a.conductivity}/${b.conductivity})`);
  return { tier: 3, mechanism: 'thermal-contact', outcome: null, reasons };
}

export default decidePair;
