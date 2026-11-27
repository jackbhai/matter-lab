/* v27 — deterministic, evidence-based daily and weekly challenges.
   This module deliberately depends only on engine-shaped data and element
   metadata: a challenge can only advance from cells/temperatures/objects in
   the actual world, or a set of named reactions the caller observed occur. */
import { BY_KEY } from '../core/matter-elements.js';

export const dateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : parseDateKey(date);
  if (!d || Number.isNaN(d.getTime())) return dateKey(new Date());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function parseDateKey(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return d.getFullYear() === Number(match[1]) && d.getMonth() === Number(match[2]) - 1 && d.getDate() === Number(match[3]) ? d : null;
}

export function weeklyKey(date = new Date()) {
  const d = parseDateKey(date);
  if (!d) return weeklyKey(new Date());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // local Monday, ISO-style week start
  return dateKey(d);
}

export const yesterdayKey = (date = new Date()) => {
  const d = parseDateKey(date) || new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
};

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const ID = Object.freeze(Object.fromEntries(
  ['water', 'ice', 'lead-iodide', 'steam', 'sand', 'brine', 'smoke', 'oil', 'fire']
    .map((key) => [key, (BY_KEY.get(key) || {}).id || 0]),
));
const DAILY_ID = 'daily';
const WEEKLY_ID = 'weekly';

/** One bounded world scan feeds both active boards (never one scan per card). */
export function measureChallengeWorld(engine) {
  if (!engine || !engine.el || !engine.temp) return { counts: {}, hotWater90: 0, hotWater100: 0, coldWater: 0, uniqueSubstances: 0, particles: 0, objects: 0 };
  const countsById = new Map();
  const seen = new Set();
  let hotWater90 = 0, hotWater100 = 0, coldWater = 0;
  const waterId = ID.water, iceId = ID.ice;
  for (let i = 0; i < engine.el.length; i++) {
    const id = engine.el[i];
    if (!id) continue;
    countsById.set(id, (countsById.get(id) || 0) + 1);
    seen.add(id);
    if (id === waterId) {
      const temp = engine.temp[i];
      if (temp >= 90) hotWater90++;
      if (temp >= 100) hotWater100++;
      if (temp <= 0) coldWater++;
    }
  }
  const counts = {};
  for (const [key, id] of Object.entries(ID)) counts[key] = id ? (countsById.get(id) || 0) : 0;
  return {
    counts,
    hotWater90,
    hotWater100,
    coldWater,
    uniqueSubstances: seen.size,
    particles: Number.isFinite(engine.particles) ? engine.particles : engine.el.length,
    objects: engine.objects && typeof engine.objects.size === 'number' ? engine.objects.size : 0,
  };
}

const progress = (current, target, detail, extra = {}) => {
  const n = Number.isFinite(current) ? Math.max(0, current) : 0;
  const t = Math.max(1, Number(target) || 1);
  const done = n >= t;
  return { current: n, target: t, progress: Math.max(0, Math.min(1, n / t)), done, complete: done, detail, ...extra };
};
const count = (m, key) => Math.max(0, Number(m?.counts?.[key]) || 0);
const setSize = (value) => value instanceof Set ? value.size : Array.isArray(value) ? value.length : Math.max(0, Number(value) || 0);

const daily = (id, name, text, evaluate) => ({ id, period: DAILY_ID, name, text, reward: 25, evaluate });
const weekly = (id, name, text, evaluate) => ({ id, period: WEEKLY_ID, name, text, reward: 100, evaluate });

/* The original five daily IDs/order stay intact: old devices keep showing a
   recognisable assignment while the expanded pool rotates through more labs. */
