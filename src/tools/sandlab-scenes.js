/* UI-A split: showcase scenes + guided experiments data and their pure
   builders (extracted verbatim from sandlab.jsx). buildSceneInto(e, which)
   builds into any engine instance; computeObjective scans a live engine. */
import { BY_KEY } from '../core/matter-elements.js';

/* ================= V2: shared scene builder + showcase/experiment data =================
   buildSceneInto is the PURE builder extracted from buildDemo (live behaviour
   unchanged — buildDemo now delegates to it). Thumbnails and experiments
   reuse it so every entry point builds the identical scene. */
export const MATTER_SCENES = [
  { id: 'volcano', name: 'Volcano & Lake', description: 'A stone volcano with a lava core beside a sandy lake — eruptions, steam and flow in one scene.' },
  { id: 'bench', name: 'The Bench', description: 'The classic lab bench: lit burner under a beaker of water, battery, electrodes, flask and thermometer.' },
  { id: 'electrolysis', name: 'Electrolysis Rig', description: 'A beaker of water with two carbon electrodes and a battery — split water into hydrogen and oxygen.' },
  { id: 'golden', name: 'Golden Rain', description: 'Lead nitrate and potassium iodide solutions layered in one beaker — mix them for golden lead-iodide rain.' },
];
export const MATTER_EXPERIMENTS = [
  { id: 'boil', name: 'Boil Water', goal: 'Heat water in a beaker until some of it reaches 95°C.', setup: 'bench', steps: ['Tap "Set up" — a beaker of water over a lit burner (level 2).', 'Wait while the burner heats the water. Add a thermometer or switch to Heat view to watch it climb.', 'Objective (checked live): some water cell reaches 95°C.'] },
  { id: 'electrolysis', name: 'Electrolysis of Water', goal: 'Use the battery and carbon electrodes to split water and collect hydrogen.', setup: 'electrolysis', steps: ['Tap "Set up" — beaker of water, two carbon electrodes, battery alongside.', 'Make sure both electrodes stand in the water and the battery circuit is complete so the current flows.', 'Objective (checked live): more than 40 hydrogen cells collected in the world.'] },
  { id: 'golden', name: 'Golden Rain', goal: 'Mix lead nitrate solution with potassium iodide solution to precipitate golden lead iodide.', setup: 'golden', steps: ['Tap "Set up" — the two solutions sit layered in one beaker.', 'Stir the beaker contents (Stir tool) or tip the beaker so the layers mix.', 'Objective (checked live): more than 40 lead-iodide cells formed.'] },
  { id: 'chill', name: 'Chill to Freezing', goal: 'Freeze water with a level-3 cooling coil sitting inside the beaker.', setup: 'chill', steps: ['Tap "Set up" — a cooling coil at level 3 inside a beaker of water.', 'Wait — the coil pulls heat out of the water around it.', 'Objective (checked live): the water freezes (ice forms, or water reaches 0°C).'] },
];
export function buildSceneInto(e, which, policy = {}) {
  const C = e.cols, R = e.rows;
  const paint = typeof policy.paint === 'function' ? policy.paint : (...args) => e.paint(...args);
  const enginePlaceObject = e.placeObject.bind(e);
  const placeObject = typeof policy.placeObject === 'function' ? policy.placeObject : enginePlaceObject;
  const P = (k, x, y, r, o) => paint(x, y, r, (BY_KEY.get(k) || {}).id || 0, o);
  /* HOTFIX: gear stamps scale on narrow grids — demo placement must use the
     stamp's real size (defaults are the desktop sizes, so desktop scenes are
     byte-identical; on portrait the beaker no longer collides with the floor
     and silently fails to place). */
  let BW = 26, BH = 18;
  try { const st = e._stampFor('beaker-m'); if (st) { BW = st.w; BH = st.h; } } catch { /* keep defaults */ }
  if (which === 'volcano') {
    P('stone', Math.floor(C * 0.3), R - 30, 46); P('rock', Math.floor(C * 0.3), R - 62, 30); P('lava', Math.floor(C * 0.3), R - 78, 13);
    P('sand', Math.floor(C * 0.62), R - 6, 26); P('water', Math.floor(C * 0.78), R - 16, 30);
    P('wood', Math.floor(C * 0.08), R - 10, 7); P('grass', Math.floor(C * 0.52), R - 12, 9);
    for (let x = 0; x < C; x += 3) P('stone', x, R - 2, 2);
  } else if (which === 'electrolysis') {
    for (let x = 8; x < C - 8; x += 3) P('stone', x, R - 14, 2);
    const bx = Math.floor(C * 0.38), by = R - 14;
    const bk = placeObject('beaker-m', bx, by - 6 - BH);
    if (bk != null) { for (let yy = by - 32; yy < by - 18; yy += 2) for (let xx = bx + 5; xx < bx + 22; xx += 2) P('water', xx, yy, 1); }
    placeObject('battery', bx + BW + 8, by - 8);
    placeObject('electrode-carbon', bx + 6, by - 30);
    placeObject('electrode-carbon', bx + 18, by - 30);
  } else if (which === 'golden') {
    for (let x = 8; x < C - 8; x += 3) P('stone', x, R - 14, 2);
    const bx = Math.floor(C * 0.4), by = R - 14;
    const bk = placeObject('beaker-m', bx, by - 6 - BH);
    if (bk != null) {
      for (let yy = by - 24; yy < by - 18; yy += 2) for (let xx = bx + 5; xx < bx + 22; xx += 2) P('lead-nitrate-sol', xx, yy, 1);
      for (let yy = by - 32; yy < by - 24; yy += 2) for (let xx = bx + 5; xx < bx + 22; xx += 2) P('potassium-iodide-sol', xx, yy, 1);
    }
  } else {
    for (let x = 8; x < C - 8; x += 3) { P('stone', x, R - 14, 2); P('wood', x, Math.floor(R * 0.35), 2); }
    const bx = Math.floor(C * 0.4), by = R - 14;
    const burner = placeObject('burner', bx + 4, by - 6);
    if (burner != null) { e.interactObject(burner); }
    const bk = placeObject('beaker-m', bx, by - 6 - BH);
    if (bk != null) P('water', bx + 13, by - 30, 9);
    placeObject('battery', Math.floor(C * 0.68), Math.floor(R * 0.35) - 6);
    placeObject('electrode-carbon', Math.floor(C * 0.74), Math.floor(R * 0.35) - 8);
    placeObject('electrode-copper', Math.floor(C * 0.78), Math.floor(R * 0.35) - 8);
    placeObject('flask', Math.floor(C * 0.6), R - 34);
    placeObject('thermometer', bx + 30, by - 26);
  }
}
/* Real objective check against live engine state. Returns {done, detail}. */
export function computeObjective(e, expId) {
  const idOf = (k) => (BY_KEY.get(k) || {}).id || -1;
  if (expId === 'boil') {
    const wid = idOf('water'); let mx = -999;
    for (let i = 0; i < e.el.length; i++) if (e.el[i] === wid && e.temp[i] > mx) mx = e.temp[i];
    return mx === -999 ? { done: false, detail: 'No water in the world yet' } : { done: mx >= 95, detail: 'Hottest water: ' + Math.round(mx) + '°C / 95°C' };
  }
  if (expId === 'electrolysis') {
    const hid = idOf('hydrogen'); let c = 0;
    for (let i = 0; i < e.el.length; i++) if (e.el[i] === hid) c++;
    return { done: c > 40, detail: 'Hydrogen cells: ' + c + ' / 41' };
  }
  if (expId === 'golden') {
    const pid = idOf('lead-iodide'); let c = 0;
    for (let i = 0; i < e.el.length; i++) if (e.el[i] === pid) c++;
    return { done: c > 40, detail: 'Lead iodide cells: ' + c + ' / 41' };
  }
  if (expId === 'chill') {
    const wid = idOf('water'), iid = idOf('ice'); let ice = 0, mn = 999;
    for (let i = 0; i < e.el.length; i++) { if (e.el[i] === iid) ice++; else if (e.el[i] === wid && e.temp[i] < mn) mn = e.temp[i]; }
    return { done: ice > 20 || mn <= 0, detail: ice > 0 ? 'Ice cells: ' + ice + ' / 21' : (mn === 999 ? 'No water in the world yet' : 'Coldest water: ' + Math.round(mn) + '°C / 0°C') };
  }
  return { done: false, detail: '' };
}
/* ================= V2: pre-rendered sprite cache (realistic pack) =================
   Every sprite is drawn ONCE to an offscreen canvas and cached; the render
   loop only blits. No per-frame vector paths or gradients. */
