import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine, TIERS as ENGINE_TIERS } from '../src/core/matter-engine.js';
import { createAdaptiveTiers, dimensionsForTier, TIERS } from '../src/core/tier-engine.js';
import { clearSimulatedDevice, deviceInfo, measureMemory, resourceBudget, setSimulatedDevice } from '../src/core/perf.js';

function feed(controller, stats, from, until, step = 100) {
  for (let now = from; now <= until; now += step) controller.update(stats, now);
}

test('tier budgets are the engine tiers and aspect scaling never exceeds their cell budget', () => {
  assert.strictEqual(TIERS, ENGINE_TIERS, 'controller must consume the engine export, not duplicate tier values');
  assert.deepEqual(TIERS.map(({ cols, rows }) => [cols, rows]), [
    [576, 324], [480, 270], [384, 216], [320, 180], [192, 108],
  ]);
  for (let index = 0; index < TIERS.length; index++) {
    const budget = TIERS[index].cols * TIERS[index].rows;
    for (const aspect of [0.3, 0.46, 1, 16 / 9, 3.4]) {
      const dims = dimensionsForTier(index, aspect);
      assert.ok(dims.cols * dims.rows <= budget, `tier ${index} exceeded cell budget at aspect ${aspect}`);
    }
  }
});

test('sustained high FPS upgrades the active MatterEngine after the hysteresis window', () => {
  const engine = new MatterEngine(TIERS[2].cols, TIERS[2].rows);
  const controller = createAdaptiveTiers(engine, { autoTier: true }, {
    initialTierIndex: 2,
    upgradeHoldMs: 1200,
    cooldownMs: 300,
  });
  const headroom = { fps: 60, emaMs: 10, particles: 1000, particleRatio: 0.1, memoryPressure: 0.1 };
  feed(controller, headroom, 0, 1000);
  assert.equal(controller.currentIndex, 2, 'quality must not upgrade before the full headroom hold');
  assert.deepEqual([engine.cols, engine.rows], [TIERS[2].cols, TIERS[2].rows]);
  feed(controller, headroom, 1100, 2000);
  assert.equal(controller.currentIndex, 1, 'steady high FPS must upgrade index 2 → 1');
  assert.deepEqual([engine.cols, engine.rows], [TIERS[1].cols, TIERS[1].rows], 'upgrade must resize the real engine, not only change controller state');
  assert.equal(engine.stats().tier, 1);
});

test('high particle/memory pressure downgrades the active engine and low FPS independently downgrades another tier', () => {
  const engine = new MatterEngine(TIERS[1].cols, TIERS[1].rows);
  const controller = createAdaptiveTiers(engine, { autoTier: true }, {
    initialTierIndex: 1,
    memoryHoldMs: 250,
    downgradeHoldMs: 300,
    cooldownMs: 250,
  });
  const pressure = { fps: 58, emaMs: 12, particles: 17000, particleRatio: 0.94, memoryPressure: 0.93 };
  feed(controller, pressure, 0, 200);
  assert.equal(controller.currentIndex, 1, 'pressure must remain within the current tier until its hold expires');
  feed(controller, pressure, 300, 500);
  assert.equal(controller.currentIndex, 2, 'high memory/particle pressure must downgrade index 1 → 2');
  assert.deepEqual([engine.cols, engine.rows], [TIERS[2].cols, TIERS[2].rows]);
  assert.equal(engine.stats().tier, 2);
  const lowFps = { fps: 22, emaMs: 32, particles: 1000, particleRatio: 0.1, memoryPressure: 0.1 };
  feed(controller, lowFps, 1000, 1200);
  assert.equal(controller.currentIndex, 2, 'low FPS must also respect the downgrade hold');
  feed(controller, lowFps, 1300, 1600);
  assert.equal(controller.currentIndex, 3, 'sustained low FPS must downgrade index 2 → 3');
  assert.deepEqual([engine.cols, engine.rows], [TIERS[3].cols, TIERS[3].rows]);
  assert.equal(engine.stats().tier, 3);
});

