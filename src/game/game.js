/* P4 + UI-B — game layer for Matter Lab: progression (stars + unlocks),
   discovery log, daily challenge, achievements, named save slots, and the
   DELTA undo/redo stack. Pure logic + localStorage persistence only — no
   simulation rules, no reaction data, no serialize-format changes live here.
   All NEW storage keys use the `matterlab:` namespace (P5 naming). */
import { BY_KEY } from '../core/matter-elements.js';
import { CARDS } from '../core/matter-reactions.js';
import { computeObjective, MATTER_EXPERIMENTS } from '../tools/sandlab-scenes.js';
import { DAILY_POOL, WEEKLY_POOL, dailyFor, evaluateChallenge, measureChallengeWorld, weeklyFor, weeklyKey, dateKey, yesterdayKey } from './challenges.js';
import { FIELD_KIT_CAPACITY, FIELD_KIT_STARTING_SUPPLY, normalizeSandboxMode } from './sandbox-modes.js';

const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const K = {
  stars: 'matterlab:stars',
  discoveries: 'matterlab:discoveries',
  achievements: 'matterlab:achievements',
  rxTotal: 'matterlab:rx-total',
  daily: 'matterlab:daily',
  flags: 'matterlab:flags',
  slots: 'matterlab:slots',
  haptics: 'matterlab:haptics',
  renderer: 'matterlab:renderer',
  heatRamp: 'matterlab:heat-ramp',
  fontScale: 'matterlab:fontscale',
  touchLevel: 'matterlab:touch-level',
  challengeLedger: 'matterlab:challenge-ledger',
  sandbox: 'matterlab:sandbox-mode',
};

/* ---------------- progression: stars + unlocks ---------------- */
export const getStars = () => lsGet(K.stars, {});
export const totalStars = () => Object.values(getStars()).reduce((a, b) => a + (b | 0), 0);
export function awardStars(expId, stars) {
  const all = getStars();
  const prev = all[expId] | 0;
  if (stars > prev) { all[expId] = stars; lsSet(K.stars, all); return { prev, now: stars, improved: true }; }
  return { prev, now: prev, improved: false };
}
/* Unlock gates (total stars earned). Index-aligned with MATTER_EXPERIMENTS /
   MATTER_SCENES order. Sandbox is NEVER gated — it is not in either list. */
export const EXP_UNLOCK = [0, 1, 3, 5];
export const SCENE_UNLOCK = { volcano: 0, bench: 0, electrolysis: 2, golden: 4 };
export const expUnlockNeed = (expId) => { const i = MATTER_EXPERIMENTS.findIndex((x) => x.id === expId); return i < 0 ? 0 : (EXP_UNLOCK[i] || 0); };
export const isExpUnlocked = (expId, tot = totalStars()) => tot >= expUnlockNeed(expId);
export const isSceneUnlocked = (sceneId, tot = totalStars()) => tot >= (SCENE_UNLOCK[sceneId] || 0);

/* Star rating per experiment, extending computeObjective with real measured
   quantities from the live engine (counts + elapsed ticks since setup).
   1★ = the objective itself (computeObjective.done). 2★/3★ are strictly
   harder, measurable conditions — never inferred, never faked. */