export const DAILY_POOL = Object.freeze([
  daily('boil200', 'Rolling Boil', 'Get 200+ water cells to 90°C or hotter at the same time.', (m) => progress(m.hotWater90, 200, `${m.hotWater90} / 200 hot water cells`)),
  daily('freeze50', 'Deep Freeze', 'Freeze water — have 50+ ice cells in the world at once.', (m) => progress(count(m, 'ice'), 50, `${count(m, 'ice')} / 50 ice cells`)),
  daily('golden40', 'Golden Rain', 'Make 40+ lead-iodide cells in one live world.', (m) => progress(count(m, 'lead-iodide'), 40, `${count(m, 'lead-iodide')} / 40 lead-iodide cells`)),
  daily('steam100', 'Steam Room', 'Fill the lab with 100+ steam cells at once.', (m) => progress(count(m, 'steam'), 100, `${count(m, 'steam')} / 100 steam cells`)),
  daily('rx5', 'Five Reactions', 'Trigger 5 different named reactions today.', (m, ctx) => { const n = setSize(ctx?.dailyReactions ?? ctx?.rxToday); return progress(n, 5, `${n} / 5 different named reactions today`); }),
  daily('thermal-cycle', 'Two-Phase Window', 'Keep 50 hot water cells and 25 steam cells in the same world.', (m) => {
    const hot = Math.min(1, m.hotWater90 / 50), steam = Math.min(1, count(m, 'steam') / 25), p = Math.min(hot, steam);
    return progress(p, 1, `Hot water ${Math.min(50, m.hotWater90)} / 50 · steam ${Math.min(25, count(m, 'steam'))} / 25`, { components: [{ current: m.hotWater90, target: 50 }, { current: count(m, 'steam'), target: 25 }] });
  }),
  daily('apparatus-three', 'Bench Crew', 'Place three working pieces of lab gear in the world.', (m) => progress(m.objects, 3, `${m.objects} / 3 lab objects`)),
  daily('matter-eight', 'Material Survey', 'Bring eight different substances into one world.', (m) => progress(m.uniqueSubstances, 8, `${m.uniqueSubstances} / 8 substances`)),
  daily('sand-dune', 'Build a Dune', 'Gather 180 or more sand cells in the world.', (m) => progress(count(m, 'sand'), 180, `${count(m, 'sand')} / 180 sand cells`)),
  daily('brine-batch', 'Brine Batch', 'Make 80 or more brine cells.', (m) => progress(count(m, 'brine'), 80, `${count(m, 'brine')} / 80 brine cells`)),
  daily('cold-and-hot', 'Thermal Contrast', 'Show 30 hot water cells and 30 ice cells together.', (m) => {
    const a = Math.min(1, m.hotWater90 / 30), b = Math.min(1, count(m, 'ice') / 30), p = Math.min(a, b);
    return progress(p, 1, `Hot water ${Math.min(30, m.hotWater90)} / 30 · ice ${Math.min(30, count(m, 'ice'))} / 30`, { components: [{ current: m.hotWater90, target: 30 }, { current: count(m, 'ice'), target: 30 }] });
  }),
  daily('steam-and-smoke', 'Atmosphere Study', 'Build a plume of 60 steam and 40 smoke cells.', (m) => {
    const steam = count(m, 'steam'), smoke = count(m, 'smoke'), p = Math.min(steam / 60, smoke / 40);
    return progress(p, 1, `Steam ${Math.min(60, steam)} / 60 · smoke ${Math.min(40, smoke)} / 40`, { components: [{ current: steam, target: 60 }, { current: smoke, target: 40 }] });
  }),
]);

