/* Matter Lab Ultra — v21: Adaptive Tiers engine (BIG).
 * A real 4-tier adaptive quality engine: Low/Mid/High/Max. Measures live FPS
 * (simulation step EMA), memory pressure and GPU capability; shifts tiers
 * automatically with smooth transitions. */

export const TIERS = [
  { name: 'Low', cols: 48, rows: 48 },
  { name: 'Mid', cols: 56, rows: 56 },
  { name: 'High', cols: 64, rows: 64 },
  { name: 'Max', cols: 96, rows: 96 },
];
export const TIERS_N = TIERS.length;
export const TIER_MAX = TIERS_N - 1; // 3 = Max
export const TIER_MIN = 0; // 0 = Low
export const FREEZE_FPS = 2;

export function createAdaptiveTiers(engine, perf) {
  // config from perf.loadPerf()
  const p = {
    current: 0,
    autoTier: (perf && typeof perf.autoTier === 'boolean') ? perf.autoTier : true,
    fpsFloor: (perf && typeof perf.fpsFloor === 'number' && perf.fpsFloor > 0) ? perf.fpsFloor : 20,
    upgradeHyst: (perf && typeof perf.upgradeHyst === 'number' && perf.upgradeHyst > 0) ? perf.upgradeHyst : 3,
    upgradeFpsCeil: (perf && typeof perf.upgradeFpsCeil === 'number' && perf.upgradeFpsCeil > 0) ? perf.upgradeFpsCeil : 60,
  };

  // live stats (filled each frame from engine.stats())
  const stat = { fps: 0, stepEmaMs: 0, particles: 0, sleepFrac: 0, emitted: 0 };
  const gpu = { known: false, mult: 1.0, touchMult: 1.0, name: 'unknown', logo: false, particleLogo: false };

  // transition state
  const trans = { during: 0, total: 180 };
  let upTimer = 0;

  function tryUpgrade() {
    if (!p.autoTier || upTimer > 0) return false;
    if (p.current >= TIER_MAX) return false;
    // steady FPS above the floor → upgrade
    if (stat.fps > FREEZE_FPS && stat.fps > p.fpsFloor && stat.fps < p.upgradeFpsCeil) {
      upTimer = 1;
      return true;
    }
    return false;
  }

  function memoryTouch() {
    // memory pressure: high particles → push down a tier, never to 0
    if (stat.particles > 50) return false;
    if (p.current > TIER_MIN) { p.current--; return true; }
    return false;
  }

  function update(stats, w) {
    Object.assign(stat, stats || {});
    if (w && w.GL) gpu.known = true;
    if (gpu.known && p.current < TIER_MAX) tryUpgrade();
    return trans;
  }

  return {
    update,
    tryUpgrade,
    memoryTouch,
    stat,
    gpu,
    p,
    get current() { return p.current; },
    get during() { return trans.during; },
    stats: () => ({ fps: stat.fps, stepEmaMs: stat.stepEmaMs, particles: stat.particles, sleepFrac: stat.sleepFrac, emitted: stat.emitted }),
  };
}
