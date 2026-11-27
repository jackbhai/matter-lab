import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine } from '../src/core/matter-engine.js';
import { BY_KEY, SUBSTANCES } from '../src/core/matter-elements.js';
import * as Game from '../src/game/game.js';
import {
  DAILY_POOL, WEEKLY_POOL, challengeById, dailyFor, dateKey, evaluateChallenge,
  measureChallengeWorld, weeklyFor, weeklyKey,
} from '../src/game/challenges.js';
import {
  FIELD_KIT_CAPACITY, FIELD_KIT_REACTION_REWARD, FIELD_KIT_STARTING_SUPPLY,
  SANDBOX_MODE_LIST, applySandboxPreset, createSandboxSession, duplicateGearWithSandboxPolicy, gearCreditCost,
  materialCellCost, paintWithSandboxPolicy, placeGearWithSandboxPolicy, sandboxGravityStrength,
  sceneSupplyCost, setWithSandboxPolicy, speedAllowed,
} from '../src/game/sandbox-modes.js';

function installStorage() {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  return values;
}

function dayOffset(key, amount) {
  const [year, month, day] = key.split('-').map(Number);
  const value = new Date(year, month - 1, day + amount, 12);
  return dateKey(value);
}

test('daily and weekly challenge pools rotate deterministically on local day and Monday boundaries', () => {
  assert.equal(DAILY_POOL.length, 12);
  assert.equal(WEEKLY_POOL.length, 8);
  assert.equal(new Set(DAILY_POOL.map((item) => item.id)).size, DAILY_POOL.length);
  assert.equal(new Set(WEEKLY_POOL.map((item) => item.id)).size, WEEKLY_POOL.length);
  assert.equal(dailyFor('2026-11-27').id, dailyFor('2026-11-27').id);
  assert.equal(weeklyKey('2026-11-27'), '2026-11-23');
  assert.equal(weeklyFor('2026-11-27').id, weeklyFor('2026-11-23').id);
  assert.notEqual(weeklyKey('2026-11-22'), weeklyKey('2026-11-23'));
});

test('challenge evidence is measured from MatterEngine cells, temperatures and live objects', () => {
  const engine = new MatterEngine(40, 20);
  const waterId = BY_KEY.get('water').id;
  for (let i = 0; i < 200; i++) {
    assert.equal(engine.set(i % engine.cols, Math.floor(i / engine.cols), waterId, { temp: 95 }), true);
  }
  engine.placeObject('rack', 20, 10);
  const metrics = measureChallengeWorld(engine);
  assert.equal(metrics.hotWater90, 200);
  assert.equal(metrics.counts.water, 200);
  assert.equal(metrics.objects, 1);
  assert.equal(challengeById('boil200').check(engine).done, true);
  assert.equal(challengeById('apparatus-three').evaluate(metrics).done, false);

  const dailyReaction = evaluateChallenge(challengeById('rx5'), metrics, { dailyReactions: new Set(['a', 'b', 'c', 'd', 'e']) });
  const weeklyReaction = evaluateChallenge(challengeById('rx25', 'weekly'), metrics, { weeklyReactions: Array.from({ length: 25 }, (_, i) => `rx-${i}`) });
  assert.equal(dailyReaction.done, true);
  assert.equal(weeklyReaction.done, true);
  assert.equal(weeklyReaction.current, 25);
});

test('challenge ledger deduplicates named-reaction evidence and awards daily/weekly points once', () => {
  installStorage();
  const day = '2026-11-27';
  assert.equal(Game.getChallengeLedger().points, 0);
  assert.equal(Game.recordChallengeReaction('water-oxygen', day), true);
  assert.equal(Game.recordChallengeReaction('water-oxygen', day), false);
  assert.deepEqual([...Game.getChallengeActivity(day).dailyReactions], ['water-oxygen']);
  assert.deepEqual([...Game.getChallengeActivity(day).weeklyReactions], ['water-oxygen']);

  for (let offset = -3; offset <= 0; offset++) {
    const key = dayOffset(day, offset);
    assert.equal(Game.markDailyDone(key, dailyFor(key).id), true);
    assert.equal(Game.markDailyDone(key, dailyFor(key).id), false, 'same-day completion cannot award points twice');
  }
  const week = weeklyKey(day);
  assert.equal(Game.markWeeklyDone(week, weeklyFor(day).id), true);
  assert.equal(Game.markWeeklyDone(week, weeklyFor(day).id), false, 'same-week completion cannot award points twice');
  const summary = Game.getChallengeSummary(new Date(2026, 10, 27, 12));
  assert.equal(summary.points, 200);
  assert.equal(summary.streak, 4);
  assert.equal(summary.dailyDone, true);
  assert.equal(summary.weeklyDone, true);
  assert.equal(summary.dailyCompleted, 4);
  assert.equal(summary.weeklyCompleted, 1);
});

test('Field Kit stock survives switching away from the mode and clamps corrupted or oversized values', () => {
  const storage = installStorage();
  assert.deepEqual(Game.getSandboxState(), { mode: 'creative', credits: FIELD_KIT_STARTING_SUPPLY });
  assert.equal(Game.setSandboxState({ mode: 'field-kit', credits: 37 }), true);
  assert.deepEqual(Game.getSandboxState(), { mode: 'field-kit', credits: 37 });
  assert.equal(Game.setSandboxState({ mode: 'creative', credits: 0 }), true);
  assert.deepEqual(Game.getSandboxState(), { mode: 'creative', credits: 37 });
  assert.equal(Game.setSandboxState({ mode: 'field-kit' }), true);
  assert.deepEqual(Game.getSandboxState(), { mode: 'field-kit', credits: 37 });
  assert.equal(Game.setSandboxState({ mode: 'field-kit', credits: 5000 }), true);
  assert.equal(Game.getSandboxState().credits, FIELD_KIT_CAPACITY);
  storage.set(Game.K.sandbox, JSON.stringify({ mode: 'field-kit', credits: -90 }));
  assert.equal(Game.getSandboxState().credits, 0);
});