const idOf = (k) => (BY_KEY.get(k) || {}).id || -1;
function countId(e, id) { let c = 0; if (id < 0) return 0; for (let i = 0; i < e.el.length; i++) if (e.el[i] === id) c++; return c; }
export function experimentStars(e, expId, setupTick) {
  const base = computeObjective(e, expId);
  if (!base.done) return { stars: 0, detail: base.detail, extra: '' };
  const elapsed = setupTick != null && e.tick != null ? Math.max(0, e.tick - setupTick) : null;
  if (expId === 'boil') {
    const steam = countId(e, idOf('steam'));
    if (steam >= 25 && elapsed != null && elapsed <= 7200) return { stars: 3, detail: base.detail, extra: `Full boil: ${steam} steam cells within ${Math.round(elapsed / 60)}s of setup` };
    if (steam >= 25) return { stars: 2, detail: base.detail, extra: `Full boil: ${steam} steam cells (3★ needs it within 120s of setup)` };
    return { stars: 1, detail: base.detail, extra: `2★ needs a full boil — 25+ steam cells (now ${steam})` };
  }
  if (expId === 'electrolysis') {
    const h = countId(e, idOf('hydrogen')), o = countId(e, idOf('oxygen'));
    if (h > 150 && o > 40) return { stars: 3, detail: base.detail, extra: `Both gases collected: ${h} hydrogen + ${o} oxygen cells` };
    if (h > 150) return { stars: 2, detail: base.detail, extra: `Hydrogen ${h} (3★ also needs 41+ oxygen cells, now ${o})` };
    return { stars: 1, detail: base.detail, extra: `2★ needs 151+ hydrogen cells (now ${h})` };
  }
  if (expId === 'golden') {
    const p = countId(e, idOf('lead-iodide'));
    if (p > 200 && elapsed != null && elapsed <= 7200) return { stars: 3, detail: base.detail, extra: `Heavy rain: ${p} lead-iodide cells within ${Math.round(elapsed / 60)}s of setup` };
    if (p > 200) return { stars: 2, detail: base.detail, extra: `Heavy rain: ${p} cells (3★ needs it within 120s of setup)` };
    return { stars: 1, detail: base.detail, extra: `2★ needs 201+ lead-iodide cells (now ${p})` };
  }
  if (expId === 'chill') {
    const ice = countId(e, idOf('ice'));
    if (ice > 300) return { stars: 3, detail: base.detail, extra: `Deep freeze: ${ice} ice cells` };
    if (ice > 100) return { stars: 2, detail: base.detail, extra: `Solid freeze: ${ice} ice cells (3★ needs 301+)` };
    return { stars: 1, detail: base.detail, extra: `2★ needs 101+ ice cells (now ${ice})` };
  }
  return { stars: 1, detail: base.detail, extra: '' };
}

/* ---------------- discovery log ---------------- */
export const getDiscoveries = () => lsGet(K.discoveries, {}); // { cardKey: firstSeenAtMs }
/* A NAMED reaction card is a real pair card: its name carries no {a}/{b}
   template placeholders (family/template cards are pair PATTERNS — the
   same distinction the homepage ticker makes). Only named cards count
   toward the NAMED_REACTIVE_COUNT denominator, so only they are logged. */
export const isNamedCard = (key) => {
  if (!key) return false;
  try {
    const c = CARDS && typeof CARDS.get === 'function' ? CARDS.get(key) : null;
    return !!c && !String(c.name || '').includes('{');
  } catch { return false; }
};
/* The discovery map with any non-named keys filtered out (self-healing
   read: data written before this rule existed can never inflate the
   count against the named denominator). */
export function namedDiscoveries() {
  const all = getDiscoveries(); const out = {};
  for (const k of Object.keys(all)) if (isNamedCard(k)) out[k] = all[k];
  return out;
}
/* Records a reaction ONLY when the engine actually fired it in-world AND
   it carries a named pair card. Returns true when NEW. */
export function recordDiscovery(cardKey) {
  if (!cardKey || !isNamedCard(cardKey)) return false;
  const all = getDiscoveries();
  if (all[cardKey]) return false;
  all[cardKey] = Date.now();
  lsSet(K.discoveries, all);
  return true;
}
export const discoveryCount = () => Object.keys(namedDiscoveries()).length;

/* ---------------- reaction counter + flags (achievement inputs) -------- */
export const getRxTotal = () => lsGet(K.rxTotal, 0) | 0;
export function bumpRxTotal() { const n = getRxTotal() + 1; lsSet(K.rxTotal, n); return n; }
export const getFlags = () => lsGet(K.flags, {});
export function setFlag(name) { const f = getFlags(); if (!f[name]) { f[name] = Date.now(); lsSet(K.flags, f); } }

