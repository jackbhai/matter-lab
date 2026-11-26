/**
 * Matter Lab Ultra — cellular engine (W32U spec §§1,2,5,6; W32 §1).
 * Pure ESM, no DOM/React. Imports the substance table + reaction resolver.
 *
 * Storage: structure-of-arrays typed arrays. Swap moves ALL arrays together.
 * xorshift RNG, no allocation in hot loops, alternating scan directions.
 * aux bits: 0-1 variant, 4 updated-this-frame, 5 burning, 6 electrified,
 *           7 frozen-lock.
 * ph: pH x10 (0..140), 255 = n/a. mix: 0..255 stirred-ness (decays).
 * pol: charge sign (+1/-1/0) from nearest electric source.
 * pressure: Float32 at quarter resolution.
 */
import { SUBSTANCES, BY_KEY, SUBSTANCE_COUNT } from './matter-elements.js';
import { resolvePair, PROFILES } from './matter-reactions.js';

export const TIERS = [
  { cols: 576, rows: 324 },
  { cols: 480, rows: 270 },
  { cols: 384, rows: 216 },
  { cols: 320, rows: 180 },
];

export const GEAR = [
  { kind: 'beaker-s', name: 'Beaker S' }, { kind: 'beaker-m', name: 'Beaker M' },
  { kind: 'beaker-l', name: 'Beaker L' }, { kind: 'flask', name: 'Erlenmeyer Flask' },
  { kind: 'testtube', name: 'Test Tube' }, { kind: 'roundflask', name: 'Round Flask' },
  { kind: 'cylinder', name: 'Measuring Cylinder' }, { kind: 'funnel', name: 'Funnel' },
  { kind: 'lid-s', name: 'Lid S' }, { kind: 'lid-m', name: 'Lid M' }, { kind: 'lid-l', name: 'Lid L' },
  { kind: 'burner', name: 'Burner' }, { kind: 'battery', name: 'Battery' },
  { kind: 'thermometer', name: 'Thermometer' },
  { kind: 'electrode-carbon', name: 'Electrode (Carbon)' },
  { kind: 'electrode-copper', name: 'Electrode (Copper)' },
  { kind: 'electrode-platinum', name: 'Electrode (Platinum)' },
  { kind: 'rack', name: 'Test-tube Rack' }, { kind: 'filterpaper', name: 'Filter Paper' },
  { kind: 'benchlamp', name: 'Bench Lamp' },
  { kind: 'wire', name: 'Wire' }, { kind: 'lamp', name: 'Lamp' },
  { kind: 'heater-coil', name: 'Heater Coil' }, { kind: 'cooling-coil', name: 'Cooling Coil' },
  { kind: 'switch', name: 'Switch' },
  { kind: 'sensor', name: 'Heat Sensor' },
];

const AMBIENT = 20;
const DISPLACE = new Set(['liquid', 'gas', 'fire', 'electric']);
const STIR_SET = new Set(['liquid', 'gas', 'fire', 'electric', 'powder']); // stir-only: powders disperse too (movement keeps using DISPLACE)
const VESSEL_KINDS = new Set(['beaker-s', 'beaker-m', 'beaker-l', 'flask', 'testtube', 'roundflask', 'cylinder', 'funnel', 'lid-s', 'lid-m', 'lid-l', 'condenser', 'filterstand', 'ice-bath']);
// W32U-5 R2: vessel size ladder for placeObject opts.size. Binding targets at
// a 251-col portrait grid: beaker-l S ≈ 88 cells wide, M ≈ 126, L ≈ 164.
const SIZE_MUL = { S: 1.4, M: 2.0, L: 2.6, XL: 3.2 }; // V2 Part C: XL \u2248 203 cells wide at a 251-col portrait grid (\u2248 80% of a 412px screen)
const NOT_RESIZABLE = new Set(['switch', 'sensor', 'thermometer', 'electrode-carbon', 'electrode-copper', 'electrode-platinum', 'ph-probe']);
const DYN_CLS = new Set(['gas', 'fire', 'electric', 'special', 'life']); // W32U-5 chunking: classes that never sleep on their own
const idOf = (key) => { const r = key && BY_KEY.get(key); return r ? r.id : 0; };
const firstId = (keys) => { for (const k of keys) { const id = idOf(k); if (id) return id; } return 0; };

