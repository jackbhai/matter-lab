/**
 * Matter Lab Ultra — unified falling-sand × beaker-lab sandbox (W32U §7).
 * One world, one engine (src/core/matter-engine.js), ~1,287 substances +
 * placeable Lab Gear objects. Render body only — App wraps in ToolFrame.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SUBSTANCES, BY_KEY, CATS, SUBSTANCE_COUNT } from '../core/matter-elements';
import { MatterEngine, GEAR, TIERS } from '../core/matter-engine';
import { MatterSound } from '../core/matter-sound';
import { enabled as sfxEnabled, setEnabled as setSfxEnabled, hapticFx } from '../core/sfx';
import { loadPerf, deviceSummary, setPerf as setPerfStore, autoStartTier } from '../core/perf.js';
import { GLRenderer, buildGLTables } from '../render/gl-renderer';
import { Card, Empty, toast } from '../ui/kit';
import TopBar from '../ui/TopBar.jsx';
import { Dock, PickerStrip } from '../ui/Dock.jsx';
import ToolWheel from '../ui/ToolWheel.jsx';
import SettingsPanel from '../ui/Settings.jsx';
import Picker from '../ui/Picker.jsx';
import InfoCard from '../ui/InfoCard.jsx';
import { Tile, MiniTile } from './sandlab-tiles.jsx';
import { glassSprite, burnerSprite, coilSprite, flameFrame, haloSprite, frostSprite, heatTinted, bucket } from './sandlab-sprites.js';
import { MATTER_SCENES, MATTER_EXPERIMENTS, buildSceneInto, computeObjective } from './sandlab-scenes.js';
export { MATTER_SCENES, MATTER_EXPERIMENTS };
import { Icon } from '../ui/icons';

/* Reactions module is built in parallel — the engine imports it too, so the
   integration build only runs once it lands. Access is guarded at use sites
   (CARDS/PROFILES may be a Map or null-shaped), per the contract API. */
import { CARDS, NAMED_PAIR_COUNT, NAMED_REACTIVE_COUNT, PROFILES } from '../core/matter-reactions';
import * as Game from '../game/game.js';
import { DiscoveryPanel, AchievementsPanel, CoachMarks, COACH_STEPS } from '../ui/GamePanels.jsx';
import { decidePair } from '../core/matter-verdicts';
/* P0-REOPEN: in-app / WebView user agents — the presentation-failure class
   (the compositor can present a canvas as a black void while its backing
   store reads back fine). Detected once at module load. */