/* ---------------- achievements ---------------- */
export const ACHIEVEMENTS = [
  { id: 'first-reaction', name: 'First Reaction', desc: 'Trigger any reaction in the world.' },
  { id: 'first-discovery', name: 'First Discovery', desc: 'Discover your first named reaction.' },
  { id: 'first-boil', name: 'First Boil', desc: 'Get water to 100°C somewhere in the world.' },
  { id: 'first-explosion', name: 'First Explosion', desc: 'Set off an explosion.' },
  { id: 'rx-10', name: 'Getting Reactive', desc: 'Trigger 10 reactions in total.' },
  { id: 'rx-100', name: 'Chain Reactor', desc: 'Trigger 100 reactions in total.' },
  { id: 'rx-1000', name: 'Reaction Machine', desc: 'Trigger 1,000 reactions in total.' },
  { id: 'disc-10', name: 'Field Notes', desc: 'Discover 10 different named reactions.' },
  { id: 'disc-50', name: 'Reaction Hunter', desc: 'Discover 50 different named reactions.' },
  { id: 'disc-250', name: 'Master of Reactions', desc: 'Discover 250 different named reactions.' },
  { id: 'first-custom', name: 'Inventor', desc: 'Create your first custom substance.' },
  { id: 'first-share', name: 'Show & Tell', desc: 'Copy a scene share code for the first time.' },
  { id: 'all-exp-1', name: 'Course Complete', desc: 'Earn at least 1★ on every experiment.' },
  { id: 'daily-done', name: 'Daily Chemist', desc: 'Complete a daily challenge.' },
];
export const getAchievements = () => lsGet(K.achievements, {}); // { id: earnedAtMs }
/* Awards if not already earned. Returns the achievement def when NEW. */
export function awardAchievement(id) {
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  if (!def) return null;
  const all = getAchievements();
  if (all[id]) return null;
  all[id] = Date.now();
  lsSet(K.achievements, all);
  return def;
}
/* Count-based achievements, re-checked whenever the counters move. Returns
   the list of newly earned defs. */
export function checkCountAchievements() {
  const out = [];
  const rx = getRxTotal(), disc = discoveryCount();
  const stars = getStars();
  const tests = [
    ['rx-10', rx >= 10], ['rx-100', rx >= 100], ['rx-1000', rx >= 1000],
    ['disc-10', disc >= 10], ['disc-50', disc >= 50], ['disc-250', disc >= 250],
    ['all-exp-1', MATTER_EXPERIMENTS.length > 0 && MATTER_EXPERIMENTS.every((x) => (stars[x.id] | 0) >= 1)],
  ];
  for (const [id, ok] of tests) if (ok) { const d = awardAchievement(id); if (d) out.push(d); }
  return out;
}