function b64encode(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let s = '';
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(s);
}
function b64decode(str) {
  if (typeof Buffer !== 'undefined') { const b = Buffer.from(str, 'base64'); return new Uint8Array(b.buffer, b.byteOffset, b.byteLength); }
  const bin = atob(str); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class MatterEngine {
  constructor(cols, rows) {
    this.cols = cols | 0; this.rows = rows | 0;
    const n = this.cols * this.rows;
    this.el = new Uint16Array(n);
    // W32U-6 (WS3+4): ambient temperature is instance state (setAmbientT).
    this.ambientT = AMBIENT;
    this.temp = new Float32Array(n).fill(this.ambientT);
    // W32U-6: ambient-air oxygen budget per cell (0.21 = fresh air). Only
    // empty/gas cells hold a budget; see _airO2Pass/_combustionPass.
    this.airO2 = new Float32Array(n).fill(0.21);
    // W32U-6: rigid bodies (separate from cell objects) + their occupancy map.
    this.bodies = [];
    this._nextBody = 1;
    this.bodyMap = new Int32Array(n);
    this.gravityPreset = 'earth';
    this._jupiter = false;
    this.life = new Uint16Array(n);
    this.aux = new Uint8Array(n);
    this.ph = new Uint8Array(n).fill(255);
    this.mix = new Uint8Array(n);
    this.pol = new Int8Array(n);
    this.tint = new Uint32Array(n);        // per-cell reaction tint (0 = none, else 0xRRGGBB)
    this.pw = Math.max(1, Math.ceil(cols / 4)); this.ph2 = Math.max(1, Math.ceil(rows / 4));
    this.pressure = new Float32Array(this.pw * this.ph2);
    // W32U-4 air field: coarse air pressure + velocity on the same quarter grid
    this.airP = new Float32Array(this.pw * this.ph2);
    this.airVX = new Float32Array(this.pw * this.ph2);
    this.airVY = new Float32Array(this.pw * this.ph2);
    this.airCols = this.pw; this.airRows = this.ph2;
    this._powered = new Set(); // gear object ids carrying charge last electric pass (reused)
    // internal scratch (not part of the contract surface)
    this._act = new Uint32Array(n);        // tick last became active (frontier)
    this._band = new Uint8Array(n);        // last temp band seen by reaction pass
    this._rxCool = new Int32Array(n);      // inert re-check cooldown tick
    this._dissT = new Float32Array(n);     // dissolution temp (Tier-3)
    this._solute = new Uint16Array(n);     // dissolved solute id (Tier-3)
    this._charge = new Float32Array(n);    // electricity BFS scratch
    this._stamp = new Int32Array(n);       // BFS visit stamp
    this._elecList = new Int32Array(n);    // cells electrified last tick
    this._elecCount = 0;
    this._srcList = new Int32Array(4096);  // electric sources (idx)
    this._srcPol = new Int8Array(4096);
    this._srcStr = new Float32Array(4096);
    this._srcArc = new Uint8Array(4096);   // per-source: 1 = discharge (can arc-ignite), 0 = battery DC
    this._arc = new Uint8Array(n);         // per-cell arc flag, propagated with charge
    this._queue = new Int32Array(n);       // generic BFS queue
    this._region = new Int16Array(n).fill(-1);
    this._regions = [];                    // {cells, pressure, gasCount}
    this.objMap = new Int32Array(n);
    this._inside = new Int16Array(n).fill(-1); // cell -> objId whose interior contains it (sound enc)
    this._anyHot = false; // any cell > 800 C last tick (renderer shimmer flag)
    // HARDEN governor (driven by the UI): {tickRate, ladderStep, tierIndex, startTierIndex}.
    // ladderStep 0..2 = tick-rate only, 3..5 map to internal pass ladder 1..3. Resolution is UI-owned.
    this.governor = { tickRate: 60, ladderStep: 0, tierIndex: -1, startTierIndex: -1 };
    this.objects = new Map();
    this._nextObj = 1;
    this._anims = [];                      // tip animations
    this._blasts = [];                     // pending chain blasts {x,y,r,at}
    this._sparks = [];                     // {x,y,until}
    this._cardLast = new Map();            // card/fam -> tick of last event
    this.gravity = 0; this.gx = 0; this.gy = 1;
    // P3 CONTINUOUS GRAVITY: gx/gy are now a FLOAT unit direction (default
    // (0,1) = straight down). gravMag is the strength: 1 = full (default;
    // every existing proof/gate runs at 1 and, at the axis-aligned default,
    // the movement pass is byte-identical to the old 4-way engine — the
    // dominant-axis step equals the old gx/gy and the lateral probability
    // is 0, consuming no extra RNG). <1 makes gravity-driven classes
    // (powder/liquid/gas) move probabilistically — tilt strength from the
    // UI gyro. windX/windY remain a separate air/wind field (fans, the
    // wind tool, gas drift); they no longer carry the gravity direction.
    this.gravMag = 1;
    this.windX = 0; this.windY = 0;
    this.tick = 0; this.particles = 0;
    // W32U-5 chunked active-region state (32x32 chunks; see _recountChunks)
    this._chCols = 1; this._chRows = 1;
    this._chStamp = new Int32Array(1); this._chDyn = new Int32Array(1);
    this._chTmp = new Float32Array(1); this._chObj = new Int32Array(1);
    this._chAwake = new Uint8Array(1); this._chAwakeRx = new Uint8Array(1); this._chRxFull = new Uint8Array(1);
    this._chAwakeCount = 0;
    this._recountChunks();
    this.ladder = 0; this._emaMs = 16; this._calmTicks = 0;
    this._sealedDirty = true; this._lastSealedTick = -999;
    this.lastLidPop = null;
    this.onReaction = () => {};
    this.onSound = null; // SND (W32U): UI assigns fn({type,cls,intensity,pitch?})
    this._snd = null; this._inStep = false; this._prevElec = 0; this._sndFire = 0;
    this._resetSnd();
    this._rngState = 0x9e3779b9;
    // well-known ids (0 when the table lacks the key — engine stays safe)
    this._k = {
      glass: idOf('glass'), heater: idOf('heater-cell'), cooler: idOf('cooler-cell'), fire: idOf('fire'),
      smoke: firstId(['smoke', 'smoke-grey', 'smoke-black']),
      hydrogen: idOf('hydrogen'), oxygen: idOf('oxygen'), water: idOf('water'),
      filterPaper: idOf('filter-paper'), batteryPos: idOf('battery-pos'),
      batteryNeg: idOf('battery-neg'), batteryBody: idOf('battery-body'),
      thermoBulb: idOf('thermo-bulb'), spark: firstId(['spark', 'electric-spark', 'plasma']),
      metal: firstId(['steel', 'iron']), wood: firstId(['wood', 'wood-oak', 'oak-wood', 'plank-wood', 'pine-wood']),
      carbon: firstId(['carbon-electrode', 'graphite', 'carbon']),
      steam: idOf('steam'),
      copper: idOf('copper'), platinum: idOf('platinum'),
      lamp: firstId(['bench-lamp', 'lamp', 'glow-cell']),
      wall: idOf('wall'), kanthal: idOf('kanthal-wire'),
      neon: idOf('neon-discharge'), fan: idOf('fan-cell'),
    };
  }

  _resetSnd() { this._snd = { boil:0, steam:0, fizz:0, acidfizz:0, sizzle:0, pour:0, pourOil:0, pourGrain:0, shush:0, splash:0, boomE:0, pop:0, zap:0, clink:0, clank:0, knock:0, rock:0, iceN:0, glassN:0, chime:0, creak:0, scrape:0, lava:0, vent:0, ventP:0, bubble:0, whoosh:0, whooshConf:false }; this._sndFire = 0; this._sndX = {}; this._sndEnc = {}; this._sndEncAll = [0, 0]; }
  /* SND2: accumulate grid-normalised source x per class (positional audio). */
  _sx(cls, i) { const s = this._sndX || (this._sndX = {}); const e = s[cls] || (s[cls] = [0, 0]); e[0] += (i % this.cols) / Math.max(1, this.cols - 1); e[1]++;
    // E (HARDEN): enclosure estimate — sealed region 0.8, object interior 0.7, open air 0.15
    const enc = (this._region && this._region[i] >= 0) ? 0.8 : (this._inside && this._inside[i] >= 0) ? 0.7 : 0.15;
    const em = this._sndEnc || (this._sndEnc = {}); const ee = em[cls] || (em[cls] = [0, 0]); ee[0] += enc; ee[1]++;
    const all = this._sndEncAll || (this._sndEncAll = [0, 0]); all[0] += enc; all[1]++; }
  _sxAvg(cls) { const e = this._sndX && this._sndX[cls]; return e && e[1] > 0 ? e[0] / e[1] : null; }
  /* SND2: classify a destroyed/broken cell into break-sound counters. */
  _sndBreak(rec, i) {
    if (!this._snd || !rec) return;
    const fams = rec.fams || [];
    if (fams.includes('glass')) { this._snd.glassN++; this._sx('glassbreak', i); }
    else if (fams.includes('frozen')) { this._snd.iceN++; this._sx('icebreak', i); }
    else if (fams.includes('metal')) { this._snd.clank++; this._sx('clank', i); }
    else if (fams.includes('wood')) { this._snd.knock++; this._sx('knock', i); }
    else if (fams.includes('stone') || rec.profile === 'stone' || rec.profile === 'ceramic') { this._snd.rock++; this._sx('rockbreak', i); }
  }
  _emitSnd() {
    const c = this._snd; if (!c) return;
    const cl = (v, d) => Math.max(0, Math.min(1, v / d));
    const windI = cl((Math.abs(this.windX) + Math.abs(this.windY)) / 2, 1);
    const loops = [['boil', cl(c.boil, 40)], ['steam', cl(c.steam, 40)], ['fizz', cl(c.fizz, 30)], ['acidfizz', cl(c.acidfizz, 30)], ['sizzle', cl(c.sizzle, 20)], ['fire', cl(this._sndFire, 220)], ['pour', cl(c.pour, 60)], ['pour-oil', cl(c.pourOil, 60)], ['pour-grain', cl(c.pourGrain, 60)], ['bubble', cl(c.bubble, 50)], ['vent', cl(c.vent, 20)], ['lava', cl(c.lava, 60)], ['wind', windI], ['scrape', cl(c.scrape, 3)]];
    const shots = [];
    if (c.splash > 0) shots.push(['splash', cl(c.splash, 50), this._sxAvg('splash')]);
    if (c.boomE > 0) shots.push(['boom', 1 - Math.exp(-c.boomE / 220), this._sxAvg('boom')]);
    if (c.pop > 0) shots.push(['pop', cl(c.pop, 3), this._sxAvg('pop')]);
    if (c.zap > 0) { const zi = cl(c.zap, 120); shots.push(['zap', zi, this._sxAvg('zap')]); if (zi >= 0.85) shots.push(['thunder', zi, null]); }
    if (c.clink > 0) shots.push(['clink', cl(c.clink, 8), this._sxAvg('clink')]);
    if (c.clank > 0) shots.push(['clank', cl(c.clank, 8), this._sxAvg('clank')]);
    if (c.knock > 0) shots.push(['knock', cl(c.knock, 8), this._sxAvg('knock')]);
    if (c.rock >= 6) shots.push(['rockbreak', cl(c.rock, 40), this._sxAvg('rockbreak')]);
    if (c.iceN >= 10) shots.push(['icebreak', cl(c.iceN, 30), this._sxAvg('icebreak')]);
    else if (c.iceN >= 2) shots.push(['ice', cl(c.iceN, 10), this._sxAvg('icebreak')]);
    if (c.glassN >= 4) shots.push(['glassbreak', cl(c.glassN, 24), this._sxAvg('glassbreak')]);
    else if (c.glassN > 0) shots.push(['clink', cl(c.glassN + 2, 8), this._sxAvg('glassbreak')]);
    if (c.chime > 0) shots.push(['chime', cl(c.chime, 4), this._sxAvg('chime')]);
    if (c.creak > 0) shots.push(['creak', cl(c.creak, 3), this._sxAvg('creak')]);
    if (c.shush > 0) shots.push(['shush', cl(c.shush, 60), this._sxAvg('shush')]);
    if (c.whoosh > 0) { shots.push(['whoosh', cl(c.whoosh, 60), null]); if (c.whooshConf) shots.push(['pop', 0.85, null]); }
    if (typeof this.onSound === 'function') {
      try {
        const encFor = (cls) => { const ee = this._sndEnc && this._sndEnc[cls]; if (ee && ee[1] > 0) return Math.max(0, Math.min(1, ee[0] / ee[1])); const all = this._sndEncAll; return all && all[1] > 0 ? Math.max(0, Math.min(1, all[0] / all[1])) : 0.15; };
        for (const [cls, i] of loops) { const ev = { type: 'loop', cls, intensity: i, enc: encFor(cls) }; if (cls === 'vent') ev.pitch = Math.max(0, Math.min(1, c.ventP / 3)); const lx = this._sxAvg(cls === 'pour-oil' ? 'pourOil' : cls === 'pour-grain' ? 'pourGrain' : cls); if (lx != null) ev.x = lx; this.onSound(ev); }
        for (const [cls, i, x] of shots) if (i > 0.01) this.onSound({ type: 'event', cls, intensity: i, enc: encFor(cls), ...(x != null ? { x } : {}) });
      } catch (e) {}
    }
    this._resetSnd();
  }
  _sndEvt(cls, intensity, x, enc) { if (typeof this.onSound === 'function') { try { this.onSound({ type: 'event', cls, intensity, enc: enc != null ? enc : 0.15, ...(x != null ? { x } : {}) }); } catch (e) {} } }

  // ---- RNG (xorshift32) ----------------------------------------------------
  _rng() {
    let s = this._rngState;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this._rngState = s | 0;
    return (s >>> 0) / 4294967296;
  }
  _randRange(a, b) { return a + Math.floor(this._rng() * (b - a + 1)); }

  _in(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
  get(x, y) { return this._in(x, y) ? this.el[y * this.cols + x] : 0; }

  _resolve(idOrKey) {
    if (typeof idOrKey === 'string') return idOf(idOrKey);
    const id = idOrKey | 0;
    return id >= 0 && id <= SUBSTANCE_COUNT ? id : 0;
  }

  // ---- W32U-5 chunked active-region bookkeeping (32x32 chunks) ---------------
  _chunkOf(i) { return (((i / this.cols) | 0) >> 5) * this._chCols + ((i % this.cols) >> 5); }

  _isDyn(id, i) {
    if (!id) return false;
    if (this.objMap[i] !== 0) return true;
    const rec = SUBSTANCES[id];
    return !!rec && DYN_CLS.has(rec.cls);
  }

  /** Stamp cell i's chunk AND its 8 neighbours (halo: support removal above
      must wake the chunk below's neighbours too) with the current tick. */
  _dirtyChunkFor(i) {
    const cols = this.cols, chCols = this._chCols, chRows = this._chRows;
    const cx = (i % cols) >> 5, cy = ((i / cols) | 0) >> 5, t = this.tick, st = this._chStamp;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy; if (yy < 0 || yy >= chRows) continue;
      const base = yy * chCols;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx; if (xx < 0 || xx >= chCols) continue;
        st[base + xx] = t;
      }
    }
  }

  /** O(n) rebuild of all chunk state — rare paths only (ctor/resize/clear/
      deserialize/object moves that bypass _write bookkeeping). */
  _recountChunks() {
    this._chCols = Math.max(1, Math.ceil(this.cols / 32));
    this._chRows = Math.max(1, Math.ceil(this.rows / 32));
    const cn = this._chCols * this._chRows;
    this._chStamp = new Int32Array(cn).fill(this.tick);
    this._chDyn = new Int32Array(cn);
    this._chTmp = new Float32Array(cn);
    this._chObj = new Int32Array(cn);
    this._chAwake = new Uint8Array(cn).fill(1);
    this._chAwakeRx = new Uint8Array(cn).fill(1);
    this._chRxFull = new Uint8Array(cn).fill(1);
    this._chAwakeCount = cn;
    const { cols, el, objMap, temp } = this;
    for (let i = 0; i < el.length; i++) {
      const id = el[i], hasObj = objMap[i] !== 0;
      if (!id && !hasObj && temp[i] === this.ambientT) continue;
      const ci = (((i / cols) | 0) >> 5) * this._chCols + ((i % cols) >> 5);
      if (hasObj) this._chObj[ci]++;
      if (id !== 0 && (hasObj || DYN_CLS.has(SUBSTANCES[id].cls))) this._chDyn[ci]++;
      const dev = Math.abs(temp[i] - this.ambientT);
      if (dev > this._chTmp[ci]) this._chTmp[ci] = dev;
    }
  }

  /** Low-level cell write. keepTemp preserves temperature (conversions). */
  _write(i, id, keepTemp) {
    const old = this.el[i];
    // W32U-5: every write dirties its chunk halo + keeps _chDyn exact. Done
    // BEFORE the id===0 early-return below so clears are counted too.
    this._dirtyChunkFor(i);
    {
      const od = this._isDyn(old, i), nd = this._isDyn(id, i);
      if (od !== nd) this._chDyn[this._chunkOf(i)] += nd ? 1 : -1;
    }
    if (old !== 0 && id === 0) this.particles--;
    else if (old === 0 && id !== 0) this.particles++;
    this.el[i] = id;
    const rec = SUBSTANCES[id];
    if (!keepTemp) this.temp[i] = this.ambientT;
    if (!Number.isFinite(this.temp[i])) this.temp[i] = this.ambientT;
    // airO2 bookkeeping: a fresh empty cell is air (0.21) UNLESS it sits in an
    // enclosed pocket (region >= 0) — sealed interiors get no free oxygen.
    this.airO2[i] = id === 0 ? (this._region && this._region[i] >= 0 ? 0 : 0.21) : 0;
    if (id === 0) { this.life[i] = 0; this.aux[i] = 0; this.ph[i] = 255; this.mix[i] = 0; this.pol[i] = 0; this._solute[i] = 0; this.tint[i] = 0; return; }
    this.aux[i] = (this._rng() * 4) | 0; // variant bits only
    this.mix[i] = 0; this.pol[i] = 0; this._solute[i] = 0; this.tint[i] = 0;
    if (rec.lifeSpan != null) {
      this.life[i] = Array.isArray(rec.lifeSpan) ? this._randRange(rec.lifeSpan[0], rec.lifeSpan[1]) : rec.lifeSpan;
    } else this.life[i] = 0;
    if (rec.sourceTemp != null && (rec.cls === 'fire' || rec.cls === 'electric' || rec.hook === 'heater' || rec.hook === 'cooler')) {
      this.temp[i] = rec.sourceTemp;
    }
    this.ph[i] = rec.cls === 'liquid' && rec.ph != null ? Math.round(rec.ph * 10) : 255;
    if (this._inStep && this._snd && rec.cls === 'gas') {
      if ((rec.key || '').includes('steam') || (rec.boilTo != null && false)) { this._snd.steam++; if (this.temp[i] >= 95) this._snd.boil++; }
      else {
        // bubble if spawned inside/below liquid, lava if that liquid is molten-hot,
        // acid fizz if the spawning reaction involved an acid, else plain fizz
        let inLiq = false, hotLiq = false;
        const cc = this.cols;
        for (const ni of [i - 1, i + 1, i - cc, i + cc]) if (ni >= 0 && ni < this.el.length && SUBSTANCES[this.el[ni]].cls === 'liquid') { inLiq = true; if (this.temp[ni] >= 200) hotLiq = true; }
        if (hotLiq) { this._snd.lava++; this._sx('lava', i); }
        else if (inLiq) { this._snd.bubble++; this._sx('bubble', i); }
        else if (this._sndAcid) { this._snd.acidfizz++; this._sx('acidfizz', i); }
        else this._snd.fizz++;
      }
    }
    this._act[i] = this.tick;
    this._band[i] = ((this.temp[i] + 273) / 25) | 0;
    if (rec.cls === 'gas') this._sealedDirty = true;
  }

  set(x, y, idOrKey, opts) {
    if (!this._in(x, y)) return;
    const i = y * this.cols + x;
    const id = this._resolve(idOrKey);
    this._write(i, id, false);
    if (id !== 0) {
      if (opts && opts.temp != null) this.temp[i] = opts.temp;
      if (opts && opts.life != null) this.life[i] = opts.life;
      this._act[i] = this.tick;
    }
  }

  clear() {
    this.el.fill(0); this.life.fill(0); this.aux.fill(0); this.mix.fill(0);
    this.pol.fill(0); this.temp.fill(this.ambientT); this.ph.fill(255); this.tint.fill(0);
    this.airO2.fill(0.21); this.bodies = []; this.bodyMap.fill(0);
    this.pressure.fill(0); this.airP.fill(0); this.airVX.fill(0); this.airVY.fill(0);
    this._powered.clear();
    this._solute.fill(0); this._region.fill(-1);
    this._regions = []; this.objects.clear(); this.objMap.fill(0); this._inside.fill(-1);
    this._anims.length = 0; this._blasts.length = 0; this._sparks.length = 0;
    this.particles = 0; this.lastLidPop = null;
    this._recountChunks();
  }

  setGravity(dir) {
    this._chStamp.fill(this.tick); // W32U-5: gravity change can move any pile — wake everything
    this.gravity = dir & 3;
    if (this.gravity === 0) { this.gx = 0; this.gy = 1; }
    else if (this.gravity === 1) { this.gx = 0; this.gy = -1; }
    else if (this.gravity === 2) { this.gx = -1; this.gy = 0; }
    else { this.gx = 1; this.gy = 0; }
  }

  /** P3: dominant integer step of the continuous gravity vector.
      At any axis-aligned vector this is exactly the old gx/gy pair. */
  _gravDom() {
    const ax = Math.abs(this.gx), ay = Math.abs(this.gy);
    if (ax === 0 && ay === 0) return [0, 0];
    if (ay >= ax) return [0, this.gy < 0 ? -1 : 1];
    return [this.gx < 0 ? -1 : 1, 0];
  }

  /** P3: set a continuous gravity direction (any angle). The vector is
      normalised into gx/gy (floats); strength rides gravMag (clamped
      0..1 when supplied). this.gravity tracks the nearest 4-way code
      for legacy UI. A near-zero vector = gravity off (mag 0). */
  setGravityVector(vx, vy, mag) {
    const len = Math.hypot(vx || 0, vy || 0);
    this._chStamp.fill(this.tick); // gravity change can move any pile — wake everything
    if (!Number.isFinite(len) || len < 1e-9) { this.gx = 0; this.gy = 0; if (mag != null) this.gravMag = 0; return this.getGravityVector(); }
    this.gx = (vx || 0) / len; this.gy = (vy || 0) / len;
    if (mag != null && Number.isFinite(mag)) this.gravMag = Math.max(0, Math.min(1, mag));
    const a = Math.atan2(this.gy, this.gx) * 180 / Math.PI; const ang = a < 0 ? a + 360 : a; // 0=right, 90=down
    this.gravity = ang >= 45 && ang < 135 ? 0 : ang >= 135 && ang < 225 ? 2 : ang >= 225 && ang < 315 ? 1 : 3;
    return this.getGravityVector();
  }

  getGravityVector() {
    const [dx, dy] = this._gravDom();
    return { x: this.gx, y: this.gy, mag: this.gravMag, domX: dx, domY: dy, effX: this.gx * this.gravMag, effY: this.gy * this.gravMag };
  }

  /** W32U-6: ambient (room) temperature control, clamped -30..60 C. Every
      equilibration/cooling baseline in the engine reads this.ambientT. */
  setAmbientT(c) {
    const v = Number.isFinite(c) ? Math.max(-30, Math.min(60, c)) : 20;
    this.ambientT = v;
    this._chStamp.fill(this.tick); // temperature baselines changed — wake everything
    return this.ambientT;
  }

  /** W32U-6: gravity presets. Moon rides the existing gravMag path (0.17);
      Earth = 1. Jupiter = gravMag 1 PLUS one extra gravity-movement pass
      per tick (cells that failed to move get a second attempt — see step());
      measured cost is reported with the workstream (kept only if <= 10%). */
  setGravityPreset(name) {
    if (name === 'moon') { this.gravMag = 0.17; this._jupiter = false; }
    else if (name === 'jupiter') { this.gravMag = 1; this._jupiter = true; }
    else { name = 'earth'; this.gravMag = 1; this._jupiter = false; }
    this.gravityPreset = name;
    this._chStamp.fill(this.tick);
    return name;
  }

  // ---- brush tools -----------------------------------------------------------
  _brush(cx, cy, r, shape, fn) {
    const x0 = Math.max(0, cx - r), x1 = Math.min(this.cols - 1, cx + r);
    const y0 = Math.max(0, cy - r), y1 = Math.min(this.rows - 1, cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (shape !== 'square') { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r * r) continue; }
      fn(x, y, y * this.cols + x);
    }
  }

  // Natural spawn temperature for molten forms: a substance that is the meltTo
  // target of solids melting at >=200 C (lava, iron-molten, molten-glass...) is
  // placed HOT (source meltPoint + 100), never at ambient. Fixes cold lava.
  _spawnTempFor(id) {
    if (!this._spawnTemp) {
      this._spawnTemp = new Map();
      const byTarget = new Map();
      for (const rec of SUBSTANCES) {
        if (rec.meltToId != null && rec.meltPoint != null && rec.meltPoint >= 200) {
          if (!byTarget.has(rec.meltToId)) byTarget.set(rec.meltToId, []);
          byTarget.get(rec.meltToId).push(rec.meltPoint);
        }
      }
      // median source meltPoint + 100 (robust to outlier sources either way)
      for (const [tid, melts] of byTarget) {
        melts.sort((a, b) => a - b);
        this._spawnTemp.set(tid, melts[melts.length >> 1] + 100);
      }
      // canonical molten-rock temperature overrides the noisy source median
      for (const k of ['lava', 'magma']) { const lid = idOf(k); if (lid) this._spawnTemp.set(lid, 1200); }
      // W32U-5: the mirror rule for cold substances — anything that melts
      // below ambient (ice, snow, frozen-*) is placed COLD (meltPoint - 2),
      // never at ambient. Painted ice at 20 C was already above its melting
      // point and vanished on the first temp tick.
      for (const rec of SUBSTANCES) {
        if (rec.meltToId != null && rec.meltPoint != null && rec.meltPoint < this.ambientT - 1 && !this._spawnTemp.has(rec.id)) {
          this._spawnTemp.set(rec.id, rec.meltPoint - 2);
        }
      }
    }
    return this._spawnTemp.has(id) ? this._spawnTemp.get(id) : null;
  }

  paint(cx, cy, r, idOrKey, opts = {}) {
    const id = this._resolve(idOrKey);
    const density = opts.density != null ? opts.density : 1;
    const shape = opts.shape || 'circle';
    this._brush(cx, cy, r, shape, (x, y, i) => {
      if (this.objMap[i] !== 0 || this.bodyMap[i] !== 0) return; // gear/body cells are managed elsewhere
      if (density < 1 && this._rng() >= density) return;
      this._write(i, id, false);
      if (opts.temp != null) this.temp[i] = opts.temp;
      else { const st = this._spawnTempFor(id); if (st != null) this.temp[i] = st; }
    });
  }

  erase(cx, cy, r) {
    this._brush(cx, cy, r, 'circle', (x, y, i) => { if (this.objMap[i] === 0) this._write(i, 0, false); });
  }

  heatBrush(cx, cy, r, dTemp) {
    this._brush(cx, cy, r, 'circle', (x, y, i) => {
      if (this.el[i] !== 0) { this.temp[i] = Math.min(4000, this.temp[i] + dTemp); this._act[i] = this.tick; this._dirtyChunkFor(i); }
    });
  }
  coolBrush(cx, cy, r, dTemp) { this.heatBrush(cx, cy, r, -Math.abs(dTemp)); }

  stir(cx, cy, r) {
    if (this._snd) { let solid = 0; this._brush(cx, cy, r, 'circle', (x, y, i) => { const cc = SUBSTANCES[this.el[i]].cls; if (cc === 'solid' || cc === 'special') solid++; }); if (solid) { this._snd.scrape += solid * 0.04; this._sx('scrape', cy * this.cols + cx); } }
    this._brush(cx, cy, r, 'circle', (x, y, i) => { if (this.el[i] !== 0) { this.mix[i] = 255; this._act[i] = this.tick; this._dirtyChunkFor(i); } });
    // VORTEX pass: rotate every swappable free cell around the centre by an
    // angle that falls off with distance — bulk transport, so immiscible
    // layers actually interleave instead of only jittering in place.
    for (let vpass = 0; vpass < 3; vpass++) try {
      const cells = [];
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (!this._in(x, y)) continue;
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * this.cols + x;
        if (this.objMap[i] !== 0 || this.el[i] === 0) continue;
        if (!STIR_SET.has(SUBSTANCES[this.el[i]].cls)) continue;
        cells.push(i);
      }
      // random processing order (xorshift Fisher-Yates) — no directional bias
      for (let k = cells.length - 1; k > 0; k--) { const m = (this._rng() * (k + 1)) | 0; const t = cells[k]; cells[k] = cells[m]; cells[m] = t; }
      for (let k = 0; k < cells.length; k++) {
        const i = cells[k];
        if (this.objMap[i] !== 0 || this.el[i] === 0) continue;
        if (!STIR_SET.has(SUBSTANCES[this.el[i]].cls)) continue; // may have changed via an earlier swap
        const x = i % this.cols, y = (i / this.cols) | 0;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) continue;
        const fall = 1 - dist / (r + 1);
        const th = 2.4 * fall * fall; // steep falloff: core spins >> rim -> shear folds the layers
        const co = Math.cos(th), si = Math.sin(th);
        const tx = Math.round(cx + dx * co - dy * si), ty = Math.round(cy + dx * si + dy * co);
        if (!this._in(tx, ty)) continue;
        const tdx = tx - cx, tdy = ty - cy;
        if (tdx * tdx + tdy * tdy > r * r) continue; // target stays inside the disc
        const j = ty * this.cols + tx;
        if (j === i || this.objMap[j] !== 0) continue;
        if (this.el[j] !== 0 && !STIR_SET.has(SUBSTANCES[this.el[j]].cls)) continue;
        this._swap(i, j);
      }
    } catch (e) {}
    // TURBULENT pass: rod-scale displacement — a fraction of swappable cells
    // trade places with a random partner elsewhere in the disc, breaking
    // coherent blobs into interleaved droplets (rotation alone keeps blobs whole).
    try {
      const cells = [];
      this._brush(cx, cy, r, 'circle', (x, y, i) => {
        if (this.objMap[i] === 0 && this.el[i] !== 0 && STIR_SET.has(SUBSTANCES[this.el[i]].cls)) cells.push(i);
      });
      for (let k = cells.length - 1; k > 0; k--) { const m = (this._rng() * (k + 1)) | 0; const t = cells[k]; cells[k] = cells[m]; cells[m] = t; }
      for (let round = 0; round < 4; round++) for (let k = 0; k < cells.length; k++) {
        if (this._rng() >= 0.8) continue;
        const i = cells[k];
        if (this.objMap[i] !== 0 || this.el[i] === 0 || !STIR_SET.has(SUBSTANCES[this.el[i]].cls)) continue;
        for (let tries = 0; tries < 6; tries++) {
          const j = cells[(this._rng() * cells.length) | 0];
          if (j === i || this.objMap[j] !== 0) continue;
          if (this.el[j] !== 0 && !STIR_SET.has(SUBSTANCES[this.el[j]].cls)) continue;
          if (this.el[j] === this.el[i]) continue; // unlike-partner exchange interleaves; like-like is a no-op for mixing
          this._swap(i, j);
          break;
        }
      }
    } catch (e) {}
    // final pass: random diagonal jitter (now incl. powder via STIR_SET)
    const swaps = Math.max(4, (r * r * 2) | 0);
    for (let s = 0; s < swaps; s++) {
      const x = cx + this._randRange(-r, r), y = cy + this._randRange(-r, r);
      if (!this._in(x, y)) continue;
      const i = y * this.cols + x;
      if (this.objMap[i] !== 0) continue;
      const cls = SUBSTANCES[this.el[i]].cls;
      if (!STIR_SET.has(cls)) continue;
      const dx = this._rng() < 0.5 ? 1 : -1, dy = this._rng() < 0.5 ? 1 : -1;
      const j = (y + dy) * this.cols + (x + dx);
      if (this._in(x + dx, y + dy) && this.objMap[j] === 0 && (this.el[j] === 0 || STIR_SET.has(SUBSTANCES[this.el[j]].cls))) this._swap(i, j);
    }
  }

  /** Dispersion measure: fraction of keyA cells touching a keyB cell (4-neighbour). */
  mixingIndex(keyA, keyB) {
    const aId = idOf(keyA), bId = idOf(keyB);
    let aCells = 0, aTouchingB = 0;
    if (aId && bId) {
      const { cols, rows, el } = this;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (el[i] !== aId) continue;
        aCells++;
        if ((x > 0 && el[i - 1] === bId) || (x + 1 < cols && el[i + 1] === bId) ||
            (y > 0 && el[i - cols] === bId) || (y + 1 < rows && el[i + cols] === bId)) aTouchingB++;
      }
    }
    return { aCells, bCells: bId ? this._countId(bId) : 0, aTouchingB, fraction: aTouchingB / Math.max(1, aCells) };
  }

  _countId(id) { let n = 0; for (let i = 0; i < this.el.length; i++) if (this.el[i] === id) n++; return n; }

  poke(cx, cy, r, dx, dy) {
    if (this._snd) { let liq = 0, solid = 0; this._brush(cx, cy, r, 'circle', (x, y, i) => { const cc = SUBSTANCES[this.el[i]].cls; if (cc === 'liquid') liq++; else if (cc === 'solid' || cc === 'special') solid++; }); if (liq) this._snd.splash += liq * 0.5; if (solid && (dx || dy)) { this._snd.scrape += solid * 0.04; this._sx('scrape', cy * this.cols + cx); } }
    const qi = Math.min(this.ph2 - 1, Math.max(0, (cy / 4) | 0)) * this.pw + Math.min(this.pw - 1, Math.max(0, (cx / 4) | 0));
    this.pressure[qi] += 1.5;
    // W32U-4: a poke also nudges the air field in the poke direction
    this.airP[qi] += 0.3;
    this.airVX[qi] += Math.sign(dx) * 0.3; this.airVY[qi] += Math.sign(dy) * 0.3;
    this._brush(cx, cy, r, 'circle', (x, y, i) => {
      if (this.el[i] === 0 || !DISPLACE.has(SUBSTANCES[this.el[i]].cls)) return;
      const tx = x + Math.sign(dx), ty = y + Math.sign(dy);
      if (this._in(tx, ty)) { const j = ty * this.cols + tx; if (this.el[j] === 0 && this._rng() < 0.5) this._swap(i, j); }
    });
  }

  sparkAt(x, y) {
    if (!this._in(x, y)) return;
    this._sparks.push({ x, y, until: this.tick + 90 });
    if (this._sparks.length > 32) this._sparks.shift();
    const i = y * this.cols + x;
    if (this.el[i] === 0 && this._k.spark) this._write(i, this._k.spark, false);
    this._act[i] = this.tick;
  }

  /** Swap ALL per-cell arrays between i and j. */
  _swap(i, j) {
    // W32U-5: swaps dirty both chunk halos; _chDyn moves only when the two
    // cells live in different chunks and their classifications differ.
    this._dirtyChunkFor(i); this._dirtyChunkFor(j);
    {
      const ci = this._chunkOf(i), cj = this._chunkOf(j);
      if (ci !== cj) {
        const aId = this.el[i], bId = this.el[j];
        const oi = this._isDyn(aId, i), oj = this._isDyn(bId, j);
        const ni = this._isDyn(bId, i), nj = this._isDyn(aId, j);
        if (oi !== ni) this._chDyn[ci] += ni ? 1 : -1;
        if (oj !== nj) this._chDyn[cj] += nj ? 1 : -1;
      }
    }
    if (this._inStep && this._snd) {
      try {
        const A = SUBSTANCES[this.el[i]], B = SUBSTANCES[this.el[j]];
        const down = j > i; // gravity-down approximation (default gravity)
        if (A && B) {
          if (A.cls === 'liquid' && down && (B.cls === 'gas' || this.el[j] === 0)) { if ((A.viscosity || 0) >= 0.5) { this._snd.pourOil++; this._sx('pourOil', i); } else { this._snd.pour++; this._sx('pour', i); } const below = j + this.cols; if (below < this.el.length && this.el[below] !== 0 && SUBSTANCES[this.el[below]].cls !== 'gas') { this._snd.splash += 0.34; this._sx('splash', j); } }
          if (A.cls === 'powder' && down) { if ((A.fams || []).includes('stone')) { this._snd.pourGrain++; this._sx('pourGrain', i); } else this._snd.shush++; }
          if (A.cls === 'gas' && B.cls === 'liquid' && j < i) this._snd.bubble++;
          if (B.cls === 'gas' && A.cls === 'liquid' && i < j) this._snd.bubble++;
          if (A.cls === 'gas' && this._region && this._region[i] >= 0 && this._region[j] < 0) { this._snd.vent++; const rg = this._regions[this._region[i]]; if (rg) this._snd.ventP = Math.max(this._snd.ventP, rg.pressure || 0); }
        }
      } catch (e) {}
    }
    const el = this.el; let t;
    t = el[i]; el[i] = el[j]; el[j] = t;
    t = this.temp[i]; this.temp[i] = this.temp[j]; this.temp[j] = t;
    t = this.life[i]; this.life[i] = this.life[j]; this.life[j] = t;
    t = this.aux[i]; this.aux[i] = this.aux[j] | 16; this.aux[j] = t | 16;
    t = this.ph[i]; this.ph[i] = this.ph[j]; this.ph[j] = t;
    t = this.mix[i]; this.mix[i] = this.mix[j]; this.mix[j] = t;
    t = this.pol[i]; this.pol[i] = this.pol[j]; this.pol[j] = t;
    t = this._dissT[i]; this._dissT[i] = this._dissT[j]; this._dissT[j] = t;
    t = this._solute[i]; this._solute[i] = this._solute[j]; this._solute[j] = t;
    t = this.tint[i]; this.tint[i] = this.tint[j]; this.tint[j] = t;
    this._act[i] = this.tick; this._act[j] = this.tick;
  }

  _convert(i, newId) { // reaction/state conversion: temperature preserved
    if (this.el[i] === newId) return;
    this._write(i, newId, true);
  }

  // ---- movement pass ---------------------------------------------------------
  _canDisplace(aRec, bId) {
    if (bId === 0) return true;
    const b = SUBSTANCES[bId];
    return DISPLACE.has(b.cls) && b.density < aRec.density;
  }

  _movePass() {
    const { cols, rows, el } = this;
    // P3: movement consumes the DOMINANT axis step (dgx,dgy) — identical
    // to the old integer gx/gy at axis-aligned vectors — plus a lateral
    // bias: latX/latY is the off-axis step and pLat = |minor|/|major|
    // (0 at axis alignment, 1 at 45°) is the probability that a falling /
    // rising cell takes the diagonal (dominant + lateral) step first.
    // At the default (0,1) pLat is 0 and no extra RNG is consumed.
    const [gx, gy] = this._gravDom();
    const rx = gy, ry = -gx; // lateral "right" in gravity frame
    const major = Math.max(Math.abs(this.gx), Math.abs(this.gy));
    const minor = Math.min(Math.abs(this.gx), Math.abs(this.gy));
    const pLat = major > 0 ? minor / major : 0;
    const latX = gy !== 0 ? (this.gx < 0 ? -1 : this.gx > 0 ? 1 : 0) : 0;
    const latY = gy === 0 ? (this.gy < 0 ? -1 : this.gy > 0 ? 1 : 0) : 0;
    const flip = (this.tick & 1) === 1;
    // scan from the gravity-down edge backwards; inner axis alternates
    const outerN = gy !== 0 ? rows : cols;
    const innerN = gy !== 0 ? cols : rows;
    for (let o = 0; o < outerN; o++) {
      const along = gy > 0 || gx > 0 ? outerN - 1 - o : o;
      const rowFlip = flip !== ((o & 1) === 1);
      for (let q = 0; q < innerN; q++) {
        const lat = rowFlip ? innerN - 1 - q : q;
        let x, y;
        if (gy !== 0) { y = along; x = lat; } else { x = along; y = lat; }
        const i = y * cols + x;
        if (!this._chAwake[((y >> 5) * this._chCols) + (x >> 5)]) continue; // W32U-5 sleeping chunk
        const id = el[i];
        if (id === 0 || (this.aux[i] & 16)) continue;
        const rec = SUBSTANCES[id];
        const cls = rec.cls;
        // W32U-4: lamp gear cells are pinned — the neon core is electric-class
        // and would otherwise drift like a gas / decay like a spark.
        if (cls === 'electric' && this.objMap[i] !== 0) { const oo = this.objects.get(this.objMap[i]); if (oo && oo.kind === 'lamp') continue; }
        // gravMag gate: inert at 1 (no RNG consumed, proofs unchanged).
        if (this.gravMag < 1 && (cls === 'powder' || cls === 'liquid' || cls === 'gas') && this._rng() >= this.gravMag) continue;
        if (cls === 'powder') this._movePowder(i, x, y, rec, gx, gy, rx, ry, latX, latY, pLat);
        else if (cls === 'liquid') this._moveLiquid(i, x, y, rec, gx, gy, rx, ry, latX, latY, pLat);
        else if (cls === 'gas' || cls === 'fire' || cls === 'electric') this._moveGas(i, x, y, rec, gx, gy, rx, ry, cls, latX, latY, pLat);
        else if (cls === 'special') this._specialTick(i, x, y, rec);
        // solid & life: static in the movement pass
      }
    }
  }

  _tryStep(i, x, y, dx, dy, rec, displace) {
    const nx = x + dx, ny = y + dy;
    if (!this._in(nx, ny)) return false;
    const j = ny * this.cols + nx;
    if (this.bodyMap[j] !== 0) return false; // rigid bodies are solid to cells
    const bId = this.el[j];
    if (bId === 0 || (displace && this._canDisplace(rec, bId))) { this._swap(i, j); return true; }
    return false;
  }

  _movePowder(i, x, y, rec, gx, gy, rx, ry, latX = 0, latY = 0, pLat = 0) {
    // P3: diagonal-first fall along the true vector, with probability pLat.
    if (pLat > 0 && this._rng() < pLat && this._tryStep(i, x, y, gx + latX, gy + latY, rec, true)) return;
    // W32U-4: local air flow shoves light powders (density < 0.5). Guarded on
    // non-zero air velocity, so calm scenes consume no RNG and are unaffected.
    if (rec.density < 0.5) {
      const aqi = (y >> 2) * this.pw + (x >> 2);
      const avx = this.airVX[aqi], avy = this.airVY[aqi];
      if (avx !== 0 || avy !== 0) {
        const aLat = avx * rx + avy * ry;
        if (Math.abs(aLat) > 0.4 && this._rng() < Math.min(1, Math.abs(aLat) * 0.4)) {
          if (this._tryStep(i, x, y, rx * Math.sign(aLat), ry * Math.sign(aLat), rec, false)) return;
        }
        const aUp = -(avx * gx + avy * gy);
        if (aUp > 0.5 && this._rng() < aUp * 0.35) { if (this._tryStep(i, x, y, -gx, -gy, rec, false)) return; }
      }
    }
    if (this._tryStep(i, x, y, gx, gy, rec, true)) return;
    const s = this._rng() < 0.5 ? 1 : -1;
    if (this._tryStep(i, x, y, gx + rx * s, gy + ry * s, rec, true)) return;
    this._tryStep(i, x, y, gx - rx * s, gy - ry * s, rec, true);
  }

  _moveLiquid(i, x, y, rec, gx, gy, rx, ry, latX = 0, latY = 0, pLat = 0) {
    // filter paper: liquid seeps through slowly, solids/powders never do
    if (this._k.filterPaper) {
      const bx = x + gx, by = y + gy;
      if (this._in(bx, by) && this.el[by * this.cols + bx] === this._k.filterPaper) {
        const ax = bx + gx, ay = by + gy;
        if (this._in(ax, ay) && this.el[ay * this.cols + ax] === 0 && this._rng() < 0.04) {
          this._swap(i, ay * this.cols + ax); return;
        }
      }
    }
    // P3: diagonal-first fall along the true vector, with probability pLat.
    if (pLat > 0 && this._rng() < pLat && this._tryStep(i, x, y, gx + latX, gy + latY, rec, true)) return;
    if (this._tryStep(i, x, y, gx, gy, rec, true)) return;
    const s = this._rng() < 0.5 ? 1 : -1;
    if (this._tryStep(i, x, y, gx + rx * s, gy + ry * s, rec, true)) return;
    if (this._tryStep(i, x, y, gx - rx * s, gy - ry * s, rec, true)) return;
    // lateral dispersion, throttled by viscosity
    const visc = rec.viscosity || 0;
    if (this._rng() < 1 - visc * 0.75) {
      const disp = Math.max(1, rec.dispersion | 0);
      let dir = this._rng() < 0.5 ? 1 : -1;
      // P3: bias sideways flow toward the vector's off-axis side.
      if (pLat > 0 && this._rng() < pLat) { const la = latX * rx + latY * ry; if (la !== 0) dir = la; }
      let cx = x, cy = y, ci = i;
      for (let d = 0; d < disp; d++) {
        const nx = cx + rx * dir, ny = cy + ry * dir;
        if (!this._in(nx, ny)) break;
        const j = ny * this.cols + nx;
        if (this.bodyMap[j] !== 0) break;
        const bId = this.el[j];
        if (bId !== 0 && !(SUBSTANCES[bId].cls === 'gas' && SUBSTANCES[bId].density < rec.density)) break;
        // only flow sideways if the cell beyond/below does not support us
        this._swap(ci, j); ci = j; cx = nx; cy = ny;
        if (this._tryStep(ci, cx, cy, gx, gy, rec, true)) break;
      }
    }
  }

  _moveGas(i, x, y, rec, gx, gy, rx, ry, cls, latX = 0, latY = 0, pLat = 0) {
    // P3: diagonal-first rise along the true (inverted) vector, prob pLat.
    if (pLat > 0 && this._rng() < pLat && this._tryStep(i, x, y, -gx + latX, -gy + latY, rec, true)) return;
    // rise against gravity; swap up through denser liquids (buoyancy)
    if (this._tryStep(i, x, y, -gx, -gy, rec, true)) return;
    const s = this._rng() < 0.5 ? 1 : -1;
    if (this._tryStep(i, x, y, -gx + rx * s, -gy + ry * s, rec, true)) return;
    if (this._tryStep(i, x, y, -gx - rx * s, -gy - ry * s, rec, true)) return;
    // lateral diffusion + wind bias
    let dir = this._rng() < 0.5 ? 1 : -1;
    const windLat = this.windX * rx + this.windY * ry;
    if (Math.abs(windLat) > 0.15 && this._rng() < Math.abs(windLat)) dir = Math.sign(windLat);
    const windUp = -(this.windX * gx + this.windY * gy);
    if (windUp > 0.3 && this._rng() < windUp * 0.5) { this._tryStep(i, x, y, -gx, -gy, rec, false); return; }
    // W32U-4: local air-field bias, same style as global wind above. Guarded
    // on non-zero air velocity — calm scenes consume no RNG, proofs unaffected.
    const aqi = (y >> 2) * this.pw + (x >> 2);
    const avx = this.airVX[aqi], avy = this.airVY[aqi];
    if (avx !== 0 || avy !== 0) {
      const aLat = avx * rx + avy * ry;
      if (Math.abs(aLat) > 0.15 && this._rng() < Math.min(1, Math.abs(aLat) * 0.5)) dir = Math.sign(aLat);
      const aUp = -(avx * gx + avy * gy);
      if (aUp > 0.3 && this._rng() < aUp * 0.4) { this._tryStep(i, x, y, -gx, -gy, rec, false); return; }
      if (aUp < -0.3 && this._rng() < -aUp * 0.4) { this._tryStep(i, x, y, gx, gy, rec, false); return; }
    }
    // HARDEN C4: lateral diffusion scales with buoyancy vs air (0.12) — light gases
    // (H2, He) spread/rise faster, heavy gases (CO2, Cl2) hug and creep slower.
    const buoy = Math.abs((rec.density || 0.12) - 0.12);
    const steps = cls === 'gas' ? Math.max(1, Math.round(((rec.dispersion | 0) >> 1) * (0.6 + Math.min(1.6, buoy * 6)))) : 1;
    let cx = x, cy = y, ci = i;
    for (let d = 0; d < steps; d++) {
      const nx = cx + rx * dir, ny = cy + ry * dir;
      if (!this._in(nx, ny)) break;
      const j = ny * this.cols + nx;
      if (this.el[j] !== 0 || this.bodyMap[j] !== 0) break;
      if (d > 0 && buoy > 0.05 && this._rng() < 0.25) break; // extra hops are probabilistic for buoyant gases
      this._swap(ci, j); ci = j; cx = nx; cy = ny;
    }
  }

  _specialTick(i, x, y, rec) {
    if (rec.hook === 'clone') {
      // copy a random non-empty neighbour into a random empty neighbour
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dy] = dirs[this._randRange(0, 3)];
      const sx = x + dx, sy = y + dy, tx = x - dx, ty = y - dy;
      if (this._in(sx, sy) && this._in(tx, ty)) {
        const sId = this.el[sy * this.cols + sx], ti = ty * this.cols + tx;
        if (sId !== 0 && this.el[ti] === 0 && SUBSTANCES[sId].cls !== 'special' && this._rng() < 0.2) this._write(ti, sId, false);
      }
    } else if (rec.hook === 'void') {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dy] = dirs[this._randRange(0, 3)];
      const tx = x + dx, ty = y + dy;
      if (this._in(tx, ty)) { const ti = ty * this.cols + tx; if (this.el[ti] !== 0 && this.objMap[ti] === 0) this._write(ti, 0, false); }
    }
    // heater/cooler/battery/thermometer hooks act in the temp/electric passes
  }

  // ---- temperature pass --------------------------------------------------------
  _tempPass() {
    const { cols, rows, el, temp } = this;
    let anyHot = false;
    // Stefan-Boltzmann ambient term for 20 C, ((293)/100)^4, precomputed once per pass
    const SB_AMB = 73.7;
    const checker = this.ladder >= 1;
    const parity = this.tick & 1;
    // burner nozzles: heater cells of burner objects are driven to level temp
    for (const obj of this.objects.values()) {
      if (obj.kind !== 'burner') continue;
      if (obj.level <= 0) continue; // W32U-5: level 0 = burner OFF (no nozzle drive, no flame licks)
      const target = obj.level === 1 ? 400 : obj.level === 2 ? 700 : 1000;
      for (let c = 0; c < obj.cells.length; c++) {
        const i = obj.cells[c];
        if (el[i] === this._k.heater && this._k.heater) temp[i] += (target - temp[i]) * 0.25;
      }
      // flame licks above the nozzle
      if (this._k.fire) {
        const ax = obj.anchor.x + 4, ay = obj.anchor.y + 3;
        if (this._in(ax, ay)) { const i = ay * cols + ax; if (el[i] === 0 && this._rng() < 0.35) { this._write(i, this._k.fire, false); temp[i] = target * 0.8; } }
      }
    }
    // W32U-4 electronics gear hooks (powered state comes from last tick's
    // electric pass — one tick of lag, no allocation):
    // heater-coil kanthal drives toward 500 C when powered; a powered lamp's
    // neon core gets a gentle lift capped at 60 C; a heat sensor reads its
    // thermo-bulb against its level threshold (1/2/3 = 60/150/300 C).
    for (const obj of this.objects.values()) {
      if (obj.kind === 'heater-coil') {
        // W32U-5: level selects the target (1/2/3 = 200/350/500 C); 0 = off.
        if (obj.level <= 0 || !this._powered.has(obj.id)) continue;
        const target = obj.level === 1 ? 200 : obj.level === 2 ? 350 : 500;
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (this._k.kanthal && el[i] === this._k.kanthal) temp[i] += (target - temp[i]) * 0.2;
        }
      } else if (obj.kind === 'cooling-coil') {
        // W32U-5: level selects the target (1/2/3 = 0/-40/-100 C); 0 = off.
        if (obj.level <= 0) continue;
        const target = obj.level === 1 ? 0 : obj.level === 2 ? -40 : -100;
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (this._k.cooler && el[i] === this._k.cooler) temp[i] += (target - temp[i]) * 0.2;
        }
      } else if (obj.kind === 'lamp') {
        if (!obj.light) continue;
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (this._k.neon && el[i] === this._k.neon && temp[i] < 60) temp[i] += (60 - temp[i]) * 0.08;
        }
      } else if (obj.kind === 'sensor') {
        const thr = obj.level === 3 ? 300 : obj.level === 2 ? 150 : 60;
        obj.firing = 0;
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (el[i] === this._k.thermoBulb && temp[i] >= thr) { obj.firing = 1; break; }
        }
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const ci = ((y >> 5) * this._chCols) + (x >> 5);
        if (!this._chAwakeRx[ci]) continue; // W32U-5 sleeping chunk (rotation visits included so slow heat processes still complete)
        const id = el[i];
        if (id === 0) continue;
        const rec = SUBSTANCES[id];
        let t = temp[i];
        if (t > 800) anyHot = true;
        if (!Number.isFinite(t)) { t = this.ambientT; temp[i] = t; }
        // W32U-5: leaky per-chunk temperature max keeps hot/cold chunks awake
        { const dev = Math.abs(t - this.ambientT); if (dev > 1 || this._chTmp[ci] > 1.5) this._chTmp[ci] = Math.max(this._chTmp[ci] * 0.995, dev); }
        // SND2: wood-stress creak (150–280 °C, unignited, heavily rate-limited) + molten-liquid surface lava
        if (this._snd) {
          if (t >= 150 && t <= 280 && !(this.aux[i] & 32) && (rec.fams || []).includes('wood') && this._rng() < 0.0006) { this._snd.creak++; this._sx('creak', i); }
          if (rec.cls === 'liquid' && t >= 300 && y > 0 && (el[i - cols] === 0 || SUBSTANCES[el[i - cols]].cls === 'gas')) { this._snd.lava += 0.25; this._sx('lava', i); }
        }
        // sources & sinks hold toward their sourceTemp
        if (rec.sourceTemp != null && (rec.cls === 'fire' || rec.cls === 'electric' || rec.cls === 'special')) {
          // W32U-5: a cooling-coil's own cooler cells are driven by the coil's
          // level (object loop above), NOT by the cell's -40 sourceTemp hold —
          // otherwise level 0 could never be truly off.
          let hold = true;
          if (this._k.cooler && id === this._k.cooler && this.objMap[i] !== 0) {
            const oo = this.objects.get(this.objMap[i]);
            if (oo && oo.kind === 'cooling-coil') hold = false;
          }
          // Same for a burner nozzle at level 0: the heater-cell's own 800 C
          // sourceTemp hold would keep it hot with the burner "off".
          if (hold && this._k.heater && id === this._k.heater && this.objMap[i] !== 0) {
            const oo = this.objects.get(this.objMap[i]);
            if (oo && oo.kind === 'burner' && oo.level <= 0) hold = false;
          }
          if (hold) { t += (rec.sourceTemp - t) * 0.2; temp[i] = t; }
        }
        // burning cells: heat, smoke, burn-out
        if (this.aux[i] & 32) {
          this._sndFire++;
          t += (650 - t) * 0.08; temp[i] = t;
          if (this.life[i] > 0) this.life[i]--;
          const [dgx, dgy] = this._gravDom(); const above = y - dgy >= 0 && y - dgy < rows && x - dgx >= 0 && x - dgx < cols ? (y - dgy) * cols + (x - dgx) : -1;
          if (above >= 0 && el[above] === 0) {
            const r = this._rng();
            if (r < 0.10 && this._k.fire) this._write(above, this._k.fire, false);
            else if (r < 0.14 && this._k.smoke) this._write(above, this._k.smoke, false);
          }
          // smothering: no gas/empty neighbour at all -> chance to die out
          let air = 0;
          if (x + 1 < cols && (el[i + 1] === 0 || SUBSTANCES[el[i + 1]].cls === 'gas')) air++;
          if (x > 0 && (el[i - 1] === 0 || SUBSTANCES[el[i - 1]].cls === 'gas')) air++;
          if (y + 1 < rows && (el[i + cols] === 0 || SUBSTANCES[el[i + cols]].cls === 'gas')) air++;
          if (y > 0 && (el[i - cols] === 0 || SUBSTANCES[el[i - cols]].cls === 'gas')) air++;
          if (air === 0 && this._rng() < 0.1) this.aux[i] &= ~32;
          if (this.life[i] === 0) { this._convert(i, rec.burnToId || 0); continue; }
        }
        // fire / electric class lifetime decay (lamp-object cores are exempt:
        // the neon cell is a fixture, not a spark)
        if ((rec.cls === 'fire' || rec.cls === 'electric') && rec.lifeSpan != null) {
          const loid = this.objMap[i];
          const isLampCore = loid !== 0 && (this.objects.get(loid) || {}).kind === 'lamp';
          if (!isLampCore) {
            if (this.life[i] > 0) this.life[i]--;
            if (this.life[i] === 0) {
              const to = rec.burnToId || (this._rng() < 0.25 ? this._k.smoke : 0);
              this._convert(i, to || 0); continue;
            }
          }
        }
        // ignition by temperature
        if (!(this.aux[i] & 32) && rec.flammability > 0 && rec.ignitionTemp != null && t >= rec.ignitionTemp) {
          if (this._snd && rec.cls === 'gas') { this._snd.whoosh++; if (this._region && this._region[i] >= 0) this._snd.whooshConf = true; }
          this.aux[i] |= 32;
          this.life[i] = rec.burnTime ? (Array.isArray(rec.burnTime) ? this._randRange(rec.burnTime[0], rec.burnTime[1]) : rec.burnTime) : 90;
          this._act[i] = this.tick;
          this._dirtyChunkFor(i); // W32U-5: a fresh ignition wakes its chunk halo
        }
        // explosive cook-off
        if (rec.blast > 0 && (t >= (rec.ignitionTemp != null ? rec.ignitionTemp : 250) || (this.aux[i] & 32))) {
          if (this._blasts.length < 64) this._blasts.push({ x, y, r: rec.blast, at: this.tick + 2 }); // HARDEN cap
          this._convert(i, 0); continue;
        }
        // conduction: right + down neighbours (checkerboard half-pass on ladder)
        if (!checker || (((x + y) & 1) === parity)) {
          const ca = rec.conductivity || 0;
          if (ca > 0) {
            if (x + 1 < cols) this._conduct(i, i + 1, ca);
            if (y + 1 < rows) this._conduct(i, i + cols, ca);
          }
        }
        // gentle ambient drift keeps the field sane
        temp[i] += (this.ambientT - temp[i]) * 0.0005;
        // HARDEN C1: radiative cooling (simplified Stefan-Boltzmann). Hot cells radiate
        // ~T^4, so a 1500 C cell in open air cools far faster than conduction alone;
        // shielded cells (no empty/gas neighbour) radiate at 25%. Per-tick delta capped.
        if (temp[i] > 200) {
          const tk = (temp[i] + 273) / 100; const t2 = tk * tk;
          let rad = 3e-5 * (t2 * t2 - SB_AMB);
          if (rad > 0) {
            let exposed = false;
            if (x + 1 < cols && (el[i + 1] === 0 || SUBSTANCES[el[i + 1]].cls === 'gas')) exposed = true;
            else if (x > 0 && (el[i - 1] === 0 || SUBSTANCES[el[i - 1]].cls === 'gas')) exposed = true;
            else if (y + 1 < rows && (el[i + cols] === 0 || SUBSTANCES[el[i + cols]].cls === 'gas')) exposed = true;
            else if (y > 0 && (el[i - cols] === 0 || SUBSTANCES[el[i - cols]].cls === 'gas')) exposed = true;
            if (!exposed) rad *= 0.25;
            temp[i] -= Math.min(6, rad);
          }
        }
        if (temp[i] < -273) temp[i] = -273; else if (temp[i] > 4000) temp[i] = 4000;
        // state changes (thresholds are data)
        t = temp[i];
        if (rec.meltToId != null && rec.meltPoint != null && t >= rec.meltPoint) { this._convert(i, rec.meltToId); continue; }
        if (rec.boilToId != null && rec.boilPoint != null) {
          // W32U-4: local pressure (sealed region + air field) raises the
          // boiling point by +6 C per unit, capped at +45, never downward —
          // at ambient pressure (~0) the shift is 0 and nothing changes.
          const bpShift = Math.min(45, Math.max(0, this._pressureAt(x, y) * 6));
          if (t >= rec.boilPoint + bpShift) { if (this._snd && rec.cls === 'liquid') { this._snd.boil++; this._snd.steam++; } this._convert(i, rec.boilToId); continue; }
        }
        if (rec.freezeToId != null && rec.freezePoint != null && t <= rec.freezePoint) { this._convert(i, rec.freezeToId); continue; }
        if (rec.condenseToId != null && rec.condensePoint != null && t <= rec.condensePoint) { this._convert(i, rec.condenseToId); continue; }
        // HARDEN C3: evaporation — volatile liquid surface cells (empty/gas above, in the
        // gravity frame) at >= 40 C slowly become their vapour well below boiling point.
        // aqueous liquids get a small vapour-pressure floor (0.15) when the table
        // lists volatility 0 — real water does evaporate, just slower than ethanol (0.9).
        const effVol = rec.volatility > 0 ? rec.volatility : ((rec.fams || []).includes('aqueous') ? 0.15 : 0);
        if (rec.cls === 'liquid' && effVol > 0 && temp[i] >= 40) {
          const [egx, egy] = this._gravDom(); const ux = x - egx, uy = y - egy;
          if (ux >= 0 && uy >= 0 && ux < cols && uy < rows) {
            const aboveId = el[uy * cols + ux];
            if (aboveId === 0 || SUBSTANCES[aboveId].cls === 'gas') {
              const bp = Math.max(rec.boilPoint != null ? rec.boilPoint : 100, 100);
              const pEvap = effVol * (temp[i] / bp) * 0.02;
              if (this._rng() < pEvap) {
                const vapId = rec.boilToId || ((rec.fams || []).includes('aqueous') ? this._k.steam : 0);
                if (vapId) { this._convert(i, vapId); continue; }
              }
            }
          }
        }
        // mix decay rides this pass
        if (this.mix[i] > 0) this.mix[i] = (this.mix[i] * 0.94) | 0;
      }
    }
    this._anyHot = anyHot;
  }

  _conduct(i, j, ca) {
    const bId = this.el[j];
    if (bId === 0) return;
    const cb = SUBSTANCES[bId].conductivity || 0;
    const k = ca * cb * 0.6;
    if (k <= 0) return;
    const d = (this.temp[i] - this.temp[j]) * k;
    if (d !== 0) {
      this.temp[i] -= d; this.temp[j] += d;
      if (Math.abs(d) > 2) { this._act[i] = this.tick; this._act[j] = this.tick; }
      // W32U-5: a real heat flow wakes both chunks and feeds the target
      // chunk's leaky temperature max so gradients keep their chunks awake.
      if (Math.abs(d) > 0.5) {
        this._dirtyChunkFor(i); this._dirtyChunkFor(j);
        const cj = this._chunkOf(j);
        const dev = Math.abs(this.temp[j] - this.ambientT);
        if (dev > this._chTmp[cj]) this._chTmp[cj] = dev;
      }
    }
  }

  // ---- reaction pass (frontier only) -------------------------------------------
  _reactionPass() {
    const { cols, rows, el } = this;
    // governor pass degradation (ladder>=2): ambient re-check sweep drops 1/8 -> 1/16 of cells
    const sweepMask = this.ladder >= 2 ? 15 : 7;
    const sweep = this.tick & sweepMask;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        // W32U-5: sleeping chunks skip — except on the slow rotation, where
        // chunk ci gets a FULL ambient pass once every 64 ticks.
        const ci2 = ((y >> 5) * this._chCols) + (x >> 5);
        if (!this._chAwakeRx[ci2]) continue;
        const id = el[i];
        if (id === 0) continue;
        const band = ((this.temp[i] + 273) / 25) | 0;
        const active = (this.tick - this._act[i] <= 2) || band !== this._band[i] || this.mix[i] > 0 || ((i & sweepMask) === sweep) || this._chRxFull[ci2] === 1;
        this._band[i] = band;
        if (!active) continue;
        if (x + 1 < cols && el[i + 1] !== 0) this._pair(i, i + 1, x, y);
        if (y + 1 < rows && el[i + cols] !== 0) this._pair(i, i + cols, x, y);
        this._tier3Cell(i, x, y);
        if (SUBSTANCES[id].cls === 'life') this._growLife(i, x, y, SUBSTANCES[id]);
      }
    }
  }

  _pressureAt(x, y) {
    const qi = Math.min(this.ph2 - 1, Math.max(0, (y / 4) | 0)) * this.pw + Math.min(this.pw - 1, Math.max(0, (x / 4) | 0));
    let p = this.pressure[qi] + this.airP[qi];
    const reg = this._region[y * this.cols + x];
    if (reg >= 0 && this._regions[reg]) p += this._regions[reg].pressure;
    return p;
  }

  /** Public pressure readout for view modes (sealed region + fields). */
  pressureAt(x, y) { return this._pressureAt(x, y); }

  /** Air field sample at a cell coordinate: {p, vx, vy} on the quarter grid. */
  airAt(x, y) {
    const qi = Math.min(this.ph2 - 1, Math.max(0, (y / 4) | 0)) * this.pw + Math.min(this.pw - 1, Math.max(0, (x / 4) | 0));
    return { p: this.airP[qi], vx: this.airVX[qi], vy: this.airVY[qi] };
  }

  // W32U-4 air pass: fan jets + sealed-pressure bleed feed the field; pressure
  // diffuses to neighbours, velocities decay (~0.92) and advect pressure.
  _airPass() {
    const { pw, ph2, airP, airVX, airVY, cols, rows, el } = this;
    // (b) fan-cell hook cells inject a steady local jet in the facing
    // direction (global wind direction when set, else +x). Local only — the
    // global windX/windY mechanism is untouched, not double-applied.
    if (this._k.fan) {
      const hasWind = this.windX !== 0 || this.windY !== 0;
      const fx = hasWind ? Math.sign(this.windX) : 1;
      const fy = hasWind ? Math.sign(this.windY) : 0;
      for (let i = 0; i < el.length; i++) {
        if (el[i] !== this._k.fan) continue;
        // W32U-6: fan GEAR objects are level-gated (0 = off, 1..3 = strength);
        // painted fan-cells (no object) keep the legacy full-strength jet.
        let fmult = 1;
        const foid = this.objMap[i];
        if (foid !== 0) { const fo = this.objects.get(foid); if (fo && fo.kind === 'fan') { if (fo.level <= 0) continue; fmult = fo.level / 3; } }
        const cx = i % cols, cy = (i / cols) | 0;
        for (let d = 1; d <= 6; d++) {
          const tx = cx + fx * d, ty = cy + fy * d;
          if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) break;
          const qi = ((ty / 4) | 0) * pw + ((tx / 4) | 0);
          airVX[qi] += fx * 0.22 * fmult; airVY[qi] += fy * 0.22 * fmult;
        }
      }
    }
    // (c) sealed-region pressure bleeds a little into airP so bursts show
    for (let r = 0; r < this._regions.length; r++) {
      const reg = this._regions[r];
      if (!reg || !(reg.pressure > 0) || !reg.cells.length) continue;
      const ci = reg.cells[0];
      const qi = (((ci / cols) | 0) >> 2) * pw + ((ci % cols) >> 2);
      if (qi >= 0 && qi < airP.length) airP[qi] += reg.pressure * 0.01;
    }
    for (let qy = 0; qy < ph2; qy++) {
      for (let qx = 0; qx < pw; qx++) {
        const qi = qy * pw + qx;
        let p = airP[qi];
        let sum = 0, cnt = 0;
        if (qx > 0) { sum += airP[qi - 1]; cnt++; }
        if (qx + 1 < pw) { sum += airP[qi + 1]; cnt++; }
        if (qy > 0) { sum += airP[qi - pw]; cnt++; }
        if (qy + 1 < ph2) { sum += airP[qi + pw]; cnt++; }
        if (cnt) p += (sum / cnt - p) * 0.18;
        // simple advection: pressure drifts downwind
        const vx = airVX[qi], vy = airVY[qi];
        if (vx > 0.05 && qx > 0) p += airP[qi - 1] * 0.04 * vx;
        else if (vx < -0.05 && qx + 1 < pw) p += airP[qi + 1] * -0.04 * vx;
        if (vy > 0.05 && qy > 0) p += airP[qi - pw] * 0.04 * vy;
        else if (vy < -0.05 && qy + 1 < ph2) p += airP[qi + pw] * -0.04 * vy;
        p *= 0.985;
        airP[qi] = p > 12 ? 12 : p < 0 ? 0 : p;
        let nvx = vx * 0.92, nvy = vy * 0.92;
        airVX[qi] = nvx > 3 ? 3 : nvx < -3 ? -3 : nvx;
        airVY[qi] = nvy > 3 ? 3 : nvy < -3 ? -3 : nvy;
      }
    }
  }

  _pair(i, j, x, y) {
    if (this.tick < this._rxCool[i] || this.tick < this._rxCool[j]) return;
    const aId = this.el[i], bId = this.el[j];
    if (aId === 0 || bId === 0) return;
    const aRec0 = SUBSTANCES[aId];
    const ctx = {
      mixed: Math.max(this.mix[i], this.mix[j]) / 255,
      temp: (this.temp[i] + this.temp[j]) * 0.5,
      electrified: (this.aux[i] & 64) !== 0 || (this.aux[j] & 64) !== 0 || this.pol[i] !== 0 || this.pol[j] !== 0,
      pressure: this._pressureAt(x, y),
      ignited: (this.aux[i] & 32) !== 0 || (this.aux[j] & 32) !== 0,
    };
    if (this._snd && ((aRec0.cls === 'liquid' && this.temp[j] > 150) || (SUBSTANCES[bId].cls === 'liquid' && this.temp[i] > 150))) this._snd.sizzle++;
    let out = null;
    try { out = resolvePair(aId, bId, ctx); } catch (e) { out = null; }
    if (!out) { this._tier3Pair(i, j); return; }
    if (out.kind === 'inert') { this._rxCool[i] = this.tick + 600; this._rxCool[j] = this.tick + 600; return; }
    const aRec = SUBSTANCES[aId], bRec = SUBSTANCES[bId];
    // HARDEN C2: rates in matter-reactions.js are authored at a 25 C reference.
    // Applied rate = base x Arrhenius factor 2^((T-25)/60) (clamped 0.05..40)
    // x surface-area factor: powder form 1.8, liquid-liquid 1.3, solid chunk
    // against a non-liquid/non-gas partner 0.7, otherwise 1.
    const baseRate = out.rate != null ? out.rate : 0.02;
    const arr = Math.min(40, Math.max(0.05, Math.pow(2, (ctx.temp - 25) / 60)));
    let surf = 1;
    const aPow = aRec.cls === 'powder' || (aRec.key || '').endsWith('-powder');
    const bPow = bRec.cls === 'powder' || (bRec.key || '').endsWith('-powder');
    if (aPow || bPow) surf = 1.8;
    else if (aRec.cls === 'liquid' && bRec.cls === 'liquid') surf = 1.3;
    else if ((aRec.cls === 'solid' && bRec.cls !== 'liquid' && bRec.cls !== 'gas') ||
             (bRec.cls === 'solid' && aRec.cls !== 'liquid' && aRec.cls !== 'gas')) surf = 0.7;
    if (this._rng() >= Math.min(1, baseRate * arr * surf)) return;
    if (out.heat) { this.temp[i] += out.heat; this.temp[j] += out.heat; }
    // Consumption requires a MATERIAL outcome (a conversion or a gas). A
    // heat-only or tint-only outcome (resistance heating, dyeing, indicator
    // flips, gas dissolving) must never annihilate the pair — the resolver's
    // default consume flags are only honoured when something is produced.
    const hasMaterial = out.outA != null || out.outB != null || (out.gas != null && out.gasN > 0);
    if (out.outA != null) this._convert(i, idOf(out.outA));
    else if (out.consumeA && hasMaterial) this._convert(i, 0);
    if (out.outB != null) this._convert(j, idOf(out.outB));
    else if (out.consumeB && hasMaterial) this._convert(j, 0);
    if (out.gas && out.gasN > 0) {
      const gId = idOf(out.gas);
      if (gId) {
        let placed = 0;
        // SND2: either reaction side being an acid routes the gas share to acidfizz (read by _write)
        const acidSide = (aRec.fams || []).includes('acid') || (bRec.fams || []).includes('acid') || aRec.acidStrength > 0 || bRec.acidStrength > 0;
        const prevAcid = this._sndAcid; if (acidSide) this._sndAcid = true;
        const cand = [i - this.cols, j - this.cols, i - 1, j + 1, i + 1, j - 1, i + this.cols, j + this.cols];
        for (let c = 0; c < cand.length && placed < out.gasN; c++) {
          const ci = cand[c];
          if (ci >= 0 && ci < this.el.length && this.el[ci] === 0) { this._write(ci, gId, false); this.temp[ci] = ctx.temp; placed++; }
        }
        this._sndAcid = prevAcid;
      }
    }
    // tint channel: the pair's colour consequence (indicators, dyes, dissolved
    // gases, golden-rain shimmer) — applied after conversions, never to air
    if (out.tintTo != null) {
      // W32U-2: surface-effect families tint only the surface they act on —
      // wetting lives on the non-liquid partner, a powder coat on the solid.
      // Tinting both cells repainted pooled liquids with wall colour and
      // fought real reaction tints (golden rain / indicator scenes).
      let ti = true, tj = true;
      if (out.fam === 'wetting' || out.fam === 'powder-coat') {
        const ci = this.el[i] !== 0 ? SUBSTANCES[this.el[i]].cls : '';
        const cj = this.el[j] !== 0 ? SUBSTANCES[this.el[j]].cls : '';
        if (out.fam === 'wetting') {
          if (ci === 'liquid' && cj !== 'liquid') ti = false;
          else if (cj === 'liquid' && ci !== 'liquid') tj = false;
        } else {
          if (ci === 'solid' && cj !== 'solid') tj = false;
          else if (cj === 'solid' && ci !== 'solid') ti = false;
        }
      }
      if (ti && this.el[i] !== 0) this.tint[i] = out.tintTo;
      if (tj && this.el[j] !== 0) this.tint[j] = out.tintTo;
    }
    // first Tier-1/Tier-2 firing per (card/fam, ~2 s) notifies the UI
    const cardKey = out.card || out.fam || null;
    if (cardKey && (out.tier === 1 || out.tier === 2)) {
      const last = this._cardLast.get(cardKey) || -9999;
      if (this.tick - last >= 120) {
        if (this._cardLast.size > 256) this._cardLast.clear(); // HARDEN cap: card throttle map bounded
        this._cardLast.set(cardKey, this.tick);
        try { this.onReaction({ card: out.card || null, fam: out.fam || null, aKey: aRec.key, bKey: bRec.key, x, y, tier: out.tier || 2, outA: out.outA != null ? out.outA : null, outB: out.outB != null ? out.outB : null, gas: out.gas != null ? out.gas : null, heat: out.heat != null ? out.heat : null, needs: out.needs != null ? out.needs : null, tick: this.tick }); } catch (e) {}
      }
    }
    // Non-material outcomes (tint-only, heat-only, …) convert neither cell and
    // spawn no gas — the physical floor (dissolution / corrosion) must still
    // run for such pairs, or Tier-2 tint families would silently switch it off.
    if (!(out.outA || out.outB || (out.gas && out.gasN > 0)) && out.kind !== 'inert') {
      try { this._floorPhysical(i, j); } catch (e) {}
    }
    this._act[i] = this.tick; this._act[j] = this.tick;
  }

  // Physical floor shared by the Tier-3 path and non-material Tier-1/2 outcomes:
  // dissolution + corrosion, both directions.
  _floorPhysical(i, j) {
    const aId = this.el[i], bId = this.el[j];
    if (aId === 0 || bId === 0) return;
    const A = SUBSTANCES[aId], B = SUBSTANCES[bId];
    this._dissolve(i, j, A, B);
    this._dissolve(j, i, B, A);
    this._corrode(i, j);
    this._corrode(j, i);
  }

  // Tier-3 floor behaviours for a pair the tiers above did not name.
  _tier3Pair(i, j) {
    const aId = this.el[i], bId = this.el[j];
    const A = SUBSTANCES[aId], B = SUBSTANCES[bId];
    // pH frontier mixing between liquids (+ neutralisation heat)
    if (A.cls === 'liquid' && B.cls === 'liquid' && this.ph[i] !== 255 && this.ph[j] !== 255) {
      const d = this.ph[j] - this.ph[i];
      if (d !== 0) {
        const stepv = Math.round(d * 0.1) || Math.sign(d);
        this.ph[i] += stepv; this.ph[j] -= stepv;
        if ((this.ph[i] < 65 && this.ph[j] > 75) || (this.ph[j] < 65 && this.ph[i] > 75)) {
          const heat = Math.abs(d) * 0.04;
          this.temp[i] += heat; this.temp[j] += heat;
        }
      }
    }
    // dissolution + corrosion (shared physical floor)
    this._floorPhysical(i, j);
  }

  _dissolve(solidI, solvI, S, L) {
    if (S.cls !== 'solid' && S.cls !== 'powder') return;
    if (L.cls !== 'liquid' || !(S.solubility > 0)) return;
    const sat = S.solubility * 1000;
    if (this.life[solvI] >= sat) return;
    if (this._rng() < S.solubility * 0.03) {
      this._solute[solvI] = this.el[solidI];
      this._dissT[solvI] = this.temp[solvI];
      this.life[solvI] = Math.min(65535, this.life[solvI] + 10);
      this._convert(solidI, 0);
    }
  }

  _corrode(metalI, otherI) {
    const M = SUBSTANCES[this.el[metalI]];
    if (!M.oxideKeyId) return;
    const O = SUBSTANCES[this.el[otherI]];
    const wet = O.cls === 'liquid';
    const oxy = O.cls === 'gas' && this._k.oxygen && this.el[otherI] === this._k.oxygen;
    if (!wet && !oxy) return;
    // oil coating blocks corrosion
    const dirs = [metalI - 1, metalI + 1, metalI - this.cols, metalI + this.cols];
    for (let d = 0; d < 4; d++) { const ni = dirs[d]; if (ni >= 0 && ni < this.el.length && (SUBSTANCES[this.el[ni]].fams || []).includes('oil')) return; }
    let rate = wet ? 2 : 1;
    if ((O.fams || []).includes('acid') || O.acidStrength > 0) rate *= 5;
    if (this._rng() < 0.05) {
      this.life[metalI] += rate;
      if (this.life[metalI] >= 600) this._convert(metalI, M.oxideKeyId);
    }
  }

  _tier3Cell(i, x, y) {
    const id = this.el[i];
    const rec = SUBSTANCES[id];
    if (rec.cls !== 'liquid' || this.life[i] === 0 || this._solute[i] === 0) return;
    // precipitation: cooled 15° below dissolution temp -> solute comes back out
    if (this.temp[i] < this._dissT[i] - 15) {
      const [pgx, pgy] = this._gravDom(); const below = i + pgy * this.cols + pgx;
      if (below >= 0 && below < this.el.length && this.el[below] === 0 && this._rng() < 0.05) {
        this._write(below, this._solute[i], false);
        if (this._snd) { this._snd.chime++; this._sx('chime', below); } // SND2: precipitation = crystal/plating event
        this.life[i] = Math.max(0, this.life[i] - 10);
        if (this.life[i] === 0) this._solute[i] = 0;
      }
      return;
    }
    // crystal growth at an evaporating edge (gas/empty neighbour, heavy load)
    if (this.life[i] > 50) {
      const dirs = [i - 1, i + 1, i - this.cols, i + this.cols];
      for (let d = 0; d < 4; d++) {
        const ni = dirs[d];
        if (ni < 0 || ni >= this.el.length) continue;
        if (this.el[ni] === 0 || SUBSTANCES[this.el[ni]].cls === 'gas') {
          if (this.el[ni] === 0 && this._rng() < 0.01) {
            this._write(ni, this._solute[i], false);
            if (this._snd) { this._snd.chime++; this._sx('chime', ni); } // SND2: crystal growth event
            this.life[i] = Math.max(0, this.life[i] - 20);
          }
          break;
        }
      }
    }
  }

  // Minimal plant growth: life-class cells with growth data spread upward /
  // sideways when water is adjacent (full rules live in reaction profiles).
  _growLife(i, x, y, rec) {
    const fams = rec.fams || [];
    if (!fams.includes('plant-matter') && rec.profile !== 'plant' && rec.profile !== 'fungus') return;
    let water = false, soil = false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d = 0; d < 4; d++) {
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      if (!this._in(nx, ny)) continue;
      const nRec = SUBSTANCES[this.el[ny * this.cols + nx]];
      if (nRec.cls === 'liquid' && (nRec.fams || []).includes('aqueous')) water = true;
      if (nRec.cls === 'powder' || nRec.cls === 'solid') soil = true;
    }
    if (!water) return;
    this.life[i]++;
    const fungus = rec.profile === 'fungus';
    if (this._rng() < (fungus ? 0.004 : 0.002)) {
      // grow against gravity into empty (plants) or into wet wood (fungus)
      const [ggx, ggy] = this._gravDom();
      const tx = x - ggx + (this._rng() < 0.3 ? (this._rng() < 0.5 ? ggy : -ggy) : 0);
      const ty = y - ggy + (this._rng() < 0.3 ? (this._rng() < 0.5 ? ggx : -ggx) : 0);
      if (this._in(tx, ty)) {
        const ti = ty * this.cols + tx;
        const tRec = SUBSTANCES[this.el[ti]];
        if (this.el[ti] === 0 || (fungus && (tRec.fams || []).includes('wood'))) this._write(ti, this.el[i], false);
      }
    }
    void soil;
  }

  // ---- electricity ---------------------------------------------------------------
  _electricPass() {
    const { cols, rows, el } = this;
    // clear last tick's charge marks
    for (let n = 0; n < this._elecCount; n++) { const i = this._elecList[n]; this.aux[i] &= ~64; this.pol[i] = 0; }
    this._elecCount = 0;
    // gather sources: battery terminals (object tier = strength), painted
    // battery hook cells, spark/plasma/lightning-class cells, spark points
    let ns = 0;
    const addSrc = (i, sign, str, arc) => { if (ns < this._srcList.length) { this._srcList[ns] = i; this._srcPol[ns] = sign; this._srcStr[ns] = str; this._srcArc[ns] = arc ? 1 : 0; ns++; } };
    for (const obj of this.objects.values()) {
      if (obj.kind === 'battery') {
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (el[i] === this._k.batteryPos && this._k.batteryPos) addSrc(i, 1, obj.level, 0);
          else if (el[i] === this._k.batteryNeg && this._k.batteryNeg) addSrc(i, -1, obj.level, 0);
        }
      } else if (obj.kind === 'sensor' && obj.firing) {
        // W32U-4: a firing heat sensor's copper output acts as a + source
        for (let c = 0; c < obj.cells.length; c++) {
          const i = obj.cells[c];
          if (el[i] === this._k.copper && this._k.copper) addSrc(i, 1, 2, 0);
        }
      }
    }
    for (let s = this._sparks.length - 1; s >= 0; s--) {
      if (this.tick > this._sparks[s].until) { this._sparks.splice(s, 1); continue; }
      addSrc(this._sparks[s].y * cols + this._sparks[s].x, 1, 3, 1);
    }
    // electric-class cells are sources too (collected during a cheap scan)
    for (let i = 0; i < el.length; i++) {
      const id = el[i];
      if (id === 0) continue;
      const rec = SUBSTANCES[id];
      if (rec.cls === 'electric') {
        // a lamp object's neon core is a load, never a source
        const oid = this.objMap[i];
        if (oid === 0 || (this.objects.get(oid) || {}).kind !== 'lamp') addSrc(i, 1, 2, 1);
      }
      else if (id === this._k.batteryPos) addSrc(i, 1, 2, 0);
      else if (id === this._k.batteryNeg) addSrc(i, -1, 2, 0);
    }
    if (ns === 0) { // no sources: nothing is powered, lamps go dark
      this._powered.clear();
      for (const obj of this.objects.values()) if (obj.kind === 'lamp') obj.light = false;
      return;
    }
    // frontier BFS with loss
    const stampVal = this.tick + 1;
    let qh = 0, qt = 0;
    for (let s = 0; s < ns; s++) {
      const i = this._srcList[s];
      this._charge[i] = this._srcStr[s]; this._stamp[i] = stampVal;
      this.pol[i] = this._srcPol[s]; this._arc[i] = this._srcArc[s];
      this._queue[qt++] = i;
    }
    let budget = 24000;
    while (qh < qt && budget-- > 0) {
      const i = this._queue[qh++];
      const ch = this._charge[i];
      if (ch < 0.06) continue;
      const x = i % cols, y = (i / cols) | 0;
      this.aux[i] |= 64;
      if (this._elecCount < this._elecList.length) this._elecList[this._elecCount++] = i;
      const dirs = [i - 1, i + 1, i - cols, i + cols];
      for (let d = 0; d < 4; d++) {
        const ni = dirs[d];
        if (ni < 0 || ni >= el.length) continue;
        if ((d === 0 && x === 0) || (d === 1 && x === cols - 1)) continue;
        const nId = el[ni];
        if (nId === 0) continue;
        // W32U-4: cells of an OPEN switch object (level 0) are non-conductive
        const nObj = this.objMap[ni];
        if (nObj !== 0) { const oo = this.objects.get(nObj); if (oo && oo.kind === 'switch' && oo.level === 0) continue; }
        const nRec = SUBSTANCES[nId];
        const cond = nRec.electric || 0;
        if (cond < 0.3 && nRec.cls !== 'liquid') continue;
        // excellent conductors (electric>=0.9: copper, aluminium...) carry charge
        // across scene-scale wire runs with ~0.2%/hop loss; poorer conductors and
        // liquids keep the steep loss curve (electrolysis stays a surface effect)
        const flow = ch * (cond >= 0.9 ? 0.998 : 0.45 + 0.5 * Math.max(cond, 0.15));
        if (this._stamp[ni] === stampVal && this._charge[ni] >= flow) continue;
        this._stamp[ni] = stampVal; this._charge[ni] = flow; this._arc[ni] = this._arc[i];
        if (this.pol[ni] === 0) this.pol[ni] = this.pol[i];
        // Joule heating in poor conductors — skipped for heater-coil object
        // cells: their temperature is governed by the coil's level drive in
        // the temp pass (W32U-5: heater-coil level 0 must be a true off).
        if (cond < 0.9) { const jo = nObj !== 0 ? this.objects.get(nObj) : null; if (!jo || jo.kind !== 'heater-coil') this.temp[ni] += flow * (1 - cond) * 1.5; }
        this._queue[qt++] = ni;
        this._act[ni] = this.tick;
      }
    }
    if (this._snd) { const newly = Math.max(0, this._elecCount - (this._prevElec || 0)); this._snd.zap += newly; if (newly > 0 && this._elecCount > 0) this._sx('zap', this._elecList[0]); }
    this._prevElec = this._elecCount;
    // W32U-4: per-object powered state — an object is powered when any of its
    // cells carried charge this pass (they are all in the electrified list).
    this._powered.clear();
    for (let n = 0; n < this._elecCount; n++) {
      const oid = this.objMap[this._elecList[n]];
      if (oid !== 0) this._powered.add(oid);
    }
    for (const obj of this.objects.values()) if (obj.kind === 'lamp') obj.light = this._powered.has(obj.id);
    // electrolysis fallback + arc ignition on the electrified frontier
    for (let n = 0; n < this._elecCount; n++) {
      const i = this._elecList[n];
      const rec = SUBSTANCES[el[i]];
      const x = i % cols, y = (i / cols) | 0;
      const dirs = [i - 1, i + 1, i - cols, i + cols];
      for (let d = 0; d < 4; d++) {
        const ni = dirs[d];
        if (ni < 0 || ni >= el.length) continue;
        if ((d === 0 && x === 0) || (d === 1 && x === cols - 1)) continue;
        const nRec = SUBSTANCES[el[ni]];
        // arc ignition of flammable gas next to charge — only on DISCHARGE
        // networks (lightning/spark/plasma, _arc=1). Battery DC networks never
        // arc, so a battery's own electrolysis hydrogen is not torched by the
        // circuit that produced it.
        if (nRec.cls === 'gas' && nRec.flammability > 0 && this._arc[i] === 1 && this._rng() < 0.08) {
          if (this._snd) { this._snd.whoosh++; this._snd.zap += 4; if (this._region && this._region[ni] >= 0) this._snd.whooshConf = true; }
          this.aux[ni] |= 32; this.life[ni] = nRec.burnTime || 30; this._act[ni] = this.tick;
        }
        // electrolysis: electrified liquid beside a signed conductive solid.
        // Stoichiometric: cathode (pol<0) makes H2 at p=0.05, anode O2 at
        // p=0.025 -> H2:O2 = 2:1 in expectation (2H2O -> 2H2 + O2). The gas
        // replaces the reacting water cell (a bubble on the electrode surface)
        // and rises through the liquid on its own.
        if (rec.cls === 'liquid' && nRec.cls === 'solid' && (nRec.electric || 0) >= 0.3 && this.pol[ni] !== 0) {
          const isWater = el[i] === this._k.water || (rec.fams || []).includes('aqueous');
          if (isWater && this._rng() < (this.pol[ni] < 0 ? 0.05 : 0.025)) {
            const gasId = this.pol[ni] < 0 ? this._k.hydrogen : this._k.oxygen;
            if (gasId) { const t = this.temp[i]; this._write(i, gasId, false); this.temp[i] = t; }
          }
        }
      }
    }
  }

  // ---- W32U-6 ambient-air oxygen model --------------------------------------
  // Empty cells are AIR. airO2[i] is the oxygen budget of an empty/gas cell
  // (0.21 = fresh air). Budgets diffuse between neighbouring empty/gas cells
  // (gas-phase interdiffusion) and empty cells relax back toward 0.21 — but
  // only when they are NOT inside an enclosed pocket (_region >= 0): air in a
  // sealed interior does not replenish.
  _o2diff(i, j) {
    const a = this.el[i], b = this.el[j];
    if (!(a === 0 || SUBSTANCES[a].cls === 'gas')) return;
    if (!(b === 0 || SUBSTANCES[b].cls === 'gas')) return;
    const d = (this.airO2[i] - this.airO2[j]) * 0.09;
    if (d !== 0) { this.airO2[i] -= d; this.airO2[j] += d; }
  }

  _airO2Pass() {
    const { cols, rows, el, airO2 } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const id = el[i];
        if (id !== 0 && SUBSTANCES[id].cls !== 'gas') { airO2[i] = 0; continue; }
        if (id === 0 && this._region[i] < 0) airO2[i] += (0.21 - airO2[i]) * 0.04;
        if (x + 1 < cols) this._o2diff(i, i + 1);
        if (y + 1 < rows) this._o2diff(i, i + cols);
      }
    }
  }

  // Hydrogen combustion with AIR oxygen. An ignited hydrogen cell (burning
  // bit, spark/fire contact, or >= ignition temperature) may draw oxygen from
  // its neighbours' air budgets at the real 2 H2 : 1 O2 stoichiometry (0.5
  // budget units per H2 cell), bounded per tick (mixing-limited). With no
  // oxygen available and no fire/oxygen neighbour it is SMOTHERED — hydrogen
  // never burns alone. Pairs touching a real oxygen cell are left to the
  // existing H2+O2 reaction path.
  _combustionPass() {
    const H2 = this._k.hydrogen, O2 = this._k.oxygen, steam = this._k.steam;
    if (!H2) return;
    const { cols, rows, el, aux, temp, life, airO2 } = this;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (el[i] !== H2) continue;
        if (!((aux[i] & 32) || temp[i] >= 500)) continue;
        let avail = 0, hasO2 = false, hasFire = false;
        const nb = [];
        if (x > 0) nb.push(i - 1);
        if (x + 1 < cols) nb.push(i + 1);
        if (y > 0) nb.push(i - cols);
        if (y + 1 < rows) nb.push(i + cols);
        for (let n = 0; n < nb.length; n++) {
          const j = nb[n], nid = el[j];
          if (nid === O2 && O2) { hasO2 = true; continue; }
          if (nid !== 0 && SUBSTANCES[nid].cls === 'fire') hasFire = true;
          if (nid === 0 || SUBSTANCES[nid].cls === 'gas') avail += airO2[j];
        }
        if (hasO2) continue; // the H2+O2 pair reaction owns this cell
        if (avail >= 0.5) {
          if (this._rng() >= 0.6) continue; // mixing-limited burn rate
          let need = 0.5;
          for (let n = 0; n < nb.length && need > 0; n++) {
            const j = nb[n];
            if (airO2[j] > 0 && (el[j] === 0 || SUBSTANCES[el[j]].cls === 'gas')) {
              const d = Math.min(airO2[j], need); airO2[j] -= d; need -= d;
            }
          }
          this._convert(i, steam || 0);
          if (steam) temp[i] = Math.min(1200, temp[i] + 250);
          for (let n = 0; n < nb.length; n++) { // flame front ignites neighbours
            const j = nb[n];
            if (el[j] === H2 && this._rng() < 0.5) { aux[j] |= 32; life[j] = 40; }
          }
          const qi = Math.min(this.ph2 - 1, (y >> 2)) * this.pw + Math.min(this.pw - 1, (x >> 2));
          this.pressure[qi] += 0.04;
          if (this._snd) { this._snd.pop += 0.2; this._snd.whoosh += 0.5; }
        } else if ((aux[i] & 32) && !hasFire) {
          aux[i] &= ~32; // smothered: no oxygen to sustain the burn
        }
      }
    }
  }

  // ---- W32U-6 gear behaviour pass (stirrer / hotplate / condenser /
  // filterstand (passive: the filter-paper cell mechanism does the work) /
  // tripod / ice-bath / probe + thermometer readings) -------------------------
  _gearPass() {
    const { cols, el, temp } = this;
    const HOTPLATE_T = [0, 50, 90, 160];
    for (const obj of this.objects.values()) {
      switch (obj.kind) {
        case 'stirrer': {
          if (obj.level <= 0) continue;
          // find a vessel whose interior overlaps the band just above the base
          let target = null;
          for (const v of this.objects.values()) {
            if (!v.interior || !v.interior.length || v === obj) continue;
            for (let c = 0; c < v.interior.length; c++) {
              const i = v.interior[c], ix = i % cols, iy = (i / cols) | 0;
              if (iy >= obj.anchor.y - 9 && iy < obj.anchor.y && ix >= obj.anchor.x - 3 && ix < obj.anchor.x + obj.w + 3) { target = v; break; }
            }
            if (target) break;
          }
          if (!target) continue;
          for (let c = 0; c < target.interior.length; c++) { const i = target.interior[c]; if (el[i] !== 0) this.mix[i] = 255; }
          obj._st = (obj._st || 0) + 1;
          const period = obj.level === 3 ? 3 : obj.level === 2 ? 5 : 9;
          if (obj._st % period === 0) {
            const cx = target.anchor.x + (target.w >> 1), cy = target.anchor.y + (target.h >> 1);
            const r = Math.max(2, (Math.min(target.w, target.h) >> 1) - 1);
            this.stir(cx, cy, r);
          }
          break;
        }
        case 'hotplate': {
          if (obj.level <= 0) continue;
          const target = HOTPLATE_T[obj.level] || 90;
          for (let c = 0; c < obj.cells.length; c++) { const i = obj.cells[c]; temp[i] += (target - temp[i]) * 0.25; }
          // heat whatever rests on the plate (loose cells AND a vessel base),
          // evenly across the whole surface
          const ry = obj.anchor.y - 1;
          if (ry >= 0) for (let x = obj.anchor.x; x < obj.anchor.x + obj.w; x++) {
            const i = ry * cols + x;
            if (el[i] !== 0) { temp[i] += (target - temp[i]) * 0.06; this._dirtyChunkFor(i); }
          }
          break;
        }
        case 'condenser': {
          // cooling jacket: channel contents are pulled toward 30 C; gas with
          // a condenseTo target then condenses (temp pass) or converts here at
          // a bounded rate; liquid drains out of the bottom gap by gravity.
          for (let c = 0; c < (obj.interior || []).length; c++) {
            const i = obj.interior[c], id = el[i];
            if (id === 0) continue;
            temp[i] += (30 - temp[i]) * 0.12;
            const rec = SUBSTANCES[id];
            if (rec.cls === 'gas' && rec.condenseToId != null && this._rng() < 0.05) this._convert(i, rec.condenseToId);
          }
          break;
        }
        case 'tripod': {
          // a burner burning below spreads its heat across the gauze, so a
          // vessel base above the gauze is heated evenly across its width.
          let burner = null;
          for (const b of this.objects.values()) {
            if (b.kind !== 'burner' || b.level <= 0) continue;
            if (b.anchor.y <= obj.anchor.y) continue;
            if (b.anchor.y - (obj.anchor.y + obj.h) > 14) continue;
            if (b.anchor.x + b.w < obj.anchor.x || b.anchor.x > obj.anchor.x + obj.w) continue;
            burner = b; break;
          }
          if (!burner) continue;
          const target = (burner.level === 1 ? 400 : burner.level === 2 ? 700 : 1000) * 0.8;
          for (let c = 0; c < obj.cells.length; c++) { const i = obj.cells[c]; temp[i] += (target - temp[i]) * 0.15; }
          // spread evenly across the FULL base of any vessel resting on the ring
          for (const v of this.objects.values()) {
            if (v === obj) continue;
            if (v.anchor.y + v.h - 1 !== obj.anchor.y - 1) continue;
            const brow = v.anchor.y + v.h - 1;
            for (let c = 0; c < v.cells.length; c++) {
              const i = v.cells[c];
              if (((i / cols) | 0) === brow) temp[i] += (target - temp[i]) * 0.15;
            }
          }
          const ry = obj.anchor.y - 1; // any other gear base resting on the ring
          if (ry >= 0) for (let x = obj.anchor.x; x < obj.anchor.x + obj.w; x++) {
            const i = ry * cols + x;
            if (this.objMap[i] !== 0 && this.objMap[i] !== obj.id) temp[i] += (target - temp[i]) * 0.12;
          }
          break;
        }
        case 'ice-bath': {
          for (let c = 0; c < (obj.interior || []).length; c++) {
            const i = obj.interior[c];
            if (el[i] !== 0) temp[i] += (0 - temp[i]) * 0.02; // bounded pull toward 0 C
          }
          break;
        }
        case 'ph-probe': {
          obj.reading = null;
          const tip = obj.cells[obj.cells.length - 1];
          const tx = tip % cols, ty = (tip / cols) | 0;
          const cand = [tip, tip - 1, tip + 1, tip - cols, tip + cols];
          for (let n = 0; n < cand.length; n++) {
            const j = cand[n];
            if (j < 0 || j >= el.length) continue;
            if (n === 1 && tx === 0) continue;
            if (n === 2 && tx === cols - 1) continue;
            const rec = SUBSTANCES[el[j]];
            if (rec && rec.cls === 'liquid') { obj.reading = this.ph[j] !== 255 ? this.ph[j] / 10 : (rec.ph != null ? rec.ph : null); break; }
          }
          break;
        }
        case 'thermometer': {
          let bulb = obj.cells[obj.cells.length - 1];
          for (let c = 0; c < obj.cells.length; c++) if (el[obj.cells[c]] === this._k.thermoBulb) { bulb = obj.cells[c]; break; }
          const bx = bulb % cols, by = (bulb / cols) | 0;
          let sum = 0, cnt = 0;
          const cand = [bulb - 1, bulb + 1, bulb - cols, bulb + cols];
          for (let n = 0; n < cand.length; n++) {
            const j = cand[n];
            if (j < 0 || j >= el.length) continue;
            if ((n === 0 && bx === 0) || (n === 1 && bx === cols - 1)) continue;
            if (el[j] !== 0 && this.objMap[j] === 0) { sum += temp[j]; cnt++; }
          }
          obj.reading = Math.round((cnt ? sum / cnt : temp[bulb]) * 10) / 10;
          void by;
          break;
        }
        default: break;
      }
    }
  }

  // ---- W32U-6 rigid bodies ---------------------------------------------------
  // AABB bodies (NO rotation/tipping — honest PARTIAL). Integrated per tick:
  // gravity, collision vs solid/powder cells + gear cells + world bounds +
  // other bodies, buoyancy by material density vs the liquid's density.
  // Occupied cells are marked in bodyMap and are solid to the cell sim.
  placeBody(kind, x, y) {
    const spec = {
      'block-wood': { w: 12, h: 8, density: 0.6, ball: false },
      'block-steel': { w: 12, h: 8, density: 7.8, ball: false },
      'ball': { w: 8, h: 8, density: 0.95, ball: true },
    }[kind];
    if (!spec) return null;
    const b = { id: this._nextBody++, kind, x: x | 0, y: y | 0, w: spec.w, h: spec.h, vx: 0, vy: 0, density: spec.density, ball: spec.ball, resting: false };
    this.bodies.push(b);
    this._rebuildBodyMap();
    return b;
  }

  removeBody(id) {
    const k = this.bodies.findIndex((b) => b.id === id);
    if (k < 0) return false;
    this.bodies.splice(k, 1);
    this._rebuildBodyMap();
    return true;
  }

  _bodySolidAt(cx, cy, self) {
    if (cx < 0 || cx >= this.cols || cy >= this.rows) return true;
    if (cy < 0) return false;
    const i = cy * this.cols + cx;
    if (this.objMap[i] !== 0) return true;
    const id = this.el[i];
    if (id !== 0) { const cls = SUBSTANCES[id].cls; if (cls === 'solid' || cls === 'special' || cls === 'powder') return true; }
    for (let n = 0; n < this.bodies.length; n++) {
      const o = this.bodies[n];
      if (o === self) continue;
      if (cx >= o.x && cx < o.x + o.w && cy >= o.y && cy < o.y + o.h) return true;
    }
    return false;
  }

  _bodyHit(b, px, py) {
    const x0 = Math.floor(px), x1 = Math.ceil(px + b.w) - 1;
    const y0 = Math.floor(py), y1 = Math.ceil(py + b.h) - 1;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (this._bodySolidAt(cx, cy, b)) return true;
    return false;
  }

  _rebuildBodyMap() {
    this.bodyMap.fill(0);
    for (let n = 0; n < this.bodies.length; n++) {
      const b = this.bodies[n];
      const x0 = Math.max(0, Math.floor(b.x)), x1 = Math.min(this.cols - 1, Math.ceil(b.x + b.w) - 1);
      const y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(this.rows - 1, Math.ceil(b.y + b.h) - 1);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { this.bodyMap[cy * this.cols + cx] = b.id; this._dirtyChunkFor(cy * this.cols + cx); }
    }
  }

  _bodyPass() {
    if (!this.bodies.length) return;
    const G = 0.35;
    for (let n = 0; n < this.bodies.length; n++) {
      const b = this.bodies[n];
      // buoyancy: fraction of the AABB sitting in liquid + that liquid's density
      let liqCells = 0, liqDens = 0;
      const x0 = Math.max(0, Math.floor(b.x)), x1 = Math.min(this.cols - 1, Math.ceil(b.x + b.w) - 1);
      const y0 = Math.max(0, Math.floor(b.y)), y1 = Math.min(this.rows - 1, Math.ceil(b.y + b.h) - 1);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const rec = SUBSTANCES[this.el[cy * this.cols + cx]];
        if (rec && rec.cls === 'liquid') { liqCells++; liqDens += rec.density || 1; }
      }
      const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
      const submerged = liqCells / area;
      const ld = liqCells ? liqDens / liqCells : 1;
      const netA = submerged > 0 ? G * (1 - (ld / b.density) * submerged) : G;
      const supported = this._bodyHit(b, b.x, b.y + 0.06);
      if (supported && b.vy >= 0 && submerged === 0) {
        b.resting = true; b.vy = 0; // hard rest on a solid support: bit-stable
      } else if (submerged > 0 && Math.abs(netA) < 0.03 && Math.abs(b.vy) < 0.05) {
        b.resting = true; b.vy = 0; // floating equilibrium: hold position
      } else {
        b.resting = false;
        b.vy += netA;
        if (submerged > 0.05) { b.vy *= 0.85; b.vx *= 0.9; }
        if (b.vy > 3) b.vy = 3; else if (b.vy < -2.5) b.vy = -2.5;
      }
      if (!b.resting) {
        // vertical integration in <=1-cell substeps
        let rem = b.vy;
        while (rem !== 0) {
          const stepv = Math.max(-1, Math.min(1, rem));
          if (this._bodyHit(b, b.x, b.y + stepv)) { b.vy = 0; break; }
          b.y += stepv; rem -= stepv;
        }
        // horizontal integration
        rem = b.vx;
        while (rem !== 0) {
          const stepv = Math.max(-1, Math.min(1, rem));
          if (this._bodyHit(b, b.x + stepv, b.y)) { b.vx = 0; break; }
          b.x += stepv; rem -= stepv;
        }
        if (b.ball) { // roll: slope sampling under the ball
          const gyAt = (cx) => { for (let d = 0; d <= 6; d++) { const cy = Math.floor(b.y + b.h) + d; if (this._bodySolidAt(cx, cy, b)) return cy; } return Math.floor(b.y + b.h) + 6; };
          if (this._bodyHit(b, b.x, b.y + 0.06)) {
            const gl = gyAt(Math.floor(b.x) + 1), gr = gyAt(Math.floor(b.x + b.w) - 2);
            b.vx += (gr - gl) * 0.06;
            if (b.vx > 1.5) b.vx = 1.5; else if (b.vx < -1.5) b.vx = -1.5;
          }
          b.vx *= 0.99;
        } else b.vx *= 0.8;
      } else if (b.ball && supported) {
        const gyAt = (cx) => { for (let d = 0; d <= 6; d++) { const cy = Math.floor(b.y + b.h) + d; if (this._bodySolidAt(cx, cy, b)) return cy; } return Math.floor(b.y + b.h) + 6; };
        const gl = gyAt(Math.floor(b.x) + 1), gr = gyAt(Math.floor(b.x + b.w) - 2);
        if (gr !== gl) { b.resting = false; b.vx += (gr - gl) * 0.06; }
      }
    }
    this._rebuildBodyMap();
  }

  // ---- pressure field + sealed regions --------------------------------------------
  _pressurePass() {
    const p = this.pressure;
    for (let i = 0; i < p.length; i++) p[i] *= 0.9;
    // W32U-5 perf: region recomputation is a full-grid BFS and _sealedDirty
    // is raised by every gas write (fire scenes set it nearly every tick).
    // Sealed pressure is a slow field (builds over 100s of ticks), so cap
    // recomputation at a 6-tick cadence — physics unchanged, ~1/6 the cost.
    if ((this._sealedDirty || (this._hasLids() && this.tick - this._lastSealedTick >= 30)) && this.tick - this._lastSealedTick >= 6) this._recomputeRegions();
    // lid pop check
    for (let r = 0; r < this._regions.length; r++) {
      const reg = this._regions[r];
      if (reg.pressure > 2.5 && reg.lidObj) {
        const obj = this.objects.get(reg.lidObj);
        if (obj) {
          for (let c = 0; c < obj.cells.length; c++) { const li = obj.cells[c]; if (this.objMap[li] !== 0) this._chObj[this._chunkOf(li)]--; this.objMap[li] = 0; }
          this.objects.delete(reg.lidObj);
          // a few lid cells burst away, gas rushes out
          for (let c = 0; c < obj.cells.length; c += 3) this._convert(obj.cells[c], 0);
          this.lastLidPop = { x: obj.anchor.x, y: obj.anchor.y, tick: this.tick };
          if (this._snd) { this._snd.pop++; this._snd.vent += 8; this._snd.ventP = Math.max(this._snd.ventP, reg.pressure || 0); }
        }
        reg.pressure = 0;
      } else if (reg.pressure > 1.8 && reg.lidObj) {
        // rattle: jitter lid cells sideways by pressure field nudge (visual via temp band)
        const obj = this.objects.get(reg.lidObj);
        if (obj && this._rng() < 0.3) this.pressure[((obj.anchor.y / 4) | 0) * this.pw + ((obj.anchor.x / 4) | 0)] += 0.01;
      }
    }
  }

  _hasLids() { for (const o of this.objects.values()) if (o.kind.startsWith('lid')) return true; return false; }

  _recomputeRegions() {
    this._sealedDirty = false; this._lastSealedTick = this.tick;
    const { cols, rows, el } = this;
    const prevGas = this._regions.map((r) => r.gasCount);
    const prevP = this._regions.map((r) => r.pressure);
    this._region.fill(-1);
    this._regions = [];
    const stampVal = this.tick + 100000;
    for (let s = 0; s < el.length; s++) {
      if (el[s] === 0 || SUBSTANCES[el[s]].cls !== 'gas' || this._region[s] !== -1) continue;
      // BFS the connected gas/empty pocket
      let qh = 0, qt = 0; this._queue[qt++] = s; this._stamp[s] = stampVal;
      const cells = [];
      let enclosed = true, lidObj = 0;
      while (qh < qt) {
        const i = this._queue[qh++];
        cells.push(i);
        const x = i % cols, y = (i / cols) | 0;
        if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) enclosed = false;
        const dirs = [i - 1, i + 1, i - cols, i + cols];
        for (let d = 0; d < 4; d++) {
          const ni = dirs[d];
          if (ni < 0 || ni >= el.length) { enclosed = false; continue; }
          if ((d === 0 && x === 0) || (d === 1 && x === cols - 1)) continue;
          const nId = el[ni];
          if (nId === 0 || SUBSTANCES[nId].cls === 'gas') {
            if (this._stamp[ni] !== stampVal) { this._stamp[ni] = stampVal; this._queue[qt++] = ni; }
          } else if (SUBSTANCES[nId].cls !== 'solid' && SUBSTANCES[nId].cls !== 'special') {
            enclosed = false; // leaks into liquid/fire/etc.
          }
          if (this.objMap[ni] !== 0) { const o = this.objects.get(this.objMap[ni]); if (o && o.kind.startsWith('lid')) lidObj = o.id; }
        }
      }
      if (!enclosed || cells.length === 0) { for (const i of cells) this._region[i] = -2; continue; }
      const rid = this._regions.length;
      for (const i of cells) this._region[i] = rid;
      // pressure carries over by matching centroid-ish (first cell) region
      let pressure = 0;
      const old = prevGas.length ? rid : -1;
      if (old >= 0 && prevP[old] != null) pressure = prevP[old];
      const gasCount = cells.length;
      if (old >= 0 && prevGas[old] != null && gasCount > prevGas[old]) pressure += (gasCount - prevGas[old]) * 0.02;
      this._regions.push({ cells, pressure, gasCount, lidObj });
    }
  }

  blast(cx, cy, radius) {
    if (this._snd) { this._snd.boomE += Math.max(1, radius | 0) * 6; if (radius <= 3) this._snd.pop++; }
    const { cols, rows, el } = this;
    const r = Math.max(1, radius | 0);
    const smokeId = this._k.smoke, fireId = this._k.fire;
    for (let y = Math.max(0, cy - r); y <= Math.min(rows - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(cols - 1, cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;
        const i = y * cols + x;
        const id = el[i];
        const fall = 1 - dist / (r + 1);
        this.temp[i] += 500 * fall;
        // W32U-5: blast heats cells in place (no _write) — wake the chunk and
        // feed its temperature max so the heat is processed, not slept on.
        this._dirtyChunkFor(i);
        { const ci = this._chunkOf(i); const dev = Math.abs(this.temp[i] - this.ambientT); if (dev > this._chTmp[ci]) this._chTmp[ci] = dev; }
        if (id === 0) { if (fireId && this._rng() < 0.3 * fall) this._write(i, fireId, false); continue; }
        const rec = SUBSTANCES[id];
        if (this._snd) { this._snd.boomE += fall * 2; this._sx('boom', cy * this.cols + cx); if (this.objMap[i] !== 0) this._snd.clink++; }
        if (rec.blast > 0 && dist > 0.5) { if (this._blasts.length < 64) this._blasts.push({ x, y, r: rec.blast, at: this.tick + 2 }); if (this._snd) this._sndBreak(rec, i); this._convert(i, 0); continue; }
        if (this._rng() > (rec.blastResistance || 0)) {
          // debris throw: relocate light cells outward into empty space, capped
          let placed = false;
          if (rec.cls !== 'solid' || this._rng() < 0.4) {
            const steps = Math.min(6, 1 + ((this._rng() * r * fall) | 0));
            const ux = dist > 0 ? dx / dist : 0, uy = dist > 0 ? dy / dist : -1;
            const tx = Math.round(x + ux * steps), ty = Math.round(y + uy * steps);
            if (this._in(tx, ty)) { const ti = ty * cols + tx; const rubberOk = !(rec.fams || []).includes('rubber') || this._rng() < 0.8; if (el[ti] === 0 && rubberOk) { this._swap(i, ti); placed = true; } }
          }
          if (!placed) { if (this._snd) this._sndBreak(rec, i); this._convert(i, this._rng() < 0.25 && smokeId ? smokeId : 0); }
        }
        this._act[i] = this.tick;
      }
    }
    const qi = Math.min(this.ph2 - 1, Math.max(0, (cy / 4) | 0)) * this.pw + Math.min(this.pw - 1, Math.max(0, (cx / 4) | 0));
    this.pressure[qi] += r * 0.4;
    // W32U-4: radial air impulse + pressure spike into the air field
    const ar = Math.max(1, Math.ceil(r / 4));
    const acx = Math.min(this.pw - 1, Math.max(0, (cx / 4) | 0)), acy = Math.min(this.ph2 - 1, Math.max(0, (cy / 4) | 0));
    for (let qy = Math.max(0, acy - ar); qy <= Math.min(this.ph2 - 1, acy + ar); qy++) {
      for (let qx = Math.max(0, acx - ar); qx <= Math.min(this.pw - 1, acx + ar); qx++) {
        const ddx = qx - acx, ddy = qy - acy;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > ar) continue;
        const fall = 1 - dd / (ar + 1);
        const ai2 = qy * this.pw + qx;
        this.airP[ai2] += (r * 0.35 + 0.4) * fall;
        const ux = dd > 0 ? ddx / dd : 0, uy = dd > 0 ? ddy / dd : -1;
        this.airVX[ai2] += ux * 2.2 * fall;
        this.airVY[ai2] += uy * 2.2 * fall;
      }
    }
    this._sealedDirty = true;
  }

  // ---- world objects (Lab Gear) ---------------------------------------------------
  _stampFor(kind, sizeMul = 1) {
    const G = this._k.glass, M = this._k.metal, W = this._k.wood;
    const cells = []; // [dx, dy, id]
    const add = (x, y, id) => { if (id) cells.push([x, y, id]); };
    /* HOTFIX (portrait phones): vessel stamps scale UP on narrow grids so a
       beaker stays ~15-20% of the world width instead of a few px on screen.
       gs = 1 at cols >= 400 (desktop + proof grids bit-identical to before);
       only vessel kinds scale — burner/battery/electrodes keep fixed sizes. */
    const gs = this.cols >= 400 ? 1 : Math.min(2, Math.max(1, (480 / this.cols) * 0.92));
    // W32U-5: vessel kinds additionally scale by sizeMul (SIZE_MUL ladder
    // S 1.4 / M 2.0 / L 2.6 from placeObject opts.size, or a raw opts.scale);
    // sizeMul 1 (the default) is byte-identical
    // to the pre-W32U-5 stamps. Non-vessel kinds ignore sizeMul.
    const SC = (v) => Math.max(2, Math.round(v * gs * (VESSEL_KINDS.has(kind) ? sizeMul : 1)));
    const beaker = (w, h, notch) => {
      for (let x = 0; x < w; x++) add(x, h - 1, G);
      for (let y = 0; y < h; y++) { add(0, y, G); if (!(notch && y === 1)) add(w - 1, y, G); }
      return { w, h };
    };
    switch (kind) {
      case 'beaker-s': return { cells, ...beaker(SC(18), SC(12), true) };
      case 'beaker-m': return { cells, ...beaker(SC(26), SC(18), true) };
      case 'beaker-l': return { cells, ...beaker(SC(36), SC(24), true) };
      case 'flask': {
        const w = SC(26), h = SC(20);
        for (let y = 0; y < h; y++) {
          const t = (h - 1 - y) / (h - 1);
          const inset = Math.min(Math.floor(Math.pow(t, 1.4) * (w / 2 - 3)), w / 2 - 3);
          add(inset, y, G); add(w - 1 - inset, y, G);
        }
        for (let x = 0; x < w; x++) add(x, h - 1, G);
        return { cells, w, h };
      }
      case 'testtube': {
        const w = SC(6), h = SC(16);
        for (let y = 0; y < h; y++) { add(0, y, G); add(w - 1, y, G); }
        for (let x = 0; x < w; x++) add(x, h - 1, G);
        return { cells, w, h };
      }
      case 'roundflask': {
        const w = SC(24), h = SC(22);
        const cx = (w - 1) / 2, neckHalf = w * 2.5 / 24, neckH = Math.round(h * 5 / 22);
        const cy = Math.round(h * 13 / 22), rad = Math.round(w * 10 / 24), bcx = Math.floor(cx);
        for (let y = 0; y < neckH; y++) { add(Math.round(cx - neckHalf), y, G); add(Math.round(cx + neckHalf), y, G); }
        for (let y = neckH; y < h; y++) {
          const dy = y - cy, half = Math.floor(Math.sqrt(Math.max(0, rad * rad - dy * dy)));
          add(bcx - half, y, G); add(bcx + half, y, G);
        }
        return { cells, w, h };
      }
      case 'cylinder': return { cells, ...beaker(SC(10), SC(26), false) };
      case 'funnel': {
        const w = SC(14), h = SC(10);
        const coneH = Math.round(h * 0.6), stemX = Math.floor(w / 2) - 1;
        for (let y = 0; y < coneH; y++) { const inset = Math.round(y * (w / 2 - 2) / Math.max(1, coneH - 1)); add(inset, y, G); add(w - 1 - inset, y, G); }
        for (let y = coneH; y < h; y++) { add(stemX, y, G); add(stemX + 1, y, G); }
        return { cells, w, h };
      }
      case 'lid-s': case 'lid-m': case 'lid-l': {
        const w = SC(kind === 'lid-s' ? 18 : kind === 'lid-m' ? 26 : 36);
        for (let x = 0; x < w; x++) add(x, 0, G);
        return { cells, w, h: 1 };
      }
      case 'burner': {
        /* PHASE 0 minimal fix: scale the burner by the same portrait factor
           (gs) the vessels already get — at gs=1 (desktop/proof grids) the
           stamp is cell-identical to the old fixed 9x8; on narrow phone
           grids it was ~15px wide on screen while beakers scale up ~2x,
           so the burner/flame all but disappeared under a beaker. */
        const w = Math.round(9 * gs), h = Math.round(8 * gs);
        const mid = Math.floor(w / 2), armY = Math.round(3 * gs), legTop = Math.round(4 * gs), arm = Math.round(2 * gs);
        for (let y = legTop; y < h; y++) { add(0, y, M); add(w - 1, y, M); }
        for (let x = 0; x <= arm; x++) add(x, armY, M);
        for (let x = w - 1 - arm; x <= w - 1; x++) add(x, armY, M);
        add(mid, Math.round(5 * gs), M); add(mid, Math.round(6 * gs), M);
        add(mid - 1, h - 1, M); add(mid, h - 1, M); add(mid + 1, h - 1, M);
        add(mid, legTop, this._k.heater);
        return { cells, w, h };
      }
      case 'battery': {
        const w = 10, h = 6;
        for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) add(x, y, this._k.batteryBody);
        add(2, 0, this._k.batteryPos); add(7, 0, this._k.batteryNeg);
        return { cells, w, h };
      }
      case 'thermometer': {
        for (let y = 0; y <= 8; y++) add(0, y, G);
        add(0, 9, this._k.thermoBulb);
        return { cells, w: 1, h: 10 };
      }
      case 'electrode-carbon': case 'electrode-copper': case 'electrode-platinum': {
        const id = kind === 'electrode-carbon' ? this._k.carbon : kind === 'electrode-copper' ? this._k.copper : this._k.platinum;
        for (let y = 0; y < 10; y++) add(0, y, id || M);
        return { cells, w: 1, h: 10 };
      }
      case 'rack': {
        const w = 20, h = 6;
        for (let x = 0; x < w; x++) { add(x, 0, W); add(x, h - 1, W); }
        for (let y = 1; y < h - 1; y++) { add(0, y, W); add(w - 1, y, W); }
        return { cells, w, h };
      }
      case 'filterpaper': {
        for (let x = 0; x < 10; x++) add(x, 0, this._k.filterPaper);
        return { cells, w: 10, h: 1 };
      }
      case 'benchlamp': {
        for (let y = 2; y < 8; y++) add(0, y, M);
        for (let x = 0; x <= 5; x++) add(x, 1, M);
        for (let x = 0; x <= 3; x++) add(x, 7, M);
        add(5, 2, this._k.lamp || G);
        return { cells, w: 6, h: 8 };
      }
      case 'wire': {
        for (let x = 0; x < 6; x++) add(x, 0, this._k.copper);
        return { cells, w: 6, h: 1 };
      }
      case 'lamp': {
        const N = this._k.neon, C = this._k.copper;
        add(1, 0, G); add(2, 0, G); add(3, 0, G);
        add(0, 1, G); add(4, 1, G); add(2, 1, N);
        add(0, 2, G); add(4, 2, G);
        add(1, 3, G); add(2, 3, G); add(3, 3, G);
        add(0, 4, C); add(4, 4, C); // copper feet = wire terminals
        return { cells, w: 5, h: 5 };
      }
      case 'heater-coil': {
        for (let x = 0; x < 6; x++) add(x, 0, this._k.kanthal);
        for (let x = 0; x < 6; x++) add(x, 1, this._k.wall);
        return { cells, w: 6, h: 2 };
      }
      case 'cooling-coil': {
        for (let x = 0; x < 6; x++) add(x, 0, this._k.cooler);
        for (let x = 0; x < 6; x++) add(x, 1, this._k.wall);
        return { cells, w: 6, h: 2 };
      }
      case 'switch': {
        add(1, 0, this._k.copper); add(2, 0, this._k.copper);
        for (let x = 0; x < 4; x++) add(x, 1, this._k.wall);
        return { cells, w: 4, h: 2 };
      }
      case 'sensor': {
        add(0, 0, this._k.thermoBulb);
        add(1, 0, this._k.batteryBody);
        add(2, 0, this._k.copper);
        return { cells, w: 3, h: 1 };
      }
      case 'stirrer': { // magnetic stirrer base; a vessel rests on its top face
        const w = 16, h = 3;
        for (let x = 0; x < w; x++) { add(x, 1, M); add(x, 2, M); add(x, 0, M); }
        add(7, 0, this._k.batteryBody); add(8, 0, this._k.batteryBody); // drive plate centre
        return { cells, w, h };
      }
      case 'hotplate': { // flat heated plate: steel top over an insulated base
        const w = 18, h = 2;
        for (let x = 0; x < w; x++) { add(x, 0, M); add(x, 1, this._k.wall); }
        return { cells, w, h };
      }
      case 'condenser': { // Liebig condenser, vertical: glass tube, open top,
        // drain gap in the bottom row (the outlet) + a small lower side lip.
        const w = 6, h = 20;
        for (let y = 0; y < h; y++) { add(0, y, G); add(5, y, G); }
        for (let x = 0; x < w; x++) if (x !== 2) add(x, h - 1, G);
        add(-1, h - 3, G); add(-1, h - 2, G); // lower side outlet lip
        return { cells, w, h };
      }
      case 'filterstand': { // funnel + filter paper in the throat, stem below
        const w = 16, h = 14, coneH = 6;
        // cone walls get an outer backing cell per step so powders cannot
        // slip diagonally through the staircase corners
        for (let y = 0; y < coneH; y++) { const inset = Math.round(y * 6 / (coneH - 1)); add(inset, y, G); add(w - 1 - inset, y, G); if (y > 0) { add(inset - 1, y, G); add(w - inset, y, G); } }
        add(7, coneH - 1, this._k.filterPaper); add(8, coneH - 1, this._k.filterPaper);
        for (let y = coneH; y < h; y++) { add(6, y, G); add(9, y, G); }
        add(2, 11, M); add(2, 12, M); add(13, 11, M); add(13, 12, M);
        add(0, 13, M); add(1, 13, M); add(2, 13, M); add(13, 13, M); add(14, 13, M); add(15, 13, M);
        return { cells, w, h };
      }
      case 'ph-probe': { // thin probe; the thermo-bulb-style tip cell senses
        for (let y = 0; y < 7; y++) add(0, y, M);
        add(0, 7, this._k.thermoBulb);
        return { cells, w: 1, h: 8 };
      }
      case 'tripod': { // ring + gauze sheet on three-leg frame (two leg pairs in 2D)
        const w = 18, h = 10;
        for (let x = 0; x < w; x++) { add(x, 0, M); add(x, 1, M); } // ring (0) + gauze (1)
        for (let y = 2; y < h; y++) { add(0, y, M); add(1, y, M); add(w - 2, y, M); add(w - 1, y, M); }
        return { cells, w, h };
      }
      case 'ice-bath': { // shallow open tray (vessel-like)
        const w = 22, h = 8;
        for (let x = 0; x < w; x++) add(x, h - 1, G);
        for (let y = 0; y < h; y++) { add(0, y, G); add(w - 1, y, G); }
        return { cells, w, h };
      }
      case 'fan': { // desk fan on a stand; fan-cell head faces +x (right)
        for (let x = 0; x < 5; x++) add(x, 5, M);
        add(1, 2, M); add(1, 3, M); add(1, 4, M); add(1, 1, M);
        add(2, 0, this._k.fan); add(3, 0, this._k.fan); add(2, 1, this._k.fan); add(3, 1, this._k.fan);
        return { cells, w: 5, h: 6 };
      }
      default: return null;
    }
  }

  _interiorFor(kind, ax, ay, w, h, stampSet) {
    const vessels = ['beaker-s', 'beaker-m', 'beaker-l', 'flask', 'testtube', 'roundflask', 'cylinder', 'funnel', 'condenser', 'filterstand', 'ice-bath'];
    if (!vessels.includes(kind)) return [];
    const { cols } = this;
    const seedX = ax + (w >> 1), seedY = ay + (h >> 1);
    const out = [];
    let qh = 0, qt = 0;
    const start = seedY * cols + seedX;
    if (stampSet.has(start)) return [];
    this._queue[qt++] = start; this._stamp[start] = this.tick + 200000;
    while (qh < qt) {
      const i = this._queue[qh++];
      out.push(i);
      const x = i % cols, y = (i / cols) | 0;
      const dirs = [i - 1, i + 1, i - cols, i + cols];
      for (let d = 0; d < 4; d++) {
        const ni = dirs[d];
        if (ni < 0 || ni >= this.el.length) continue;
        const nx = ni % cols, ny = (ni / cols) | 0;
        if (nx < ax || ny < ay || nx >= ax + w || ny >= ay + h) continue;
        if (stampSet.has(ni) || this._stamp[ni] === this.tick + 200000) continue;
        this._stamp[ni] = this.tick + 200000; this._queue[qt++] = ni;
      }
    }
    return out;
  }

  /** W32U-5 R2: effective stamp size multiplier for (kind, opts): opts.scale
      (a finite number) wins; else the vessel SIZE_MUL ladder via opts.size;
      else 1 — the legacy placement sizes the proofs depend on. */
  _sizeMulFor(kind, opts = {}) {
    if (typeof opts.scale === 'number' && Number.isFinite(opts.scale)) return opts.scale;
    if (VESSEL_KINDS.has(kind)) return SIZE_MUL[opts.size] ?? 1;
    return 1;
  }

  /** W32U-5 R2: stamp dimensions for (kind, opts) without placing anything. */
  stampDims(kind, opts = {}) {
    const stamp = this._stampFor(kind, this._sizeMulFor(kind, opts));
    if (!stamp || stamp.cells.length === 0) return null;
    return { w: stamp.w, h: stamp.h };
  }

  placeObject(kind, x, y, opts = {}) {
    if (this.objects.size >= 64) return null; // HARDEN cap: object registry bounded at 64 (UI toasts on null)
    // W32U-5 R2: vessel size ladder / raw scale; absent size+scale = mul 1.
    const sizeMul = this._sizeMulFor(kind, opts);
    const stamp = this._stampFor(kind, sizeMul);
    if (!stamp || stamp.cells.length === 0) return null;
    const { cols } = this;
    const abs = [];
    const set = new Set();
    for (const [dx, dy, id] of stamp.cells) {
      const ax = x + dx, ay = y + dy;
      if (!this._in(ax, ay)) return null;
      const i = ay * cols + ax;
      if (this.el[i] !== 0 || set.has(i)) { if (!set.has(i)) return null; continue; }
      set.add(i); abs.push([i, id]);
    }
    const objId = this._nextObj++;
    const idxArr = new Int32Array(abs.length);
    for (let c = 0; c < abs.length; c++) {
      const [i, id] = abs[c];
      this._write(i, id, false);
      this.objMap[i] = objId;
      this._chObj[this._chunkOf(i)]++; // W32U-5: gear cells keep their chunk awake
      idxArr[c] = i;
    }
    const interior = this._interiorFor(kind, x, y, stamp.w, stamp.h, set);
    for (let c = 0; c < interior.length; c++) this._inside[interior[c]] = objId;
    const obj = { id: objId, kind, cells: idxArr, stampIds: abs.map((a) => a[1]), anchor: { x, y }, level: opts.level || (kind === 'heater-coil' ? 3 : 1), interior, w: stamp.w, h: stamp.h, light: kind === 'benchlamp', locked: !!opts.locked, scale: sizeMul };
    if (['beaker-s','beaker-m','beaker-l','flask','testtube','roundflask','cylinder','funnel','lid-s','lid-m','lid-l'].includes(kind)) this._sndEvt('clink', 0.5, x / Math.max(1, this.cols - 1));
    else if (['battery','burner','benchlamp'].includes(kind) || kind.startsWith('electrode')) this._sndEvt('clank', 0.55, x / Math.max(1, this.cols - 1));
    else if (kind === 'rack') this._sndEvt('knock', 0.55, x / Math.max(1, this.cols - 1));
    this.objects.set(objId, obj);
    if (kind.startsWith('lid')) this._sealedDirty = true;
    return objId;
  }

  removeObject(objId) {
    const obj = this.objects.get(objId);
    if (!obj || obj.locked) return false;
    for (let c = 0; c < obj.cells.length; c++) {
      const i = obj.cells[c];
      if (this.objMap[i] === objId) {
        this.objMap[i] = 0;
        this._chObj[this._chunkOf(i)]--; // W32U-5
        if (this.el[i] === obj.stampIds[c]) this._write(i, 0, false); // gear vanishes, contents untouched
      }
    }
    for (let c = 0; c < (obj.interior || []).length; c++) if (this._inside[obj.interior[c]] === objId) this._inside[obj.interior[c]] = -1;
    this.objects.delete(objId);
    this._anims = this._anims.filter((a) => a.objId !== objId);
    if (obj.kind.startsWith('lid')) this._sealedDirty = true;
    return true;
  }

  tipObject(objId) {
    const obj = this.objects.get(objId);
    if (!obj || obj.locked) return false;
    if (this._anims.some((a) => a.objId === objId)) return false;
    const steps = obj.kind === 'flask' ? 4 : 3;
    // pivot: base corner on the spout side (right, or left if near right edge)
    const toLeft = obj.anchor.x + obj.w * 2 > this.cols;
    const px = toLeft ? obj.anchor.x : obj.anchor.x + obj.w - 1;
    const py = obj.anchor.y + obj.h - 1;
    this._anims.push({ objId, step: 0, steps, timer: 0, px, py, dir: toLeft ? -1 : 1, orig: Array.from(obj.cells), origIds: obj.stampIds.slice() });
    return true;
  }

  _tipStep(anim) {
    if (this._snd) this._snd.pour += 6; // vessel tipping releases a stream
    const obj = this.objects.get(anim.objId);
    if (!obj) return true;
    anim.step++;
    const { cols } = this;
    // erase current gear cells
    for (let c = 0; c < obj.cells.length; c++) {
      const i = obj.cells[c];
      if (this.objMap[i] === anim.objId && this.el[i] === obj.stampIds[c]) this._write(i, 0, false);
      this.objMap[i] = 0;
    }
    // rotate original positions by 90° x step around the pivot
    const rot = (x, y) => {
      let dx = x - anim.px, dy = y - anim.py;
      for (let s = 0; s < anim.step; s++) { const ndx = anim.dir > 0 ? -dy : dy; const ndy = anim.dir > 0 ? dx : -dx; dx = ndx; dy = ndy; }
      return [anim.px + dx, anim.py + dy];
    };
    const newCells = [];
    const newIds = [];
    for (let c = 0; c < anim.orig.length; c++) {
      const oi = anim.orig[c];
      const [nx, ny] = rot(oi % cols, (oi / cols) | 0);
      if (!this._in(nx, ny)) continue;
      const ni = ny * cols + nx;
      if (this.el[ni] !== 0) continue; // blocked: that gear cell is lost (honest breakage)
      this._write(ni, anim.origIds[c], false);
      this.objMap[ni] = anim.objId;
      newCells.push(ni); newIds.push(anim.origIds[c]);
    }
    for (let c = 0; c < (obj.interior || []).length; c++) if (this._inside[obj.interior[c]] === anim.objId) this._inside[obj.interior[c]] = -1;
    obj.cells = new Int32Array(newCells);
    obj.stampIds = newIds;
    const xs = newCells.map((i) => i % cols), ys = newCells.map((i) => (i / cols) | 0);
    if (xs.length) obj.anchor = { x: Math.min(...xs), y: Math.min(...ys) };
    obj.interior = [];
    this._recountChunks(); // W32U-5: tipping relocates gear cells across chunks (objMap bypasses _chObj bookkeeping)
    return anim.step >= anim.steps;
  }

  moveObject(objId, dx) {
    const obj = this.objects.get(objId);
    if (!obj || obj.locked || dx === 0 || Math.abs(dx) > 8) return false;
    const { cols } = this;
    const gearSet = new Set(Array.from(obj.cells));
    const intSet = new Set(obj.interior.filter((i) => this.el[i] !== 0));
    // validate: gear targets empty-or-own; content targets empty-or-vacating
    for (const i of gearSet) {
      const nx = (i % cols) + dx;
      if (nx < 0 || nx >= cols) return false;
      const t = i + dx;
      if (this.el[t] !== 0 && !gearSet.has(t) && !intSet.has(t)) return false;
    }
    for (const i of intSet) {
      const nx = (i % cols) + dx;
      if (nx < 0 || nx >= cols) return false;
      const t = i + dx;
      if (this.el[t] !== 0 && !gearSet.has(t) && !intSet.has(t)) return false;
    }
    // move contents first (descending order along dx), then gear
    const intArr = Array.from(intSet).sort((a, b) => dx > 0 ? b - a : a - b);
    for (const i of intArr) this._swap(i, i + dx);
    // direct relocation (gear cells are static solids; swap chains are fragile)
    const origCells = Array.from(obj.cells);
    const temps = origCells.map((i) => this.temp[i]);
    for (let c = 0; c < origCells.length; c++) if (this.el[origCells[c]] === obj.stampIds[c]) this._write(origCells[c], 0, false);
    const newCells = new Int32Array(origCells.length);
    for (let c = 0; c < origCells.length; c++) {
      const ni = origCells[c] + dx;
      this._write(ni, obj.stampIds[c], false);
      this.temp[ni] = temps[c];
      this.objMap[ni] = objId;
      newCells[c] = ni;
    }
    obj.cells = newCells;
    obj.anchor.x += dx;
    for (let c = 0; c < obj.interior.length; c++) if (this._inside[obj.interior[c]] === objId) this._inside[obj.interior[c]] = -1;
    obj.interior = obj.interior.map((i) => i + dx);
    for (let c = 0; c < obj.interior.length; c++) this._inside[obj.interior[c]] = objId;
    if (this._snd) { this._snd.scrape += 1; this._sx('scrape', obj.anchor.y * this.cols + obj.anchor.x); }
    this._recountChunks(); // W32U-5: gear cells relocated across chunks
    return true;
  }

  /** W32U-5 R2: move an object so its anchor lands at (nx, ny). Validates the
      whole footprint first (stamp targets in-bounds and empty-or-own;
      interior-content targets in-bounds and empty-or-own) — blocked moves
      change nothing. Contents move write-based, descending along the delta,
      the same care moveObject takes. Locked objects refuse. */
  moveObjectTo(objId, nx, ny) {
    const obj = this.objects.get(objId);
    if (!obj || obj.locked) return false;
    nx |= 0; ny |= 0;
    const dx = nx - obj.anchor.x, dy = ny - obj.anchor.y;
    if (dx === 0 && dy === 0) return true;
    const { cols } = this;
    const ownStamp = new Set(Array.from(obj.cells));
    const ownInt = new Set(obj.interior || []);
    const stampTargets = new Int32Array(obj.cells.length);
    for (let c = 0; c < obj.cells.length; c++) {
      const i = obj.cells[c];
      const tx = (i % cols) + dx, ty = ((i / cols) | 0) + dy;
      if (!this._in(tx, ty)) return false;
      const t = ty * cols + tx;
      if (this.el[t] !== 0 && !ownStamp.has(t) && !ownInt.has(t)) return false;
      stampTargets[c] = t;
    }
    const contents = []; // [src, dst, id, temp]
    for (const i of ownInt) {
      if (this.el[i] === 0) continue;
      const tx = (i % cols) + dx, ty = ((i / cols) | 0) + dy;
      if (!this._in(tx, ty)) return false;
      const t = ty * cols + tx;
      if (this.el[t] !== 0 && !ownStamp.has(t) && !ownInt.has(t)) return false;
      contents.push([i, t, this.el[i], this.temp[i]]);
    }
    // erase gear (temps preserved) + content sources, then write targets:
    // after the erases every validated target is empty, so no write can
    // clobber a cell that still has to move.
    const temps = Array.from(obj.cells, (i) => this.temp[i]);
    for (let c = 0; c < obj.cells.length; c++) {
      const i = obj.cells[c];
      if (this.objMap[i] === objId) this.objMap[i] = 0;
      if (this.el[i] === obj.stampIds[c]) this._write(i, 0, false);
    }
    for (const [src] of contents) if (this.el[src] !== 0) this._write(src, 0, false);
    contents.sort((a, b) => (((b[0] % cols) - (a[0] % cols)) * dx) + ((((b[0] / cols) | 0) - ((a[0] / cols) | 0)) * dy));
    for (const [, t, id, tp] of contents) { this._write(t, id, false); this.temp[t] = tp; }
    for (let c = 0; c < stampTargets.length; c++) {
      const t = stampTargets[c];
      this._write(t, obj.stampIds[c], false);
      this.temp[t] = temps[c];
      this.objMap[t] = objId;
    }
    obj.cells = stampTargets;
    obj.anchor = { x: nx, y: ny };
    for (const i of ownInt) if (this._inside[i] === objId) this._inside[i] = -1;
    obj.interior = VESSEL_KINDS.has(obj.kind)
      ? this._interiorFor(obj.kind, nx, ny, obj.w, obj.h, new Set(Array.from(stampTargets)))
      : [];
    for (let c = 0; c < obj.interior.length; c++) this._inside[obj.interior[c]] = objId;
    if (obj.kind.startsWith('lid')) this._sealedDirty = true;
    if (this._snd) { this._snd.scrape += 1; this._sx('scrape', ny * cols + nx); }
    this._recountChunks(); // gear cells relocated across chunks
    return true;
  }

  /** W32U-5 R2: resize an object to a new stamp scale (clamped 0.5..3),
      bottom-aligned on its anchor centre. Vessel contents are resampled
      proportionally into the new interior. Returns { w, h } or null (locked,
      not resizable, doesn't fit, or blocked — with NO changes made). */
  resizeObject(objId, scale) {
    const obj = this.objects.get(objId);
    if (!obj || obj.locked || !Number.isFinite(scale)) return null;
    if (NOT_RESIZABLE.has(obj.kind)) return null;
    scale = Math.max(0.5, Math.min(3, scale));
    const kind = obj.kind, { cols } = this;
    const oldW = obj.w, oldH = obj.h;
    let stamp = null;
    if (VESSEL_KINDS.has(kind)) {
      stamp = this._stampFor(kind, scale);
    } else if (kind === 'wire') {
      const w = Math.max(3, Math.round(6 * scale)), cells = [];
      for (let x = 0; x < w; x++) cells.push([x, 0, this._k.copper]);
      stamp = { cells, w, h: 1 };
    } else if (kind === 'heater-coil' || kind === 'cooling-coil') {
      const w = Math.max(4, Math.round(6 * scale)), cells = [];
      const mat = kind === 'heater-coil' ? this._k.kanthal : this._k.cooler;
      for (let x = 0; x < w; x++) cells.push([x, 0, mat]);
      for (let x = 0; x < w; x++) cells.push([x, 1, this._k.wall]);
      stamp = { cells, w, h: 2 };
    } else {
      // generic resample of the old stamp
      const oldMap = new Map();
      for (let c = 0; c < obj.cells.length; c++) {
        const i = obj.cells[c];
        const rx = (i % cols) - obj.anchor.x, ry = ((i / cols) | 0) - obj.anchor.y;
        if (rx >= 0 && ry >= 0 && rx < oldW && ry < oldH) oldMap.set(ry * oldW + rx, obj.stampIds[c]);
      }
      const newW = Math.max(2, Math.round(oldW * scale)), newH = Math.max(1, Math.round(oldH * scale));
      const cells = [];
      for (let y = 0; y < newH; y++) for (let x = 0; x < newW; x++) {
        const id = oldMap.get(Math.floor(y / scale) * oldW + Math.floor(x / scale));
        if (id) cells.push([x, y, id]);
      }
      if (!cells.length) return null;
      stamp = { cells, w: newW, h: newH };
    }
    if (!stamp || !stamp.cells.length || stamp.w > cols || stamp.h > this.rows) return null;
    const anchorCx = obj.anchor.x + oldW / 2;
    const newAx = Math.max(0, Math.min(cols - stamp.w, Math.round(anchorCx - stamp.w / 2)));
    let newAy = obj.anchor.y + (oldH - stamp.h);
    if (newAy < 0) newAy = 0;
    if (newAy + stamp.h > this.rows) return null;
    // capture vessel contents BEFORE any removal (old interior set, id+temp)
    const ownStamp = new Set(Array.from(obj.cells));
    const ownInt = new Set(obj.interior || []);
    let oldContent = null;
    if (VESSEL_KINDS.has(kind)) {
      oldContent = new Map();
      for (const i of ownInt) if (this.el[i] !== 0) oldContent.set(i, { id: this.el[i], temp: this.temp[i] });
    }
    // validate + dedupe stamp targets (beaker stamps list corners twice)
    const scells = []; // [absIdx, id]
    const seen = new Set();
    for (const [ddx, ddy, id] of stamp.cells) {
      const tx = newAx + ddx, ty = newAy + ddy;
      if (!this._in(tx, ty)) return null;
      const t = ty * cols + tx;
      if (seen.has(t)) continue;
      if (this.el[t] !== 0 && !ownStamp.has(t) && !ownInt.has(t)) return null;
      seen.add(t); scells.push([t, id]);
    }
    // remove the old stamp + interior bookkeeping
    for (let c = 0; c < obj.cells.length; c++) {
      const i = obj.cells[c];
      if (this.objMap[i] === objId) {
        this.objMap[i] = 0;
        if (this.el[i] === obj.stampIds[c]) this._write(i, 0, false);
      }
    }
    for (const i of ownInt) if (this._inside[i] === objId) this._inside[i] = -1;
    // write the new stamp
    const idxArr = new Int32Array(scells.length);
    const idsArr = new Array(scells.length);
    for (let c = 0; c < scells.length; c++) {
      const [t, id] = scells[c];
      this._write(t, id, false);
      this.objMap[t] = objId;
      idxArr[c] = t; idsArr[c] = id;
    }
    const interior = VESSEL_KINDS.has(kind)
      ? this._interiorFor(kind, newAx, newAy, stamp.w, stamp.h, seen)
      : [];
    for (let c = 0; c < interior.length; c++) this._inside[interior[c]] = objId;
    // resample contents proportionally into the new interior
    if (oldContent && oldContent.size) {
      for (const i of interior) {
        if (this.el[i] !== 0) continue; // never overwrite a stamp/foreign cell
        const u = ((i % cols) - newAx) / stamp.w, v = (((i / cols) | 0) - newAy) / stamp.h;
        const oi = (obj.anchor.y + Math.floor(v * oldH)) * cols + (obj.anchor.x + Math.floor(u * oldW));
        const c0 = oldContent.get(oi);
        if (c0) { this._write(i, c0.id, false); this.temp[i] = c0.temp; }
      }
    }
    obj.cells = idxArr; obj.stampIds = idsArr; obj.interior = interior;
    obj.anchor = { x: newAx, y: newAy };
    obj.w = stamp.w; obj.h = stamp.h; obj.scale = scale;
    if (kind.startsWith('lid')) this._sealedDirty = true;
    this._recountChunks();
    return { w: stamp.w, h: stamp.h };
  }

  /** W32U-5 R2: duplicate an object at the first free offset (right, below,
      left, above, diagonal). Vessel contents are copied cell-for-cell at the
      same relative offset where the new interior allows. */
  duplicateObject(objId) {
    const obj = this.objects.get(objId);
    if (!obj) return null;
    const { cols } = this;
    const w = obj.w, h = obj.h;
    const offs = [[w + 4, 0], [0, h + 4], [-(w + 4), 0], [0, -(h + 4)], [w + 4, h + 4]];
    for (const [ox, oy] of offs) {
      const nid = this.placeObject(obj.kind, obj.anchor.x + ox, obj.anchor.y + oy, { scale: obj.scale, level: obj.level, locked: false });
      if (nid == null) continue;
      const nobj = this.objects.get(nid);
      if (nobj) nobj.level = obj.level; // placeObject's || drops a legit 0
      if (nobj && VESSEL_KINDS.has(obj.kind)) {
        const newInt = new Set(nobj.interior || []);
        for (const i of (obj.interior || [])) {
          if (this.el[i] === 0) continue;
          const t = (nobj.anchor.y + (((i / cols) | 0) - obj.anchor.y)) * cols + (nobj.anchor.x + ((i % cols) - obj.anchor.x));
          if (newInt.has(t) && this.el[t] === 0) { this._write(t, this.el[i], false); this.temp[t] = this.temp[i]; }
        }
      }
      return nid;
    }
    return null;
  }

  /** W32U-5 R2: lock/unlock an object. Locked objects refuse moveObject,
      moveObjectTo, resizeObject, tipObject and removeObject; interactObject
      and setObjectLevel stay available. */
  setObjectLocked(objId, locked) {
    const obj = this.objects.get(objId);
    if (!obj) return false;
    obj.locked = !!locked;
    return true;
  }

  /** W32U-5: direct level API (UI sliders/buttons). Clamps 0..3, switches
      0..1 (open/closed). Returns the new level, or null for a bad object id.
      interactObject's tap-to-cycle behaviour is unchanged. */
  setObjectLevel(objId, level) {
    const obj = this.objects.get(objId);
    if (!obj) return null;
    const max = obj.kind === 'switch' ? 1 : 3;
    obj.level = Math.max(0, Math.min(max, level | 0));
    this._dirtyChunkFor(obj.cells.length ? obj.cells[0] : obj.anchor.y * this.cols + obj.anchor.x);
    return obj.level;
  }

  interactObject(objId) {
    const obj = this.objects.get(objId);
    if (!obj) return null;
    if (obj.kind === 'burner' || obj.kind === 'battery') {
      obj.level = obj.level >= 3 ? 1 : obj.level + 1;
      return obj.level;
    }
    if (obj.kind === 'switch') { // toggle: 1 = closed (default), 0 = open
      obj.level = obj.level === 0 ? 1 : 0;
      return obj.level;
    }
    if (obj.kind === 'sensor') { // cycle trigger threshold 60 / 150 / 300 C
      obj.level = obj.level >= 3 ? 1 : obj.level + 1;
      return obj.level;
    }
    if (obj.kind === 'stirrer' || obj.kind === 'hotplate' || obj.kind === 'fan') { // cycle 0..3 (0 = off)
      obj.level = obj.level >= 3 ? 0 : obj.level + 1;
      return obj.level;
    }
    return obj.level;
  }

  objectsAt(x, y) {
    if (!this._in(x, y)) return null;
    const id = this.objMap[y * this.cols + x];
    return id !== 0 ? id : null;
  }

  /** Registry accessor for UI readouts (thermometer bulb, burner level…). */
  getObject(objId) { return this.objects.get(objId) || null; }

  /** HARDEN governor: UI sets ladderStep 0..5; steps 3..5 degrade engine passes.
      The colour/render pipeline is NEVER degraded by the ladder (UI-side rule). */
  applyGovernor(step) {
    const st = Math.max(0, Math.min(5, step | 0));
    this.governor.ladderStep = st;
    this.governor.tickRate = st <= 0 ? 60 : st === 1 ? 45 : 30;
    this.ladder = st <= 2 ? 0 : st - 2;
    return this.governor;
  }

  // ---- stats / inspect / scenes -----------------------------------------------------
  stats() {
    let tier = -1;
    for (let t = 0; t < TIERS.length; t++) if (TIERS[t].cols === this.cols && TIERS[t].rows === this.rows) tier = t;
    const gov = this.governor || { tickRate: 60, ladderStep: 0 };
    if (gov.tierIndex == null || gov.tierIndex < 0) gov.tierIndex = tier;
    if (gov.startTierIndex == null || gov.startTierIndex < 0) gov.startTierIndex = gov.tierIndex;
    if (tier < 0) tier = gov.tierIndex; // aspect-matched grids are not literal TIERS entries — report the governor's tier
    return {
      particles: this.particles, fps: 0, tier, cols: this.cols, rows: this.rows,
      ladder: this.ladder, suggestTierDown: gov.ladderStep >= 5 && this._emaMs > 26,
      emaMs: Math.round(this._emaMs * 100) / 100, anyHot: this._anyHot,
      tickRate: gov.tickRate, ladderStep: gov.ladderStep,
      tierIndex: tier, startTierIndex: gov.startTierIndex,
      lastLidPop: this.lastLidPop,
      chunksTotal: this._chStamp.length, chunksAwake: this._chAwakeCount,
      sleepingFrac: this._chStamp.length ? Math.round((1 - this._chAwakeCount / this._chStamp.length) * 1000) / 1000 : 0,
    };
  }

  inspect(x, y) {
    if (!this._in(x, y)) return null;
    const i = y * this.cols + x;
    const id = this.el[i];
    if (id === 0) return null;
    const rec = SUBSTANCES[id];
    let state = rec.cls;
    if (this.aux[i] & 32) state = 'burning';
    else if (this.aux[i] & 64) state = rec.cls + ' (electrified)';
    else if (this.temp[i] <= 0 && rec.cls === 'liquid') state = 'liquid (near freezing)';
    const hints = [];
    try {
      const prof = PROFILES && typeof PROFILES.get === 'function' ? PROFILES.get(id) : null;
      if (Array.isArray(prof)) for (let h = 0; h < prof.length && hints.length < 3; h++) {
        const e = prof[h];
        if (e && (e.withKey || e.withFam)) hints.push('Reacts with ' + (e.withKey || e.withFam) + (e.note ? ' — ' + e.note : ''));
      }
    } catch (e) { /* profile hints are best-effort */ }
    return {
      key: rec.key, name: rec.name, temp: Math.round(this.temp[i] * 10) / 10,
      ph: this.ph[i] !== 255 ? this.ph[i] / 10 : (rec.ph != null ? rec.ph : null),
      tint: this.tint[i] ? this.tint[i] : null,
      state, hints,
    };
  }

  serialize() {
    const elBytes = new Uint8Array(this.el.buffer, this.el.byteOffset, this.el.byteLength);
    const t16 = new Int16Array(this.el.length);
    for (let i = 0; i < t16.length; i++) t16[i] = Math.max(-273, Math.min(4000, Math.round(this.temp[i])));
    const tBytes = new Uint8Array(t16.buffer, t16.byteOffset, t16.byteLength);
    const objects = [];
    for (const obj of this.objects.values()) objects.push({ kind: obj.kind, x: obj.anchor.x, y: obj.anchor.y, level: obj.level, locked: !!obj.locked, scale: obj.scale != null ? obj.scale : 1 });
    const bodies = this.bodies.map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y) }));
    return { v: 3, cols: this.cols, rows: this.rows, el: b64encode(elBytes), temp: b64encode(tBytes), objects, bodies };
  }

  /** W32U-5 R2 (serialize v2): re-register saved objects on the loaded grid.
      An object is restored only when at least half its stamp cells still
      match the grid; destroyed objects are skipped (their cells stay inert,
      the v1 behaviour). objMap is set only where the grid cell matches. */
  _restoreObjects(list) {
    const { cols } = this;
    for (let n = 0; n < list.length && n < 64; n++) {
      if (this.objects.size >= 64) break;
      const e = list[n];
      if (!e || typeof e.kind !== 'string') continue;
      const vessel = VESSEL_KINDS.has(e.kind);
      const stampScale = vessel ? (e.scale || 1) : 1;
      const stamp = this._stampFor(e.kind, stampScale);
      if (!stamp || !stamp.cells.length) continue;
      const ax = e.x | 0, ay = e.y | 0;
      if (!this._in(ax, ay) || ax + stamp.w > cols || ay + stamp.h > this.rows) continue;
      const seen = new Set(), pos = [], ids = [];
      for (const [dx, dy, id] of stamp.cells) {
        const i = (ay + dy) * cols + (ax + dx);
        if (seen.has(i)) continue;
        seen.add(i); pos.push(i); ids.push(id);
      }
      let match = 0;
      for (let c = 0; c < pos.length; c++) if (this.el[pos[c]] === ids[c]) match++;
      if (match * 2 < pos.length) continue;
      const objId = this._nextObj++;
      for (let c = 0; c < pos.length; c++) if (this.el[pos[c]] === ids[c]) this.objMap[pos[c]] = objId;
      const interior = this._interiorFor(e.kind, ax, ay, stamp.w, stamp.h, seen);
      for (let c = 0; c < interior.length; c++) this._inside[interior[c]] = objId;
      const obj = {
        id: objId, kind: e.kind, cells: new Int32Array(pos), stampIds: ids,
        anchor: { x: ax, y: ay },
        level: Number.isFinite(e.level) ? e.level : (e.kind === 'heater-coil' ? 3 : 1),
        interior, w: stamp.w, h: stamp.h, light: e.kind === 'benchlamp',
        locked: !!e.locked, scale: Number.isFinite(e.scale) && e.scale ? e.scale : 1,
      };
      this.objects.set(objId, obj);
      if (e.kind.startsWith('lid')) this._sealedDirty = true;
    }
    this._recountChunks();
  }

  deserialize(data) {
    if (!data || (data.v !== 1 && data.v !== 2 && data.v !== 3)) return false;
    // HARDEN caps: reject oversized scenes (UI also checks the raw byte length > 8 MB)
    if (!Number.isFinite(data.cols) || !Number.isFinite(data.rows) || data.cols < 1 || data.rows < 1 || data.cols > 1024 || data.rows > 1024 || data.cols * data.rows > 200000) return false;
    if (typeof data.el === 'string' && data.el.length > 8 * 1024 * 1024) return false;
    if (data.cols !== this.cols || data.rows !== this.rows) this.resize(data.cols | 0, data.rows | 0);
    const n = this.cols * this.rows;
    try {
      const elBytes = b64decode(data.el);
      const tBytes = data.temp ? b64decode(data.temp) : null;
      const elView = new Uint16Array(elBytes.buffer, elBytes.byteOffset, Math.min(n, elBytes.byteLength / 2));
      const tView = tBytes ? new Int16Array(tBytes.buffer, tBytes.byteOffset, Math.min(n, tBytes.byteLength / 2)) : null;
      this.clear();
      let count = 0;
      for (let i = 0; i < n; i++) {
        const id = elView[i] || 0;
        this.el[i] = id >= 1 && id <= SUBSTANCE_COUNT ? id : 0; // unknown ids -> empty
        if (this.el[i] !== 0) {
          count++;
          const rec = SUBSTANCES[this.el[i]];
          this.aux[i] = (this._rng() * 4) | 0;
          this.ph[i] = rec.cls === 'liquid' && rec.ph != null ? Math.round(rec.ph * 10) : 255;
          if (tView) this.temp[i] = tView[i];
        }
      }
      this.particles = count;
      this._recountChunks(); // W32U-5: deserialize writes el/temp directly, bypassing _write
      if (data.v >= 2 && Array.isArray(data.objects)) this._restoreObjects(data.objects);
      if (data.v === 3 && Array.isArray(data.bodies)) for (const bd of data.bodies) { if (bd && typeof bd.kind === 'string') this.placeBody(bd.kind, bd.x | 0, bd.y | 0); }
      return true;
    } catch (e) { return false; }
  }

  resize(cols, rows) {
    cols = Math.max(8, cols | 0); rows = Math.max(8, rows | 0);
    if (cols === this.cols && rows === this.rows) return;
    const n = cols * rows;
    const nel = new Uint16Array(n), nlife = new Uint16Array(n), naux = new Uint8Array(n);
    const ntemp = new Float32Array(n).fill(this.ambientT), nph = new Uint8Array(n).fill(255);
    const nmix = new Uint8Array(n), npol = new Int8Array(n);
    const ntint = new Uint32Array(n);
    for (let y = 0; y < rows; y++) {
      const sy = Math.min(this.rows - 1, Math.floor(y * this.rows / rows));
      for (let x = 0; x < cols; x++) {
        const sx = Math.min(this.cols - 1, Math.floor(x * this.cols / cols));
        const si = sy * this.cols + sx, di = y * cols + x;
        nel[di] = this.el[si]; ntemp[di] = this.temp[si]; nlife[di] = this.life[si]; ntint[di] = this.tint[si];
        naux[di] = this.aux[si] & 3; nph[di] = this.ph[si]; nmix[di] = this.mix[si]; npol[di] = this.pol[si];
      }
    }
    this.cols = cols; this.rows = rows;
    this.el = nel; this.temp = ntemp; this.life = nlife; this.aux = naux; this.ph = nph; this.mix = nmix; this.pol = npol; this.tint = ntint;
    this.pw = Math.max(1, Math.ceil(cols / 4)); this.ph2 = Math.max(1, Math.ceil(rows / 4));
    this.pressure = new Float32Array(this.pw * this.ph2);
    this.airP = new Float32Array(this.pw * this.ph2);
    this.airVX = new Float32Array(this.pw * this.ph2);
    this.airVY = new Float32Array(this.pw * this.ph2);
    this.airCols = this.pw; this.airRows = this.ph2;
    this.airO2 = new Float32Array(n).fill(0.21);
    this.bodyMap = new Int32Array(n); this.bodies = [];
    const m = n;
    this._act = new Uint32Array(m); this._band = new Uint8Array(m); this._rxCool = new Int32Array(m);
    this._dissT = new Float32Array(m); this._solute = new Uint16Array(m); this._charge = new Float32Array(m);
    this._stamp = new Int32Array(m); this._elecList = new Int32Array(m); this._queue = new Int32Array(m);
    this._arc = new Uint8Array(m);
    this._region = new Int16Array(m).fill(-1); this._regions = []; this._inside = new Int16Array(m).fill(-1);
    this.objMap = new Int32Array(m); this.objects.clear(); this._anims = [];
    let count = 0; for (let i = 0; i < m; i++) if (nel[i] !== 0) count++;
    this.particles = count;
    this._sealedDirty = true;
    this._recountChunks(); // W32U-5: chunk grid follows the new dimensions
  }
  setTier(cols, rows) { this.resize(cols, rows); }

  // ---- main step ----------------------------------------------------------------------
  step() {
    this._inStep = true;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { el, aux } = this;
    for (let i = 0; i < el.length; i++) aux[i] &= ~16; // clear updated flag
    // tip animations advance every ~10 ticks
    for (let a = this._anims.length - 1; a >= 0; a--) {
      const anim = this._anims[a];
      anim.timer++;
      if (anim.timer >= 10) { anim.timer = 0; if (this._tipStep(anim)) this._anims.splice(a, 1); }
    }
    // pending chain blasts
    for (let b = this._blasts.length - 1; b >= 0; b--) {
      if (this.tick >= this._blasts[b].at) { const bl = this._blasts[b]; this._blasts.splice(b, 1); this.blast(bl.x, bl.y, bl.r); }
    }
    // W32U-5: recompute chunk awake flags before the gated passes. A chunk is
    // awake when recently dirtied, when it holds dynamic-class cells, a live
    // temperature deviation, or gear cells. The reaction pass additionally
    // wakes one rotating slice of sleeping chunks (1/64 per tick).
    {
      const cn = this._chStamp.length;
      let awakeCount = 0;
      for (let ci = 0; ci < cn; ci++) {
        const awake = (this.tick - this._chStamp[ci] <= 2) || this._chDyn[ci] > 0 || this._chTmp[ci] > 1.5 || this._chObj[ci] > 0 ? 1 : 0;
        this._chAwake[ci] = awake;
        const rxVisit = ((this.tick & 63) === (ci & 63)) ? 1 : 0;
        this._chAwakeRx[ci] = (awake || rxVisit) ? 1 : 0;
        // A rotation visit is a FULL visit: every cell in the chunk counts as
        // active for the reaction pass and the temp pass runs — otherwise the
        // rotation (1/64) stacked on the ambient sweep (1/8) left settled
        // scenes (Na pool, wood, ice, neutralisation) unchecked for ~512
        // ticks and slow processes silently never ran.
        this._chRxFull[ci] = (!awake && rxVisit) ? 1 : 0;
        awakeCount += awake;
      }
      this._chAwakeCount = awakeCount;
    }
    this._movePass();
    if (this._jupiter) this._movePass(); // W32U-6 Jupiter: extra gravity-movement pass (unmoved cells retry; moved cells are aux-flagged)
    this._tempPass();
    this._combustionPass();
    this._airO2Pass();
    this._gearPass();
    if (this.ladder < 2 || (this.tick & 1) === 0) this._reactionPass();
    // W32U-4 air pass: the FIRST pass shed by the ladder — full rate below
    // ladder 2, every 2nd tick at ladder 2, every 4th tick at ladder >= 3.
    if (this.ladder < 2 || (this.ladder === 2 && (this.tick & 1) === 0) || (this.tick & 3) === 0) this._airPass();
    this._electricPass();
    this._bodyPass();
    if (this.ladder < 3 || (this.tick & 1) === 0) this._pressurePass();
    else { const p = this.pressure; for (let i = 0; i < p.length; i++) p[i] *= 0.95; }
    this._emitSnd();
    this._inStep = false;
    // exact particle recount every 60 ticks (corrects any drift cheaply)
    if (this.tick % 60 === 59) { let c = 0; for (let i = 0; i < el.length; i++) if (el[i] !== 0) c++; this.particles = c; }
    this.tick++;
    // HARDEN: EMA of own step duration is only MEASURED here — the UI load governor
    // owns the degradation ladder (tick rate -> update radius -> resolution) and
    // drives this.ladder via applyGovernor(). No self-resizing, no self-laddering.
    const dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this._emaMs = this._emaMs * 0.9 + dt * 0.1;
  }
}