test('simulated 2GB low-CPU Android activates the real safe floor and particle/texture budgets', () => {
  try {
    setSimulatedDevice({ android: true, ramMB: 2048, threads: 2 });
    const device = deviceInfo();
    assert.equal(device.safe2GB, true);
    assert.equal(device.lowEnd, true);
    const budget = resourceBudget(device);
    assert.equal(budget.tierFloor, TIERS.length - 1);
    assert.equal(budget.maxWorldCells, TIERS.at(-1).cols * TIERS.at(-1).rows);
    assert.ok(budget.particleBudget > 0 && budget.particleBudget <= budget.maxWorldCells);
    assert.equal(budget.maxTextureQuality, 0);
    assert.ok(budget.maxWorldTextureDimension <= 512);

    const engine = new MatterEngine(TIERS[2].cols, TIERS[2].rows);
    const controller = createAdaptiveTiers(engine, { autoTier: true }, { initialTierIndex: 2 });
    controller.setDeviceProfile(device, 100);
    assert.equal(controller.currentIndex, TIERS.length - 1, 'safety profile must move to the engine-defined lowest tier');
    assert.deepEqual([engine.cols, engine.rows], [TIERS.at(-1).cols, TIERS.at(-1).rows]);
    assert.equal(controller.setManualTier(0, 200), false, 'manual Max may not bypass the 2GB tier floor');
    assert.equal(controller.currentIndex, TIERS.length - 1);

    const gridBounded = new MatterEngine(TIERS[0].cols, TIERS[0].rows);
    gridBounded.setWorldCellBudget(budget.maxWorldCells);
    assert.deepEqual([gridBounded.cols, gridBounded.rows], [TIERS.at(-1).cols, TIERS.at(-1).rows], 'safe cell budget must shrink an existing oversized world');
    gridBounded.resize(TIERS[0].cols, TIERS[0].rows);
    assert.ok(gridBounded.cols * gridBounded.rows <= budget.maxWorldCells, 'later resizes must stay under the safe world-cell cap');

    const oversizedScene = new MatterEngine(TIERS[0].cols, TIERS[0].rows);
    assert.equal(oversizedScene.set(0, 0, 'sand'), true);
    oversizedScene.el.fill(oversizedScene.el[0]);
    oversizedScene.particles = oversizedScene.el.length;
    const imported = new MatterEngine(TIERS.at(-1).cols, TIERS.at(-1).rows);
    imported.setWorldCellBudget(budget.maxWorldCells);
    imported.setParticleBudget(budget.particleBudget);
    assert.equal(imported.deserialize(oversizedScene.serialize()), true, 'scene imports should downscale rather than bypass the safe cell cap');
    assert.ok(imported.cols * imported.rows <= budget.maxWorldCells);
    assert.equal(imported.particles, budget.particleBudget, 'scene imports must also honor the hard particle budget');

    const bounded = new MatterEngine(TIERS.at(-1).cols, TIERS.at(-1).rows);
    bounded.setParticleBudget(budget.particleBudget);
    for (let cell = 0; cell < budget.particleBudget; cell++) {
      assert.equal(bounded.set(cell % bounded.cols, Math.floor(cell / bounded.cols), 'sand'), true);
    }
    assert.equal(bounded.set(budget.particleBudget % bounded.cols, Math.floor(budget.particleBudget / bounded.cols), 'sand'), false, 'particle writes stop at the hard budget');
    assert.equal(bounded.particles, budget.particleBudget);
    assert.equal(bounded.particleBudgetHits, 1);
    const memory = measureMemory(bounded, null, device);
    assert.equal(memory.safe2GB, true);
    assert.ok(memory.engineBytes <= budget.engineCeilingBytes, `engine typed arrays exceeded safe ceiling: ${memory.engineBytes}`);
    assert.ok(memory.memoryPressure >= 1, 'full safe particle budget must be reflected in live pressure');
    for (let tick = 0; tick < 5; tick++) assert.doesNotThrow(() => bounded.step(), 'safe simulation step must not crash');
  } finally {
    clearSimulatedDevice();
  }
});