/* ---------------- challenge board: daily + weekly, evidence + rewards --- */
export { DAILY_POOL, WEEKLY_POOL, dailyFor, weeklyFor, weeklyKey, dateKey, yesterdayKey, measureChallengeWorld, evaluateChallenge };
export const getDailyState = () => lsGet(K.daily, {}); // legacy-compatible { [dateKey]: { done, at, id } }
const EMPTY_CHALLENGE_LEDGER = () => ({ version: 1, points: 0, completed: { daily: {}, weekly: {} }, activity: { daily: {}, weekly: {} } });
const boundedMap = (value, limit) => {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const keys = Object.keys(obj).sort().slice(-limit);
  return Object.fromEntries(keys.map((key) => [key, obj[key]]));
};
export function getChallengeLedger() {
  const raw = lsGet(K.challengeLedger, {});
  const empty = EMPTY_CHALLENGE_LEDGER();
  const completed = raw && raw.completed && typeof raw.completed === 'object' ? raw.completed : {};
  const activity = raw && raw.activity && typeof raw.activity === 'object' ? raw.activity : {};
  return {
    version: 1,
    points: Math.max(0, Number(raw && raw.points) || 0),
    completed: {
      daily: boundedMap(completed.daily, 400),
      weekly: boundedMap(completed.weekly, 104),
    },
    activity: {
      daily: boundedMap(activity.daily, 60),
      weekly: boundedMap(activity.weekly, 52),
    },
    ...(!raw || typeof raw !== 'object' ? empty : {}),
  };
}
const saveChallengeLedger = (ledger) => lsSet(K.challengeLedger, ledger);
export function getChallengeActivity(day = dateKey()) {
  const d = String(day);
  const week = weeklyKey(d);
  const ledger = getChallengeLedger();
  return {
    day: d,
    week,
    dailyReactions: new Set(Array.isArray(ledger.activity.daily[d]) ? ledger.activity.daily[d] : []),
    weeklyReactions: new Set(Array.isArray(ledger.activity.weekly[week]) ? ledger.activity.weekly[week] : []),
  };
}
/** Call only for a named reaction the engine genuinely fired. Duplicate card
    keys do not rewrite storage or inflate either period's distinct count. */
export function recordChallengeReaction(cardKey, day = dateKey()) {
  const key = String(cardKey == null ? '' : cardKey).trim().slice(0, 160);
  if (!key) return false;
  const d = String(day), week = weeklyKey(d), ledger = getChallengeLedger();
  const daily = new Set(Array.isArray(ledger.activity.daily[d]) ? ledger.activity.daily[d] : []);
  const weekly = new Set(Array.isArray(ledger.activity.weekly[week]) ? ledger.activity.weekly[week] : []);
  const changed = !daily.has(key) || !weekly.has(key);
  if (!changed) return false;
  daily.add(key); weekly.add(key);
  ledger.activity.daily[d] = [...daily].slice(-512);
  ledger.activity.weekly[week] = [...weekly].slice(-2048);
  ledger.activity.daily = boundedMap(ledger.activity.daily, 60);
  ledger.activity.weekly = boundedMap(ledger.activity.weekly, 52);
  return saveChallengeLedger(ledger);
}
export function completeChallenge(period, periodKey, challengeId, at = Date.now(), reward = null) {
  if (period !== 'daily' && period !== 'weekly') return false;
  const key = String(periodKey || (period === 'daily' ? dateKey() : weeklyKey()));
  const ledger = getChallengeLedger();
  if (ledger.completed[period][key]) return false;
  const defaultReward = period === 'daily' ? 25 : 100;
  const points = Math.max(0, Math.floor(Number(reward) || defaultReward));
  ledger.completed[period][key] = {
    id: String(challengeId || ''),
    at: Number.isFinite(at) ? at : Date.now(),
    reward: points,
  };
  ledger.completed[period] = boundedMap(ledger.completed[period], period === 'daily' ? 400 : 104);
  ledger.points += points;
  return saveChallengeLedger(ledger);
}
export function markDailyDone(key = dateKey(), challengeId = dailyFor(key).id, at = Date.now()) {
  const all = getDailyState();
  if (all[key] && all[key].done) return false;
  all[key] = { done: true, at: Number.isFinite(at) ? at : Date.now(), id: challengeId };
  const stored = lsSet(K.daily, boundedMap(all, 400));
  completeChallenge('daily', key, challengeId, at, dailyFor(key).reward);
  return stored;
}
export function markWeeklyDone(key = weeklyKey(), challengeId = weeklyFor(key).id, at = Date.now()) {
  return completeChallenge('weekly', key, challengeId, at, weeklyFor(key).reward);
}
function completionKeys() {
  const ledger = getChallengeLedger();
  const legacy = getDailyState();
  return new Set([...Object.keys(ledger.completed.daily), ...Object.keys(legacy).filter((key) => legacy[key] && legacy[key].done)]);
}
export function dailyChallengeStreak(today = dateKey()) {
  const completed = completionKeys();
  let cursor = completed.has(today) ? today : (completed.has(yesterdayKey(today)) ? yesterdayKey(today) : null);
  if (!cursor) return 0;
  let streak = 0;
  while (completed.has(cursor) && streak < 400) {
    streak++;
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = dateKey(d);
  }
  return streak;
}
export function getChallengeSummary(now = new Date()) {
  const today = dateKey(now), week = weeklyKey(now), ledger = getChallengeLedger(), daily = getDailyState();
  return {
    points: ledger.points,
    streak: dailyChallengeStreak(today),
    dailyDone: !!((daily[today] && daily[today].done) || ledger.completed.daily[today]),
    weeklyDone: !!ledger.completed.weekly[week],
    dailyCompleted: completionKeys().size,
    weeklyCompleted: Object.keys(ledger.completed.weekly).length,
    today, week,
  };
}