export const WEEKLY_POOL = Object.freeze([
  weekly('rx25', 'Reaction Atlas', 'Discover 25 different named reactions this week.', (m, ctx) => { const n = setSize(ctx?.weeklyReactions); return progress(n, 25, `${n} / 25 named reactions this week`); }),
  weekly('winter300', 'Winter Reservoir', 'Accumulate 300 ice cells in one world.', (m) => progress(count(m, 'ice'), 300, `${count(m, 'ice')} / 300 ice cells`)),
  weekly('golden300', 'Precipitation Run', 'Grow 300 lead-iodide cells in one world.', (m) => progress(count(m, 'lead-iodide'), 300, `${count(m, 'lead-iodide')} / 300 lead-iodide cells`)),
  weekly('boiling500', 'Industrial Boil', 'Hold at least 500 water cells above 90°C.', (m) => progress(m.hotWater90, 500, `${m.hotWater90} / 500 hot water cells`)),
  weekly('apparatus-five', 'Instrumented Lab', 'Place five lab objects and use at least eight substances.', (m) => {
    const p = Math.min(m.objects / 5, m.uniqueSubstances / 8);
    return progress(p, 1, `Lab objects ${Math.min(5, m.objects)} / 5 · substances ${Math.min(8, m.uniqueSubstances)} / 8`, { components: [{ current: m.objects, target: 5 }, { current: m.uniqueSubstances, target: 8 }] });
  }),
  weekly('phase-pair', 'Steamworks', 'Maintain 200 hot water cells and 120 steam cells together.', (m) => {
    const p = Math.min(m.hotWater90 / 200, count(m, 'steam') / 120);
    return progress(p, 1, `Hot water ${Math.min(200, m.hotWater90)} / 200 · steam ${Math.min(120, count(m, 'steam'))} / 120`, { components: [{ current: m.hotWater90, target: 200 }, { current: count(m, 'steam'), target: 120 }] });
  }),
  weekly('material-census', 'Matter Census', 'Reach 14 different substances and 400 particles in one scene.', (m) => {
    const p = Math.min(m.uniqueSubstances / 14, m.particles / 400);
    return progress(p, 1, `Substances ${Math.min(14, m.uniqueSubstances)} / 14 · particles ${Math.min(400, m.particles)} / 400`, { components: [{ current: m.uniqueSubstances, target: 14 }, { current: m.particles, target: 400 }] });
  }),
  weekly('water-and-ice', 'Equilibrium Study', 'Keep 250 water and 250 ice cells in the same scene.', (m) => {
    const water = count(m, 'water'), ice = count(m, 'ice'), p = Math.min(water / 250, ice / 250);
    return progress(p, 1, `Water ${Math.min(250, water)} / 250 · ice ${Math.min(250, ice)} / 250`, { components: [{ current: water, target: 250 }, { current: ice, target: 250 }] });
  }),
]);

const DAILY_BY_ID = new Map(DAILY_POOL.map((challenge) => [challenge.id, challenge]));
const WEEKLY_BY_ID = new Map(WEEKLY_POOL.map((challenge) => [challenge.id, challenge]));

export function dailyFor(key) {
  const day = key instanceof Date ? dateKey(key) : (parseDateKey(key) ? dateKey(key) : dateKey());
  return DAILY_POOL[seedOf(`matterlab-daily:${day}`) % DAILY_POOL.length];
}

export function weeklyFor(key) {
  const week = weeklyKey(key instanceof Date || parseDateKey(key) ? key : new Date());
  return WEEKLY_POOL[seedOf(`matterlab-weekly:${week}`) % WEEKLY_POOL.length];
}

export function challengeById(id, period = DAILY_ID) {
  return (period === WEEKLY_ID ? WEEKLY_BY_ID : DAILY_BY_ID).get(id) || null;
}

export function evaluateChallenge(challenge, worldMetrics, context = {}) {
  if (!challenge || typeof challenge.evaluate !== 'function') return progress(0, 1, 'Unknown challenge');
  try { return challenge.evaluate(worldMetrics || {}, context); }
  catch { return progress(0, 1, 'Progress unavailable'); }
}

/** Compatibility: old callers can still ask a definition to scan/check an engine. */
for (const challenge of [...DAILY_POOL, ...WEEKLY_POOL]) {
  challenge.check = (engine, context) => evaluateChallenge(challenge, measureChallengeWorld(engine), context);
}

export const dailyChallengeCount = DAILY_POOL.length;
export const weeklyChallengeCount = WEEKLY_POOL.length;
