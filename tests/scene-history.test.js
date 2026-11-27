import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine } from '../src/core/matter-engine.js';
import { SceneSwapHistory } from '../src/game/scene-history.js';

test('full-scene Undo/Redo restores world size, cells, and lab gear after a destructive import', () => {
  const engine = new MatterEngine(64, 48);
  assert.equal(engine.set(2, 3, 'water'), true);
  /* PHONE-FIX: beaker-s is taller now (hero profile h ≈ 1.05 × w), so it
     is placed higher on this small test grid; the undo/redo intent of
     this test is unchanged. */
  assert.notEqual(engine.placeObject('beaker-s', 12, 8), null);
  assert.equal(engine.objects.size, 1);
  const previousCells = engine.el.slice();

  const imported = new MatterEngine(32, 24);
  assert.equal(imported.set(20, 15, 'sand'), true);
  const history = new SceneSwapHistory();
  assert.equal(history.replace(engine, { v: 99 }), false, 'invalid scene swaps must leave the current world intact');
  assert.deepEqual(Array.from(engine.el), Array.from(previousCells));
  assert.equal(history.replace(engine, imported.serialize()), true);
  assert.deepEqual([engine.cols, engine.rows], [32, 24]);
  assert.equal(engine.objects.size, 0);

  assert.equal(history.undo(engine), true);
  assert.deepEqual([engine.cols, engine.rows], [64, 48]);
  assert.deepEqual(Array.from(engine.el), Array.from(previousCells));
  assert.equal(engine.objects.size, 1, 'serialized lab gear is restored with its matching cells');
  assert.equal([...engine.objects.values()][0].kind, 'beaker-s');

  assert.equal(history.redo(engine), true);
  assert.deepEqual([engine.cols, engine.rows], [32, 24]);
  assert.equal(engine.stats().particles, 1);
  assert.equal(engine.objects.size, 0);
  assert.equal(history.undo(engine), true, 'redo restores a new one-step undo point');
  history.discardRedo();
  assert.equal(history.redo(engine), false, 'a new user action can invalidate full-scene redo');
});