/* ---------------- sandbox mode persistence ---------------------------- */
export function getSandboxState() {
  const raw = lsGet(K.sandbox, {});
  const mode = normalizeSandboxMode(raw && raw.mode);
  const stored = Number(raw && raw.credits);
  const credits = Number.isFinite(stored)
    ? Math.max(0, Math.min(FIELD_KIT_CAPACITY, Math.floor(stored)))
    : FIELD_KIT_STARTING_SUPPLY;
  return { mode, credits };
}
export function setSandboxState(value = {}) {
  const current = getSandboxState();
  const mode = normalizeSandboxMode(value.mode == null ? current.mode : value.mode);
  // Field Kit stock belongs to the player, not the currently selected mode.
  // Preserve it while visiting Creative/Moon/Jupiter so switching back cannot
  // silently refill a depleted kit; only an explicit field-kit balance updates it.
  const requested = Number(value.credits == null ? current.credits : value.credits);
  const credits = mode !== 'field-kit'
    ? current.credits
    : Number.isFinite(requested)
      ? Math.max(0, Math.min(FIELD_KIT_CAPACITY, Math.floor(requested)))
      : FIELD_KIT_STARTING_SUPPLY;
  return lsSet(K.sandbox, { mode, credits });
}

/* ---------------- named save slots ---------------- */
export const MAX_SAVE_SLOTS = 12;
export const MAX_SAVE_SLOT_NAME_LENGTH = 48;
export function normalizeSaveSlotName(value, fallback = 'Scene') {
  const name = String(value == null ? '' : value).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SAVE_SLOT_NAME_LENGTH);
  return name || String(fallback).slice(0, MAX_SAVE_SLOT_NAME_LENGTH);
}
export function upsertSaveSlot(slots, slot) {
  if (!Array.isArray(slots) || !slot || typeof slot !== 'object') return { ok: false, reason: 'invalid' };
  const name = normalizeSaveSlotName(slot.name, 'Scene');
  const index = slots.findIndex((entry) => normalizeSaveSlotName(entry && entry.name, '').toLocaleLowerCase() === name.toLocaleLowerCase());
  if (index < 0 && slots.length >= MAX_SAVE_SLOTS) return { ok: false, reason: 'limit' };
  const saved = { ...slot, id: index >= 0 ? slots[index].id : slot.id, name };
  if (!saved.id) return { ok: false, reason: 'invalid' };
  const next = index >= 0 ? slots.map((entry, i) => i === index ? saved : entry) : [...slots, saved];
  return { ok: true, updated: index >= 0, slots: next };
}
/* Legacy single-key scenes (omni:sandlab:scenes, numeric slots) are imported
   as named slots on first read — the old key is left untouched, so nothing
   is lost if an older build reads it again. */
