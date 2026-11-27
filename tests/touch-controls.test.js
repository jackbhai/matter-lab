import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TOUCH_LEVEL, TOUCH_LEVELS, effectiveBrushRadius, interpolateTouchStroke,
  isTouchDoubleTap, normalizeTouchLevel, touchProfile, touchStrokePointBudget,
  MAX_TOUCH_STROKE_POINTS,
} from '../src/core/touch-controls.js';

test('touch profile lookup is defensive and each level exposes a distinct assistance contract', () => {
  assert.equal(DEFAULT_TOUCH_LEVEL, 'medium');
  assert.equal(normalizeTouchLevel('easy'), 'easy');
  assert.equal(normalizeTouchLevel('unexpected'), 'medium');
  assert.equal(touchProfile('not-a-level'), TOUCH_LEVELS.medium);
  assert.ok(TOUCH_LEVELS.easy.brushScale > TOUCH_LEVELS.medium.brushScale);
  assert.ok(TOUCH_LEVELS.hard.brushScale < TOUCH_LEVELS.medium.brushScale);
  assert.ok(TOUCH_LEVELS.easy.doubleTapMs > TOUCH_LEVELS.medium.doubleTapMs);
  assert.ok(TOUCH_LEVELS.hard.doubleTapPx < TOUCH_LEVELS.medium.doubleTapPx);
});

test('brush radius assistance is touch-only, ordered, and clamped to the supported brush range', () => {
  assert.deepEqual(
    ['easy', 'medium', 'hard'].map((level) => effectiveBrushRadius(10, level, 'touch')),
    [13, 10, 7],
  );
  assert.equal(effectiveBrushRadius(10, 'easy', 'mouse'), 10, 'desktop pointer precision must not be changed by a touch setting');
  assert.equal(effectiveBrushRadius(100, 'easy', 'touch'), 64);
  assert.equal(effectiveBrushRadius(0, 'hard', 'touch'), 1);
  assert.equal(effectiveBrushRadius('bad', 'medium', 'pen'), 1);
});

test('touch stroke interpolation closes event gaps and preserves endpoints at every profile', () => {
  const from = { x: 3, y: 4 }, to = { x: 23, y: 4 };
  const easy = interpolateTouchStroke(from, to, 'easy');
  const medium = interpolateTouchStroke(from, to, 'medium');
  const hard = interpolateTouchStroke(from, to, 'hard');
  assert.deepEqual(easy.at(-1), to);
  assert.deepEqual(medium.at(-1), to);
  assert.deepEqual(hard.at(-1), to);
  assert.ok(easy.length >= medium.length && medium.length > hard.length, 'Easy must fill at least as much of a grid stroke as Medium; Hard deliberately samples more sparsely');
  assert.ok(easy.every((point) => point.x >= from.x && point.x <= to.x && point.y === from.y));
  assert.deepEqual(interpolateTouchStroke(from, from, 'easy'), []);
  assert.deepEqual(interpolateTouchStroke(null, to, 'easy'), []);
});

test('touch stroke work is bounded on large pointer jumps and still reaches the destination', () => {
  const points = interpolateTouchStroke({ x: 0, y: 0 }, { x: 100000, y: 50000 }, 'easy', 32);
  assert.ok(points.length <= 32);
  assert.deepEqual(points.at(-1), { x: 100000, y: 50000 });
});

test('per-event stroke budgets shrink with brush footprint and never exceed the mobile cap', () => {
  assert.equal(touchStrokePointBudget(1), MAX_TOUCH_STROKE_POINTS);
  assert.ok(touchStrokePointBudget(8) < touchStrokePointBudget(2));
  assert.equal(touchStrokePointBudget(64), 4, 'large brushes cap repeated canvas work on memory-limited devices');
  assert.ok(touchStrokePointBudget(0) >= 4);
});

test('double-tap undo/redo thresholds follow Easy, Medium, and Hard touch levels', () => {
  const first = { t: 1000, x: 30, y: 40, fingers: 1 };
  assert.equal(isTouchDoubleTap(first, { t: 1430, x: 90, y: 40, fingers: 1 }, 'easy'), true);
  assert.equal(isTouchDoubleTap(first, { t: 1430, x: 90, y: 40, fingers: 1 }, 'medium'), false);
  assert.equal(isTouchDoubleTap(first, { t: 1250, x: 66, y: 40, fingers: 1 }, 'hard'), false);
  assert.equal(isTouchDoubleTap(first, { t: 1250, x: 45, y: 40, fingers: 1 }, 'hard'), true);
  assert.equal(isTouchDoubleTap(first, { t: 1200, x: 30, y: 40, fingers: 2 }, 'easy'), false);
  assert.equal(isTouchDoubleTap(first, { t: 900, x: 30, y: 40, fingers: 1 }, 'easy'), false);
  assert.equal(isTouchDoubleTap({ ...first, pointerType: 'touch' }, { ...first, t: 1100, pointerType: 'mouse' }, 'easy'), false);
});
