/* Matter Lab Ultra — v21 adaptive tier controller.
 * The resolution source of truth is MatterEngine.TIERS. These five physical
 * grid budgets are mapped to four human-facing quality labels (Max / High /
 * Mid / Low); the final engine tier is the 2GB-safe Low floor.
 *
 * Tier index 0 is the largest grid; larger indices use fewer cells.
 */
import { TIERS as ENGINE_TIERS } from './matter-engine.js';

export const TIERS = ENGINE_TIERS;
export const QUALITY_LEVELS = Object.freeze([
  { id: 'max', label: 'Max', engineIndex: 0 },
  { id: 'high', label: 'High', engineIndex: 1 },
  { id: 'mid', label: 'Mid', engineIndex: 2 },
  { id: 'low', label: 'Low', engineIndex: 3 },
]);
export const SAFE_TIER_INDEX = TIERS.length - 1;
export const MAX_TIER_INDEX = 0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
const finite = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function tierName(index, safeMode = false) {
  const i = clamp(index, 0, TIERS.length - 1);
  if (safeMode && i === SAFE_TIER_INDEX) return 'Low · 2GB safe';
  if (i === SAFE_TIER_INDEX) return 'Low · minimum grid';
  return QUALITY_LEVELS.find((tier) => tier.engineIndex === i)?.label || 'Low';
}

/* Derive an aspect-matched size from the engine's real cell budget. Unlike
   arbitrary square grids, every result stays within that tier's cell count. */
export function dimensionsForTier(index, aspect = 16 / 9) {
  const tier = TIERS[clamp(index, 0, TIERS.length - 1)];
  const budget = tier.cols * tier.rows;
  const a = Math.max(0.3, Math.min(3.4, finite(aspect, 16 / 9)));
  let cols = Math.max(8, Math.min(720, Math.round(Math.sqrt(budget * a))));
  let rows = Math.max(8, Math.min(720, Math.floor(budget / cols)));
  if (cols * rows > budget) rows = Math.max(8, rows - 1);
  if (cols * rows > budget) cols = Math.max(8, Math.floor(budget / rows));
  return { cols, rows, cellBudget: budget, tierIndex: clamp(index, 0, TIERS.length - 1) };
}

/**
 * Create a live quality governor attached to a real MatterEngine instance.
 * `update(stats, now)` is intended to run once per animation frame. It applies
 * tier changes directly to engine.setTier()/resize(), with hysteresis and a
 * cooldown so borderline FPS does not oscillate the simulation grid.
 *
 * stats: { fps, stepEmaMs, particles, particleRatio, memoryPressure,
 *          heapUsedBytes, engineBytes }
 * options: { initialTierIndex, safeMode, getDimensions, onTierChange,
 *            upgradeHoldMs, downgradeHoldMs, memoryHoldMs }
 */