export function loadSlots() {
  const cur = lsGet(K.slots, null);
  if (Array.isArray(cur)) return cur;
  const legacy = lsGet('omni:sandlab:scenes', {});
  const out = [];
  if (legacy && typeof legacy === 'object') {
    for (const k of Object.keys(legacy).sort((a, b) => Number(a) - Number(b))) {
      const s = legacy[k];
      if (s && s.data) out.push({ id: 'legacy-' + k, name: `Slot ${Number(k) + 1} (imported)`, at: s.at || Date.now(), data: s.data, parts: null, subs: null });
    }
  }
  lsSet(K.slots, out);
  return out;
}
export const saveSlots = (slots) => lsSet(K.slots, slots);

/* ---------------- settings helpers ---------------- */
export const getHaptics = () => lsGet(K.haptics, true) !== false;
export const setHaptics = (b) => lsSet(K.haptics, !!b);
export const getRendererPref = () => { const v = lsGet(K.renderer, 'auto'); return ['auto', 'gl', '2d', 'simple'].includes(v) ? v : 'auto'; };
export const setRendererPref = (v) => lsSet(K.renderer, v);
export const getHeatRamp = () => (lsGet(K.heatRamp, 'classic') === 'viridis' ? 'viridis' : 'classic');
export const setHeatRamp = (v) => lsSet(K.heatRamp, v);
export const getFontScale = () => { const v = lsGet(K.fontScale, 'm'); return ['s', 'm', 'l', 'xl'].includes(v) ? v : 'm'; };
export const setFontScale = (v) => lsSet(K.fontScale, v);
export const getTouchLevel = () => { const v = lsGet(K.touchLevel, 'medium'); return ['easy', 'medium', 'hard'].includes(v) ? v : 'medium'; };
export const setTouchLevel = (v) => lsSet(K.touchLevel, ['easy', 'medium', 'hard'].includes(v) ? v : 'medium');

/* =====================================================================
   DELTA UNDO/REDO STACK
   Old behaviour (UI-A): every snapshot copied el (Uint16) + temp (Float32)
   wholesale — 6 bytes/cell, ~810 KB per step on a 480×270 grid, 10 steps.
   Delta behaviour: the chain stores ONE full base entry; every later entry
   is a bidirectional patch of RUNS of changed cells between consecutive
   snapshot states (el uint16 + temp int16-quantised — the same 1°C
   precision the ML1 serialize format itself keeps). A patch whose bytes
   would exceed 70% of a full copy is stored as a full copy instead (new
   base). Caps: max 30 steps AND a 24 MB byte budget; trimming the oldest
   entry materialises the next one as a full base so the chain always
   reconstructs exactly. Restore semantics are IDENTICAL to the old code:
   the target state is rebuilt into a scratch buffer and set wholesale.
   ===================================================================== */
export const qTemp = (temp) => { const out = new Int16Array(temp.length); for (let i = 0; i < temp.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(temp[i]))); return out; };
export const stateOf = (e) => ({ cols: e.cols, rows: e.rows, el: e.el.slice(), tempQ: qTemp(e.temp) });
export const fullBytes = (cols, rows) => cols * rows * 4; // el 2B + tempQ 2B