const RISKY_PRESENT_UA = (() => { try { const ua = navigator.userAgent || ''; return /; wv\)|FBAN|FBAV|Instagram|KAKAOTALK|Line\//.test(ua); } catch { return false; } })();
import * as ElementsNS from '../core/matter-elements';
/* W32U-4 customs API (landing in parallel) — accessed via namespace so a
   not-yet-landed export degrades to a no-op instead of breaking the build. */
const registerCustomSubstance = typeof ElementsNS.registerCustomSubstance === 'function' ? ElementsNS.registerCustomSubstance : () => null;
const CUSTOM_SUBSTANCES = Array.isArray(ElementsNS.CUSTOM_SUBSTANCES) ? ElementsNS.CUSTOM_SUBSTANCES : [];
const isCustomKey = typeof ElementsNS.isCustomKey === 'function' ? ElementsNS.isCustomKey : (k) => CUSTOM_SUBSTANCES.some((c) => c && (c.key === k || (c.def && c.def.key === k)));
const LS_CUSTOMS = 'omni:matterlab:customs';
const nameOfKey = (k) => { if (k == null) return null; if (typeof k === 'number') return (SUBSTANCES[k] && SUBSTANCES[k].name) || null; const r = BY_KEY.get(k); return r ? r.name : String(k); };
const getCardSafe = (id) => { try { if (!id || !CARDS) return null; if (typeof CARDS.get === 'function') return CARDS.get(id); return CARDS[id] || null; } catch { return null; } };
const NEEDS_LABEL = { contact: 'on contact', mixed: 'when mixed', heated: 'with heat', electrified: 'under electric current', pressurised: 'under pressure', ignited: 'once ignited' };
const mechLabel = (m) => { if (!m) return 'Known behaviour'; if (m === 'named-pair') return 'Named reaction'; if (m === 'profile') return 'Known behaviour'; if (typeof m === 'string' && m.startsWith('family:')) return 'Family rule'; return m; };
const outcomeSummary = (v) => { if (!v) return ''; const o = v.outcome; if (o) { const prods = [o.outA, o.outB, o.gas].map(nameOfKey).filter(Boolean); const bits = []; if (prods.length) bits.push('Produces: ' + [...new Set(prods)].join(', ')); if (o.heat) bits.push('Heat: ' + o.heat); if (bits.length) return bits.join(' · '); } return (v.reasons && v.reasons[0]) || ''; };
const lighten = (hexCol, f = 0.35) => { const n = parseInt(String(hexCol).replace('#',''), 16); if (!Number.isFinite(n)) return 0xaaaaaa; const r = Math.min(255, Math.round(((n>>16)&255) + (255-((n>>16)&255))*f)), g = Math.min(255, Math.round(((n>>8)&255) + (255-((n>>8)&255))*f)), b = Math.min(255, Math.round((n&255) + (255-(n&255))*f)); return (r<<16)|(g<<8)|b; };
const hexToInt = (hexCol) => { const n = parseInt(String(hexCol||'#888888').replace('#',''), 16); return Number.isFinite(n) ? n : 0x888888; };
const ensureCols = () => { for (const rec of SUBSTANCES) { if (rec && rec.id != null && !COLS[rec.id]) { const a = hex((rec.col && rec.col[0]) || 0x888888), b = hex((rec.col && rec.col[1]) || (rec.col && rec.col[0]) || 0x888888); COLS[rec.id] = [a, b]; } } buildRenderTables(); };
/* share-code codec (ML1. gzip / ML0. raw) */
const b64urlEnc = (u8) => { let bin=''; for (let i=0;i<u8.length;i+=8192) bin += String.fromCharCode.apply(null, u8.subarray(i,i+8192)); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
const b64urlDec = (str) => { const b64 = String(str).replace(/-/g,'+').replace(/_/g,'/'); const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''; const bin = atob(b64+pad); const out = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; };
async function encodeShareCode(sceneObj) { const raw = new TextEncoder().encode(JSON.stringify(sceneObj)); if (typeof CompressionStream !== 'undefined') { try { const cs = new CompressionStream('gzip'); const gz = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer()); return 'ML1.' + b64urlEnc(gz); } catch { /* fall through */ } } return 'ML0.' + b64urlEnc(raw); }
async function decodeShareCode(code) { const t = String(code||'').trim(); if (t.startsWith('ML1.')) { if (typeof DecompressionStream === 'undefined') throw new Error('gzip unsupported'); const ds = new DecompressionStream('gzip'); const raw = await new Response(new Blob([b64urlDec(t.slice(4))]).stream().pipeThrough(ds)).arrayBuffer(); return JSON.parse(new TextDecoder().decode(raw)); } if (t.startsWith('ML0.')) return JSON.parse(new TextDecoder().decode(b64urlDec(t.slice(4)))); throw new Error('bad prefix'); }
const copyText = async (txt) => { try { await navigator.clipboard.writeText(txt); return true; } catch { try { const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; } catch { return false; } } };
/* view-mode ramps */
const rampLerp = (stops, v) => { if (v <= stops[0][0]) return stops[0].slice(1); for (let i=1;i<stops.length;i++) { if (v <= stops[i][0]) { const [v0,...c0]=stops[i-1]; const [v1,...c1]=stops[i]; const f=(v-v0)/Math.max(1e-6,(v1-v0)); return c0.map((c,k)=>Math.round(c+(c1[k]-c)*f)); } } return stops[stops.length-1].slice(1); };
const HEAT_STOPS = [[-100,36,86,200],[20,18,20,30],[200,240,138,36],[600,226,59,46],[1200,255,255,255]];
/* UI-B accessibility: colour-blind-safe Heat ramp (viridis-style: purple ->
   teal -> green -> yellow — ordered by luminance, no red/green ambiguity). */
const HEAT_STOPS_CB = [[-100,68,1,84],[20,49,104,142],[200,38,130,142],[450,110,190,105],[800,200,220,60],[1200,253,231,37]];
const PRESS_STOPS = [[0,10,20,80],[0.5,20,160,170],[2,240,210,60],[5,226,59,46]];

const ALIASES = { ret: 'sand', paani: 'water', pani: 'water', aag: 'fire', namak: 'salt', tel: 'oil', barf: 'ice', bijli: 'spark', mitti: 'soil', loha: 'iron', sona: 'gold', chandi: 'silver', lakdi: 'wood', hawa: 'air', dhuaan: 'smoke', khoon: 'blood', doodh: 'milk', shahad: 'honey', mom: 'wax', sheesha: 'glass', pathar: 'stone', koyla: 'coal', chai: 'tea', sharab: 'ethanol', sirka: 'vinegar', namakpaani: 'brine' };
const TOOLS = [
  ['paint', 'Paint'], ['spray', 'Spray'], ['line', 'Line'], ['rect', 'Rect'], ['circle', 'Circle'],
  ['fill', 'Fill'], ['eraser', 'Eraser'], ['heat', 'Heat'], ['cool', 'Cool'], ['wind', 'Wind'],
  ['stir', 'Stir/Poke'], ['clone', 'Clone'], ['inspect', 'Inspect'], ['spark', 'Spark'],
  ['blast', 'Blast'], ['interact', 'Interact'], ['dropper', 'Dropper'],
];
const PERF = loadPerf(); // Matter Lab Ultra — device estimate + perf prefs (2 GB / low-CPU mobile)
const SPEEDS = PERF.lowEnd ? [0.25, 0.5, 1, 2] : [0.25, 0.5, 1, 2, 4]; // low-end: no 4x mode (movement already capped ~4x)
/* HOTFIX (portrait stretch): aspect-matched grid dims — every tier keeps its
   cell budget, but cols/rows follow the real viewport aspect so a cell is
   SQUARE on any screen (was: fixed 16:9 landscape grid stretched onto tall
   portrait phones, which also shrank gear stamps to a few px). */
const TIER_CELLS = TIERS.map((t) => t.cols * t.rows);
const dimsForTier = (ti, aspect) => {
  const cells = TIER_CELLS[Math.max(0, Math.min(TIERS.length - 1, ti | 0))];
  const a = Math.max(0.3, Math.min(3.4, aspect || 16 / 9));
  const cols = Math.max(96, Math.min(720, Math.round(Math.sqrt(cells * a))));
  const rows = Math.max(96, Math.min(720, Math.round(cells / cols)));
  return { cols, rows };
};
const viewAspect = () => { try { const a = window.innerWidth / Math.max(1, window.innerHeight); return a > 0 && Number.isFinite(a) ? a : 16 / 9; } catch { return 16 / 9; } };
const LS = { favs: 'omni:sandlab:favs', recent: 'omni:sandlab:recent', scenes: 'omni:sandlab:scenes', recipes: 'omni:sandlab:recipes', power: 'omni:sandlab:power' };
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
const dl = (blob, name) => { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
const hex = (c) => [c >> 16 & 255, c >> 8 & 255, c & 255];
/* Precomputed per-substance colour ramps. */
const COLS = SUBSTANCES.map((s) => { const a = hex((s && s.col && s.col[0]) || 0x888888), b = hex((s && s.col && s.col[1]) || (s && s.col && s.col[0]) || 0x888888); return [a, b]; });
const GLASS_ID = (BY_KEY.get('glass') || {}).id || -1;
const THERMO_ID = (BY_KEY.get('thermo-bulb') || {}).id || -1;
const SMOKE_IDS = new Set(SUBSTANCES.filter((s2) => s2 && s2.cls === 'gas' && (s2.key || '').includes('smoke')).map((s2) => s2.id));
/* W32U-5 render tables: LUT[id*4+variant] -> [r,g,b] (the COLS lo->hi lerp at
   variant/3), plus per-id typed arrays so the render loop never dereferences
   SUBSTANCES[id] or compares .cls strings per cell. Rebuilt by ensureCols()
   (custom substances included). */
const CLS_CODE = { empty: 0, powder: 1, liquid: 2, gas: 3, solid: 4, fire: 5, electric: 6, special: 7, life: 8 };
let LUT = null, CLSARR = null, ISSMOKE = null, TEX_TYPE = null, TEX_AMP = null;
/* P1: render-table version — the GL renderer re-uploads its substance meta
   textures whenever this bumps (custom substances rebuild the tables). */
let RENDER_VER = 0;
function texFor(rec) {
  const fams = rec.fams || [];
  if (rec.cls === 'powder') return [1, 0.13];
  if (rec.cls === 'liquid') { if ((rec.key || '') === 'water') return [13, 0.20]; return [4, 0.08]; }
  if (rec.cls === 'gas') return [7, 0.10];
  if (rec.cls === 'solid') {
    if (fams.includes('wood')) return [3, 0.12];
    // V2 realistic pack: copper family -> copper streaks (12), other metals -> fine brushed (8)
    if ((rec.key || '').includes('copper') || fams.includes('copper')) return [12, 0.12];
    if (fams.includes('metal')) return [8, 0.09];
    if (fams.includes('ceramic') || (rec.key || '').includes('ceramic') || (rec.key || '').includes('porcelain') || (rec.key || '').includes('marble')) return [9, 0.07];
    if (fams.includes('stone') || fams.includes('mineral') || fams.includes('gem')) return [2, 0.12];
    if (fams.includes('salt') || fams.includes('crystal')) return [5, 0.15];
    if (fams.includes('rubber') || fams.includes('polymer') || rec.cat === 'polymers') return [11, 0.06];
    if (rec.key === 'glass' || rec.cat === 'glass') return [10, 0.05]; // glass sheen
    return [1, 0.07];
  }
  if (rec.cls === 'powder' && (fams.includes('rubber') || fams.includes('polymer'))) return [11, 0.05];
  return [0, 0]; // fire / electric / special / life / empty: no texture
}
function buildRenderTables() {
  RENDER_VER++;
  const n = SUBSTANCES.length;
  LUT = new Float32Array(n * 12); CLSARR = new Uint8Array(n); ISSMOKE = new Uint8Array(n);
  TEX_TYPE = new Uint8Array(n); TEX_AMP = new Float32Array(n);
  for (const rec of SUBSTANCES) {
    if (!rec || rec.id == null) continue;
    const id = rec.id, ramp = COLS[id] || [[136, 136, 136], [170, 170, 170]];
    const lo = ramp[0], hi = ramp[1];
    for (let v = 0; v < 4; v++) { const f = v / 3, o = (id * 4 + v) * 3; LUT[o] = lo[0] + (hi[0] - lo[0]) * f; LUT[o + 1] = lo[1] + (hi[1] - lo[1]) * f; LUT[o + 2] = lo[2] + (hi[2] - lo[2]) * f; }
    CLSARR[id] = CLS_CODE[rec.cls] != null ? CLS_CODE[rec.cls] : 7;
    ISSMOKE[id] = SMOKE_IDS.has(id) ? 1 : 0;
    const tt = texFor(rec); TEX_TYPE[id] = tt[0]; TEX_AMP[id] = tt[1];
  }
}
/* W32U-5 texture tiles: 8 x 32x32 offsets, deterministic (mulberry32, fixed
   seed). NOTE: Int16Array, not Int8 — the sparkle tile needs +160..+255,
   which Int8 cannot represent; every value and the apply formula are as
   specified. 0 none, 1 grain, 2 speckle, 3 streaks, 4 sheen, 5 sparkle,
   6 brushed, 7 cloudy. */
const TEX_TILES = (() => {
  let seed = 0x9E3779B9;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const T = new Int16Array(16 * 1024); // 13 used tiles (0-12), headroom to 16
  for (let i = 0; i < 1024; i++) T[1024 + i] = Math.round((rnd() * 2 - 1) * 100); // 1 grain ±100
  for (let i = 0; i < 1024; i++) { let v = (rnd() * 2 - 1) * 80; if (rnd() < 0.06) v = -128 + rnd() * 20; T[2048 + i] = Math.round(v); } // 2 speckle ±80 + sparse dark pits
  { let rv = 0; for (let y = 0; y < 32; y++) { rv += (rnd() * 2 - 1) * 34; rv = Math.max(-95, Math.min(95, rv * 0.78)); for (let x = 0; x < 32; x++) T[3072 + y * 32 + x] = Math.round(rv + (rnd() * 2 - 1) * 10); } } // 3 streaks: smooth per-row
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) T[4096 + y * 32 + x] = Math.round(Math.sin((x + y) / 32 * Math.PI * 2) * 45); // 4 sheen diagonal bands ±45
  for (let i = 0; i < 1024; i++) T[5120 + i] = rnd() < 0.08 ? Math.round(160 + rnd() * 95) : 0; // 5 sparkle
  for (let x = 0; x < 32; x++) { const cv = Math.round((rnd() * 2 - 1) * 55); for (let y = 0; y < 32; y++) T[6144 + y * 32 + x] = cv; } // 6 brushed per-column ±55
  { const g = new Float32Array(64); for (let i = 0; i < 64; i++) g[i] = (rnd() * 2 - 1) * 70; // 7 cloudy: 8x8 bilinear-upsampled ±70 (wrap-tiled)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const gx = x / 4, gy = y / 4, x0 = Math.floor(gx) % 8, y0 = Math.floor(gy) % 8, fx = gx - Math.floor(gx), fy = gy - Math.floor(gy), x1 = (x0 + 1) % 8, y1 = (y0 + 1) % 8; T[7168 + y * 32 + x] = Math.round((g[y0 * 8 + x0] * (1 - fx) + g[y0 * 8 + x1] * fx) * (1 - fy) + (g[y1 * 8 + x0] * (1 - fx) + g[y1 * 8 + x1] * fx) * fy); } }
  // V2 realistic pack tiles 8-12 (appended AFTER 0-7 so their values/seed order are unchanged):
  for (let x = 0; x < 32; x++) { const cv = Math.round((rnd() * 2 - 1) * 26); for (let y = 0; y < 32; y++) T[8192 + y * 32 + x] = Math.round(cv + (rnd() * 2 - 1) * 7); } // 8 fine brushed metal: tight per-column ±26
  for (let i = 0; i < 1024; i++) T[9216 + i] = Math.round((rnd() * 2 - 1) * 22); // 9 ceramic: smooth low noise ±22
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) T[10240 + y * 32 + x] = Math.round(Math.sin((x - y) / 32 * Math.PI * 2) * 60); // 10 glass sheen: diagonal band ±60
  for (let i = 0; i < 1024; i++) T[11264 + i] = Math.round((rnd() * 2 - 1) * 15); // 11 rubber matte: near-flat ±15
  { let rv = 0; for (let y = 0; y < 32; y++) { rv += (rnd() * 2 - 1) * 40; rv = Math.max(-80, Math.min(80, rv * 0.8)); for (let x = 0; x < 32; x++) T[12288 + y * 32 + x] = Math.round(rv + (rnd() * 2 - 1) * 16); } } // 12 copper streaks: warm per-row walk
  /* Water film: fine vertical streaks + sparse tiny droplets (tile 13). */
  for (let i = 0; i < 1024; i++) T[13312 + i] = Math.round(Math.sin((i % 32) * 0.42 + (i / 32) * 0.05) * 9);
  for (let i = 0; i < 300; i++) T[13312 + (rnd() * 1024 | 0)] += Math.round(10 + rnd() * 30); // sparse droplets
  return T;
})();
buildRenderTables();
/* W32U-5 gear visuals: per-kind monogram + gradient for the picker tiles. */
const GEAR_VIS = {
  'beaker-s': { label2: 'BS', bg: 'linear-gradient(135deg,#0d5a63,#15919e)' }, 'beaker-m': { label2: 'BM', bg: 'linear-gradient(135deg,#0a6b74,#17a2ad)' },
  'beaker-l': { label2: 'BL', bg: 'linear-gradient(135deg,#0e7c86,#1db3bf)' }, 'flask': { label2: 'EF', bg: 'linear-gradient(135deg,#0b5566,#128a9e)' },
  'testtube': { label2: 'TT', bg: 'linear-gradient(135deg,#0f6a70,#1ba39b)' }, 'roundflask': { label2: 'RF', bg: 'linear-gradient(135deg,#0a5f6e,#12908c)' },
  'cylinder': { label2: 'MC', bg: 'linear-gradient(135deg,#0d6e63,#14a085)' }, 'funnel': { label2: 'FN', bg: 'linear-gradient(135deg,#0b6258,#11998a)' },
  'lid-s': { label2: 'LS', bg: 'linear-gradient(135deg,#3d4654,#5b6a7d)' }, 'lid-m': { label2: 'LM', bg: 'linear-gradient(135deg,#46505f,#68798d)' },
  'lid-l': { label2: 'LL', bg: 'linear-gradient(135deg,#505c6e,#76879c)' },
  'burner': { label2: 'BU', bg: 'linear-gradient(135deg,#7e1503,#c33d05)' }, 'cooling-coil': { label2: 'CC', bg: 'linear-gradient(135deg,#0b5f8a,#19b6d9)' },
  'heater-coil': { label2: 'HC', bg: 'linear-gradient(135deg,#8a2b04,#e06408)' }, 'battery': { label2: 'BA', bg: 'linear-gradient(135deg,#145c1e,#2f9e44)' },
  'thermometer': { label2: 'TH', bg: 'linear-gradient(135deg,#155e86,#38a3d9)' },
  'wire': { label2: 'WI', bg: 'linear-gradient(135deg,#8a6108,#d9a514)' }, 'lamp': { label2: 'LA', bg: 'linear-gradient(135deg,#96690a,#e0ac16)' },
  'electrode-carbon': { label2: 'C+', bg: 'linear-gradient(135deg,#3a3f4d,#5f6478)' }, 'electrode-copper': { label2: 'Cu', bg: 'linear-gradient(135deg,#54465e,#7d6a94)' },
  'electrode-platinum': { label2: 'Pt', bg: 'linear-gradient(135deg,#625a78,#968bb5)' },
  'sensor': { label2: 'HS', bg: 'linear-gradient(135deg,#7d1060,#c2189e)' }, 'switch': { label2: 'SW', bg: 'linear-gradient(135deg,#4a7a08,#84cc16)' },
  'rack': { label2: 'RK', bg: 'linear-gradient(135deg,#5b3a1e,#8a5f30)' }, 'filterpaper': { label2: 'FP', bg: 'linear-gradient(135deg,#f5f1e4,#d9d2ba)', fg: '#4a4230' },
  'benchlamp': { label2: 'BE', bg: 'linear-gradient(135deg,#8a7208,#e6c51a)' },
};
const VESSEL_KINDS = new Set(['beaker-s', 'beaker-m', 'beaker-l', 'flask', 'testtube', 'roundflask', 'cylinder', 'funnel', 'lid-s', 'lid-m', 'lid-l']);
const LEVEL_GEAR = new Set(['burner', 'cooling-coil', 'heater-coil', 'sensor', 'switch']);
/* W32U-5 R2: kinds the engine refuses to resize (fixed stamp size) */
const FIXED_SIZE_KINDS = new Set(['switch', 'sensor', 'thermometer', 'electrode-carbon', 'electrode-copper', 'electrode-platinum']);
const REDUCED_MOTION = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
/* UI2 (W32U P2): ctx.filter support probe for the soften/glow pass — guarded, silent skip. */
const FILTER_OK = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

function blackbody(t) { // >600°C ramp
  const k = Math.min(1, (t - 600) / 1800);
  return [255, Math.round(60 + 160 * k), Math.round(10 + 140 * k * k)];
}

/* ---------------- big colour tiles (sand:box-pattern picker, UI2) ----------------
   Tile = the substance's REAL colour ramp (COLS[id] lo->hi) as a soft two-stop
   gradient, name underneath. Long-press opens the existing data card. */
/* Thumbnail: build the named demo into a THROWAWAY engine at 192x108 and
   rasterise with the same LUT colours. Never touches the live engine/state. */
export function renderSceneThumbnail(sceneId, canvas) {
  try {
    if (!canvas || typeof document === 'undefined') return false;
    const eng = new MatterEngine(192, 108);
    buildSceneInto(eng, sceneId);
    if (canvas.width !== 192) canvas.width = 192;
    if (canvas.height !== 108) canvas.height = 108;
    const ctx = canvas.getContext('2d'); if (!ctx) return false;
    const img = ctx.createImageData(192, 108); const d = img.data;
    for (let i = 0, n = 192 * 108; i < n; i++) {
      const o = i * 4, id = eng.el[i];
      if (!id || !LUT) { d[o] = 10; d[o + 1] = 12; d[o + 2] = 18; d[o + 3] = 255; continue; }
      const lo3 = (id * 4 + (eng.aux[i] & 3)) * 3;
      d[o] = LUT[lo3]; d[o + 1] = LUT[lo3 + 1]; d[o + 2] = LUT[lo3 + 2]; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return true;
  } catch { return false; }
}

export function MatterLab(props) {
  const launch = props && props.launch ? props.launch : undefined;
  const onHome = props && typeof props.onHome === 'function' ? props.onHome : null;
  const rootRef = useRef(null), boxRef = useRef(null), canvasRef = useRef(null);
  const engRef = useRef(null), offRef = useRef(null), imgRef = useRef(null);
  const sndRef = useRef(null);
  const rafRef = useRef(0), ptrRef = useRef(null);
  /* UI-B: DELTA undo/redo — DeltaStack instances (one full base + run-length
     patches between consecutive snapshot states; see src/game/game.js). */
  const undoRef = useRef(null), redoRef = useRef(null);
  if (!undoRef.current) undoRef.current = new Game.DeltaStack(30, 24 * 1024 * 1024);
  if (!redoRef.current) redoRef.current = new Game.DeltaStack(30, 24 * 1024 * 1024);
  const cloneRef = useRef(null), firedRef = useRef(new Set()), recipeRef = useRef([]);
  const gyroRef = useRef({ cand: -1, since: 0 });
  /* UI2 gyro (high class): low-pass filtered orientation, calibrated neutral,
     continuous vector. vx/vy in screen coords (y down): down = (0,1). */
  const gyroOnRef = useRef(false);
  const filtRef = useRef(null); // {beta, gamma} low-pass state
  const neutralRef = useRef(lsGet('omni:sandlab:neutral', { beta: 90, gamma: 0 }));
  const gyroVecRef = useRef({ vx: 0, vy: 1, mag: 1, angle: 90 });
  const gravDirRef = useRef(0); const shakeRef = useRef({ last: 0, mag: 0 });
  const gravIndRef = useRef(null); const gravArrowRef = useRef(null); const gravPctRef = useRef(null);
  const [ready, setReady] = useState(0);
  const [simError, setSimError] = useState(null); // HARDEN A1: paused-error banner state
  const [constructErr, setConstructErr] = useState(null); // HARDEN A1: engine build failure -> Empty + retry
  const [attempt, setAttempt] = useState(0);
  const govRef = useRef({ tickRate: 60, ladderStep: 0, tierIndex: -1, startTierIndex: -1, overSince: 0, healthySince: 0, lastResChange: 0, stepAt: 0 });
  const errStreakRef = useRef(0); const errOkSinceRef = useRef(0);
  /* P0-REOPEN (2026-11-27): the v3 watchdog sampled the visible canvas's
     BACKING STORE — but on the user's Android in-app browser the backing
     store reads back CORRECTLY while the compositor presents a black void,
     so the watchdog stayed silent and the world stayed invisible. No JS API
     can read the composited screen, so the defence is now three-layered:
     (1) ENV PRE-EMPTION — known in-app/WebView user agents (the failing
     class) START on the plain present path (fbRef latched from frame one,
     notice shown) instead of discovering the failure late;
     (2) the watchdog ALSO probes via a drawImage COPY of the visible
     canvas (a different rasterizer path than direct readback) at a faster
     cadence; (3) a user-selectable 'simple' renderer pref pins the plain
     path permanently. fbRef = plain-2D fallback active; blurRef = scratch
     canvas so the visible canvas's ctx NEVER carries a filter; wdRef =
     watchdog counters. */
  const envFb0 = RISKY_PRESENT_UA && Game.getRendererPref() === 'auto';
  const fbRef = useRef(envFb0); const blurRef = useRef(null);
  /* P1: WebGL2 primary renderer (null when WebGL2 is unavailable — the 2D
     path below is then used seamlessly). glEnabledRef is a bench/debug
     switch to force the 2D path. Once fbRef latches (watchdog, render
     throw, GL failure, context loss) the GL path stays off for the session. */
  const glRef = useRef(null); const glEnabledRef = useRef(true);
  const wdRef = useRef({ n: 0, strikes: 0, fbStrikes: 0, dismissed: false, failedShown: false });
  const probeRef = useRef(null); // P0-REOPEN: drawImage copy-probe canvas
  const sabotageRef = useRef(false); // P0-REOPEN: fault-injection lever (gate only)
  const gfxNoticeRef = useRef(envFb0 ? 'fallback' : null);
  const [gfxFb, setGfxFb] = useState(() => (envFb0 ? 'fallback' : null)); // null | 'fallback' | 'failed'
  const [gfxDetail, setGfxDetail] = useState(false);
  const setGfx = (v) => { gfxNoticeRef.current = v; setGfxFb(v); };
  const loopRef = useRef(null); const lastSceneRef = useRef(null);
  const depthRef = useRef(null); const hotRef = useRef([]); const hotBandRef = useRef(new Uint8Array(8));
  const [tool, setTool] = useState('paint');
  const [brush, setBrush] = useState(6);
  const [shape, setShape] = useState('circle');
  const [selId, setSelId] = useState(() => (BY_KEY.get('sand') || SUBSTANCES[1]).id);
  const [paused, setPaused] = useState(false); const pausedRef = useRef(false);
  const [speedI, setSpeedI] = useState(2);
  const [fps, setFps] = useState(0); const [parts, setParts] = useState(0);
  const [tierI, setTierI] = useState(1); const [tierNote, setTierNote] = useState('');
  const [gridDims, setGridDims] = useState({ cols: 480, rows: 270 }); // HOTFIX: live grid dims (canvas aspect + readouts)
  const aspectRef = useRef(16 / 9); const geomRef = useRef(null); // HOTFIX: viewport aspect + last render geometry (uniform scale + letterbox offsets)
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState('earth');
  const [favs, setFavs] = useState(() => lsGet(LS.favs, []));
  const [recent, setRecent] = useState(() => lsGet(LS.recent, []));
  const [dataCard, setDataCard] = useState(null);
  const [inspectInfo, setInspectInfo] = useState(null);
  const [rxLog, setRxLog] = useState([]);
  const [unread, setUnread] = useState(0); // PART E: Messages badge (reactions since feed last opened)
  const msgsOpenRef = useRef(false);
  const [expActive, setExpActive] = useState(null); const [expStatus, setExpStatus] = useState(null);
  const expActiveRef = useRef(null); const expStatusKeyRef = useRef('');
  const heatCacheRef = useRef(new Map()); const menRef = useRef({ map: new Map() }); const frameNoRef = useRef(0);
  const processedNonceRef = useRef(null); const kbRef = useRef({});
  const [muted, setMuted] = useState(false); const mutedRef = useRef(false);
  const [sheet, setSheet] = useState(''); // '', 'scenes', 'recipes', 'help', 'log', 'menu'
  const [scenes, setScenes] = useState(() => lsGet(LS.scenes, {}));
  const [recipes, setRecipes] = useState(() => lsGet(LS.recipes, {}));
  const [recipeLen, setRecipeLen] = useState(0);
  const [fs, setFs] = useState(false);
  const [fsFb, setFsFb] = useState(false); // UI2: in-page full-bleed fallback when the Fullscreen API is denied/absent
  const fsFbRef = useRef(false); fsFbRef.current = fsFb;
  const fsMode = fs || fsFb;
  const [sideOpen, setSideOpen] = useState(false); // UI2: side tool rail expanded
  const [dockTab, setDockTab] = useState(null); // UI-A: active bottom-dock category filter for the picker
  const [dockExpanded, setDockExpanded] = useState(false); // UI-A: chip strip <-> full grid sheet
  const [pourKey, setPourKey] = useState(0); // UI-A: pour micro-animation trigger (visual only)
  const smoothRef = useRef(true); // UI2: anti-boxy smoothing pipeline on/off (hook-toggleable)
  const [gyro, setGyro] = useState(false);
  const [gravDir, setGravDir] = useState(0);
  const [demoOffer, setDemoOffer] = useState(() => !lsGet('omni:sandlab:seen', false));
  /* W32U-4 state */
  const [viewMode, setViewMode] = useState('normal'); const viewModeRef = useRef('normal'); viewModeRef.current = viewMode;
  /* W32U-5 state: texture toggle, vessel size, selected gear object */
  const [textureOn, setTextureOn] = useState(() => !PERF.lowEnd); const textureOnRef = useRef(textureOn); textureOnRef.current = textureOn;
  /* P2: procedural-texture quality (GL path): 'auto' (High + governor
     auto-drop) | 'low' | 'med' | 'high', persisted like other settings. */
  const [texQuality, setTexQuality] = useState(() => { const q = lsGet('omni:sandlab:texq', 'auto'); return ['auto', 'low', 'med', 'high'].includes(q) ? q : 'auto'; });
  const texQualityRef = useRef(texQuality); texQualityRef.current = texQuality;
  const setTexQualityQ = (q) => { setTexQuality(q); lsSet('omni:sandlab:texq', q); };
  const [vesselSize, setVesselSize] = useState('M'); // W32U-5 R2: 'M' regardless of orientation
  const [selObj, setSelObj] = useState(null); // { id, kind, level, locked, scale, w, h } | null
  const selObjRef = useRef(null); // mirror of selObj for the render loop (synced in an effect below)
  const dragRef = useRef(null); // W32U-5 R2: in-progress drag { id, dx, dy } (cells)
  const dragCandRef = useRef(null); // W32U-5 R2: pointerdown candidate { id, gx, gy, anchor }
  const [rxMode, setRxMode] = useState('feed');
  const [collapsedRx, setCollapsedRx] = useState(() => new Set());
  /* ---- P4 + UI-B game-layer state ---- */
  const [starsMap, setStarsMap] = useState(() => Game.getStars());
  const [discoveries, setDiscoveries] = useState(() => Game.namedDiscoveries());
  const [achMap, setAchMap] = useState(() => Game.getAchievements());
  const [achToast, setAchToast] = useState(null); // brief TOP toast (never bottom spam)
  const achToastTRef = useRef(0);
  const [dailyStatus, setDailyStatus] = useState(null); // { tpl, done, detail }
  const dailyDoneRef = useRef(!!(Game.getDailyState()[Game.dateKey()] || {}).done);
  const rxTodayRef = useRef(new Set()); // distinct reaction cards fired today (daily rx5 + honest session tracking)
  const expSetupTickRef = useRef(null);
  const [slots, setSlots] = useState(() => Game.loadSlots());
  const [slotName, setSlotName] = useState('');
  const [expandedRx, setExpandedRx] = useState(() => new Set());
  const [coachStep, setCoachStep] = useState(-1); // -1 = off
  const coachAnchorRef = useRef(null);
  const [, setCoachTick] = useState(0);
  /* ---- UI-B settings state ---- */
  const [hapticsOn, setHapticsOn] = useState(() => Game.getHaptics());
  const hapticsOnRef = useRef(hapticsOn); hapticsOnRef.current = hapticsOn;
  const buzz = (fn) => { if (hapticsOnRef.current) fn(); }; // haptics fire only if the sound-toggle path allows (inside hapticFx) AND this toggle is on
  const [rendererPref, setRendererPref] = useState(() => Game.getRendererPref());
  const rendererPrefRef = useRef(rendererPref); rendererPrefRef.current = rendererPref;
  const [rendererNote, setRendererNote] = useState('');
  const autoDropRef = useRef(false);
  const frameSampleRef = useRef({ t0: 0, samples: [], decided: false });
  const [heatRamp, setHeatRamp] = useState(() => Game.getHeatRamp());
  const heatRampRef = useRef(heatRamp); heatRampRef.current = heatRamp;
  const [fontScale, setFontScale] = useState(() => Game.getFontScale());
  /* ---- UI-B zoom / gesture state ---- */
  const [zoom, setZoom] = useState(1);
  const viewRef = useRef({ z: 1, fx: null, fy: null }); // fx/fy = world cell at canvas centre (null = world centre)
  const ptrMapRef = useRef(new Map()); // active pointers for pinch
  const pinchRef = useRef(null); // { d0, z0, cx, cy } while pinching
  const lastTapRef = useRef({ t: 0, x: 0, y: 0, fingers: 0 });
  const sparkFlickRef = useRef({ lastMoveT: 0, lastBurst: 0 });
  const hoverRef = useRef(null); // world point under the pointer (hover ring on the world)
  const tiltPourRef = useRef({ since: 0, last: 0 });
  const rxLogRef = useRef([]); const rxIdRef = useRef(0);
  const [lookupA, setLookupA] = useState('water'); const [lookupB, setLookupB] = useState('sodium');
  const [lookupRes, setLookupRes] = useState(null);
  const [shareInput, setShareInput] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customsVer, setCustomsVer] = useState(0);
  const [cf, setCf] = useState({ name: '', cls: 'powder', colour: '#c8a24a', density: 1, flammability: 0, acidity: 0, ph: 7, solubility: 0, boil: '' });
  const speedRef = useRef(2); speedRef.current = speedI; pausedRef.current = paused; mutedRef.current = muted;
  /* Matter Lab Ultra — Power Mode: 10× speed + stronger gravity (>1). */
  const [powerOn, setPowerOn] = useState(() => { try { return lsGet(LS.power, false); } catch { return false; } });
  const powerRef = useRef(powerOn); powerRef.current = powerOn;
  const applyPower = (v) => {
    const on = !!v; setPowerOn(on); lsSet(LS.power, on);
    const e = engRef.current; if (e) e.setGravityStrength(on ? 4 : 1);
    toast(on ? 'Power Mode ON — 10× speed, stronger gravity' : 'Power Mode OFF');
  };
  const toolRef = useRef('paint'); toolRef.current = tool; const selRecRef = useRef(null);

  const engine = () => engRef.current;
  const selRec = SUBSTANCES[selId] || SUBSTANCES[1]; selRecRef.current = selRec;

  /* W32U-5 R2: selection refresh — full object snapshot for the Gear panel +
     canvas highlight; clears the selection when the object is gone. */
  const refreshSel = (id) => {
    const e = engine();
    if (!e || id == null || typeof e.getObject !== 'function') { setSelObj(null); return null; }
    const o = e.getObject(id);
    if (!o) { setSelObj(null); return null; }
    const s = { id, kind: o.kind, level: o.level, locked: !!o.locked, scale: o.scale, w: o.w, h: o.h };
    setSelObj(s); return s;
  };
  /* W32U-5 R2: blocked-action feedback — shake the canvas stage */
  const shakeCanvas = () => {
    try {
      const el = boxRef.current;
      if (el && typeof el.animate === 'function') el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 280 });
    } catch { /* animation unsupported — toast already shown */ }
  };

  /* ---------------- engine lifecycle + render loop ---------------- */
  // HARDEN helpers (component scope so Resume / Reset-engine can reuse them).
  /* P4: achievement unlocks surface as ONE brief toast at the TOP of the
     stage (the app-wide toaster sits at the bottom — reactions/achievements
     never spam there), plus the success haptic when haptics allow. */
  const announceAch = (defs) => {
    const list = (Array.isArray(defs) ? defs : [defs]).filter(Boolean);
    if (!list.length) return;
    setAchMap(Game.getAchievements());
    setAchToast(list[0]);
    buzz(() => hapticFx.success());
    clearTimeout(achToastTRef.current);
    achToastTRef.current = setTimeout(() => setAchToast(null), 3200);
  };
  const wireEngine = (eng) => {
    eng.governor = govRef.current;
    eng.onSound = (ev) => { if (!ev) return; /* P3 haptics + UI-B separate haptics toggle: fire only when the toggle is on (hapticFx itself stays gated on the sound toggle) */ if (ev.type === 'event' && ev.cls === 'boom') { buzz(() => hapticFx.blast()); const d = Game.awardAchievement('first-explosion'); if (d) announceAch(d); } else if (ev.type === 'event' && ev.cls === 'pop') buzz(() => hapticFx.pop()); const snd = sndRef.current; if (!snd) return; snd.handleEvent(ev); };
    eng.onReaction = (evt) => {
      if (!evt) return;
      const products = [evt.outA, evt.outB, evt.gas].filter((x) => x != null);
      const id = ++rxIdRef.current;
      let parentId = null;
      for (const prev of rxLogRef.current) { // most recent earlier entry first
        if (Array.isArray(prev.products) && (prev.products.includes(evt.aKey) || prev.products.includes(evt.bKey))) { parentId = prev.id; break; }
      }
      const entry = { ...evt, id, products, parentId, at: Date.now() };
      rxLogRef.current = [entry, ...rxLogRef.current].slice(0, 200);
      setRxLog(rxLogRef.current);
      // PART E: reactions NEVER auto-show (no bottom card, no toast) — they
      // only bump the Messages badge silently while the feed is closed.
      if (!msgsOpenRef.current) setUnread((u) => u + 1);
      /* P4 game wiring — every counter below is fed ONLY by this real
         in-world event: total reactions, today's distinct set, and the
         persistent DISCOVERY LOG keyed by the reaction's card identity. */
      Game.bumpRxTotal();
      /* Discovery + the daily distinct-set count NAMED pair cards only
         (family/template cards are patterns, not named reactions — see
         game.js isNamedCard). first-reaction fires for ANY real event. */
      const fresh = [];
      const d1 = Game.awardAchievement('first-reaction'); if (d1) fresh.push(d1);
      if (evt.card && Game.isNamedCard(evt.card)) {
        rxTodayRef.current.add(evt.card);
        if (Game.recordDiscovery(evt.card)) {
          setDiscoveries(Game.namedDiscoveries());
          const d2 = Game.awardAchievement('first-discovery'); if (d2) fresh.push(d2);
        }
      }
      fresh.push(...Game.checkCountAchievements());
      if (fresh.length) announceAch(fresh);
    };
  };
  const rebuildOff = (eng) => {
    const off = offRef.current || document.createElement('canvas');
    off.width = eng.cols; off.height = eng.rows; offRef.current = off;
    imgRef.current = off.getContext('2d').createImageData(eng.cols, eng.rows);
    depthRef.current = new Int16Array(eng.cols);
  };
  const startLoop = () => { cancelAnimationFrame(rafRef.current); if (loopRef.current) rafRef.current = requestAnimationFrame(loopRef.current); };
  const handleSimError = (err, eng) => {
    // HARDEN A1: stop the loop, keep the scene, surface a resumable banner.
    cancelAnimationFrame(rafRef.current);
    errStreakRef.current += 1;
    try { if (eng) lastSceneRef.current = eng.serialize(); } catch { /* keep older backup */ }
    try { window.__matterlab = window.__matterlab || {}; window.__matterlab.lastError = { message: String((err && err.message) || err), tick: eng ? eng.tick : -1 }; } catch { /* noop */ }
    setSimError(String((err && err.message) || err || 'unknown error'));
    setPaused(true);
    toast('Simulation paused — something glitched. Your scene is safe.');
  };
  const resumeSim = () => { setSimError(null); setPaused(false); errOkSinceRef.current = performance.now(); startLoop(); };
  /* Matter Lab Ultra — Performance section (Settings): apply the live particle cap. */
  const applyPerfCap = (n) => { const e = engRef.current; if (e) e.setMaxParts(n); setPerfStore({ capParts: n }); toast(n ? `Movement cap ${n} — OK on this device` : 'Movement cap off'); };
  const resetEngine = () => {
    const old = engRef.current;
    let scene = lastSceneRef.current;
    try { if (old) scene = old.serialize() || scene; } catch { /* use backup */ }
    let eng = null;
    const d0 = dimsForTier(tierI, aspectRef.current);
    try { eng = new MatterEngine(d0.cols, d0.rows); } catch (e2) { setConstructErr(String((e2 && e2.message) || e2)); return; }
    engRef.current = eng;
    if (PERF.capParts > 0) eng.setMaxParts(PERF.capParts); wireEngine(eng);
    if (scene) { try { eng.deserialize(scene); } catch { /* start empty rather than crash */ } }
    rebuildOff(eng); setGridDims({ cols: eng.cols, rows: eng.rows });
    errStreakRef.current = 0; setSimError(null); setPaused(false); startLoop();
    toast('Engine reset — scene restored');
  };

  useEffect(() => {
    const w = boxRef.current ? boxRef.current.clientWidth : 360;
    const ti = autoStartTier(w >= 900 ? 0 : 1); // low-end devices start at the deepest tier (2 GB phones)
    aspectRef.current = viewAspect();
    setTierI(ti);
    govRef.current.tierIndex = ti; govRef.current.startTierIndex = ti; govRef.current.ladderStep = 0; govRef.current.tickRate = 60;
    /* W32U-4: restore saved custom substances BEFORE the engine is created. */
    try { const saved = lsGet(LS_CUSTOMS, []); if (Array.isArray(saved)) saved.forEach((def) => { try { registerCustomSubstance(def); } catch { /* skip bad def */ } }); ensureCols(); if (saved && saved.length) setCustomsVer((v) => v + 1); } catch { /* guarded */ }
    let eng = null;
    const d0 = dimsForTier(ti, aspectRef.current);
    try { eng = new MatterEngine(d0.cols, d0.rows); } catch (e2) {
      // HARDEN A1: construction failure -> Empty state with retry, never a throw through React.
      setConstructErr(String((e2 && e2.message) || e2)); return undefined;
    }
    engRef.current = eng;
    if (PERF.capParts > 0) eng.setMaxParts(PERF.capParts); // low-end: movement-duty cap
    const snd = new MatterSound(); sndRef.current = (PERF.disableSound ? null : snd);
    wireEngine(eng);
    rebuildOff(eng); setGridDims({ cols: eng.cols, rows: eng.rows });
    /* P1: create the WebGL2 renderer once. If WebGL2 is unavailable or the
       context cannot be created (incl. --disable-3d-apis software gate),
       glRef stays null and the 2D path runs seamlessly. A later context
       loss latches the P0 fallback + notice through the watchdog path. */
    try {
      const g = new GLRenderer(() => { fbRef.current = true; if (!wdRef.current.dismissed) setGfx('fallback'); try { window.__matterlab = window.__matterlab || {}; window.__matterlab.gfxFallback = true; } catch { /* noop */ } });
      glRef.current = g && g.ok ? g : null;
    } catch { glRef.current = null; }
    let frames = 0, winT = performance.now(), acc = 0, lastT = performance.now(), lastStats = 0, lastGov = 0, lastAmb = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const e = engRef.current; if (!e) return;
      try {
        if (!pausedRef.current) {
          // HARDEN B: tick-rate cap is ladder step 1-2 (60 -> 45 -> 30 ticks/s at 1x).
          const dtMs = Math.min(100, now - lastT); lastT = now;
          acc += (dtMs / 1000) * govRef.current.tickRate * SPEEDS[speedRef.current] * (powerRef.current ? 10 : 1); // Power Mode: 10× speed
          let steps = Math.floor(acc); acc -= steps; if (steps > 8) { steps = 8; acc = 0; }
          for (let s2 = 0; s2 < steps; s2++) e.step();
          if (Math.abs(e.windX) > 0.01 || Math.abs(e.windY) > 0.01) { e.windX *= 0.94; e.windY *= 0.94; } else { e.windX = 0; e.windY = 0; }
          if (sndRef.current) { sndRef.current.frame(0.016);
            const pp = ptrRef.current;
            if (pp && (toolRef.current === 'paint' || toolRef.current === 'spray')) { const rec = selRecRef.current; const cls = rec ? rec.cls : ''; const x01 = pp.x != null && e.cols ? pp.x / e.cols : null;
              if (cls === 'liquid') sndRef.current.setLoop((rec.viscosity || 0) >= 0.5 ? 'pour-oil' : 'pour', 0.55, null, x01);
              else if (cls === 'powder') { if ((rec.fams || []).includes('stone')) sndRef.current.setLoop('pour-grain', 0.5, null, x01); else sndRef.current.event('shush', 0.4, null, x01); } }
          }
        } else lastT = now;
        /* P3 gyro applier: the continuous gravity vector goes straight
           into the engine (setGravityVector) — no 4-way quantising, and
           windX/windY are NOT touched (wind is its own field again: fans
           + the wind tool). The indicator reads the ENGINE's effective
           vector (unit direction x gravMag), not the raw sensor state. */
        if (gyroOnRef.current) {
          const v = gyroVecRef.current;
          e.setGravityVector(v.vx, v.vy, Math.max(0.05, Math.min(1, v.mag)));
          if (e.gravity !== gravDirRef.current) { gravDirRef.current = e.gravity; setGravDir(e.gravity); }
          const gv = e.getGravityVector();
          const ea = Math.atan2(gv.effY, gv.effX) * 180 / Math.PI;
          if (gravArrowRef.current) gravArrowRef.current.style.transform = `rotate(${ea}deg)`;
          if (gravPctRef.current) gravPctRef.current.textContent = `${Math.round(gv.mag * 100)}%`;
        }
        /* P0: a render-only failure drops to the plain-2D fallback and retries
           once in-place; only a fallback failure (or a sim error) pauses.
           UI-B: the same call is timed for the renderer auto-safeguard —
           while GL presents a BUSY world in Auto mode, presented-frame
           (render-call) times are sampled; the decision runs on the stats
           cadence below. */
        const rt0 = performance.now();
        try { render(e, now); } catch (rerr) {
          if (!fbRef.current) { fbRef.current = true; if (!wdRef.current.dismissed) setGfx('fallback'); try { render(e, now); } catch { throw rerr; } }
          else throw rerr;
        }
        { const fs2 = frameSampleRef.current;
          if (!fs2.decided && rendererPrefRef.current === 'auto' && glRef.current && !fbRef.current && !autoDropRef.current && e.stats().particles > 1500) {
            if (!fs2.t0) fs2.t0 = now;
            if (now - fs2.t0 > 600) fs2.samples.push(performance.now() - rt0);
          } }
      } catch (err) { handleSimError(err, e); return; }
      frames++;
      if (now - winT >= 500) { setFps(Math.round(frames * 1000 / (now - winT))); frames = 0; winT = now; }
      if (now - lastStats > 500) { lastStats = now; setParts(e.stats().particles);
        const exId = expActiveRef.current; // V2 experiments: real objective check, same cadence
        if (exId) { try { const st = computeObjective(e, exId); const kk = (st.done ? '1' : '0') + '|' + st.detail; if (kk !== expStatusKeyRef.current) { expStatusKeyRef.current = kk; setExpStatus(st); } } catch { /* check is best-effort */ } }
        /* P4: star rating on the same cadence — extends the live objective
           with measured counts + elapsed ticks (game.js experimentStars). */
        if (exId) { try {
          const sr = Game.experimentStars(e, exId, expSetupTickRef.current);
          if (sr.stars > 0) {
            const res = Game.awardStars(exId, sr.stars);
            if (res.improved) {
              setStarsMap(Game.getStars());
              toast(`★ ${sr.stars} star${sr.stars > 1 ? 's' : ''} — ${sr.extra || sr.detail}`);
              const fresh = Game.checkCountAchievements(); if (fresh.length) announceAch(fresh);
            }
          }
        } catch { /* best-effort */ } }
        /* P4: daily challenge checker against live engine state. */
        try {
          { const tk = Game.dateKey(); if (loopRef.current._dailyDate !== tk) { loopRef.current._dailyDate = tk; dailyDoneRef.current = !!(Game.getDailyState()[tk] || {}).done; rxTodayRef.current = new Set(); } }
          const tpl = Game.dailyFor();
          const chk = tpl.check(e, { rxToday: rxTodayRef.current });
          const done = dailyDoneRef.current || chk.done;
          if (chk.done && !dailyDoneRef.current) {
            dailyDoneRef.current = true;
            if (Game.markDailyDone()) { const d = Game.awardAchievement('daily-done'); toast(`Daily challenge complete — ${tpl.name}`); if (d) announceAch(d); }
          }
          const sig = tpl.id + '|' + done + '|' + chk.detail;
          if (sig !== (loopRef.current._dailySig || '')) { loopRef.current._dailySig = sig; setDailyStatus({ tpl, done, detail: chk.detail }); }
        } catch { /* best-effort */ }
        /* P4: first-boil scan (throttled to this cadence) — any water cell
           at 100°C+ is a real boil, however it was achieved. */
        try {
          const got = Game.getAchievements();
          if (!got['first-boil']) {
            const wid = (BY_KEY.get('water') || {}).id;
            if (wid != null) { let boiled = false; for (let i = 0; i < e.el.length; i++) if (e.el[i] === wid && e.temp[i] >= 100) { boiled = true; break; } if (boiled) { const d = Game.awardAchievement('first-boil'); if (d) announceAch(d); } }
          }
        } catch { /* best-effort */ }
        /* UI-B renderer auto-safeguard decision: ~4 s of busy-world samples;
           median presented-frame time > 40 ms while the SIM itself is fast
           (emaMs < 20) means the GPU path is the bottleneck on this device —
           drop to 2D for the session and say so in the setting. The P0
           watchdog keeps precedence: if it has latched the fallback, this
           never runs (fbRef check) and never un-latches anything. */
        try {
          const fs2 = frameSampleRef.current;
          if (!fs2.decided && fs2.t0 && now - fs2.t0 > 4000) {
            fs2.decided = true;
            const arr = [...fs2.samples].sort((a, b) => a - b);
            const med = arr.length ? arr[Math.floor(arr.length / 2)] : 0;
            const ema = e.stats().emaMs || 0;
            try { window.__matterlab = window.__matterlab || {}; window.__matterlab.autoSample = { n: arr.length, medianMs: Math.round(med * 10) / 10, emaMs: ema }; } catch { /* noop */ }
            if (arr.length >= 20 && med > 40 && ema < 20 && !fbRef.current) {
              autoDropRef.current = true; glEnabledRef.current = false;
              setRendererNote('Auto — using 2D (GL was slow on this device)');
            } else if (arr.length >= 20) setRendererNote('Auto — using GL');
          }
        } catch { /* best-effort */ }
      }
      if (now - lastAmb > 250 && sndRef.current) { // SND2 ambient bed: sampled scan of real engine state
        lastAmb = now;
        const elA = e.el, auxA = e.aux; let burn = 0, liq = 0, stm = 0;
        for (let k = 0; k < elA.length; k += 113) { const id = elA[k]; if (!id) continue; if (auxA[k] & 32) burn++; const rc = SUBSTANCES[id]; if (rc.cls === 'liquid') liq++; else if (rc.cls === 'gas' && (rc.key || '').includes('steam')) stm++; }
        sndRef.current.setAmbient({ fire: Math.min(1, burn / 6), water: liq > 2 ? Math.min(1, liq / 40) : 0, wind: Math.min(1, (Math.abs(e.windX) + Math.abs(e.windY)) / 2), steam: Math.min(1, stm / 8) });
      }
      if (now - lastGov > 500) {
        /* HARDEN B — load governor. Ladder order (user's): (1) tick rate 60->45->30,
           (2) engine update-radius/pass degradation via applyGovernor(3..5),
           (3) resolution LAST: at most ONE tier down from the session start tier,
           never below 320x180, only after >5 s sustained overload at ladder max.
           Recovery unwinds in reverse: pass rates -> tick rate -> resolution (one
           resolution step per 10 s). The colour/render pipeline (variant lerp, glow,
           depth tint, glass shine) is NEVER disabled by this ladder. */
        lastGov = now;
        const gov = govRef.current; const st = e.stats(); const ema = st.emaMs;
        /* W32U-5 tuning: hold a stable target — step down only on emaMs > 17
           sustained 800 ms, step up only on emaMs < 10 sustained 5000 ms.
           Ladder order and all resolution rules below are unchanged. */
        const overload = ema > 17, healthy = ema < 10;
        if (overload) { gov.healthySince = 0; if (!gov.overSince) gov.overSince = now; } else if (healthy) { gov.overSince = 0; if (!gov.healthySince) gov.healthySince = now; } else { gov.overSince = 0; gov.healthySince = 0; }
        if (gov.overSince && now - gov.overSince > 800) {
          if (gov.ladderStep < 5) { gov.ladderStep += 1; e.applyGovernor(gov.ladderStep); gov.overSince = now; if (gov.ladderStep === 1) setTierNote('Load governor: tick rate 45/s to protect quality.'); if (gov.ladderStep === 3) setTierNote('Load governor: update radius reduced — resolution and colours untouched.'); }
          else if (now - gov.overSince > 5000) {
            const cur = gov.tierIndex;
            const floorI = TIERS.length - 1; // lowest tier (smallest cell budget) is the floor
            const maxDown = Math.min(floorI, gov.startTierIndex + 1); // at most ONE tier below session start
            if (cur >= 0 && cur < maxDown && now - (gov.lastResChange || 0) > 10000) {
              const nt = dimsForTier(cur + 1, aspectRef.current); e.resize(nt.cols, nt.rows); rebuildOff(e); setGridDims({ cols: e.cols, rows: e.rows });
              gov.tierIndex = cur + 1; gov.lastResChange = now; gov.overSince = now;
              setTierI(cur + 1); setTierNote('Load governor: one resolution step down (the floor) — scene preserved.');
              toast('Stepped down one resolution tier (floor) to keep the sim smooth');
            }
          }
        }
        if (gov.healthySince && now - gov.healthySince > 5000) {
          if (gov.ladderStep > 2) { gov.ladderStep -= 1; e.applyGovernor(gov.ladderStep); gov.healthySince = now; }
          else if (gov.ladderStep > 0) { gov.ladderStep -= 1; e.applyGovernor(gov.ladderStep); gov.healthySince = now; if (gov.ladderStep === 0) setTierNote(''); }
          else if (gov.tierIndex > gov.startTierIndex && now - (gov.lastResChange || 0) > 10000) {
            const cur = gov.tierIndex;
            if (cur > gov.startTierIndex) { const nt = dimsForTier(cur - 1, aspectRef.current); e.resize(nt.cols, nt.rows); rebuildOff(e); setGridDims({ cols: e.cols, rows: e.rows }); gov.tierIndex = cur - 1; gov.lastResChange = now; setTierI(cur - 1); }
          }
        }
        try { if (window.__matterlab) { window.__matterlab.tickRate = gov.tickRate; window.__matterlab.ladderStep = gov.ladderStep; window.__matterlab.tierIndex = gov.tierIndex; window.__matterlab.startTierIndex = gov.startTierIndex; window.__matterlab.gov = gov; } } catch { /* noop */ }
        if (errStreakRef.current > 0 && errOkSinceRef.current && now - errOkSinceRef.current > 10000) errStreakRef.current = 0;
      }
    };
    loopRef.current = loop;
    rafRef.current = requestAnimationFrame(loop);
    setReady(1);
    const onVis = () => {
      if (!document.hidden) return;
      // HARDEN A2: tab-hidden auto-pause (no auto-resume — the Play control resumes).
      if (!pausedRef.current) setPaused(true);
      if (sndRef.current) { sndRef.current.setAmbient({}); sndRef.current.setLoop('boil', 0); sndRef.current._silenceLoops(); }
    };
    document.addEventListener('visibilitychange', onVis);
    const unlock = () => { if (sndRef.current) sndRef.current.resume(); };
    window.addEventListener('pointerdown', unlock);
    /* HOTFIX: orientation / big aspect change -> rebuild the grid at the new
       aspect (same tier budget). engine.resize resamples the world across —
       never a stretch. Small shifts (URL bar, fullscreen chrome) are ignored. */
    let rzT = 0;
    const onRz = () => {
      clearTimeout(rzT);
      rzT = setTimeout(() => {
        const na = viewAspect(), e2 = engRef.current;
        if (!e2 || !na) return;
        if (Math.abs(Math.log(na / aspectRef.current)) < Math.log(1.25)) return;
        aspectRef.current = na;
        const tix = govRef.current.tierIndex >= 0 ? govRef.current.tierIndex : ti;
        const nd = dimsForTier(tix, na);
        if (nd.cols !== e2.cols || nd.rows !== e2.rows) {
          try { e2.resize(nd.cols, nd.rows); rebuildOff(e2); setGridDims({ cols: e2.cols, rows: e2.rows }); } catch { /* keep the old grid rather than crash */ }
        }
      }, 350);
    };
    window.addEventListener('resize', onRz);
    return () => { cancelAnimationFrame(rafRef.current); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointerdown', unlock); window.removeEventListener('resize', onRz); clearTimeout(rzT); if (sndRef.current) { sndRef.current.dispose(); sndRef.current = null; } if (glRef.current) { glRef.current.dispose(); glRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  /* P0 WATCHDOG (reworked, P0-REOPEN): every 15th frame, if the world is
     non-empty but the PRESENTED canvas samples as pure background, count a
     strike. Two probes per patch: direct readback AND a drawImage copy of
     the visible canvas read from a probe canvas (a different rasterizer
     path — catches failures where one read path lies). Two strikes on the
     fancy path engage the plain-2D fallback + notice; two more on the
     fallback escalate to "rendering failed" — never a silent black void.
     Known blind spot (documented, mitigated by env pre-emption + the
     'simple' pref): a compositor that presents black while BOTH read
     paths return the drawn pixels cannot be detected from JS. */
  function wdCheck(e, cv, ctx) {
    const wd = wdRef.current;
    if ((wd.n = (wd.n + 1) % 15) !== 0) return;
    const el = e.el; let first = -1;
    for (let i = 0; i < el.length; i += 211) if (el[i]) { first = i; break; }
    if (first < 0 && !(e.objects && e.objects.length)) return;
    const g = geomRef.current; if (!g || !(g.s > 0)) return;
    let visible = false;
    try {
      const patches = [[g.ox + g.w / 2 - 12, g.oy + g.h / 2 - 12]];
      if (first >= 0) patches.push([g.ox + (first % e.cols) * g.s - 6, g.oy + ((first / e.cols) | 0) * g.s - 6]);
      for (const [px, py] of patches) {
        const sw = Math.max(1, Math.min(24, cv.width)), sh = Math.max(1, Math.min(24, cv.height));
        const sx0 = Math.max(0, Math.min(cv.width - sw, Math.round(px))), sy0 = Math.max(0, Math.min(cv.height - sh, Math.round(py)));
        const isBg = (data) => { for (let i = 0; i < data.length; i += 16) { if (data[i + 3] > 0 && !(Math.abs(data[i] - 10) <= 2 && Math.abs(data[i + 1] - 12) <= 2 && Math.abs(data[i + 2] - 18) <= 2)) return false; } return true; };
        if (!isBg(ctx.getImageData(sx0, sy0, sw, sh).data)) { visible = true; break; }
        /* copy-probe: drawImage the visible canvas into a probe canvas and
           read THAT — if the direct readback lies (returns stale/black or
           stale/healthy pixels), the copy path may still tell the truth. */
        try {
          const pc = probeRef.current || (probeRef.current = document.createElement('canvas'));
          if (pc.width !== sw || pc.height !== sh) { pc.width = sw; pc.height = sh; }
          const pctx = pc.getContext('2d');
          pctx.clearRect(0, 0, sw, sh);
          pctx.drawImage(cv, sx0, sy0, sw, sh, 0, 0, sw, sh);
          if (!isBg(pctx.getImageData(0, 0, sw, sh).data)) { visible = true; break; }
        } catch { /* copy-probe unavailable — direct readback already judged */ }
      }
    } catch { return; /* readback unavailable — never false-trigger */ }
    if (visible) { wd.strikes = 0; wd.fbStrikes = 0; return; }
    if (!fbRef.current) {
      if (++wd.strikes >= 2) { fbRef.current = true; wd.strikes = 0; if (!wd.dismissed) setGfx('fallback'); try { window.__matterlab = window.__matterlab || {}; window.__matterlab.gfxFallback = true; } catch { /* noop */ } }
    } else if (++wd.fbStrikes >= 2 && !wd.failedShown) { wd.failedShown = true; setGfx('failed'); }
  }

  function render(e, now) {
    const cv = canvasRef.current;
    if (!cv || !offRef.current || !imgRef.current) return;
    /* P0 guard: a 0-sized / stale offscreen (e.g. after a resize rebuild on a
       tall portrait viewport) makes putImageData/drawImage silently no-op or
       throw — rebuild it from the live engine before touching pixels. */
    if (offRef.current.width !== e.cols || offRef.current.height !== e.rows || imgRef.current.width !== e.cols || imgRef.current.height !== e.rows) rebuildOff(e);
    const off = offRef.current, img = imgRef.current;
    const { cols, rows, el, temp, aux, tint } = e;
    const d = img.data; const tick = e.tick;
    /* HARDEN D — renderer realism. NOTE (gate Q): this colour pipeline (variant lerp,
       hash jitter, blackbody, glow, depth tint, glass shine) is NEVER disabled by the
       load governor ladder — degradation only touches tick rate, pass rates, and (last,
       floored) resolution. */
    const vm = viewModeRef.current;
    const pressAt = (x, y) => { let pv = 0; try { if (typeof e.pressureAt === 'function') pv = e.pressureAt(x, y); else if (typeof e._pressureAt === 'function') pv = e._pressureAt(x, y); else if (e.pressure && e.pw) pv = e.pressure[Math.min(e.ph2 - 1, Math.max(0, (y / 4) | 0)) * e.pw + Math.min(e.pw - 1, Math.max(0, (x / 4) | 0))] || 0; } catch { /* noop */ } try { if (e.airP) { const ac = e.airCols || e.pw || Math.ceil(cols / 4), ar = e.airRows || e.ph2 || Math.ceil(rows / 4); const ai = Math.min(ar - 1, Math.max(0, Math.floor(y / rows * ar))) * ac + Math.min(ac - 1, Math.max(0, Math.floor(x / cols * ac))); pv += e.airP[ai] || 0; } } catch { /* noop */ } return pv; };
    const depth = depthRef.current && depthRef.current.length === cols ? depthRef.current : (depthRef.current = new Int16Array(cols));
    const hot = hotRef.current; hot.length = 0;
    const hotBands = hotBandRef.current; hotBands.fill(0);
    const texOn = textureOnRef.current && vm === 'normal'; // W32U-5: texture is Normal-view only
    /* P1 — WebGL2 primary path: pack the engine state into GL textures and
       shade the whole world on the GPU into the renderer's own canvas; the
       present step below then composites THAT canvas with the same
       letterbox drawImage the 2D path uses (a plain drawImage of a
       DIFFERENT canvas — the P0-safe operation). If anything about GL
       fails, glWorld stays false and this frame falls through to the full
       2D pipeline below; a draw failure also latches the P0 fallback. */
    let glWorld = false;
    const glr = glRef.current;
    /* UI-B: the GL shader's heat ramp is fixed (gl-renderer is read-only in
       this phase), so the colour-blind-safe viridis Heat view is presented
       through the 2D pipeline below, which shares the same present step —
       the user sees the viridis ramp regardless of renderer. */
    const cbHeat = vm === 'heat' && heatRampRef.current === 'viridis';
    if (glr && glr.ok && !fbRef.current && glEnabledRef.current && !cbHeat) {
      try {
        if (glr.tablesVer !== RENDER_VER) glr.setTables(buildGLTables(SUBSTANCES, COLS, TEX_TYPE, TEX_AMP, CLSARR, ISSMOKE, GLASS_ID, LUT), RENDER_VER);
        let q = texQualityRef.current === 'low' ? 0 : texQualityRef.current === 'med' ? 1 : 2; // 'auto' and 'high' start at High
        if (govRef.current.ladderStep >= 3) q = Math.min(q, 1); // load-governor auto-drop (same spirit as the glow-pass gate)
        if (govRef.current.ladderStep >= 5) q = 0;
        glWorld = !!glr.draw(e, { view: vm === 'heat' ? 1 : vm === 'pressure' ? 2 : 0, quality: q, texOn: textureOnRef.current, now }, hotBands);
        if (!glWorld) { fbRef.current = true; if (!wdRef.current.dismissed) setGfx('fallback'); }
      } catch { fbRef.current = true; if (!wdRef.current.dismissed) setGfx('fallback'); glWorld = false; }
    }
    if (!glWorld) for (let i = 0, n = cols * rows; i < n; i++) {
      const o = i * 4, id = el[i];
      if (vm === 'heat' || vm === 'pressure') {
        const vx2 = i % cols, vy2 = (i / cols) | 0;
        if (vm === 'heat') { if (id === 0) { d[o] = 10; d[o + 1] = 12; d[o + 2] = 18; } else { const c = rampLerp(heatRampRef.current === 'viridis' ? HEAT_STOPS_CB : HEAT_STOPS, temp[i]); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; } }
        else { const c = rampLerp(PRESS_STOPS, Math.max(0, pressAt(vx2, vy2))); d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; }
        d[o + 3] = 255; continue;
      }
      if (id === 0) { d[o] = 10; d[o + 1] = 12; d[o + 2] = 18; d[o + 3] = 255; continue; }
      const x = i % cols, y = (i / cols) | 0;
      /* W32U-5: base colour from the precomputed LUT + class from CLSARR —
         no SUBSTANCES[id] deref or .cls string compare in this loop. */
      const clsC = CLSARR[id];
      const variant = aux[i] & 3;
      const lo3 = (id * 4 + variant) * 3;
      let r = LUT[lo3], g = LUT[lo3 + 1], b = LUT[lo3 + 2];
      const v = variant / 3;
      const t = temp[i];
      // D1: per-cell hash jitter +-6% brightness — no flat fills
      const jit = 1 + ((((i * 2654435761) >>> 8) % 13) - 6) / 100;
      r *= jit; g *= jit; b *= jit;
      // W32U-5 texture — Normal view ONLY (heat/pressure returned above; flow
      // skips via texOn). One tile read + one multiply per channel.
      if (texOn) {
        const tt = TEX_TYPE[id];
        if (tt) {
          const off = TEX_TILES[tt * 1024 + ((((clsC === 2 ? y + ((tick >> 3) & 31) : y) & 31) << 5) + ((x + variant * 8) & 31))];
          if (off) { const tf = 1 + (off / 128) * TEX_AMP[id]; r *= tf; g *= tf; b *= tf; }
        }
      }
      // D3: depth tinting — liquids darken/saturate with run-depth below the surface (cap 35%)
      if (clsC === 2) {
        const dep = depth[x] + 1; depth[x] = dep;
        const dk = Math.min(0.35, dep * 0.03);
        r *= (1 - dk); g *= (1 - dk * 0.9); b *= (1 - dk * 0.65);
      } else depth[x] = 0; // any non-liquid cell breaks the column's liquid run
      // D5: wet darkening — solids touching liquid render ~12% darker
      if (clsC === 4) {
        let wet = false;
        if (x + 1 < cols && CLSARR[el[i + 1]] === 2) wet = true;
        else if (x > 0 && CLSARR[el[i - 1]] === 2) wet = true;
        else if (y + 1 < rows && CLSARR[el[i + cols]] === 2) wet = true;
        else if (y > 0 && CLSARR[el[i - cols]] === 2) wet = true;
        if (wet) { r *= 0.88; g *= 0.88; b *= 0.88; }
      }
      // D4: smoke fade — smoke-family gas lerps toward the background as it cools to ambient
      if (ISSMOKE[id]) {
        const f = Math.max(0, Math.min(0.65, (55 - t) / 50)) * (0.7 + 0.3 * v);
        r += (10 - r) * f; g += (12 - g) * f; b += (18 - b) * f;
      }
      // reaction tint — the pair outcome's colour consequence (indicators, dyes,
      // dissolved gases, golden-rain shimmer) lerps the cell toward the tint
      const tn = tint[i];
      if (tn) { r += (((tn >> 16) & 255) - r) * 0.55; g += (((tn >> 8) & 255) - g) * 0.55; b += ((tn & 255) - b) * 0.55; }
      if (aux[i] & 32) { const f = ((i * 2654435761 ^ tick * 97) >>> 8) % 40; r = Math.min(255, r + 60 + f); g = Math.min(255, g + f); }
      if (t > 600) { const bb = blackbody(t), k = Math.min(0.85, (t - 600) / 1400); r += (bb[0] - r) * k; g += (bb[1] - g) * k; b += (bb[2] - b) * k; }
      else if (t < 0) { r += (120 - r) * 0.25; g += (170 - g) * 0.25; b += (255 - b) * 0.3; }
      if (id === GLASS_ID) { r += (235 - r) * 0.45; g += (245 - g) * 0.45; b += (250 - b) * 0.45; if ((aux[i] & 3) === 0) { r = 245; g = 250; b = 252; } }
      if (t > 550 && hot.length < 4096) { hot.push(i); if (t > 800) hotBands[Math.min(7, (y * 8 / rows) | 0)] = 1; }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
    // D2: blackbody light radiation — additive glow pass, hot cells lighten radius-2 neighbours
    if (!glWorld) for (let h = 0; h < hot.length; h++) {
      const i = hot[h]; const t = temp[i];
      const glow = Math.min(1, (t - 550) / 1450);
      const hx = i % cols, hy = (i / cols) | 0;
      for (let dy = -2; dy <= 2; dy++) {
        const ny = hy + dy; if (ny < 0 || ny >= rows) continue;
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = hx + dx; if (nx < 0 || nx >= cols) continue;
          const dist = Math.abs(dx) + Math.abs(dy);
          const fall = glow * (1 - dist / 6) * 90;
          if (fall <= 0) continue;
          const o = (ny * cols + nx) * 4;
          d[o] = Math.min(255, d[o] + fall); d[o + 1] = Math.min(255, d[o + 1] + fall * 0.55); d[o + 2] = Math.min(255, d[o + 2] + fall * 0.2);
        }
      }
    }
    if (!glWorld) { const octx = off.getContext('2d'); octx.putImageData(img, 0, 0); }
    /* D7: heated liquids/gases — a soft ambient glow around >250 C cells
       (hot water, boiling, workshop heat) drawn into the offscreen AFTER
       the main pass: realistic amber halos under tubes, rising v realistically.
       Sampled every other cell (step 2), radius 1.1, ~10% alpha. */
    if (!glWorld && !PERF.lowEnd) {
      const octx = off.getContext('2d');
      const gx0 = (tick >> 1) & 1;
      octx.save(); octx.globalCompositeOperation = 'lighter'; octx.globalAlpha = 0.10;
      for (let gy = 0; gy < rows; gy += 2) {
        for (let gx = 0; gx < cols; gx += 2) {
          if (((gy + gx) & 1) !== gx0) continue;
          const id = el[gy * cols + gx];
          if (!id) continue;
          const cls = CLSARR[id];
          if (cls !== 2 && cls !== 3) continue;
          const t = temp[gy * cols + gx];
          if (t < 250) continue;
          octx.fillStyle = `rgb(${Math.min(255, Math.round(250 + (t - 250) * 0.3))},${Math.min(255, Math.round(170 + (t - 250) * 0.05))},80)`;
          octx.beginPath(); octx.arc(gx, gy, 1.1, 0, 7); octx.fill();
        }
      }
      octx.restore();
    }
    const ctx = cv.getContext('2d');
    /* P0 guard: never size the backing store from a 0/negative client size
       (mid-fullscreen-transition WebViews can report 0 for a frame) — that
       would pin the letterbox scale to 0 and draw nothing, every frame. */
    const cw = cv.clientWidth | 0, ch = cv.clientHeight | 0;
    if (cw > 0 && ch > 0 && (cv.width !== cw || cv.height !== ch)) { cv.width = cw; cv.height = ch; }
    if (!(cv.width > 0) || !(cv.height > 0)) return;
    /* P0-GEOMETRY (2026-11-27): in fullscreen-fallback mode (in-app
       WebViews, where requestFullscreen is missing) the canvas element can
       be TALLER than the visible region — fixed inset:0 / 100dvh size to
       the LAYOUT viewport, which can exceed the visual viewport. A centred
       letterbox then puts the world floor below the fold: everything
       settles out of sight and the screen reads as a black void. Clamp the
       draw box to the canvas's VISIBLE part (rect ∩ visualViewport) so the
       whole world, floor included, fits what the user can actually see.
       geomRef carries the same box, so pointer mapping stays exact for
       everything visible. No-op when the canvas is fully visible. */
    let drawW = cv.width, drawH = cv.height;
    try {
      const vv = window.visualViewport;
      if (vv && vv.height > 0 && (fsFbRef.current || document.fullscreenElement)) {
        const r = cv.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) {
          const kx = cv.width / r.width, ky = cv.height / r.height;
          const visW = Math.round((Math.min(r.right, vv.offsetLeft + vv.width) - Math.max(r.left, vv.offsetLeft)) * kx);
          const visH = Math.round((Math.min(r.bottom, vv.offsetTop + vv.height) - Math.max(r.top, vv.offsetTop)) * ky);
          if (visW > 40 && visW < drawW - 8) drawW = visW;
          if (visH > 40 && visH < drawH - 8) drawH = visH;
        }
      }
    } catch { /* no visualViewport — full-canvas draw box */ }
    /* HOTFIX: UNIFORM scale + letterbox. One px-per-cell factor for BOTH axes,
       world centred in the canvas; the old code drew the grid canvas onto the
       full canvas box, so on a tall portrait viewport every cell became a tall
       rectangle (needle mountains, streak droplets, stamp-size distortion).
       The anti-boxy smoothing pass below uses the same dest rect, so it can
       no longer reintroduce the stretch. */
    let s = Math.min(drawW / cols, drawH / rows);
    if (!(s > 0) || !Number.isFinite(s)) return; // P0 guard: degenerate geometry draws nothing
    let dw = Math.max(1, Math.round(cols * s)), dh = Math.max(1, Math.round(rows * s));
    let ox = Math.round((drawW - dw) / 2), oy = Math.round((drawH - dh) / 2);
    /* UI-B pinch zoom: the presented world scales around the view focus
       (world cell at canvas centre). geomRef ALWAYS describes the presented
       geometry, so pointer mapping (toGrid) stays exact at every zoom. */
    const vr = viewRef.current;
    if (vr.z > 1.001) {
      s = s * vr.z;
      dw = Math.max(1, Math.round(cols * s)); dh = Math.max(1, Math.round(rows * s));
      const fx = vr.fx != null ? vr.fx : cols / 2, fy = vr.fy != null ? vr.fy : rows / 2;
      ox = Math.round(drawW / 2 - fx * s); oy = Math.round(drawH / 2 - fy * s);
      // clamp pan: keep at least 48px of world on screen on each axis
      ox = Math.max(48 - dw, Math.min(drawW - 48, ox));
      oy = Math.max(48 - dh, Math.min(drawH - 48, oy));
    }
    geomRef.current = { s, ox, oy, w: drawW, h: drawH };
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, cv.width, cv.height);
    /* P0-REOPEN fault injection (gate only, via __matterlab.sabotagePresent):
       present a black frame while the offscreen world stays correct — the
       device failure, mimicked. The watchdog must still run and react. */
    if (sabotageRef.current) { wdCheck(e, cv, ctx); return; }
    /* P1: the world source is the GL canvas when the GPU path drew this
       frame, else the 2D offscreen. Both are grid-sized canvases, so every
       draw below is unchanged apart from the source. The blur soften pass
       doubles as the bloom-ish glow for the GL path (it blurs the GL
       canvas — emissive cells included — into the scratch canvas and
       blits additively at the same 0.38 alpha, gated exactly as before). */
    const worldSrc = glWorld ? glr.canvas : off;
    /* UI2 anti-boxy pipeline: grid canvas is drawn UPSCALED with smoothing on
       (quality high) instead of pixelated, then a soften/glow pass re-draws
       the upscaled source blurred at low alpha so liquids/gases read fluid.
       Hot-cell glow (D2, in the ImageData above) is untouched. When smoothing
       is off (debug/hook), the old crisp nearest-neighbour draw is used. */
    if (fbRef.current) {
      /* P0 FALLBACK PATH: plain 2D only — no filter, no smoothing upscale, no
         self-drawImage. Engaged by the watchdog (or a render throw); gear
         overlays below still draw, so vessels/burners stay visible too. */
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(worldSrc, 0, 0, worldSrc.width, worldSrc.height, ox, oy, dw, dh);
    } else if (smoothRef.current) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(worldSrc, 0, 0, worldSrc.width, worldSrc.height, ox, oy, dw, dh);
      /* W32U-5 glow gating: the blur soften pass is a redraw effect (not the
         colour pipeline) — it runs only while the governor is at ladderStep
         <= 2 and resolution is still at the session start tier. The plain
         smoothed drawImage above always runs. */
      if (FILTER_OK && (vm === 'normal' || vm === 'flow') && govRef.current.ladderStep <= 2 && govRef.current.tierIndex <= govRef.current.startTierIndex) {
        try {
          /* P0: the blur is rendered into a SCRATCH canvas and blitted plain.
             The visible canvas's ctx never carries a filter — on some Android
             WebView GPU rasterizers a filtered drawImage presents as a pure
             black void even though the pixels read back correctly. Visual
             result is identical (same blur, same 0.38 alpha over the main draw). */
          const bc = blurRef.current || (blurRef.current = document.createElement('canvas'));
          if (bc.width !== dw || bc.height !== dh) { bc.width = dw; bc.height = dh; }
          const bx = bc.getContext('2d');
          bx.clearRect(0, 0, dw, dh); bx.filter = 'blur(2px)';
          bx.drawImage(worldSrc, 0, 0, worldSrc.width, worldSrc.height, 0, 0, dw, dh);
          try { bx.filter = 'none'; } catch { /* noop */ }
          ctx.save(); ctx.globalAlpha = 0.38; ctx.drawImage(bc, ox, oy); ctx.restore();
        } catch { /* filter unsupported at runtime — main draw already done */ }
      }
    } else {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(worldSrc, 0, 0, worldSrc.width, worldSrc.height, ox, oy, dw, dh);
    }
    // D6: heat shimmer — 8 horizontal bands of the DRAWN WORLD (letterbox-aware),
    // bands over >800 C regions get a +-1px time-sine x-offset. Band drawImage
    // calls only; off under reduced-motion.
    if (!fbRef.current && e._anyHot && !(REDUCED_MOTION && REDUCED_MOTION.matches)) {
      /* P0: bands are copied from the OFFSCREEN grid canvas, never from the
         visible canvas itself — self-referential drawImage(cv, ...) is the
         second GPU-rasterizer path that can poison presentation on Android
         WebViews. Same bands, same ±1px sine offset, same look. */
      const bandH = Math.ceil(dh / 8), bandR = Math.max(1, Math.ceil(rows / 8));
      for (let bd = 0; bd < 8; bd++) {
        if (!hotBandRef.current[bd]) continue;
        const by = oy + bd * bandH;
        const off1 = Math.round(Math.sin(now / 90 + bd * 1.7) * 1);
        if (off1) ctx.drawImage(worldSrc, 0, Math.min(rows - bandR, bd * bandR), cols, bandR, ox + off1, by, dw, bandH);
      }
    }
    /* object overlays — uniform scale s on both axes, offset by the letterbox origin */
    const sx = s, sy = s;
    ctx.font = '11px sans-serif'; ctx.textBaseline = 'bottom';
    let tn = 0;
    e.objects.forEach((obj) => {
      const ax = ox + obj.anchor.x * sx, ay = oy + obj.anchor.y * sy;
      if (obj.kind === 'thermometer') {
        tn++;
        let bt = null;
        for (let c = 0; c < obj.cells.length; c++) if (obj.stampIds[c] === THERMO_ID) { bt = e.temp[obj.cells[c]]; break; }
        if (bt == null && obj.cells.length) bt = e.temp[obj.cells[0]];
        const label = `#${tn} ${bt == null ? '—' : (Math.round(bt * 10) / 10).toFixed(1)}°C`;
        ctx.fillStyle = 'rgba(0,0,0,.65)'; const wpx = ctx.measureText(label).width + 8;
        ctx.fillRect(ax - 2, ay - 18, wpx, 15);
        ctx.fillStyle = '#fff'; ctx.fillText(label, ax + 2, ay - 4);
      } else if (obj.kind === 'burner' || obj.kind === 'battery') {
        const lvl = obj.level || 1;
        for (let p = 0; p < 3; p++) { ctx.fillStyle = p < lvl ? (obj.kind === 'burner' ? '#ff9d3c' : '#7ee787') : 'rgba(255,255,255,.25)'; ctx.fillRect(ax + p * 7, ay - 8, 5, 5); }
      } else if (obj.kind === 'cylinder') {
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        for (let gLine = 1; gLine <= 4; gLine++) ctx.fillRect(ax - 3, ay + obj.h * sy - gLine * (obj.h * sy / 5), 3, 1);
      }
    });
    try { realisticPass(e, ctx, ox, oy, s, tick); } catch { /* overlay is decorative — never break the frame */ }
    /* W32U-5 R2: selection outline (+ padlock when locked); while dragging,
       the same outline follows the ghost anchor, dashed and translucent */
    const dragNow = dragRef.current;
    const hlId = dragNow ? dragNow.id : (selObjRef.current ? selObjRef.current.id : null);
    if (hlId != null && typeof e.getObject === 'function') {
      const so = e.getObject(hlId);
      if (so && so.anchor && so.w && so.h) {
        const rx = ox + (so.anchor.x + (dragNow ? dragNow.dx : 0)) * sx, ry = oy + (so.anchor.y + (dragNow ? dragNow.dy : 0)) * sy;
        const rw = so.w * sx, rh = so.h * sy;
        ctx.save();
        if (dragNow) { ctx.globalAlpha = 0.55; ctx.setLineDash([6, 4]); }
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(rx - 3, ry - 3, 8, 8); // filled tag at the top-left corner
        if (so.locked && !dragNow) {
          /* padlock at the top-right corner: arc shackle + filled rounded body */
          const px = rx + rw - 8, py = ry + 4;
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(px, py + 2, 4, Math.PI, 0); ctx.stroke();
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(px - 6, py + 2, 12, 9, 2); else ctx.rect(px - 6, py + 2, 12, 9);
          ctx.fillStyle = '#ffd166'; ctx.fill();
        }
        ctx.restore();
      }
    }
    /* ghost preview for shape tools */
    const p = ptrRef.current;
    if (p && p.start && (tool === 'line' || tool === 'rect' || tool === 'circle' || (tool === 'clone' && !cloneRef.current))) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      const x0 = ox + p.start.x * sx, y0 = oy + p.start.y * sy, x1 = ox + p.cur.x * sx, y1 = oy + p.cur.y * sy;
      ctx.beginPath();
      if (tool === 'line') { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      else if (tool === 'circle') ctx.arc(x0, y0, Math.hypot(x1 - x0, y1 - y0), 0, 7);
      else ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.stroke(); ctx.setLineDash([]);
    } else if (p && p.cur) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (shape === 'square') ctx.rect(ox + (p.cur.x - brush) * sx, oy + (p.cur.y - brush) * sy, brush * 2 * sx, brush * 2 * sy);
      else ctx.arc(ox + p.cur.x * sx, oy + p.cur.y * sy, brush * sx, 0, 7);
      ctx.stroke();
    }
    /* Hover ring — a subtle cyan ring around the world cell under the
       pointer (usability polish; readable, does not interfere with tools). */
    const hv = hoverRef.current;
    if (hv && !fbRef.current) {
      ctx.save(); ctx.strokeStyle = 'rgba(120,230,255,0.75)'; ctx.setLineDash([]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ox + hv.x * sx, oy + hv.y * sy, 3.6, 0, 7); ctx.stroke();
      ctx.restore();
    }
    /* W32U-4 flow view: coarse air-grid direction/magnitude overlay */
    if (vm === 'flow' && e.airVX && e.airVY) {
      const ac = e.airCols || e.pw || Math.ceil(cols / 4), ar = e.airRows || e.ph2 || Math.ceil(rows / 4);
      const cw = dw / ac, ch = dh / ar;
      ctx.strokeStyle = 'rgba(120,230,255,.9)'; ctx.fillStyle = 'rgba(120,230,255,.9)'; ctx.lineWidth = 1.5;
      for (let gy = 0; gy < ar; gy++) for (let gx = 0; gx < ac; gx++) {
        const ai = gy * ac + gx; const vx = e.airVX[ai] || 0, vy = e.airVY[ai] || 0; const mag = Math.hypot(vx, vy);
        if (mag < 0.05) continue;
        const cxp = ox + (gx + 0.5) * cw, cyp = oy + (gy + 0.5) * ch; const sc = Math.min(cw, ch) * 0.45 * Math.min(1, mag);
        const ex = cxp + (vx / mag) * sc * 2, ey = cyp + (vy / mag) * sc * 2;
        ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, 7); ctx.fill();
      }
    }
    wdCheck(e, cv, ctx); // P0 watchdog (throttled internally to every 30th frame)
  }

  /* ---------------- V2 realistic pack: sprite overlay pass ----------------
     Runs AFTER the world draw + existing overlays. Only cached sprite blits;
     meniscus scan throttled to every 3rd frame, heat sampling to every 6 ticks.
     Steam wisps: SKIPPED deliberately — the engine already emits real steam
     cells, so fake sprite wisps would double-draw the same physics. */
  const realisticPass = (e, ctx, ox, oy, s, tick) => {
    frameNoRef.current++;
    const gov = govRef.current;
    e.objects.forEach((obj) => {
      const ax = ox + obj.anchor.x * s, ay = oy + obj.anchor.y * s, wpx = obj.w * s, hpx = obj.h * s;
      let hc = heatCacheRef.current.get(obj.id);
      if (!hc || tick - hc.tick >= 6) { let sum = 0; for (let c = 0; c < obj.cells.length; c++) sum += e.temp[obj.cells[c]]; const mean = obj.cells.length ? sum / obj.cells.length : 20; hc = { tick, mean, band: mean < 60 ? 0 : mean < 200 ? 1 : mean < 450 ? 2 : 3 }; heatCacheRef.current.set(obj.id, hc); }
      if (VESSEL_KINDS.has(obj.kind)) {
        const bw = bucket(wpx), bh = bucket(hpx); const spr = glassSprite(obj.kind, bw, bh); if (spr) ctx.drawImage(spr, ax, ay, wpx, hpx);
        if (frameNoRef.current % 3 === 0 || !menRef.current.map.has(obj.id)) {
          const topByX = new Map(); const liq = new Set(); const inter = obj.interior || [];
          for (let c = 0; c < inter.length; c++) { const i = inter[c]; if (e.el[i] && CLSARR[e.el[i]] === 2) { liq.add(i); const x = i % e.cols, y = (i / e.cols) | 0; if (!topByX.has(x) || y < topByX.get(x)) topByX.set(x, y); } }
          /* MENISCUS FIX: a column counts as surface only if its top cell has depth
             (liquid also present 2 cells below it) — isolated spray/foam columns are
             dropped, then the surface y is smoothed with a 3-column moving average
             so splash spikes can't draw a jagged skyline above the liquid. */
          const raw = [...topByX.entries()].filter(([x, y]) => liq.has((y + 2) * e.cols + x)).sort((a, b) => a[0] - b[0]);
          const sm = raw.map(([x, y], k) => { let sum = y, n = 1; if (k > 0) { sum += raw[k - 1][1]; n++; } if (k < raw.length - 1) { sum += raw[k + 1][1]; n++; } return [x, sum / n]; });
          menRef.current.map.set(obj.id, sm);
        }
        const pts = menRef.current.map.get(obj.id) || [];
        if (pts.length > 1) {
          ctx.save();
          ctx.strokeStyle = 'rgba(225,248,255,0.85)'; ctx.lineWidth = Math.max(1, s * 0.35); ctx.beginPath();
          pts.forEach(([x, y], idx) => { const px = ax + (x - obj.anchor.x + 0.5) * s, py = ay + (y - obj.anchor.y) * s; if (idx === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
          ctx.stroke();
          // refraction brightening at the liquid line (approximation): soft bright band just under the surface
          ctx.globalAlpha = 0.16; ctx.fillStyle = '#dff4ff';
          ctx.fillRect(ax + 2, ay + (pts[0][1] - obj.anchor.y) * s + 1, wpx - 4, Math.max(1.5, s * 1.2));
          ctx.restore();
        }
      } else if (obj.kind === 'burner') {
        const bw = bucket(wpx), bh = bucket(hpx); const base = burnerSprite(bw, bh);
        const spr = hc.band > 0 ? heatTinted('burner|' + bw + '|' + bh, base, hc.band) : base; if (spr) ctx.drawImage(spr, ax, ay, wpx, hpx);
        const lvl = obj.level || 0;
        if (lvl > 0) {
          /* FLAME FIX: taller blit vs a real Bunsen (height scale by level, width unchanged) */
          const fScale = lvl >= 3 ? 1.35 : lvl === 2 ? 1.2 : 1.1;
          const fh = (5 + lvl * 4.5) * s * fScale, fw = (4.5 + lvl * 1.2) * s, cx = ax + wpx / 2, top = ay + hpx * 0.14;
          if (gov.ladderStep <= 2) { const halo = haloSprite(); if (halo) { ctx.save(); ctx.globalAlpha = (0.16 + 0.10 * lvl) * 1.25; ctx.drawImage(halo, cx - fh * 0.9, top - fh * 1.15, fh * 1.8, fh * 1.8); ctx.restore(); } }
          const fr = flameFrame(((tick >> 2) % 12 + 12) % 12); const jit = (((tick * 2654435761) >>> 9) % 3) - 1;
          if (fr) ctx.drawImage(fr, cx - fw / 2 + jit, top - fh, fw, fh);
        }
      } else if (obj.kind === 'cooling-coil' || obj.kind === 'heater-coil') {
        const bw = bucket(wpx), bh = bucket(hpx); const base = coilSprite(obj.kind, bw, bh);
        const spr = hc.band > 0 ? heatTinted('coil|' + obj.kind + '|' + bw + '|' + bh, base, hc.band) : base; if (spr) ctx.drawImage(spr, ax, ay, wpx, hpx);
        if (obj.kind === 'cooling-coil' && (obj.level > 0 || hc.mean < 10)) { const fr2 = frostSprite(bw, bh); if (fr2) { ctx.save(); ctx.globalAlpha = Math.max(0.15, Math.min(0.9, (20 - hc.mean) / 70 + (obj.level || 0) * 0.12)); ctx.drawImage(fr2, ax, ay, wpx, hpx); ctx.restore(); } }
      }
    });
  };

  /* ---------------- helpers ---------------- */
  const logStep = useCallback((s) => { recipeRef.current = [...recipeRef.current, s].slice(-500); setRecipeLen(recipeRef.current.length); }, []); // HARDEN cap: recipe steps <= 500
  /* UI-B DELTA undo/redo: snapshot states are pushed onto DeltaStacks
     (game.js) — one full base + run-length patches of changed cells, temp
     at the serialize format's own 1°C precision. Restore semantics are
     unchanged from the full-copy era: the target state is reconstructed
     exactly and set wholesale (objects are NOT part of snapshots — same
     as before, e.clear() drops them; resize handling identical). */
  const snapshot = useCallback(() => {
    const e = engine(); if (!e) return;
    undoRef.current.push(Game.stateOf(e));
    redoRef.current.clear(); // UI-A: a fresh stroke invalidates the redo stack
  }, []);
  const applySnap = (e, s) => {
    if (s.cols !== e.cols || s.rows !== e.rows) { e.resize(s.cols, s.rows); rebuildOff(e); setGridDims({ cols: e.cols, rows: e.rows }); }
    e.clear(); e.el.set(s.el); e.temp.set(s.tempQ);
    let n = 0; for (let i = 0; i < e.el.length; i++) if (e.el[i]) n++;
    e.particles = n; setParts(n);
  };
  const undo = () => {
    const e = engine(); if (!e) return;
    const s = undoRef.current.popTarget(); if (!s) { toast('Nothing to undo'); return; }
    redoRef.current.push(Game.stateOf(e));
    applySnap(e, s); toast('Stroke undone');
  };
  const redo = () => {
    const e = engine(); if (!e) return;
    const s = redoRef.current.popTarget(); if (!s) { toast('Nothing to redo'); return; }
    undoRef.current.push(Game.stateOf(e));
    applySnap(e, s); toast('Stroke redone');
  };
  const pickSubstance = (rec) => {
    if (coachStep === 0) setCoachStep(1); // coach: step 1 done by the real pick
    setSelId(rec.id);
    setRecent((R) => { const nr = [rec.id, ...R.filter((x) => x !== rec.id)].slice(0, 12); lsSet(LS.recent, nr); return nr; });
  };
  const toggleFav = (id) => setFavs((F) => { const nf = F.includes(id) ? F.filter((x) => x !== id) : [...F, id]; lsSet(LS.favs, nf); return nf; });

  const toGrid = (ev) => {
    const cv = canvasRef.current, e = engine(); if (!cv || !e) return null;
    const r = cv.getBoundingClientRect();
    const g = geomRef.current;
    if (g && g.s > 0) {
      // HOTFIX: pointer -> cell through the letterboxed uniform-scale geometry
      return { x: Math.max(0, Math.min(e.cols - 1, Math.floor((ev.clientX - r.left - g.ox) / g.s))), y: Math.max(0, Math.min(e.rows - 1, Math.floor((ev.clientY - r.top - g.oy) / g.s))) };
    }
    return { x: Math.max(0, Math.min(e.cols - 1, Math.floor((ev.clientX - r.left) / r.width * e.cols))), y: Math.max(0, Math.min(e.rows - 1, Math.floor((ev.clientY - r.top) / r.height * e.rows))) };
  };
  const paintAt = (g, opts = {}) => {
    const e = engine(); if (!e) return;
    const dens = tool === 'spray' ? 0.22 : tool === 'dropper' ? 0.12 : 1;
    const r = tool === 'dropper' ? 1 : brush;
    e.paint(g.x, g.y, r, selId, { shape: tool === 'spray' ? 'circle' : shape, density: dens, ...opts });
  };
  const floodFill = (g) => {
    const e = engine(); if (!e) return;
    const target = e.get(g.x, g.y); if (target === selId) return;
    const stack = [[g.x, g.y]]; let n = 0;
    while (stack.length && n < 200000) {
      const [x, y] = stack.pop(); const i = y * e.cols + x;
      if (e.el[i] !== target || e.objMap[i] !== 0) continue;
      e.set(x, y, selId); n++;
      if (x > 0) stack.push([x - 1, y]); if (x < e.cols - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]); if (y < e.rows - 1) stack.push([x, y + 1]);
    }
  };
  const drawShape = (a, b) => {
    const e = engine(); if (!e) return;
    const put = (x, y) => { if (x >= 0 && y >= 0 && x < e.cols && y < e.rows && e.objMap[y * e.cols + x] === 0) e.paint(x, y, Math.max(0, Math.floor(brush / 3)), selId, { shape: 'square' }); };
    if (tool === 'line') { const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (let s = 0; s <= steps; s++) put(Math.round(a.x + (b.x - a.x) * s / steps), Math.round(a.y + (b.y - a.y) * s / steps)); }
    else if (tool === 'rect') { for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) put(x, y); }
    else if (tool === 'circle') { const r = Math.hypot(b.x - a.x, b.y - a.y); for (let y = Math.floor(a.y - r); y <= a.y + r; y++) for (let x = Math.floor(a.x - r); x <= a.x + r; x++) if (Math.hypot(x - a.x, y - a.y) <= r) put(x, y); }
  };

  /* ---------------- pointer + UI-B gestures ----------------
     Conflict rules (also in Help): ONE finger always paints/uses the tool,
     exactly as before. A SECOND finger landing starts pinch-zoom and
     cancels the in-progress stroke's painting (its snapshot stays, so Undo
     still works). Double-tap (one finger, quick, unmoved) = Undo;
     double-tap with two fingers = Redo — both are detected on the second
     pointerdown and swallow that tap so no stray paint lands. */
  const worldPtFloat = (clientX, clientY) => {
    const cv = canvasRef.current, e = engine(); if (!cv || !e) return null;
    const r = cv.getBoundingClientRect(); const g = geomRef.current;
    if (!g || !(g.s > 0)) return null;
    return { x: (clientX - r.left - g.ox) / g.s, y: (clientY - r.top - g.oy) / g.s, cx: clientX - r.left, cy: clientY - r.top, w: cv.clientWidth, h: cv.clientHeight };
  };
  const setView = (z, fx, fy) => {
    const zz = Math.max(1, Math.min(6, z));
    viewRef.current = { z: zz, fx: zz <= 1.001 ? null : fx, fy: zz <= 1.001 ? null : fy };
    setZoom(zz);
  };
  const onDown = (ev) => {
    ev.preventDefault();
    /* setPointerCapture throws NotFoundError for pointers that are not
       active (synthetic events, some stylus drivers) — never let it abort
       the gesture. */
    try { canvasRef.current.setPointerCapture?.(ev.pointerId); } catch { /* pointer not capturable — gestures still work */ }
    ptrMapRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, swallowed: false });
    const fingers = ptrMapRef.current.size;
    const now = performance.now();
    if (fingers === 2) {
      // second finger: pinch begins (or two-finger double-tap = redo)
      ptrRef.current = null; dragRef.current = null; dragCandRef.current = null;
      const lt = lastTapRef.current;
      if (lt.fingers === 2 && now - lt.t < 350) {
        lastTapRef.current = { t: 0, x: 0, y: 0, fingers: 0 };
        for (const p of ptrMapRef.current.values()) p.swallowed = true;
        pinchRef.current = { swallowed: true };
        redo();
        return;
      }
      const [p1, p2] = [...ptrMapRef.current.values()];
      const mid = worldPtFloat((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      pinchRef.current = { d0: Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y)), z0: viewRef.current.z, wx: mid ? mid.x : 0, wy: mid ? mid.y : 0, swallowed: false, t0: now };
      return;
    }
    if (fingers > 2) return;
    // one finger: double-tap = undo (swallow this tap entirely)
    const lt = lastTapRef.current;
    if (lt.fingers === 1 && now - lt.t < 350 && Math.hypot(ev.clientX - lt.x, ev.clientY - lt.y) < 48) {
      lastTapRef.current = { t: 0, x: 0, y: 0, fingers: 0 };
      ptrMapRef.current.get(ev.pointerId).swallowed = true;
      undo();
      return;
    }
    const g = toGrid(ev); if (!g) return;
    const e = engine();
    ptrRef.current = { start: g, cur: g, last: g, t0: performance.now(), moved: false, tapObj: null, lp: null, fingers: 1 };
    if (['paint', 'spray', 'eraser', 'heat', 'cool', 'fill', 'line', 'rect', 'circle', 'clone', 'dropper', 'stir'].includes(tool)) snapshot();
    if (tool === 'paint' || tool === 'spray' || tool === 'dropper') { paintAt(g); logStep({ t: 'paint', key: selRec.key, x: g.x, y: g.y, r: brush }); }
    else if (tool === 'eraser') e.erase(g.x, g.y, brush);
    else if (tool === 'heat') { e.heatBrush(g.x, g.y, brush, 25); logStep({ t: 'heat', x: g.x, y: g.y, r: brush }); }
    else if (tool === 'cool') { e.coolBrush(g.x, g.y, brush, 25); logStep({ t: 'cool', x: g.x, y: g.y, r: brush }); }
    else if (tool === 'fill') floodFill(g);
    else if (tool === 'spark') { e.sparkAt(g.x, g.y); logStep({ t: 'spark', x: g.x, y: g.y }); }
    else if (tool === 'inspect') { const info = e.inspect(g.x, g.y); const oid = e.objectsAt(g.x, g.y); let extra = ''; if (oid) { const o = e.getObject(oid); if (o && o.kind === 'cylinder') { let c = 0; (o.interior || []).forEach((i) => { if (e.el[i]) c++; }); extra = `Cylinder contents: ${c} cells (graduations on the glass).`; } } setInspectInfo(info ? { ...info, extra } : { name: 'Empty', temp: 20, ph: null, state: 'empty', hints: [], extra }); }
    else if (tool === 'interact') {
      ptrRef.current.tapObj = e.objectsAt(g.x, g.y);
      /* W32U-5 R2: arm a drag candidate + select on pointerdown */
      const hit = ptrRef.current.tapObj;
      dragCandRef.current = null;
      if (hit != null && typeof e.getObject === 'function') {
        const o = e.getObject(hit);
        if (o && o.anchor) { dragCandRef.current = { id: hit, gx: g.x, gy: g.y, anchor: { x: o.anchor.x, y: o.anchor.y } }; refreshSel(hit); }
      }
    }
    else if (tool === 'clone' && cloneRef.current) { // stamp
      const cl = cloneRef.current;
      cl.cells.forEach(([dx, dy, id, tp]) => { const x = g.x + dx, y = g.y + dy; if (x >= 0 && y >= 0 && x < e.cols && y < e.rows && e.objMap[y * e.cols + x] === 0) { e.set(x, y, id); e.temp[y * e.cols + x] = tp; } });
    }
  };
  const onMove = (ev) => {
    const rec = ptrMapRef.current.get(ev.pointerId);
    if (rec) { rec.x = ev.clientX; rec.y = ev.clientY; hoverRef.current = worldPtFloat(ev.clientX, ev.clientY); }
    if (pinchRef.current) {
      // pinch zoom / two-finger pan: the world point grabbed at pinch start
      // stays under the moving pinch centre; distance sets the zoom.
      if (pinchRef.current.swallowed || ptrMapRef.current.size !== 2) return;
      const [p1, p2] = [...ptrMapRef.current.values()];
      const e = engine(); const cv = canvasRef.current; if (!e || !cv) return;
      const d = Math.max(10, Math.hypot(p1.x - p2.x, p1.y - p2.y));
      const z = Math.max(1, Math.min(6, pinchRef.current.z0 * d / pinchRef.current.d0));
      const baseS = Math.min(cv.clientWidth / e.cols, cv.clientHeight / e.rows);
      const s2 = baseS * z;
      const r = cv.getBoundingClientRect();
      const ccx = (p1.x + p2.x) / 2 - r.left, ccy = (p1.y + p2.y) / 2 - r.top;
      const fx = pinchRef.current.wx - (ccx - cv.clientWidth / 2) / s2;
      const fy = pinchRef.current.wy - (ccy - cv.clientHeight / 2) / s2;
      setView(z, fx, fy);
      return;
    }
    const p = ptrRef.current; if (!p) return;
    const g = toGrid(ev); if (!g) return;
    const e = engine(); const dx = g.x - p.last.x, dy = g.y - p.last.y;
    if (Math.abs(g.x - p.start.x) + Math.abs(g.y - p.start.y) > 2) p.moved = true;
    p.cur = g;
    /* UI-B swipe-ignite: with the Spark tool, a fast DOWNWARD flick (mostly
       vertical, >=5 cells within one move frame) fires a spark burst over
       the brush area — a struck match, not a tap. Cooldown 140 ms. */
    if (tool === 'spark') {
      const sf = sparkFlickRef.current; const tNow = performance.now();
      if (tNow - sf.lastMoveT <= 60 && dy >= 5 && dy > 2.2 * Math.abs(dx) && tNow - sf.lastBurst > 140) {
        sf.lastBurst = tNow;
        const rr = Math.max(2, brush);
        for (let k = 0; k < 5; k++) e.sparkAt(g.x + Math.round((Math.random() - 0.5) * rr), g.y + Math.round((Math.random() - 0.5) * rr));
        buzz(() => hapticFx.tap());
        logStep({ t: 'spark', x: g.x, y: g.y });
      }
      sf.lastMoveT = tNow;
    }
    if (tool === 'paint' || tool === 'spray' || tool === 'dropper') paintAt(g);
    else if (tool === 'eraser') e.erase(g.x, g.y, brush);
    else if (tool === 'heat') e.heatBrush(g.x, g.y, brush, 25);
    else if (tool === 'cool') e.coolBrush(g.x, g.y, brush, 25);
    else if (tool === 'wind') { e.windX = Math.max(-3, Math.min(3, dx * 0.4)); e.windY = Math.max(-3, Math.min(3, dy * 0.4)); }
    else if (tool === 'stir') { e.stir(g.x, g.y, brush); if (dx || dy) e.poke(g.x, g.y, brush, dx, dy); }
    else if (tool === 'interact' && dragCandRef.current) {
      /* W32U-5 R2: drag-move — track the cell delta as a ghost; the object
         itself only moves on pointerup (moveObjectTo). p.moved suppresses
         the tap cycle/tip on release. (Replaces the old live horizontal
         slide via e.moveObject, which the ghost+commit model supersedes.) */
      const dc = dragCandRef.current;
      const dgx = g.x - dc.gx, dgy = g.y - dc.gy;
      if (dgx !== 0 || dgy !== 0) { dragRef.current = { id: dc.id, dx: dgx, dy: dgy }; p.moved = true; }
    }
    p.last = g;
  };
  const onUp = (ev) => {
    const rec = ptrMapRef.current.get(ev.pointerId);
    ptrMapRef.current.delete(ev.pointerId);
    if (pinchRef.current) {
      // a pinch (or swallowed two-finger tap) ends when fingers lift — the
      // gesture never falls through to painting or tap behaviours.
      if (ptrMapRef.current.size === 0) {
        // only a SHORT, near-motionless two-finger touch counts as a tap
        // (a real pinch-zoom must not arm the redo double-tap)
        if (!pinchRef.current.swallowed && performance.now() - pinchRef.current.t0 < 300 && Math.abs(viewRef.current.z - pinchRef.current.z0) < 0.05) lastTapRef.current = { t: performance.now(), x: ev.clientX, y: ev.clientY, fingers: 2 };
        pinchRef.current = null;
      }
      ptrRef.current = null;
      return;
    }
    if (rec && rec.swallowed) { ptrRef.current = null; return; } // double-tap undo already fired on the way down
    const p = ptrRef.current; ptrRef.current = null; if (!p) return;
    if (!p.moved && performance.now() - p.t0 < 300) lastTapRef.current = { t: performance.now(), x: ev.clientX, y: ev.clientY, fingers: 1 };
    const g = toGrid(ev) || p.cur; const e = engine();
    /* W32U-5 R2: commit a drag-move before any tap behaviour */
    const dr = dragRef.current; dragRef.current = null; dragCandRef.current = null;
    if (dr) {
      const obj = e && typeof e.getObject === 'function' ? e.getObject(dr.id) : null;
      if (obj && obj.anchor) {
        const tx = obj.anchor.x + dr.dx, ty = obj.anchor.y + dr.dy;
        if (obj.locked) { toast('That item is locked'); shakeCanvas(); }
        else if (typeof e.moveObjectTo === 'function' && e.moveObjectTo(dr.id, tx, ty)) { refreshSel(dr.id); logStep({ t: 'move', obj: dr.id, x: tx, y: ty }); }
        else { shakeCanvas(); toast('No clear space there'); }
      }
    }
    else if ((tool === 'line' || tool === 'rect' || tool === 'circle') && p.start) { drawShape(p.start, g); logStep({ t: 'paint', key: selRec.key, x: g.x, y: g.y, r: brush }); }
    else if (tool === 'clone' && !cloneRef.current && p.start) {
      const cells = []; const x0 = Math.min(p.start.x, g.x), x1 = Math.max(p.start.x, g.x), y0 = Math.min(p.start.y, g.y), y1 = Math.max(p.start.y, g.y);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * e.cols + x; if (e.el[i]) cells.push([x - x0, y - y0, e.el[i], e.temp[i]]); }
      cloneRef.current = { cells, w: x1 - x0, h: y1 - y0 }; toast(`Clone stamp ready (${cells.length} cells) — tap to stamp, Clone again to re-pick`);
    }
    else if (tool === 'blast') { const dur = performance.now() - p.t0; const r = Math.min(60, 10 + dur / 40); e.blast(g.x, g.y, r); logStep({ t: 'blast', x: g.x, y: g.y, r }); }
    else if (tool === 'stir' && !p.moved) { e.stir(g.x, g.y, brush); logStep({ t: 'stir', x: g.x, y: g.y, r: brush }); }
    else if (tool === 'interact' && p.tapObj != null && !p.moved) {
      const now = performance.now();
      if (p.tapObj === onUp._lastObj && now - (onUp._lastT || 0) < 700) { e.tipObject(p.tapObj); logStep({ t: 'tip', obj: p.tapObj }); onUp._lastObj = null; toast('Tipped'); }
      else { const lvl = e.interactObject(p.tapObj); logStep({ t: 'interact', obj: p.tapObj }); if (lvl != null) toast(`Level ${lvl}`); onUp._lastObj = p.tapObj; onUp._lastT = now; }
      // W32U-5: select the tapped object — read AFTER the action so it mirrors the cycle
      refreshSel(p.tapObj);
    }
  };

  /* ---------------- gear / demos / scenes / recipes ---------------- */
  const placeGear = (kind) => {
    const e = engine(); if (!e) return;
    /* W32U-5 R2: centre the stamp in the world using its real dims when the
       engine exposes stampDims; fall back to the old offsets otherwise */
    const isVessel = VESSEL_KINDS.has(kind);
    /* PHASE 0: kinds whose name already carries a size (Beaker S/M/L, Lid
       S/M/L) ignore the vessel-size selector — stacking XL on Beaker L made
       one beaker fill 87% of a phone screen and the ladder made no sense. */
    const INTRINSIC_SIZE = kind.startsWith('beaker-') || kind.startsWith('lid-');
    const useSize = isVessel && !INTRINSIC_SIZE;
    const dims = typeof e.stampDims === 'function' ? (useSize ? e.stampDims(kind, { size: vesselSize }) : e.stampDims(kind)) : null;
    const x = dims ? Math.max(0, Math.min(Math.max(0, e.cols - dims.w), Math.floor((e.cols - dims.w) / 2))) : Math.floor(e.cols / 2 - 10);
    /* PHASE 0: gear lands on the floor of the world, not floating at the
       vertical centre (a placed beaker hung mid-air with nothing under it). */
    const y = dims ? Math.max(0, e.rows - dims.h) : Math.floor(e.rows / 2 - 8);
    if (e.objects && e.objects.size >= 64) { toast('Object limit reached (64) — remove an item first'); return; } // HARDEN cap
    /* PHASE 0: if the floor-centre spot is taken (e.g. a beaker already sits
       there when you add a burner), try neighbouring floor spots instead of
       failing outright. */
    let id = useSize ? e.placeObject(kind, x, y, { size: vesselSize }) : e.placeObject(kind, x, y);
    if (id == null && dims) {
      const step = Math.max(8, Math.floor(dims.w / 2));
      for (const dx of [step, -step, step * 2, -step * 2, step * 3, -step * 3, step * 4, -step * 4, step * 6, -step * 6, step * 8, -step * 8]) {
        const nx = Math.max(0, Math.min(Math.max(0, e.cols - dims.w), x + dx));
        id = useSize ? e.placeObject(kind, nx, y, { size: vesselSize }) : e.placeObject(kind, nx, y);
        if (id != null) break;
      }
    }
    if (id == null) { toast('No clear space at the centre — clear a spot first'); return; }
    if (kind === 'burner' || kind === 'cooling-coil') { if (typeof e.setObjectLevel === 'function') e.setObjectLevel(id, 2); else if (kind === 'burner') e.interactObject(id); } // default: Med (lit / cooling)
    refreshSel(id);
    if (LEVEL_GEAR.has(kind)) setSideOpen(true); // picker is closed by the tile onClick — mutual exclusion kept
    logStep({ t: 'gear', kind, x, y }); toast(`Placed ${kind}`);
  };
  /* W32U-5 gear controls (side-panel Gear section) */
  const applyObjLevel = (lvl) => {
    const e = engine(); if (!e || !selObj) return;
    if (typeof e.setObjectLevel === 'function') e.setObjectLevel(selObj.id, lvl);
    refreshSel(selObj.id);
  };
  const removeSelObj = () => {
    const e = engine(); if (!e || !selObj) return;
    const wasLocked = !!selObj.locked;
    const ok = typeof e.removeObject === 'function' ? e.removeObject(selObj.id) : undefined;
    if (ok === false) { toast(wasLocked ? 'That item is locked' : 'Could not remove that item'); refreshSel(selObj.id); return; }
    setSelObj(null);
  };
  /* W32U-5 R2: resize / lock / duplicate for the selected object */
  const applyObjScale = (v) => {
    const e = engine(); if (!e || !selObj) return;
    const sc = Math.max(0.6, Math.min(2.6, Math.round(v * 20) / 20));
    const r = typeof e.resizeObject === 'function' ? e.resizeObject(selObj.id, sc) : null;
    if (!r) toast('Cannot resize — blocked, locked, or fixed size');
    refreshSel(selObj.id);
  };
  const toggleObjLock = () => {
    const e = engine(); if (!e || !selObj) return;
    if (typeof e.setObjectLocked === 'function') e.setObjectLocked(selObj.id, !selObj.locked);
    refreshSel(selObj.id);
  };
  const duplicateSelObj = () => {
    const e = engine(); if (!e || !selObj) return;
    const nid = typeof e.duplicateObject === 'function' ? e.duplicateObject(selObj.id) : null;
    if (nid != null) { refreshSel(nid); toast('Duplicated'); } else toast('No clear space for a copy');
  };
  /* UI-B: renderer preference drives the GL gate. '2d' forces the plain
     path; 'gl' forces GL (no auto-drop); 'auto' starts on GL and lets the
     safeguard decide. Changing the pref re-arms the sampler. */
  useEffect(() => {
    autoDropRef.current = false;
    frameSampleRef.current = { t0: 0, samples: [], decided: rendererPref !== 'auto' };
    glEnabledRef.current = rendererPref !== '2d' && rendererPref !== 'simple';
    /* P0-REOPEN: 'simple' pins the plain present path; any other pref
       restores the environment default (env pre-emption latch). Runtime
       watchdog latches after this are unaffected — this runs on pref
       change only. */
    fbRef.current = rendererPref === 'simple' ? true : envFb0;
    if (rendererPref === 'simple') setRendererNote('Simple — plain drawing, set by you (compatibility mode)');
    else if (rendererPref === '2d') setRendererNote('2D — set by you');
    else if (rendererPref === 'gl') setRendererNote('GL — forced by you (auto-drop off)');
    else setRendererNote('');
  }, [rendererPref]);
  const applyRendererPref = (v) => { setRendererPref(v); Game.setRendererPref(v); };
  const applyHeatRamp = (v) => { setHeatRamp(v); Game.setHeatRamp(v); };
  const applyFontScale = (v) => { setFontScale(v); Game.setFontScale(v); };
  const applyHaptics = (b) => { setHapticsOn(b); Game.setHaptics(b); };
  /* UI-B coach marks: first lab entry only (the omni:sandlab:seen flag —
     the same flag the demo offer uses; finishing/skipping the tutorial
     sets it, per the P5 migration map it is already copied to
     matterlab:sandlab:seen). Progress is checked against REAL state:
     a pick, particles in the world, a vessel placed, a lit burner. */
  const coachAutoRef = useRef(false);
  const startCoach = () => { setSheet(''); setPicker(false); setSideOpen(false); setDataCard(null); setCoachStep(0); };
  const endCoach = () => { setCoachStep(-1); lsSet('omni:sandlab:seen', true); setDemoOffer(false); };
  useEffect(() => {
    if (!ready || coachAutoRef.current) return;
    coachAutoRef.current = true;
    if (!lsGet('omni:sandlab:seen', false)) { const t = setTimeout(() => startCoach(), 700); return () => clearTimeout(t); }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (coachStep < 0) return undefined;
    const iv = setInterval(() => {
      setCoachTick((t) => t + 1); // keep anchor rects fresh
      const e = engine(); if (!e) return;
      const stepId = COACH_STEPS[coachStep] && COACH_STEPS[coachStep].id;
      if (stepId === 'paint' && e.stats().particles > 0) setCoachStep(2);
      else if (stepId === 'beaker' && e.objects && [...e.objects.values()].some((o) => VESSEL_KINDS.has(o.kind))) setCoachStep(3);
      else if (stepId === 'burner' && e.objects && [...e.objects.values()].some((o) => o.kind === 'burner' && (o.level || 0) > 0)) endCoach();
    }, 400);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachStep]);
  /* W32U-5: mirror selObj for the render loop; if the selected object is gone
     (removed / scene cleared) drop the selection, and keep every field fresh */
  useEffect(() => {
    selObjRef.current = selObj;
    if (!selObj) return;
    const e = engine(); if (!e || typeof e.getObject !== 'function') return;
    const o = e.getObject(selObj.id);
    if (!o) setSelObj(null);
    else if (o.kind !== selObj.kind || o.level !== selObj.level || !!o.locked !== !!selObj.locked || o.scale !== selObj.scale || o.w !== selObj.w || o.h !== selObj.h) setSelObj({ id: selObj.id, kind: o.kind, level: o.level, locked: !!o.locked, scale: o.scale, w: o.w, h: o.h });
  }, [selObj, sideOpen]);
  const buildDemo = (which, viaExp = false) => {
    const e = engine(); if (!e) return;
    /* P4 unlocks: later showcase scenes open as stars are earned (the
       Sandbox itself is never locked). Experiment setups pass viaExp —
       the experiment's own star gate is the lock for its setup scene. */
    if (!viaExp && !Game.isSceneUnlocked(which)) { toast(`Locked — earn ${Game.SCENE_UNLOCK[which] || 0}★ in Experiments to open this scene`); return; }
    snapshot(); e.clear();
    buildSceneInto(e, which);
    lsSet('omni:sandlab:seen', true); setDemoOffer(false); toast(which === 'volcano' ? 'Volcano & Lake built' : which === 'electrolysis' ? 'Electrolysis Rig built' : which === 'golden' ? 'Golden Rain built \u2014 watch the layers mix' : 'The Bench built \u2014 burner lit at level 2');
  };
  const buildExperiment = (exp) => {
    if (!exp) return;
    if (!Game.isExpUnlocked(exp.id)) { toast(`Locked — earn ${Game.expUnlockNeed(exp.id)}★ total to open ${exp.name}`); return; }
    setExpActive(exp.id); expActiveRef.current = exp.id; setExpStatus(null); expStatusKeyRef.current = '';
    const e0 = engine(); expSetupTickRef.current = e0 ? e0.tick : null;
    if (exp.setup === 'chill') {
      const e = engine(); if (!e) return;
      snapshot(); e.clear(); const C = e.cols, R = e.rows;
      const P = (k, x, y, r, o) => e.paint(x, y, r, (BY_KEY.get(k) || {}).id || 0, o);
      for (let x = 8; x < C - 8; x += 3) P('stone', x, R - 14, 2);
      let BW = 26, BH = 18;
      try { const st = e._stampFor('beaker-m'); if (st) { BW = st.w; BH = st.h; } } catch { /* defaults */ }
      const bx = Math.floor(C * 0.4), by = R - 14;
      const bk = e.placeObject('beaker-m', bx, by - 6 - BH);
      if (bk != null) {
        const coil = e.placeObject('cooling-coil', bx + Math.floor(BW / 2) - 3, by - 10);
        if (coil != null && typeof e.setObjectLevel === 'function') e.setObjectLevel(coil, 3);
        P('water', bx + Math.floor(BW / 2), by - 16, Math.max(4, Math.floor(BW / 3)));
      }
      toast('Experiment set up: ' + exp.name); return;
    }
    buildDemo(exp.setup, true);
  };
  /* UI-B named SAVE SLOTS (matterlab:slots). Payloads are the existing
     serialize() output — ML1/ML0 share codes keep working unchanged.
     Legacy numeric slots were imported by Game.loadSlots() on first read. */
  const persistSlots = (next) => { setSlots(next); Game.saveSlots(next); };
  const saveSlot = () => {
    const e = engine(); if (!e) return;
    const name = slotName.trim() || `Scene ${slots.length + 1}`;
    const seen = new Set(); for (let i = 0; i < e.el.length; i++) if (e.el[i]) seen.add(e.el[i]);
    const slot = { id: 's' + Date.now().toString(36), name, at: Date.now(), data: e.serialize(), parts: e.stats().particles, subs: seen.size };
    persistSlots([...slots, slot]); setSlotName('');
    toast(`Saved “${name}”`);
  };
  const loadSlot = (slot) => { const e = engine(); if (!e || !slot) return; snapshot(); e.deserialize(slot.data); rebuildOff(e); setGridDims({ cols: e.cols, rows: e.rows }); toast(`Loaded “${slot.name}”`); };
  const renameSlot = (slot) => { const n = window.prompt('Rename save slot', slot.name); if (n == null) return; const name = n.trim(); if (!name) return; persistSlots(slots.map((s) => (s.id === slot.id ? { ...s, name } : s))); };
  const deleteSlot = (slot) => { persistSlots(slots.filter((s) => s.id !== slot.id)); toast(`Deleted “${slot.name}”`); };
  const saveRecipe = (slot) => { const r = { ...recipes, [slot]: { at: Date.now(), steps: recipeRef.current } }; setRecipes(r); lsSet(LS.recipes, r); toast(`Recipe saved in slot ${slot + 1} (${recipeRef.current.length} steps)`); };
  const replayRecipe = (slot) => {
    const e = engine(); const r = recipes[slot]; if (!e || !r) return;
    if (e.stats().particles > 0 && !window.confirm('Replay clears the current world. Continue?')) return;
    e.clear(); let i = 0; setPaused(false);
    const iv = setInterval(() => {
      if (i >= r.steps.length) { clearInterval(iv); toast('Recipe replay done'); return; }
      const s = r.steps[i++];
      try {
        if (s.t === 'paint') e.paint(s.x, s.y, s.r || 4, (BY_KEY.get(s.key) || {}).id || 0);
        else if (s.t === 'gear') e.placeObject(s.kind, s.x, s.y);
        else if (s.t === 'heat') e.heatBrush(s.x, s.y, s.r || 6, 120);
        else if (s.t === 'cool') e.coolBrush(s.x, s.y, s.r || 6, 120);
        else if (s.t === 'stir') e.stir(s.x, s.y, s.r || 6);
        else if (s.t === 'spark') e.sparkAt(s.x, s.y);
        else if (s.t === 'blast') e.blast(s.x, s.y, s.r || 14);
      } catch { /* step skipped */ }
    }, 60); // ~2x feel: dense steps, sim running
  };
  const exportJson = () => { const e = engine(); if (e) dl(new Blob([JSON.stringify(e.serialize())], { type: 'application/json' }), 'matterlab-scene.json'); };
  const validSceneShape = (data) => !!(data && typeof data.cols === 'number' && typeof data.rows === 'number' && data.cols >= 1 && data.rows >= 1 && data.cols <= 1024 && data.rows <= 1024 && data.cols * data.rows <= 200000 && (Array.isArray(data.el) || typeof data.el === 'string'));
  const copyShareCode = async () => { const e = engine(); if (!e) return; try { const code = await encodeShareCode(e.serialize()); Game.setFlag('shared'); const d = Game.awardAchievement('first-share'); if (d) announceAch(d); if (await copyText(code)) toast('Share code copied'); else toast('Copy failed — code is in the import box'); setShareInput(code); } catch { toast('Could not build a share code'); } };
  const importShareCode = async (codeStr) => { const e = engine(); if (!e) return false; try { const data = await decodeShareCode(codeStr); if (!validSceneShape(data)) { toast('That share code did not validate'); return false; } if (e.deserialize(data)) { toast('Scene imported'); return true; } toast('That share code did not validate'); return false; } catch { toast('That share code is not a Matter Lab scene'); return false; } };
  const doLookup = (aKey, bKey) => { try { const plain = decidePair(aKey, bKey, { mixed: 1, temp: 25, electrified: false, pressure: 0, ignited: false }); const hot = decidePair(aKey, bKey, { mixed: 1, temp: 300, electrified: true, pressure: 3, ignited: true }); const res = { plain, hot, aKey, bKey }; setLookupRes(res); return res; } catch (err) { toast('Lookup failed for that pair'); return null; } };
  const addCustom = () => { const name = cf.name.trim(); if (!name) { toast('Give your substance a name first'); return; } const lo = hexToInt(cf.colour); const def = { name, cls: cf.cls === 'powder' ? 'powder' : cf.cls, cat: 'special', col: [lo, lighten(cf.colour)], density: Number(cf.density), flammability: Number(cf.flammability), acidStrength: Number(cf.acidity), ph: Number(cf.ph), solubility: Number(cf.solubility), ...(cf.boil !== '' && Number.isFinite(Number(cf.boil)) ? { boilPoint: Number(cf.boil) } : {}) }; let rec = null; try { rec = registerCustomSubstance(def); } catch { rec = null; } if (!rec) { toast('That substance could not be added (name may already exist)'); return; } ensureCols(); const saved = lsGet(LS_CUSTOMS, []); lsSet(LS_CUSTOMS, [...(Array.isArray(saved) ? saved : []), def]); setCustomsVer((v) => v + 1); const full = BY_KEY.get(rec.key) || rec; if (full && full.id != null) { setSelId(full.id); pickSubstance(full); } Game.setFlag('custom'); { const d = Game.awardAchievement('first-custom'); if (d) announceAch(d); } toast(`Added ${name} — now selected`); };
  const removeCustom = (defObj) => { const saved = lsGet(LS_CUSTOMS, []); const kept = (Array.isArray(saved) ? saved : []).filter((d) => d !== defObj && JSON.stringify(d) !== JSON.stringify(defObj)); lsSet(LS_CUSTOMS, kept); setCustomsVer((v) => v + 1); toast('Removed \u2014 takes effect on next open'); };
  const importJson = (f) => { if (!f) return; if (f.size > 8 * 1024 * 1024) { toast('Scene file too large (max 8 MB)'); return; } f.text().then((t) => { try { const data = JSON.parse(t); if (!data || data.cols > 1024 || data.rows > 1024 || data.cols * data.rows > 200000) { toast('Scene too large'); return; } const e = engine(); if (e && e.deserialize(data)) toast('Scene imported'); else toast('That scene file did not validate'); } catch { toast('That file is not a Matter Lab scene'); } }); };
  const exportPng = () => { const cv = canvasRef.current; if (cv) cv.toBlob((b) => { if (b) { dl(b, 'matterlab.png'); toast('PNG downloaded'); } }, 'image/png'); };
  const clearWorld = () => { const e = engine(); if (!e) return; if (e.stats().particles > 5000 && !window.confirm(`Clear ${e.stats().particles.toLocaleString()} particles?`)) return; snapshot(); e.clear(); cloneRef.current = null; toast('World cleared'); };

  /* ---------------- fullscreen / gyro ----------------
     UI2: FULLSCREEN ON OPEN. The open tap is the user gesture — we attempt
     requestFullscreen on mount (inside the tap's transient-activation window
     for hash navigation) AND retry on the first pointerdown inside the tool.
     Denial/absence (e.g. iPhone Safari) silently engages the in-page
     full-bleed fallback (fsFb) which hides chrome identically — never an
     error banner. Exiting real fullscreen only flips layout back; the tool,
     engine and selections stay mounted and intact. */
  const fsBusyRef = useRef(false);
  const enterFs = useCallback(async () => {
    const el = rootRef.current; if (!el) return false;
    if (document.fullscreenElement) { setFsFb(false); return true; }
    if (fsBusyRef.current) return false; // pointerdown-retry + click can race — one request at a time
    if (typeof el.requestFullscreen !== 'function') { setFsFb(true); return false; }
    fsBusyRef.current = true;
    try {
      await el.requestFullscreen();
      setFsFb(false);
      try { await navigator.wakeLock?.request('screen'); } catch { /* best-effort */ }
      return true;
    } catch { setFsFb(true); return false; } // denied -> silent fallback
    finally { fsBusyRef.current = false; }
  }, []);
  const fsUserExitRef = useRef(false); // explicit exit disarms the on-open retry for good
  const toggleFs = async () => {
    if (document.fullscreenElement) { fsUserExitRef.current = true; try { await document.exitFullscreen(); } catch { /* noop */ } return; }
    if (fsFbRef.current) { fsUserExitRef.current = true; setFsFb(false); return; } // exit fallback mode
    fsUserExitRef.current = false;
    await enterFs();
  };
  /* If a retry's requestFullscreen resolves AFTER the user already exited via
     the rail (race), leave fullscreen again — an explicit exit always wins. */
  useEffect(() => {
    const h = () => { if (document.fullscreenElement && fsUserExitRef.current) { document.exitFullscreen().catch(() => {}); } };
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  useEffect(() => { // fullscreen-on-open: mount attempt + first-pointer retry (max 3 tries, never after an explicit exit)
    let tries = 0; let dead = false;
    enterFs();
    const retry = () => { if (dead || fsUserExitRef.current || document.fullscreenElement || tries >= 3) return; tries++; enterFs(); };
    const el = rootRef.current;
    if (el) el.addEventListener('pointerdown', retry);
    return () => { dead = true; if (el) el.removeEventListener('pointerdown', retry); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* P0-GEOMETRY: --ml-vh tracks the VISUAL viewport height (the area the
     user can actually see). In in-app WebViews the layout viewport behind
     100dvh / fixed inset:0 can be taller than the visible region, which
     pushed the world floor below the fold. CSS sizes the lab shell from
     this variable (fallback 100dvh where visualViewport is absent). */
  useEffect(() => {
    const setVh = () => { try { const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight; if (h > 0) document.documentElement.style.setProperty('--ml-vh', `${Math.round(h)}px`); } catch { /* noop */ } };
    setVh();
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    const vv = window.visualViewport;
    if (vv) { vv.addEventListener('resize', setVh); vv.addEventListener('scroll', setVh); }
    return () => { window.removeEventListener('resize', setVh); window.removeEventListener('orientationchange', setVh); if (vv) { vv.removeEventListener('resize', setVh); vv.removeEventListener('scroll', setVh); } };
  }, []);
  const setGyroOn = (on) => { setGyro(on); gyroOnRef.current = on; if (!on) { const e = engine(); if (e) { e.setGravityVector(0, 1, 1); gravDirRef.current = 0; setGravDir(0); } } };
  const toggleGyro = async () => {
    if (gyro) { setGyroOn(false); toast('Gyro gravity off'); return; }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { toast('Gyro permission denied — use the gravity arrows'); return; }
      } else if (typeof DeviceOrientationEvent === 'undefined') { toast('Gyro is not available on this device — use the gravity arrows'); return; }
      /* P3: shake detection rides DeviceMotion — same iOS permission gate */
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch { /* shake is optional; gyro still works */ }
      }
      setGyroOn(true); toast('Gyro gravity on — tilt the phone (shake to stir)');
    } catch { toast('Gyro unavailable — use the gravity arrows'); }
  };
  useEffect(() => {
    if (!gyro) return;
    const ALPHA = 0.18; // low-pass: at rest the vector is near-constant (no jitter)
    const h = (ev) => {
      if (ev.beta == null || ev.gamma == null) return;
      const f = filtRef.current || (filtRef.current = { beta: ev.beta, gamma: ev.gamma });
      f.beta += (ev.beta - f.beta) * ALPHA;
      f.gamma += (ev.gamma - f.gamma) * ALPHA;
      /* P3 near-flat hold: with the phone flat (beta near 0/180) pitch/roll
         are unreliable and gamma spins freely — keep the last good vector
         instead of jittering. |sin(beta)| < 0.25 ≈ within ~14.5° of flat. */
      if (Math.abs(Math.sin(f.beta * Math.PI / 180)) < 0.25) return;
      const n = neutralRef.current;
      const dB = (f.beta - n.beta) * Math.PI / 180, dG = (f.gamma - n.gamma) * Math.PI / 180;
      let vx = Math.sin(dG), vy = Math.cos(dB);
      /* P3 screen-orientation correction: rotate the device-frame vector
         into the CURRENT screen frame (screen.orientation.angle, falling
         back to legacy window.orientation), so portrait and landscape
         both map tilt -> gravity correctly. */
      let deg = 0;
      try { if (window.screen && window.screen.orientation && typeof window.screen.orientation.angle === 'number') deg = window.screen.orientation.angle; else if (typeof window.orientation === 'number') deg = window.orientation; } catch { /* keep 0 */ }
      if (deg) { const th = deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th); const rx = vx * c - vy * s, ry = vx * s + vy * c; vx = rx; vy = ry; }
      const mag = Math.min(1, Math.hypot(vx, vy));
      let angle = Math.atan2(vy, vx) * 180 / Math.PI; if (angle < 0) angle += 360;
      gyroVecRef.current = { vx, vy, mag, angle };
      /* UI-B tilt-pour: gyro ON + a vessel selected + tilt past 50° from
         straight-down, held ~0.6 s -> tip the selected vessel (the same
         engine tipObject the Interact double-tap uses). 2.5 s cooldown so
         one tilt = one pour. The stage shows a hint chip while armed. */
      const so = selObjRef.current;
      const tp = tiltPourRef.current;
      if (so && VESSEL_KINDS.has(so.kind)) {
        const tiltDeg = Math.acos(Math.max(-1, Math.min(1, vy / Math.max(0.0001, Math.hypot(vx, vy))))) * 180 / Math.PI;
        const tNow = performance.now();
        if (tiltDeg > 50) {
          if (!tp.since) tp.since = tNow;
          else if (tNow - tp.since > 600 && tNow - tp.last > 2500) {
            tp.last = tNow; tp.since = 0;
            const e2 = engine();
            if (e2 && typeof e2.tipObject === 'function') { const ok = e2.tipObject(so.id); if (ok !== false) { toast('Poured — vessel tipped'); buzz(() => hapticFx.tap()); } }
          }
        } else tp.since = 0;
      } else tp.since = 0;
    };
    /* P3 shake: DeviceMotion magnitude over a smoothed baseline,
       thresholded + debounced (900 ms) -> ONE engine stir at the world
       centre per shake. */
    const hm = (ev) => {
      const a = ev && ev.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      const sh = shakeRef.current;
      sh.mag += (m - sh.mag) * 0.12; // slow baseline (~gravity + drift)
      const now = performance.now();
      if (Math.abs(m - sh.mag) > 13 && now - sh.last > 900) {
        sh.last = now;
        const e = engine();
        if (e) { e.stir((e.cols / 2) | 0, (e.rows / 2) | 0, Math.max(18, (Math.min(e.cols, e.rows) / 6) | 0)); hapticFx.tap(); }
      }
    };
    window.addEventListener('deviceorientation', h);
    window.addEventListener('devicemotion', hm);
    return () => { window.removeEventListener('deviceorientation', h); window.removeEventListener('devicemotion', hm); };
  }, [gyro]);
  const calibrateGyro = () => {
    if (!filtRef.current) { toast('Tilt the phone once so the sensor reports, then calibrate'); return; }
    neutralRef.current = { beta: filtRef.current.beta, gamma: filtRef.current.gamma };
    lsSet('omni:sandlab:neutral', neutralRef.current);
    toast('Calibrated — this pose is now neutral (gravity straight down)');
  };
  const setGrav = (d) => { if (gyroOnRef.current) setGyroOn(false); setGravDir(d); gravDirRef.current = d; const e = engine(); if (e) { const V = [[0, 1], [0, -1], [-1, 0], [1, 0]][d & 3]; e.setGravityVector(V[0], V[1], 1); e.setGravityStrength(powerRef.current ? 4 : 1); } };

  /* ---------------- V2: launch modes (shell contract) ---------------- */
  useEffect(() => {
    if (!ready || !launch) return;
    const n = launch.nonce;
    if (n != null && processedNonceRef.current === n) return;
    processedNonceRef.current = n;
    if (launch.mode === 'gallery') { if (launch.sceneId) buildDemo(launch.sceneId); openSheet('scenes'); }
    else if (launch.mode === 'experiments') { const ex = launch.experimentId ? MATTER_EXPERIMENTS.find((x) => x.id === launch.experimentId) : null; if (ex) buildExperiment(ex); openSheet('experiments'); }
    else if (launch.mode === 'custom') { setShowCreate(true); openPanel(); }
    else if (launch.mode === 'continue') { const slots = Game.loadSlots(); if (slots.length) { const latest = slots.reduce((a, b) => ((b.at || 0) > (a.at || 0) ? b : a), slots[0]); loadSlot(latest); } }
    // 'free' (and anything unknown): normal tool, nothing to do
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, launch]);

  /* ---------------- V2: keyboard shortcuts (documented in Help) ---------------- */
  kbRef.current = { undo, redo, toggleFs };
  useEffect(() => {
    const isTyping = (t) => !!(t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
    const h = (ev) => {
      if (isTyping(ev.target)) return;
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); if (ev.shiftKey) { if (kbRef.current.redo) kbRef.current.redo(); } else if (kbRef.current.undo) kbRef.current.undo(); return; }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); if (kbRef.current.redo) kbRef.current.redo(); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === ' ') { ev.preventDefault(); setPaused((pv) => !pv); }
      else if (ev.key === '[') setBrush((b) => Math.max(1, b - 1));
      else if (ev.key === ']') setBrush((b) => Math.min(64, b + 1));
      else if (ev.key === 'f' || ev.key === 'F') { if (kbRef.current.toggleFs) kbRef.current.toggleFs(); }
      else if ((ev.key === 'h' || ev.key === 'H') && onHome) onHome();
      else if (/^[1-9]$/.test(ev.key)) { const t2 = TOOLS[Number(ev.key) - 1]; if (t2) setTool(t2[0]); }
      else if (ev.key === 'm' || ev.key === 'M') setSpeedI((s2) => (s2 + 1) % SPEEDS.length); // cycle speed
      else if (ev.key === 'p' || ev.key === 'P') setPicker((p2) => !p2); // open/close substance picker
      else if (ev.key === 'g' || ev.key === 'G') setSideOpen((s2) => !s2); // settings panel
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onHome]);

  /* ---------------- test hook ---------------- */
  useEffect(() => {
    if (!ready) return;
    const e = engine();
    window.__matterlab = {
      engine: e, SUBSTANCE_COUNT, NAMED_PAIR_COUNT, CARDS,
      gov: govRef.current, lastError: null,
      /* Matter Lab Ultra: perf surface for the low-end pipeline */
      perf: { deviceSummary: deviceSummary(), lowEnd: PERF.lowEnd, capParts: PERF.capParts, setCapParts: applyPerfCap },
      perfStats: () => { const st = e.stats(); let memMB = 0; try { if (typeof navigator !== 'undefined' && navigator.deviceMemory) memMB = navigator.deviceMemory * 1024; } catch {} return { memMB, parts: st.particles, emaMs: st.emaMs, tier: st.tier, grid: `${e.cols}x${e.rows}` }; },
      get tickRate() { return govRef.current.tickRate; }, get ladderStep() { return govRef.current.ladderStep; },
      get tierIndex() { return govRef.current.tierIndex; }, get startTierIndex() { return govRef.current.startTierIndex; },
      place: (key, x, y, r = 3) => e.paint(x, y, r, (BY_KEY.get(key) || {}).id || 0),
      placeObject: (kind, x, y, opts) => e.placeObject(kind, x, y, opts),
      /* W32U-5 R2 passthroughs (guarded; engine may not provide them yet) */
      moveObjectTo: (id, x, y) => (typeof e.moveObjectTo === 'function' ? e.moveObjectTo(id, x, y) : false),
      resizeObject: (id, sc) => (typeof e.resizeObject === 'function' ? e.resizeObject(id, sc) : null),
      duplicateObject: (id) => (typeof e.duplicateObject === 'function' ? e.duplicateObject(id) : null),
      setObjectLocked: (id, b) => (typeof e.setObjectLocked === 'function' ? e.setObjectLocked(id, b) : false),
      stampDims: (kind, opts) => (typeof e.stampDims === 'function' ? e.stampDims(kind, opts) : null),
      step: (n = 1) => { for (let i = 0; i < n; i++) e.step(); },
      countKey: (key, region) => { const id = (BY_KEY.get(key) || {}).id; if (!id) return 0; let c = 0; const x0 = region?.x0 ?? 0, y0 = region?.y0 ?? 0, x1 = region?.x1 ?? e.cols - 1, y1 = region?.y1 ?? e.rows - 1; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (e.el[y * e.cols + x] === id) c++; return c; },
      setTempAt: (x, y, t) => { for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (xx >= 0 && yy >= 0 && xx < e.cols && yy < e.rows) e.temp[yy * e.cols + xx] = t; },
      inspect: (x, y) => e.inspect(x, y),
      sound: sndRef.current,
      /* UI2 additions (existing fields above unchanged): */
      setSmoothing: (b) => { smoothRef.current = !!b; },
      /* P0 additions: watchdog state + a fault-injection lever for the gate */
      gfx: () => ({ fallback: fbRef.current, notice: gfxNoticeRef.current, envSimple: RISKY_PRESENT_UA }),
      sabotagePresent: (b) => { sabotageRef.current = !!b; return true; },
      /* P1/P2 additions: renderer state + bench/fault-injection levers */
      gl: () => ({ renderer: glRef.current && glEnabledRef.current && !fbRef.current ? 'webgl2' : '2d', glAvailable: !!glRef.current, enabled: glEnabledRef.current, texQuality: texQualityRef.current, ladderStep: govRef.current.ladderStep }),
      setGLRenderer: (b) => { glEnabledRef.current = !!b; },
      setTexQuality: (q) => { if (['auto', 'low', 'med', 'high'].includes(q)) setTexQualityQ(q); },
      sabotageGL: (b) => { if (glRef.current) { glRef.current.sabotage = !!b; return true; } return false; },
      glTimings: () => (glRef.current ? glRef.current.timings || null : null),
      zeroOffscreen: () => { if (offRef.current) { offRef.current.width = 0; offRef.current.height = 0; } return true; },
      smoothing: () => smoothRef.current,
      /* W32U-5 additions */
      setTexture: (b) => { setTextureOn(!!b); },
      texture: () => textureOnRef.current,
      gravityVec: () => { const v = gyroVecRef.current; const gv = e.getGravityVector(); return { angleDeg: Math.round(v.angle * 10) / 10, mag: Math.round(v.mag * 1000) / 1000, vx: v.vx, vy: v.vy, dir: e.gravity, gravMag: e.gravMag, engGx: gv.x, engGy: gv.y, effX: gv.effX, effY: gv.effY, windX: e.windX, windY: e.windY, gyro: gyroOnRef.current, neutral: { ...neutralRef.current } }; },
      fsState: () => ({ real: !!document.fullscreenElement, fallback: fsFbRef.current }),
      /* W32U-4 additions */
      shareCode: () => 'ML0.' + b64urlEnc(new TextEncoder().encode(JSON.stringify(e.serialize()))),
      importCode: (str) => { const doImp = (data) => { if (!validSceneShape(data)) return false; const ok = !!e.deserialize(data); if (ok) { try { rebuildOff(e); setGridDims({ cols: e.cols, rows: e.rows }); } catch { /* noop */ } } return ok; }; if (typeof str === 'string' && str.trim().startsWith('ML0.')) { try { const data = JSON.parse(new TextDecoder().decode(b64urlDec(str.trim().slice(4)))); return doImp(data); } catch { return false; } } return decodeShareCode(str).then(doImp).catch(() => false); },
      setViewMode: (m) => { if (['normal', 'heat', 'pressure', 'flow'].includes(m)) setViewMode(m); },
      viewMode: () => viewModeRef.current,
      /* P4 + UI-B additions */
      game: () => ({ stars: Game.getStars(), totalStars: Game.totalStars(), discoveries: Game.namedDiscoveries(), discoveryCount: Game.discoveryCount(), namedTotal: NAMED_REACTIVE_COUNT, achievements: Game.getAchievements(), rxTotal: Game.getRxTotal(), daily: { key: Game.dateKey(), tpl: Game.dailyFor().id, state: Game.getDailyState(), status: dailyStatus }, slots: slots.map((s) => ({ id: s.id, name: s.name, at: s.at, parts: s.parts })) }),
      deltaStats: () => ({ undoSteps: undoRef.current.length, redoSteps: redoRef.current.length, undoBytes: undoRef.current.totalBytes(), redoBytes: redoRef.current.totalBytes(), lastStepBytes: undoRef.current.lastBytes, lastFullBytes: undoRef.current.lastFullBytes }),
      undoOnce: () => undo(), redoOnce: () => redo(),
      startExperiment: (id) => { const ex = MATTER_EXPERIMENTS.find((x) => x.id === id); if (ex) { buildExperiment(ex); return true; } return false; },
      expStatusNow: () => ({ active: expActiveRef.current, status: expStatus, setupTick: expSetupTickRef.current }),
      rendererState: () => ({ pref: rendererPrefRef.current, note: rendererNote, autoDropped: autoDropRef.current, glEnabled: glEnabledRef.current, samples: window.__matterlab && window.__matterlab.autoSample || null }),
      setRendererPref: (v) => { if (['auto', 'gl', '2d', 'simple'].includes(v)) applyRendererPref(v); },
      zoomState: () => ({ ...viewRef.current }),
      setZoom: (z, fx, fy) => setView(z, fx != null ? fx : viewRef.current.fx, fy != null ? fy : viewRef.current.fy),
      geom: () => geomRef.current,
      coach: () => coachStep,
      startCoach: () => startCoach(),
      census: () => { const m = {}; for (let i = 0; i < e.el.length; i++) if (e.el[i]) m[e.el[i]] = (m[e.el[i]] || 0) + 1; return m; },
      openSheetTest: (n) => openSheet(n),
      lookup: (aKey, bKey) => { try { return decidePair(aKey, bKey, { mixed: 1, temp: 25, electrified: false, pressure: 0, ignited: false }); } catch { return null; } },
    };
  }, [ready, tierI]);

  /* ---------------- picker data ---------------- */
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase(); if (!q) return null;
    const aliasKey = ALIASES[q];
    return SUBSTANCES.slice(1).filter((s) => s.name.toLowerCase().includes(q) || (s.formula || '').toLowerCase().includes(q) || s.key.includes(q) || (aliasKey && s.key === aliasKey)).slice(0, 200);
  }, [query]);
  const catItems = (catId) => SUBSTANCES.slice(1).filter((s) => s.cat === catId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedSubs = useMemo(() => SUBSTANCES.slice(1).slice().sort((a, b) => a.name.localeCompare(b.name)), [customsVer, ready]);
  /* UI2 mutual exclusion (NO-OVERLAP LAW): the expanded side panel and the
     bottom tile panel never coexist — opening one closes the other. */
  const openPanel = () => { setSideOpen(false); setSheet(''); setPicker(true); };
  const openSheet = (name) => { setPicker(false); setSideOpen(false); setSheet(name); };
  /* PART E: the ONE Messages entry system — rail button, top chip and side
     panel all route here. Opens the reaction feed as the 'log' panel and
     clears the unread badge. */
  const openMessages = () => { setPicker(false); setSideOpen(false); setSheet('log'); setUnread(0); };
  useEffect(() => { msgsOpenRef.current = sheet === 'log'; if (sheet === 'log') setUnread(0); }, [sheet]);
  const toggleSide = () => { setSideOpen((o) => { if (!o) { setPicker(false); setSheet(''); } return !o; }); };
  const pickAndClose = (s) => { pickSubstance(s); setPicker(false); if (s && s.cls === 'liquid') setPourKey((k) => k + 1); }; // UI-A: pour micro-animation on liquid picks (visual only)
  const openDockTab = (tab) => {
    /* REDESIGN COMPLIANCE (brief pt.3): a dock tab opens a one-row chip
       strip docked above the Dock — NOT the full sheet. 'gear' has no
       substance strip (its grid + vessel sizes live in the sheet), and
       Expand/Search escalate to the sheet. Tapping the active tab again
       collapses the strip. */
    if (tab === 'gear') { setDockTab(tab); setDockExpanded(false); setSideOpen(false); setSheet(''); setPicker(true); return; }
    setSideOpen(false); setSheet('');
    setDockTab((cur) => (cur === tab && !picker ? null : tab));
  };
  const dockItems = (tab) => {
    if (tab === 'solids') return SUBSTANCES.slice(1).filter((s) => s.cls === 'solid' || s.cls === 'powder');
    if (tab === 'liquids') return SUBSTANCES.slice(1).filter((s) => s.cls === 'liquid');
    if (tab === 'gases') return SUBSTANCES.slice(1).filter((s) => s.cls === 'gas');
    if (tab === 'favs') return favs.map((id) => SUBSTANCES[id]).filter(Boolean);
    return [];
  };
  const tileGrid = (items) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))', gap: 10, marginTop: 8 }}>
      {items.map((s) => <Tile key={s.id} s={s} cols={COLS[s.id]} selected={s.id === selId} onPick={pickAndClose} onInfo={setDataCard} />)}
    </div>
  );
  const rxEntryLine = (e2) => {
    const aN = nameOfKey(e2.aKey) || e2.aKey, bN = nameOfKey(e2.bKey) || e2.bKey;
    const prods = [e2.outA, e2.outB, e2.gas].map(nameOfKey).filter(Boolean);
    const card = getCardSafe(e2.card);
    const prodTxt = prods.length ? [...new Set(prods)].join(' + ') : (card && card.eq ? card.eq : 'no visible product \u2014 see note');
    const cond = NEEDS_LABEL[e2.needs] || 'on contact';
    // TEMPLATE FIX: EVERY card field (name, line, eq) goes through {a}/{b}
    // substitution with the entry's real substance names — raw templates never render.
    const subst = (t) => (t == null ? '' : String(t).replace(/\{a\}/g, aN).replace(/\{b\}/g, bN));
    const cardTxt = card ? subst(card.name || card.line || '') : '';
    const lineTxt = card ? subst(card.line || '') : '';
    const eqTxt = card ? subst(card.eq || '') : '';
    return { aN, bN, prodTxt, cond, cardTxt, lineTxt, eqTxt, card };
  };
  const renderRxEntry = (e2, depth) => {
    const info = rxEntryLine(e2);
    const kids = rxLog.filter((c) => c.parentId === e2.id);
    const collapsed = collapsedRx.has(e2.id);
    return (
      <div key={e2.id} style={{ marginLeft: Math.min(depth, 6) * 14, marginTop: 8 }}>
        <p className="sm" style={{ margin: 0 }}>
          {rxMode === 'chains' && kids.length > 0 && (<button className="btn ghost sm" style={{ padding: '0 5px', marginRight: 4 }} onClick={() => setCollapsedRx((prev) => { const n = new Set(prev); if (n.has(e2.id)) n.delete(e2.id); else n.add(e2.id); return n; })}>{collapsed ? '\u25b8' : '\u25be'}</button>)}
          <span>{info.aN} + {info.bN} {'\u2192'} {info.prodTxt}</span>
        </p>
        <p className="dim sm" style={{ margin: '2px 0 0' }}>{info.cond}{e2.fam ? ` \u00b7 ${e2.fam}` : ''} \u00b7 tier {e2.tier} \u00b7 {new Date(e2.at).toLocaleTimeString()}{info.cardTxt ? ` \u2014 ${info.cardTxt}` : ''}{info.lineTxt && info.lineTxt !== info.cardTxt ? ` \u2014 ${info.lineTxt}` : ''}{info.eqTxt ? ` \u00b7 ${info.eqTxt}` : ''}</p>
        {/* UI-B per-reaction RESULT CARD: expandable, built ONLY from the
            reaction's own card data (name / equation / line / watch) plus
            the products the engine actually produced — no invented text. */}
        {info.card && (
          <button className="btn ghost sm" style={{ padding: '0 5px', marginTop: 2 }} aria-expanded={expandedRx.has(e2.id)} onClick={() => setExpandedRx((prev) => { const n = new Set(prev); if (n.has(e2.id)) n.delete(e2.id); else n.add(e2.id); return n; })}>{expandedRx.has(e2.id) ? '▾ Result card' : '▸ Result card'}</button>
        )}
        {info.card && expandedRx.has(e2.id) && (
          <div className="glass" data-rxcard="1" style={{ padding: 9, borderRadius: 10, marginTop: 5 }}>
            <b className="sm">{info.cardTxt || `${info.aN} + ${info.bN}`}</b>
            {info.eqTxt && <p className="sm" style={{ margin: '4px 0 0' }}>{info.eqTxt}</p>}
            <p className="sm" style={{ margin: '4px 0 0' }}><span className="dim">What happened:</span> {info.aN} + {info.bN} {'\u2192'} {info.prodTxt} ({info.cond}).</p>
            {info.lineTxt && <p className="sm" style={{ margin: '4px 0 0' }}><span className="dim">Why:</span> {info.lineTxt}</p>}
            {info.card.watch && <p className="dim sm" style={{ margin: '4px 0 0' }}>{String(info.card.watch).replace(/\{a\}/g, info.aN).replace(/\{b\}/g, info.bN)}</p>}
            {discoveries[e2.card || e2.fam] && <p className="dim sm" style={{ margin: '4px 0 0' }}>✓ In your Discovery log</p>}
          </div>
        )}
        {rxMode === 'chains' && !collapsed && kids.map((k) => renderRxEntry(k, depth + 1))}
      </div>
    );
  };

  if (constructErr) {
    // HARDEN A1: engine construction failure — Empty state with retry, never a crash.
    return (
      <Card>
        <Empty t="The simulation engine could not start" icon="flask" />
        <p className="dim sm" style={{ margin: '8px 0 0' }}>{constructErr}</p>
        <button className="btn sm" style={{ marginTop: 10 }} onClick={() => { setConstructErr(null); setAttempt((a) => a + 1); }}>Retry</button>
      </Card>
    );
  }

  return (
    <div ref={rootRef} data-mlroot="1" data-fs={fontScale} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: fsMode ? 'var(--bg)' : undefined, height: fsMode ? '100%' : undefined, ...(fsFb ? { position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--ml-vh, 100dvh)', zIndex: 200, padding: 8, overflowY: 'auto' } : null) }}>
      {/* UI-A top bar — Home, Undo/Redo, Pause, Speed, Menu. REDESIGN
          COMPLIANCE (brief pt.3): the top bar + dock are THE main-screen
          chrome in every mode, fullscreen included — the old side rail is
          retired; its actions live in the Menu sheet / this bar.
          Scenes/Experiments/Recipes/Messages/PNG/Help live in the Menu sheet
          (same handlers, one behaviour) so the bar fits one row at 360px. */}
      {!sheet && !picker && !dataCard && (
        <TopBar
          onHome={onHome}
          onUndo={undo}
          onRedo={redo}
          paused={paused}
          onTogglePause={() => setPaused(!paused)}
          speedLabel={`${(powerOn ? 10 : 1) * SPEEDS[speedI]}×`}
          onCycleSpeed={() => setSpeedI((speedI + 1) % SPEEDS.length)}
          onMenu={() => openSheet('menu')}
          menuBadge={unread}
          stats={`${SUBSTANCE_COUNT} substances · ${parts.toLocaleString()} particles · ${fps} FPS · Tier ${tierI + 1} ${gridDims.cols}×${gridDims.rows}`}
        />
      )}
      {tierNote && !fsMode && <p className="dim sm" style={{ margin: 0 }}>{tierNote}</p>}
      {simError && (
        <div className="glass" role="alert" style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', border: '1px solid var(--amber, #e8a13a)' }}>
          <span className="sm" style={{ flex: 1, minWidth: 180 }}>Simulation paused — something glitched. Your scene is safe.</span>
          <button className="btn sm" onClick={resumeSim}>Resume</button>
          {errStreakRef.current >= 3 && <button className="btn ghost sm" onClick={resetEngine}>Reset engine</button>}
        </div>
      )}
      {gfxFb && (
        <div className="glass" role="alert" data-gfxnotice={gfxFb} style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', border: '1px solid var(--amber, #e8a13a)' }}>
          <span className="sm" style={{ flex: 1, minWidth: 180 }}>
            {gfxFb === 'failed'
              ? 'Rendering failed — the simulation is running, but this device could not draw the picture, even in fallback mode.'
              : 'Graphics fallback on — simpler drawing is in use so the world stays visible on this device.'}
            {gfxDetail && <span style={{ display: 'block', marginTop: 4 }}>Details: on this device/browser the full graphics path (GPU shading, smoothed upscale, blur glow) could not be shown reliably — some in-app browsers present such a canvas as a black screen — so Matter Lab switched to simple drawing: plain 2D, no filter, no glow pass, direct drawing. The simulation itself is unaffected. You can pin a renderer any time under Tools &amp; controls → View → Renderer (Simple = this safe path).</span>}
          </span>
          <button className="btn ghost sm" onClick={() => setGfxDetail((d) => !d)}>{gfxDetail ? 'Hide details' : 'Tap for details'}</button>
          <button className="btn sm" onClick={() => { wdRef.current.dismissed = true; setGfx(null); }}>Dismiss</button>
        </div>
      )}
      {demoOffer && parts === 0 && !fsMode && (
        <div className="glass" style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="sm" style={{ flex: 1, minWidth: 140 }}>Start with a demo scene?</span>
          <button className="btn sm" onClick={() => buildDemo('volcano')}>Volcano &amp; Lake</button>
          <button className="btn sm" onClick={() => buildDemo('bench')}>The Bench</button>
          <button className="btn ghost sm" onClick={() => { lsSet('omni:sandlab:seen', true); setDemoOffer(false); }}>Skip</button>
        </div>
      )}

      {/* canvas stage — full-bleed; side rail + expanded panel float over it */}
      <div ref={boxRef} className="ml-stage" style={{ position: 'relative', flex: fsMode ? 1 : undefined }}>
        <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { ptrRef.current = null; dragRef.current = null; dragCandRef.current = null; ptrMapRef.current.clear(); pinchRef.current = null; }}
          onWheel={(ev) => {
            // Wheel zoom (all devices) — pinch-zoom on mobile, wheel on
            // desktop (ctrl/meta keeps it explicit); setView stays the single
            // zoom path so pointer mapping and geometry math are shared.
            if (ev.ctrlKey || ev.metaKey || ev.deltaY !== 0) {
              const pt = worldPtFloat(ev.clientX, ev.clientY);
              const z = viewRef.current.z * (ev.deltaY < 0 ? 1.15 : 1 / 1.15);
              if (pt) { ev.preventDefault(); setView(z, pt.x, pt.y); }
            }
          }}
          style={{ width: '100%', minHeight: 0, aspectRatio: fsMode ? undefined : `${gridDims.cols} / ${gridDims.rows}`, height: fsMode ? '100%' : undefined, display: 'block', borderRadius: 12, border: '1px solid var(--line)', touchAction: 'none', background: '#0a0c12' }} />
        {/* REDESIGN COMPLIANCE: the floating side rail was retired — its
            actions (Tools & controls, Messages, Clear, Fullscreen) live in
            the TopBar's Menu sheet; Home/Pause are on the TopBar itself;
            Substances is the bottom Dock. Nothing became unreachable. */}
        {/* UI-A: floating tool wheel — current tool always visible */}
        {!sheet && !picker && !dataCard && <ToolWheel tools={TOOLS} tool={tool} onSelect={setTool} />}
        {/* UI-A: pour micro-animation overlay (visual only, reduced-motion safe) */}
        {pourKey > 0 && <div key={pourKey} className="ml-pour" aria-hidden="true" />}
        {/* UI-A (g): empty-state hint — disappears after the first paint */}
        {parts === 0 && !sheet && !picker && !dataCard && (
          <div className="ml-empty-hint" data-emptyhint="1">Pick a substance below and paint — or place a beaker from Lab Gear</div>
        )}
        {/* UI-B: achievement unlock — brief toast at the TOP of the stage */}
        {achToast && (
          <div className="glass" data-achtoast="1" role="status" style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 150, padding: '7px 14px', borderRadius: 99, border: '1px solid var(--amber, #e8a13a)', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 16px)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span className="sm">★ Achievement — <b>{achToast.name}</b></span>
          </div>
        )}
        {/* UI-B: tilt-pour hint while a vessel is selected and gyro is on */}
        {gyro && selObj && VESSEL_KINDS.has(selObj.kind) && (
          <div className="glass" data-tiltpour="1" style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 6, padding: '5px 9px', borderRadius: 99 }}>
            <span className="sm">Tilt past 50° to pour the selected vessel</span>
          </div>
        )}
        {/* UI-B: zoom chip (tap = reset) */}
        {zoom > 1.001 && !sheet && !picker && (
          <button type="button" className="glass" data-zoomchip="1" aria-label={`Zoom ${Math.round(zoom * 100)} percent — tap to reset zoom`} onClick={() => setView(1, null, null)}
            style={{ position: 'absolute', right: 8, top: 8, zIndex: 140, padding: '5px 10px', borderRadius: 99, cursor: 'pointer', color: 'var(--fg)' }}>
            <span className="sm">{Math.round(zoom * 100)}% — reset</span>
          </button>
        )}
        {/* gravity direction indicator (gyro on) */}
        {gyro && (
          <div ref={gravIndRef} className="glass" style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', borderRadius: 99 }}>
            <span ref={gravArrowRef} style={{ display: 'inline-block', transition: 'transform .12s linear' }}>➤</span>
            <span ref={gravPctRef} className="sm">100%</span>
          </div>
        )}
        {/* expanded side panel: ALL tools + sim controls (never overlaps the bottom panel — mutual exclusion) */}
        <SettingsPanel open={sideOpen} onClose={() => setSideOpen(false)} tools={TOOLS} speeds={SPEEDS} tool={tool} setTool={setTool} cloneRef={cloneRef} brush={brush} setBrush={setBrush} shape={shape} setShape={setShape} paused={paused} setPaused={setPaused} engine={engine} handleSimError={handleSimError} undo={undo} clearWorld={clearWorld} speedI={speedI} setSpeedI={setSpeedI} viewMode={viewMode} setViewMode={setViewMode} textureOn={textureOn} setTextureOn={setTextureOn} texQuality={texQuality} setTexQualityQ={setTexQualityQ} rendererPref={rendererPref} applyRendererPref={applyRendererPref} rendererNote={rendererNote} heatRamp={heatRamp} applyHeatRamp={applyHeatRamp} zoom={zoom} setView={setView} viewRef={viewRef} fontScale={fontScale} applyFontScale={applyFontScale} hapticsOn={hapticsOn} applyHaptics={applyHaptics} openMessages={openMessages} unread={unread} openSheet={openSheet} recipeLen={recipeLen} selObj={selObj} applyObjLevel={applyObjLevel} vesselKinds={VESSEL_KINDS} fixedSizeKinds={FIXED_SIZE_KINDS} refreshSel={refreshSel} removeSelObj={removeSelObj} applyObjScale={applyObjScale} toggleObjLock={toggleObjLock} duplicateSelObj={duplicateSelObj} gyro={gyro} gravDir={gravDir} setGrav={setGrav} toggleGyro={toggleGyro} calibrateGyro={calibrateGyro} muted={muted} setMuted={setMuted} perf={{ device: deviceSummary(), lowEnd: PERF.lowEnd, capParts: PERF.capParts, applyCap: applyPerfCap }} power={powerOn} setPower={applyPower} />
      </div>

      {/* selected-substance bar (opens the bottom tile panel) — shown in
          every mode now that the top bar/dock are the unified chrome */}
      {(
        <button className="btn" onClick={openPanel} style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}>
          <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 5, background: `linear-gradient(135deg, rgb(${COLS[selId][0].join(',')}), rgb(${COLS[selId][1].join(',')}))` }} />
          <span style={{ flex: 1, textAlign: 'left' }}>{selRec.name}</span>
          <span className="dim sm">tap to change · {tool}</span>
        </button>
      )}

      {/* REDESIGN COMPLIANCE (brief pt.3): dock tab → one-row chip strip
          docked directly above the Dock (Recents first, colour swatch +
          name per chip, long-press = info card). Expand escalates to the
          full grid sheet; Search opens the full picker sheet. */}
      {!sheet && !picker && !dataCard && !sideOpen && dockTab && dockTab !== 'gear' && (
        <div className="ml-stripdock glass">
          <PickerStrip
            title={dockTab === 'favs' ? '★ Favourites' : dockTab[0].toUpperCase() + dockTab.slice(1)}
            recents={recent.map((id) => SUBSTANCES[id]).filter(Boolean)}
            items={dockItems(dockTab)}
            colsOf={(id) => COLS[id]}
            selId={selId}
            onPick={(s) => { pickAndClose(s); setDockTab(null); }}
            onInfo={setDataCard}
            expanded={false}
            onToggleExpand={() => { setDockExpanded(true); setPicker(true); }}
          />
        </div>
      )}

      {/* UI-A bottom dock — 5 category tabs + Search. THE main-screen
          chrome in every mode (fullscreen included). Hidden while any
          sheet/picker/card/side-panel is open so sticky chrome never
          draws over an overlay (defect found in UI-A self-test round 1). */}
      {!sheet && !picker && !dataCard && !sideOpen && (
        <Dock active={dockTab} onTab={openDockTab} onSearch={() => { setDockTab(null); openPanel(); }} />
      )}

      {inspectInfo && (
        <Card>
          <div className="seclabel">Inspect</div>
          <p className="sm" style={{ margin: '6px 0 0' }}>
            <b>{inspectInfo.name}</b> · {inspectInfo.temp}°C · State: {inspectInfo.state}
            {inspectInfo.ph != null ? ` · pH ${inspectInfo.ph}` : ''}
          </p>
          {(inspectInfo.hints || []).map((h, i) => <p key={i} className="dim sm" style={{ margin: '4px 0 0' }}>{h}</p>)}
          {inspectInfo.extra && <p className="dim sm" style={{ margin: '4px 0 0' }}>{inspectInfo.extra}</p>}
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setInspectInfo(null)}>Close</button>
        </Card>
      )}

      {/* bottom tile panel (UI2) — SUBSTANCES + LAB GEAR ONLY (no tools here;
          tools live in the side rail). FIX for the menu bug: .sheet is nested
          INSIDE .sheet-bg (the fixed flex container) — as a sibling it was
          position:static and rendered below the fold. */}
      <Picker open={picker} onClose={() => setPicker(false)} dockTab={dockTab} setDockTab={setDockTab} searchHits={searchHits} query={query} setQuery={setQuery} showCreate={showCreate} setShowCreate={setShowCreate} cf={cf} setCf={setCf} addCustom={addCustom} customs={CUSTOM_SUBSTANCES} lsGet={lsGet} customsKey={LS_CUSTOMS} removeCustom={removeCustom} tileGrid={tileGrid} gearVis={GEAR_VIS} placeGear={placeGear} vesselSize={vesselSize} setVesselSize={setVesselSize} recent={recent} cols={COLS} selId={selId} pickAndClose={pickAndClose} onInfo={setDataCard} dockItems={dockItems} dockExpanded={dockExpanded} setDockExpanded={setDockExpanded} favs={favs} openCat={openCat} setOpenCat={setOpenCat} catItems={catItems} ensureCols={ensureCols} />

      {/* data card — UI-A: InfoCard component (same data + handlers) */}
      {dataCard && (
        <InfoCard
          rec={dataCard}
          rgb={COLS[dataCard.id][1]}
          isFav={favs.includes(dataCard.id)}
          onToggleFav={() => toggleFav(dataCard.id)}
          onClose={() => setDataCard(null)}
          onUse={() => { pickSubstance(dataCard); setDataCard(null); setPicker(false); }}
        >
          {(() => { try { const p = PROFILES && typeof PROFILES.get === 'function' ? PROFILES.get(dataCard.id) : null; if (!Array.isArray(p) || !p.length) return null; return <div style={{ marginTop: 8 }}><div className="seclabel">Reacts with…</div>{p.slice(0, 8).map((e2, i) => <p key={i} className="dim sm" style={{ margin: '3px 0 0' }}>{e2.withKey || e2.withFam}{e2.note ? ` — ${e2.note}` : ''}</p>)}</div>; } catch { return null; } })()}
        </InfoCard>
      )}

      {/* generic sheets */}
      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet('')}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto', width: '100%' }}>
            {sheet === 'help' && (<>
              <b>How to play</b>
              <p className="sm" style={{ lineHeight: 1.6 }}>Paint any of the {SUBSTANCE_COUNT} substances, place Lab Gear (beakers, burners, batteries, thermometers) into the world, heat, stir, tip vessels over and watch real-style reactions. Interact taps cycle a burner or battery level; a second quick tap on a vessel tips it. Gyro tilts gravity for the whole world — vessels stay, contents pour honestly.</p>
              <p className="dim sm" style={{ lineHeight: 1.6 }}>A fun simulator inspired by real chemistry — not a safety guide. Real labs need goggles, gloves and a teacher.</p>
              <p className="dim sm" style={{ lineHeight: 1.7 }}><b>Keyboard shortcuts</b> (not while typing): Space = play/pause · [ / ] = brush size down/up · 1–9 = quick tools · F = fullscreen · Ctrl/Cmd+Z = undo · Ctrl/Cmd+Shift+Z or the Redo button = redo · H = home (when a home action is available).</p>
              <p className="dim sm" style={{ lineHeight: 1.7 }}><b>Touch gestures</b> — one finger always paints with the current tool, exactly as before. <b>Pinch</b> with two fingers to zoom (up to 6×); drag with two fingers to pan; the % chip at the top-right resets. <b>Double-tap</b> (one finger, quick, without moving) = Undo; <b>double-tap with two fingers</b> = Redo — a pinch that actually zooms never triggers redo. With the <b>Spark</b> tool, a fast <b>downward flick</b> strikes a spark burst, like a match. With <b>Gyro</b> on and a vessel selected, <b>tilt the phone past 50°</b> and hold briefly to pour (tip) that vessel. Zoom, renderer (Auto/GL/2D), colour-blind-safe Heat colours, text size and the haptics toggle live in the side panel under View.</p>
              <p className="dim sm" style={{ lineHeight: 1.7 }}><b>Progress</b> — Experiments award 1–3★ and unlock later experiments and scenes (the Sandbox is never locked). Every named reaction you trigger is recorded in the Discovery log. A new challenge arrives every day. Undo/redo keep the last 30 actions.</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => buildDemo('volcano')}>Demo: Volcano &amp; Lake</button>
                <button className="btn sm" onClick={() => buildDemo('bench')}>Demo: The Bench</button>
                <button className="btn ghost sm" onClick={() => { setSheet(''); startCoach(); }}>Replay the tutorial</button>
              </div>
            </>)}
            {sheet === 'menu' && (<>
              <b>Tool menu</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                <button className="btn ghost sm" onClick={() => openSheet('scenes')}>Scenes, save slots &amp; share codes</button>
                <button className="btn ghost sm" onClick={() => openSheet('experiments')}>Experiments</button>
                <button className="btn ghost sm" onClick={() => openSheet('discoveries')}>Discovery log ({Game.discoveryCount()} / {NAMED_REACTIVE_COUNT.toLocaleString('en-IN')})</button>
                <button className="btn ghost sm" onClick={() => openSheet('achievements')}>Achievements</button>
                <button className="btn ghost sm" onClick={() => openSheet('recipes')}>Recipes ({recipeLen})</button>
                <button className="btn ghost sm" onClick={openMessages}>Messages{unread > 0 ? ` (${unread} new)` : ''}</button>
                <button className="btn ghost sm" onClick={() => { setSheet(''); setSideOpen(true); }}>Tools &amp; controls panel</button>
                <button className="btn ghost sm" onClick={() => { setSheet(''); toggleFs(); }}>{fsMode ? 'Exit fullscreen' : 'Fullscreen'}</button>
                <button className="btn ghost sm" onClick={() => { setSheet(''); clearWorld(); }}>Clear world</button>
                <button className="btn ghost sm" onClick={() => openSheet('help')}>Help — how to play</button>
                <button className="btn ghost sm" onClick={() => { setSheet(''); startCoach(); }}>Replay the tutorial</button>
                <button className="btn ghost sm" onClick={exportJson}>Export scene JSON</button>
                <label className="btn ghost sm" style={{ textAlign: 'center', cursor: 'pointer' }}>Import scene JSON<input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => importJson(e.target.files?.[0])} /></label>
                <button className="btn ghost sm" onClick={exportPng}>Export PNG snapshot</button>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} className="sm"><input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Mute reaction cards</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} className="sm"><input type="checkbox" checked={sfxEnabled()} onChange={(e) => { setSfxEnabled(e.target.checked); if (sndRef.current) sndRef.current.setEnabled(e.target.checked); }} /> Simulation &amp; app sounds (global)</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }} className="sm"><input type="checkbox" checked={hapticsOn} onChange={(e) => applyHaptics(e.target.checked)} /> Haptics (vibration — also needs sounds on)</label>
              </div>
            </>)}
            {sheet === 'discoveries' && (
              <DiscoveryPanel discoveries={discoveries} total={NAMED_REACTIVE_COUNT} cardOf={getCardSafe} nameOfKey={nameOfKey} />
            )}
            {sheet === 'achievements' && (
              <AchievementsPanel earned={achMap} />
            )}
            {sheet === 'scenes' && (<>
              <b>Save slots (this device)</b>
              <p className="dim sm" style={{ margin: '4px 0 0' }}>Named saves of the whole world. Payloads use the same format as share codes, so codes keep working. Older numbered slots were imported automatically.</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <input value={slotName} onChange={(e) => setSlotName(e.target.value)} placeholder="Name this save (optional)" aria-label="Save slot name" style={{ flex: 1, minWidth: 0, padding: '8px 9px', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }} />
                <button className="btn sm" onClick={saveSlot}>Save current world</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {slots.length === 0 && <p className="dim sm" style={{ margin: 0 }}>No saves yet.</p>}
                {slots.map((s) => (
                  <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="sm" style={{ flex: 1, minWidth: 140 }}>{s.name}<span className="dim"> · {new Date(s.at).toLocaleString()}{s.parts != null ? ` · ${Number(s.parts).toLocaleString()} particles` : ''}{s.subs != null ? ` · ${s.subs} substances` : ''}</span></span>
                    <button className="btn ghost sm" onClick={() => loadSlot(s)}>Load</button>
                    <button className="btn ghost sm" onClick={() => renameSlot(s)}>Rename</button>
                    <button className="btn ghost sm" onClick={() => deleteSlot(s)}>Delete</button>
                  </div>
                ))}
              </div>
            </>)}
            {sheet === 'scenes' && (<>
              <b style={{ display: 'block', marginTop: 16 }}>Share code</b>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <button className="btn ghost sm" onClick={copyShareCode}>Copy share code</button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={shareInput} onChange={(e) => setShareInput(e.target.value)} placeholder="Paste a share code (ML1.… or ML0.…)" style={{ flex: 1, padding: '8px 9px', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }} />
                  <button className="btn ghost sm" onClick={() => importShareCode(shareInput)}>Import share code</button>
                </div>
              </div>
              <b style={{ display: 'block', marginTop: 16 }}>Built-in showcase</b>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {MATTER_SCENES.map((sc) => { const locked = !Game.isSceneUnlocked(sc.id, Game.totalStars()); return (
                  <span key={sc.id} style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, maxWidth: 220 }}>
                    <button className="btn ghost sm" disabled={locked} onClick={() => buildDemo(sc.id)}>{locked ? `🔒 ${sc.name}` : sc.name}</button>
                    <span className="dim sm">{locked ? `Locked — earn ${Game.SCENE_UNLOCK[sc.id] || 0}★ in Experiments to open.` : sc.description}</span>
                  </span>
                ); })}
              </div>
            </>)}
            {sheet === 'recipes' && (<>
              <b>Recipes — your recorded actions ({recipeLen} steps)</b>
              <p className="dim sm">Actions like placing gear, painting, heating, stirring, tipping and interacting are logged. Save up to 8 and replay at speed onto a cleared world.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((s) => (
                  <div key={s} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="sm" style={{ flex: 1 }}>Recipe {s + 1}{recipes[s] ? ` · ${recipes[s].steps.length} steps` : ' · empty'}</span>
                    <button className="btn ghost sm" onClick={() => saveRecipe(s)}>Save current</button>
                    <button className="btn ghost sm" disabled={!recipes[s]} onClick={() => replayRecipe(s)}>Replay 2×</button>
                  </div>
                ))}
                <button className="btn ghost sm" onClick={() => { recipeRef.current = []; setRecipeLen(0); }}>Clear current recording</button>
              </div>
            </>)}
            {sheet === 'log' && (<>
              <b>Messages — reaction feed</b>
              <div className="seclabel" style={{ marginTop: 12 }}>Check a reaction</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <select value={lookupA} onChange={(e) => setLookupA(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '8px', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }}>{sortedSubs.map((o) => <option key={o.id} value={o.key}>{o.name}</option>)}</select>
                <select value={lookupB} onChange={(e) => setLookupB(e.target.value)} style={{ flex: 1, minWidth: 120, padding: '8px', borderRadius: 9, background: 'var(--s2)', border: '1px solid var(--line)', color: 'var(--fg)' }}>{sortedSubs.map((o) => <option key={o.id} value={o.key}>{o.name}</option>)}</select>
                <button className="btn sm" onClick={() => doLookup(lookupA, lookupB)}>Check reaction</button>
              </div>
              {lookupRes && (() => { const v = lookupRes.plain, h = lookupRes.hot; const differs = JSON.stringify(v) !== JSON.stringify(h); return (
                <div className="glass" style={{ padding: 10, borderRadius: 12, marginTop: 10 }}>
                  <b className="sm">{nameOfKey(lookupRes.aKey)} + {nameOfKey(lookupRes.bKey)} — Tier {v.tier} · {mechLabel(v.mechanism)}</b>
                  {outcomeSummary(v) ? <p className="sm" style={{ margin: '6px 0 0' }}>{outcomeSummary(v)}</p> : null}
                  {(v.reasons || []).map((r, i) => <p key={i} className="dim sm" style={{ margin: '3px 0 0' }}>{r}</p>)}
                  {differs && <p className="sm" style={{ margin: '8px 0 0' }}>With heat / current / pressure: Tier {h.tier} · {mechLabel(h.mechanism)}{outcomeSummary(h) ? ` — ${outcomeSummary(h)}` : ''}</p>}
                </div> ); })()}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 14 }}>
                <b style={{ flex: 1 }}>Live feed</b>
                {[['feed', 'Feed'], ['chains', 'Chains']].map(([m2, l2]) => <button key={m2} className={`btn sm ${rxMode === m2 ? '' : 'ghost'}`} onClick={() => setRxMode(m2)}>{l2}</button>)}
              </div>
              {rxLog.length === 0 ? <Empty t="No reactions yet — mix something!" icon="flask" /> : (rxMode === 'feed' ? rxLog.map((e2) => renderRxEntry(e2, 0)) : rxLog.filter((e2) => !e2.parentId || !rxLog.some((x) => x.id === e2.parentId)).map((e2) => renderRxEntry(e2, 0)))}
            </>)}
            {sheet === 'experiments' && (<>
              <b>Experiments — guided, with real checks</b>
              <p className="dim sm">Set up builds the scene for you. Objectives are scanned against the live world on the stats cadence — no fake ticks; a step only completes when the world really does it.</p>
              <p className="sm" style={{ margin: '8px 0 0' }}>Progress: <b>★ {Game.totalStars()} / {MATTER_EXPERIMENTS.length * 3}</b> · Discoveries <b>{Game.discoveryCount()} / {NAMED_REACTIVE_COUNT.toLocaleString('en-IN')}</b>
                <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={() => openSheet('discoveries')}>Discovery log</button>
                <button className="btn ghost sm" onClick={() => openSheet('achievements')}>Achievements</button>
              </p>
              {dailyStatus && (
                <div className="glass" data-daily="1" style={{ padding: 10, borderRadius: 12, marginTop: 10 }}>
                  <b className="sm">Daily challenge — {dailyStatus.tpl.name}</b>
                  <p className="sm" style={{ margin: '4px 0 0' }}>{dailyStatus.tpl.text}</p>
                  <p className="dim sm" style={{ margin: '4px 0 0' }}>{dailyStatus.done ? `✓ Done today · live now: ${dailyStatus.detail}` : `Not yet · ${dailyStatus.detail}`}</p>
                </div>
              )}
              {MATTER_EXPERIMENTS.map((ex) => { const locked = !Game.isExpUnlocked(ex.id, Game.totalStars()); const st = starsMap[ex.id] | 0; return (
                <div key={ex.id} className="glass" style={{ padding: 10, borderRadius: 12, marginTop: 10, opacity: locked ? 0.65 : 1 }}>
                  <b className="sm">{ex.name}</b>
                  <span className="sm" aria-label={`${st} of 3 stars`} style={{ float: 'right', color: 'var(--amber, #e8a13a)' }}>{'★'.repeat(st)}{'☆'.repeat(3 - st)}</span>
                  <p className="sm" style={{ margin: '4px 0 0' }}>{ex.goal}</p>
                  {locked
                    ? <p className="dim sm" style={{ margin: '4px 0 0' }}>🔒 Locked — earn {Game.expUnlockNeed(ex.id)}★ total across experiments to open this one.</p>
                    : ex.steps.map((st2, i) => <p key={i} className="dim sm" style={{ margin: '3px 0 0' }}>{i + 1}. {st2}</p>)}
                  {expActive === ex.id && (expStatus
                    ? <p className="sm" style={{ margin: '6px 0 0' }}>{expStatus.done ? '\u2713 Objective complete — ' : '\u2026 Waiting — '}{expStatus.detail}</p>
                    : <p className="dim sm" style={{ margin: '6px 0 0' }}>\u2026 Waiting — checking the world\u2026</p>)}
                  <button className="btn sm" style={{ marginTop: 8 }} disabled={locked} onClick={() => buildExperiment(ex)}>Set up</button>
                </div>
              ); })}
            </>)}
            <button className="btn sm" style={{ marginTop: 14 }} onClick={() => setSheet('')}>Close</button>
          </div>
        </div>
      )}

      {/* UI-B coach marks — anchored to the REAL current chrome (dock /
          canvas), recomputed each render while active */}
      {coachStep >= 0 && (() => {
        const stepDef = COACH_STEPS[coachStep];
        let rect = null;
        try {
          // the Dock is always present in the unified chrome (fullscreen
          // included) — it is the coach anchor for the picker steps
          const el = stepDef && stepDef.anchor === 'dock' ? document.querySelector('[data-dock="1"]') : canvasRef.current;
          if (el) rect = el.getBoundingClientRect();
        } catch { /* anchor is best-effort */ }
        return (
          <CoachMarks
            step={coachStep}
            anchorRect={rect}
            onNext={() => { if (coachStep >= COACH_STEPS.length - 1) endCoach(); else setCoachStep(coachStep + 1); }}
            onSkip={endCoach}
          />
        );
      })()}
    </div>
  );
}
