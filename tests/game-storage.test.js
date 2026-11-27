import test from 'node:test';
import assert from 'node:assert/strict';
import * as Game from '../src/game/game.js';

function installStorage({ failWrites = false } = {}) {
  const values = new Map();
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { if (failWrites) throw new Error('quota'); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
  return values;
}

test('touch level setting persists supported values and safely normalizes unknown stored values', () => {
  const storage = installStorage();
  assert.equal(Game.getTouchLevel(), 'medium');
  assert.equal(Game.setTouchLevel('easy'), true);
  assert.equal(Game.getTouchLevel(), 'easy');
  assert.equal(Game.setTouchLevel('hard'), true);
  assert.equal(Game.getTouchLevel(), 'hard');
  storage.set(Game.K.touchLevel, JSON.stringify('turbo'));
  assert.equal(Game.getTouchLevel(), 'medium');
  assert.equal(Game.setTouchLevel('not-a-level'), true);
  assert.equal(Game.getTouchLevel(), 'medium');
});

test('save-slot names are normalized and the portable-save budget is explicit', () => {
  assert.equal(Game.normalizeSaveSlotName('  Golden\u0000  rain  '), 'Golden rain');
  assert.equal(Game.normalizeSaveSlotName('', 'Scene 4'), 'Scene 4');
  assert.equal(Game.normalizeSaveSlotName('x'.repeat(100)).length, Game.MAX_SAVE_SLOT_NAME_LENGTH);
  assert.equal(Game.MAX_SAVE_SLOTS, 12);
});

test('slot upsert updates a same-name save in place and refuses a thirteenth distinct save', () => {
  const initial = [{ id: 'fixed-id', name: 'Golden rain', at: 1, data: 'old' }];
  const update = Game.upsertSaveSlot(initial, { id: 'new-id', name: '  GOLDEN RAIN  ', at: 2, data: 'new' });
  assert.equal(update.ok, true);
  assert.equal(update.updated, true);
  assert.equal(update.slots.length, 1);
  assert.equal(update.slots[0].id, 'fixed-id', 'updating a name must preserve the stable slot id');
  assert.equal(update.slots[0].data, 'new');

  const full = Array.from({ length: Game.MAX_SAVE_SLOTS }, (_, i) => ({ id: `s${i}`, name: `Scene ${i}`, data: 'payload' }));
  const rejected = Game.upsertSaveSlot(full, { id: 'overflow', name: 'One too many', data: 'payload' });
  assert.deepEqual({ ok: rejected.ok, reason: rejected.reason }, { ok: false, reason: 'limit' });
});

test('named slot persistence reports storage failure instead of claiming a lost save succeeded', () => {
  installStorage();
  const slots = [{ id: 'one', name: 'One', at: 1, data: 'ML2.R.example' }];
  assert.equal(Game.saveSlots(slots), true);
  assert.deepEqual(Game.loadSlots(), slots);
  installStorage({ failWrites: true });
  assert.equal(Game.saveSlots(slots), false);
});

test('legacy numeric scenes migrate to named slots without deleting the original key', () => {
  const storage = installStorage();
  storage.set('omni:sandlab:scenes', JSON.stringify({ 0: { at: 100, data: { v: 3 } }, 1: { at: 200, data: { v: 3 } } }));
  const slots = Game.loadSlots();
  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, 'legacy-0');
  assert.equal(slots[1].name, 'Slot 2 (imported)');
  assert.ok(storage.has('omni:sandlab:scenes'), 'migration is non-destructive for older app versions');
});