function diffRuns(aEl, aT, bEl, bT) {
  // Runs of consecutive indices where a != b (either array). Returns
  // { starts, lens, aEl, aT, bEl, bT } with values packed per run.
  const n = aEl.length;
  const starts = [], lens = [];
  let aEv = [], aTv = [], bEv = [], bTv = [];
  let i = 0;
  while (i < n) {
    if (aEl[i] === bEl[i] && aT[i] === bT[i]) { i++; continue; }
    const s = i;
    while (i < n && (aEl[i] !== bEl[i] || aT[i] !== bT[i])) i++;
    starts.push(s); lens.push(i - s);
    for (let j = s; j < i; j++) { aEv.push(aEl[j]); aTv.push(aT[j]); bEv.push(bEl[j]); bTv.push(bT[j]); }
  }
  return { starts: Int32Array.from(starts), lens: Int32Array.from(lens), aEl: Uint16Array.from(aEv), aT: Int16Array.from(aTv), bEl: Uint16Array.from(bEv), bT: Int16Array.from(bTv), changed: aEv.length };
}
export function entryBytes(en) {
  if (!en) return 0;
  if (en.kind === 'full') return en.el.byteLength + en.tempQ.byteLength + 32;
  const r = en.runs;
  return r.starts.byteLength + r.lens.byteLength + r.aEl.byteLength + r.aT.byteLength + r.bEl.byteLength + r.bT.byteLength + 32;
}
function makeEntry(prev, cur) {
  if (!prev || prev.cols !== cur.cols || prev.rows !== cur.rows) return { kind: 'full', cols: cur.cols, rows: cur.rows, el: cur.el, tempQ: cur.tempQ };
  const runs = diffRuns(prev.el, prev.tempQ, cur.el, cur.tempQ);
  const patch = { kind: 'patch', cols: cur.cols, rows: cur.rows, runs };
  if (entryBytes(patch) > fullBytes(cur.cols, cur.rows) * 0.7) return { kind: 'full', cols: cur.cols, rows: cur.rows, el: cur.el, tempQ: cur.tempQ };
  return patch;
}
function applyPatchForward(buf, en) { // buf holds prev state -> becomes cur state
  const r = en.runs; let o = 0;
  for (let k = 0; k < r.starts.length; k++) { const s = r.starts[k], len = r.lens[k]; for (let j = 0; j < len; j++) { buf.el[s + j] = r.bEl[o + j]; buf.tempQ[s + j] = r.bT[o + j]; } o += len; }
}
function entryTarget(prevState, en) {
  if (en.kind === 'full') return { cols: en.cols, rows: en.rows, el: en.el.slice(), tempQ: en.tempQ.slice() };
  const buf = { cols: en.cols, rows: en.rows, el: prevState.el.slice(), tempQ: prevState.tempQ.slice() };
  applyPatchForward(buf, en);
  return buf;
}

export class DeltaStack {
  constructor(maxSteps = 30, byteBudget = 24 * 1024 * 1024) {
    this.maxSteps = maxSteps; this.byteBudget = byteBudget;
    this.entries = []; this.lastBytes = 0; this.lastFullBytes = 0;
    this._top = null; // cached top target state (the state the top entry reconstructs to)
  }
  get length() { return this.entries.length; }
  totalBytes() { return this.entries.reduce((a, en) => a + entryBytes(en), 0); }
  _topState() {
    let st = null;
    for (const en of this.entries) st = entryTarget(st, en);
    return st;
  }
  /* Append a new target state (diffed against the current top target). */
  push(state) {
    const prev = this.entries.length ? this._top : null;
    const en = makeEntry(prev, state);
    this.lastBytes = entryBytes(en);
    this.lastFullBytes = fullBytes(state.cols, state.rows);
    this.entries.push(en);
    this._top = state;
    this._trim();
  }
  /* Remove and return the top target state (exact reconstruction). */
  popTarget() {
    if (!this.entries.length) return null;
    const st = this._top;
    this.entries.pop();
    this._top = this.entries.length ? this._topState() : null;
    return st;
  }
  peekTarget() { return this.entries.length ? this._top : null; }
  clear() { this.entries = []; this._top = null; }
  _trim() {
    while (this.entries.length > this.maxSteps || (this.entries.length > 1 && this.totalBytes() > this.byteBudget)) {
      // Materialise the second entry against the first, then drop the first —
      // the chain keeps reconstructing exactly with a new full base.
      const first = this.entries[0], second = this.entries[1];
      if (!second) { this.entries.shift(); break; }
      const base = entryTarget(null, first);
      this.entries[1] = makeEntry(null, entryTarget(base, second));
      // makeEntry(null, x) is always a full copy — exactly what we need.
      this.entries.shift();
    }
  }
}