export function createAdaptiveTiers(engine, preferences = {}, options = {}) {
  const autoDefault = preferences.autoTier !== false;
  const safeMode = !!options.safeMode;
  const floorIndex = safeMode ? SAFE_TIER_INDEX : clamp(options.floorIndex ?? MAX_TIER_INDEX, MAX_TIER_INDEX, SAFE_TIER_INDEX);
  const initial = Math.max(floorIndex, clamp(options.initialTierIndex ?? engine?.governor?.tierIndex ?? 1, 0, SAFE_TIER_INDEX));
  const thresholds = {
    fpsDown: finite(preferences.fpsDown, 30),
    fpsUp: finite(preferences.fpsUp, 52),
    memoryDown: finite(preferences.memoryDown, 0.86),
    memoryUp: finite(preferences.memoryUp, 0.62),
    particleDown: finite(preferences.particleDown, 0.88),
    particleUp: finite(preferences.particleUp, 0.72),
    downgradeHoldMs: Math.max(300, finite(options.downgradeHoldMs ?? preferences.downgradeHoldMs, 2500)),
    memoryHoldMs: Math.max(200, finite(options.memoryHoldMs ?? preferences.memoryHoldMs, 1500)),
    upgradeHoldMs: Math.max(1000, finite(options.upgradeHoldMs ?? preferences.upgradeHoldMs, 15000)),
    cooldownMs: Math.max(250, finite(options.cooldownMs ?? preferences.tierCooldownMs, 8000)),
    transitionMs: Math.max(100, finite(options.transitionMs, 260)),
    /* PHONE-FIX: automatic tier changes may resize the grid only inside a
       short settle window at session start. After that the grid is frozen
       for the session — sustained load is absorbed by the render
       governor's step-rate ladder instead of by rescaling the world
       (the old behaviour read on the phone as the whole screen shaking
       every few seconds under a lit burner). Manual tier changes and the
       2GB safety floor always apply immediately. */
    sessionResizeMs: Math.max(0, finite(options.sessionResizeMs, 3000)),
  };

  const getDimensions = typeof options.getDimensions === 'function'
    ? options.getDimensions
    : (index) => ({ cols: TIERS[index].cols, rows: TIERS[index].rows });
  const initialDimensions = getDimensions(initial, safeMode);
  const state = {
    index: initial,
    cols: initialDimensions.cols,
    rows: initialDimensions.rows,
    auto: autoDefault,
    safeMode,
    floorIndex,
    fps: 0,
    stepEmaMs: 0,
    particles: 0,
    particleBudget: 0,
    particleRatio: 0,
    memoryPressure: 0,
    heapUsedBytes: 0,
    engineBytes: 0,
    lastReason: 'initial',
    lastChangeAt: -Infinity,
    sessionStartAt: null,
    ratcheted: false,
    downSince: 0,
    memorySince: 0,
    upSince: 0,
    transition: { from: initial, to: initial, startedAt: 0, durationMs: thresholds.transitionMs },
  };

  const onTierChange = typeof options.onTierChange === 'function' ? options.onTierChange : () => {};

  function applyTier(requestedIndex, reason = 'manual', now = 0) {
    const next = Math.max(state.floorIndex, clamp(requestedIndex, 0, SAFE_TIER_INDEX));
    if (next === state.index) return false;
    const from = state.index;
    const dims = getDimensions(next, state.safeMode);
    if (engine) {
      const setTier = typeof engine.setTier === 'function' ? engine.setTier.bind(engine) : engine.resize?.bind(engine);
      if (setTier && dims && Number.isFinite(dims.cols) && Number.isFinite(dims.rows)) setTier(dims.cols, dims.rows);
    }
    /* PHONE-FIX ratchet: once an automatic change steps DOWN under load,
       automatic step-ups are disabled for the rest of the session — the
       down/up alternation was the visible oscillation. */
    if (next > from && reason !== 'manual' && reason !== '2GB safety floor') state.ratcheted = true;
    state.index = next;
    state.cols = dims.cols;
    state.rows = dims.rows;
    state.lastReason = reason;
    state.lastChangeAt = finite(now, 0);
    state.transition = { from, to: next, startedAt: state.lastChangeAt, durationMs: thresholds.transitionMs };
    state.downSince = 0;
    state.memorySince = 0;
    state.upSince = 0;
    onTierChange(next, { from, to: next, reason, dims, transition: { ...state.transition } });
    return true;
  }

  function setAuto(enabled) {
    state.auto = !!enabled;
    state.downSince = 0;
    state.memorySince = 0;
    state.upSince = 0;
    return state.auto;
  }

  function setManualTier(index, now = 0) {
    state.auto = false;
    return applyTier(index, 'manual', now);
  }

  function setDeviceProfile(profile, now = 0) {
    const nextSafe = !!(profile && (profile.safe2GB || profile.safeMode));
    state.safeMode = nextSafe;
    state.floorIndex = nextSafe ? SAFE_TIER_INDEX : MAX_TIER_INDEX;
    if (state.index < state.floorIndex) applyTier(state.floorIndex, '2GB safety floor', now);
    return snapshot(now);
  }

  function update(stats = {}, now = 0) {
    state.fps = Math.max(0, finite(stats.fps, state.fps));
    state.stepEmaMs = Math.max(0, finite(stats.stepEmaMs ?? stats.emaMs, state.stepEmaMs));
    state.particles = Math.max(0, finite(stats.particles, state.particles));
    state.particleBudget = Math.max(0, finite(stats.particleBudget, state.particleBudget));
    state.cols = Math.max(8, finite(stats.cols, engine?.cols || state.cols));
    state.rows = Math.max(8, finite(stats.rows, engine?.rows || state.rows));
    const cellCount = Math.max(1, state.cols * state.rows);
    state.particleRatio = Math.max(0, Math.min(2, finite(stats.particleRatio, state.particles / cellCount)));
    state.memoryPressure = Math.max(0, Math.min(2, finite(stats.memoryPressure, state.memoryPressure)));
    state.heapUsedBytes = Math.max(0, finite(stats.heapUsedBytes, state.heapUsedBytes));
    state.engineBytes = Math.max(0, finite(stats.engineBytes, state.engineBytes));

    if (!state.auto) return snapshot(now);

    /* PHONE-FIX freeze: after the settle window, update() keeps tracking
       stats but never resizes the grid again this session. */
    if (state.sessionStartAt == null) state.sessionStartAt = finite(now, 0);
    if (finite(now, 0) - state.sessionStartAt > thresholds.sessionResizeMs) return snapshot(now);

    const memoryHot = state.memoryPressure >= thresholds.memoryDown || state.particleRatio >= thresholds.particleDown;
    const fpsHot = (state.fps > 0 && state.fps < thresholds.fpsDown) || state.stepEmaMs >= 25;
    const canChange = finite(now, 0) - state.lastChangeAt >= thresholds.cooldownMs;

    if (memoryHot) {
      state.upSince = 0;
      state.downSince = 0;
      if (!state.memorySince) state.memorySince = finite(now, 0);
      if (canChange && finite(now, 0) - state.memorySince >= thresholds.memoryHoldMs && state.index < SAFE_TIER_INDEX) {
        applyTier(state.index + 1, 'memory pressure', now);
      }
      return snapshot(now);
    }
    state.memorySince = 0;

    if (fpsHot) {
      state.upSince = 0;
      if (!state.downSince) state.downSince = finite(now, 0);
      if (canChange && finite(now, 0) - state.downSince >= thresholds.downgradeHoldMs && state.index < SAFE_TIER_INDEX) {
        applyTier(state.index + 1, state.fps > 0 && state.fps < thresholds.fpsDown ? 'low FPS' : 'slow simulation step', now);
      }
      return snapshot(now);
    }
    state.downSince = 0;

    const fpsHealthy = state.fps >= thresholds.fpsUp && state.stepEmaMs > 0 && state.stepEmaMs <= 18;
    const resourcesHealthy = state.memoryPressure < thresholds.memoryUp && state.particleRatio < thresholds.particleUp;
    if (fpsHealthy && resourcesHealthy) {
      if (!state.upSince) state.upSince = finite(now, 0);
      if (!state.ratcheted && canChange && finite(now, 0) - state.upSince >= thresholds.upgradeHoldMs && state.index > state.floorIndex) {
        applyTier(state.index - 1, 'sustained headroom', now);
      }
    } else {
      state.upSince = 0;
    }
    return snapshot(now);
  }

  function snapshot(now = 0) {
    const t = state.transition;
    const elapsed = Math.max(0, finite(now, 0) - t.startedAt);
    const progress = t.from === t.to ? 1 : Math.max(0, Math.min(1, elapsed / Math.max(1, t.durationMs)));
    const physical = TIERS[state.index];
    return {
      ...state,
      label: tierName(state.index, state.safeMode),
      engineTier: { cols: state.cols, rows: state.rows },
      cells: state.cols * state.rows,
      cellBudget: physical.cols * physical.rows,
      transitionProgress: progress,
      sessionFrozen: state.sessionStartAt != null && finite(now, 0) - state.sessionStartAt > thresholds.sessionResizeMs,
      thresholds: { ...thresholds },
    };
  }

  return {
    update,
    applyTier,
    setManualTier,
    setAuto,
    setDeviceProfile,
    snapshot,
    get currentIndex() { return state.index; },
    get auto() { return state.auto; },
    get safeMode() { return state.safeMode; },
    get floorIndex() { return state.floorIndex; },
  };
}