test('Field Kit credit policy limits brush and clone/fill writes, while real reactions replenish a capped balance', () => {
  const id = BY_KEY.get('sand').id;
  const material = SUBSTANCES[id];
  const cost = materialCellCost(material);
  const session = createSandboxSession('field-kit', cost * 3);
  const engine = new MatterEngine(12, 12);
  const stroke = paintWithSandboxPolicy(engine, session, 6, 6, 1, id, {}, material);
  assert.equal(stroke.changed, 3, 'the brush may place only as many new cells as its real remaining supply can pay for');
  assert.equal(session.credits, 0);
  assert.equal(engine.particles, 3);
  const repaint = paintWithSandboxPolicy(engine, session, 6, 6, 1, id, {}, material);
  assert.equal(repaint.changed, 0);
  assert.equal(session.credits, 0, 'repainting identical matter is free and cannot create extra stock');
  assert.equal(setWithSandboxPolicy(engine, session, 10, 10, id, {}, material), false);
  assert.equal(engine.particles, 3);
  const eraser = paintWithSandboxPolicy(engine, session, 6, 6, 0, 0);
  assert.equal(eraser.changed, 1);
  assert.equal(session.credits, 0, 'removing matter is free and never refunds supply');

  const paidSet = createSandboxSession('field-kit', cost);
  assert.equal(setWithSandboxPolicy(engine, paidSet, 10, 10, id, {}, material), true);
  assert.equal(paidSet.credits, 0);
  assert.equal(setWithSandboxPolicy(engine, paidSet, 9, 10, id, {}, material), false);
  const reward = paidSet.rewardReaction();
  assert.deepEqual(reward, { gained: Math.min(FIELD_KIT_REACTION_REWARD, FIELD_KIT_CAPACITY), balance: Math.min(FIELD_KIT_REACTION_REWARD, FIELD_KIT_CAPACITY) });
  const nearlyFull = createSandboxSession('field-kit', FIELD_KIT_CAPACITY - 2);
  assert.deepEqual(nearlyFull.rewardReaction(), { gained: 2, balance: FIELD_KIT_CAPACITY });
});

test('Field Kit charges gear only after successful placement and scene imports are costed before commit', () => {
  const engine = new MatterEngine(40, 20);
  const cost = gearCreditCost('rack');
  const kit = createSandboxSession('field-kit', cost - 1);
  assert.deepEqual(placeGearWithSandboxPolicy(engine, kit, 'rack', 10, 10), { id: null, blocked: true });
  assert.equal(engine.objects.size, 0);
  assert.equal(kit.credits, cost - 1);

  const funded = createSandboxSession('field-kit', cost + 10);
  const placed = placeGearWithSandboxPolicy(engine, funded, 'rack', 10, 10);
  assert.equal(placed.blocked, false);
  assert.notEqual(placed.id, null);
  assert.equal(funded.credits, 10);
  const duplicateEngine = new MatterEngine(120, 80);
  const source = duplicateEngine.placeObject('rack', 20, 20);
  assert.notEqual(source, null);
  const shortKit = createSandboxSession('field-kit', cost - 1);
  assert.equal(duplicateGearWithSandboxPolicy(duplicateEngine, shortKit, source).blocked, true);
  assert.equal(duplicateEngine.objects.size, 1);
  const duplicateKit = createSandboxSession('field-kit', cost + 10);
  const copy = duplicateGearWithSandboxPolicy(duplicateEngine, duplicateKit, source);
  assert.notEqual(copy.id, null);
  assert.equal(duplicateKit.credits, 10);
  engine.set(2, 2, BY_KEY.get('sand').id);
  engine.set(3, 2, BY_KEY.get('water').id);
  const needed = sceneSupplyCost(engine.serialize(), (id) => SUBSTANCES[id]);
  assert.ok(needed >= cost + 2);
  assert.equal(sceneSupplyCost({ v: 3, cols: 1000, rows: 1000, el: '' }), Infinity);
  assert.equal(sceneSupplyCost({ v: 3, cols: -4, rows: -5, el: 'AAAA' }), Infinity);
});

test('sandbox modes expose distinct gravity, temperature, speed and gear policies', () => {
  assert.deepEqual(SANDBOX_MODE_LIST.map((mode) => mode.id), ['creative', 'field-kit', 'moon', 'jupiter', 'deep-freeze']);
  assert.equal(sandboxGravityStrength('moon'), 0.17);
  assert.equal(sandboxGravityStrength('moon', true), 0.68);
  assert.equal(sandboxGravityStrength('jupiter'), 1);
  assert.equal(speedAllowed('field-kit', 2), true);
  assert.equal(speedAllowed('field-kit', 4), false);
  assert.equal(speedAllowed('field-kit', 1, true), false);
  assert.equal(speedAllowed('creative', 4), true);
  assert.equal(speedAllowed('creative', 4, true), true);
  assert.ok(gearCreditCost('beaker-M') > gearCreditCost('rack'));

  const engine = new MatterEngine(20, 12);
  applySandboxPreset(engine, 'moon');
  assert.equal(engine.gravityPreset, 'moon');
  assert.equal(engine.ambientT, -10);
  assert.equal(engine.gravMag, 0.17);
  applySandboxPreset(engine, 'deep-freeze');
  assert.equal(engine.gravityPreset, 'earth');
  assert.equal(engine.ambientT, -25);
});
