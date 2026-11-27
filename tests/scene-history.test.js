import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine } from '../src/core/matter-engine.js';
import { BY_KEY } from '../src/core/matter-elements.js';
import { SceneSwapHistory } from '../src/game/scene-history.js';

test('already-built scenes can be recorded transactionally for full-scene Undo/Redo', () => {
  const engine = new MatterEngine(32, 24);
  engine.set(3, 4, 'water');
  const before = engine.serialize();
  engine.clear();
  engine.set(18, 16, 'sand');
  const after = engine.serialize();
  const history = new SceneSwapHistory();
  assert.equal(history.recordReplacement(before, after), true);
  assert.equal(engine.get(18, 16), BY_KEY.get('sand').id);
  assert.equal(history.undo(engine), true);
  assert.equal(engine.get(3, 4), BY_KEY.get('water').id);
  assert.equal(history.redo(engine), true);
  assert.equal(engine.get(18, 16), BY_KEY.get('sand').id);
});

test('full-scene Undo/Redo restores world size, cells, and lab gear after a destructive import', () => {
  const engine = new MatterEngine(64, 48);
  assert.equal(engine.set(2, 3, 'water'), true);
  assert.notEqual(engine.placeObject('beaker-s', 12, 24), null);
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
