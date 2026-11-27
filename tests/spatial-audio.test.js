import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine } from '../src/core/matter-engine.js';
import { BY_KEY } from '../src/core/matter-elements.js';
import { MatterSound } from '../src/core/matter-sound.js';
import { normalizeAudioListener, setPannerPosition, spatializeSource } from '../src/core/spatial-audio.js';

test('listener normalization clamps zoom and converts camera focus into bounded world coordinates', () => {
  assert.deepEqual(normalizeAudioListener({ cols: 100, rows: 50, fx: 99, fy: -4, zoom: 99 }), {
    cols: 100, rows: 50, zoom: 6, focusX: 1, focusY: 0,
  });
  assert.deepEqual(normalizeAudioListener({ cols: 0, rows: -1, fx: null, fy: null, zoom: 0 }), {
    cols: 480, rows: 1, zoom: 1, focusX: 0.5, focusY: 0.5,
  });
});

test('camera-relative audio maps source X/Y, pan, elevation, distance and air absorption', () => {
  const listener = { cols: 100, rows: 60, fx: 49.5, fy: 29.5, zoom: 1 };
  const left = spatializeSource({ x: 0, y: 0.5 }, listener);
  const centre = spatializeSource({ x: 0.5, y: 0.5 }, listener);
  const right = spatializeSource({ x: 1, y: 1 }, listener);
  assert.ok(left.pan < -0.8);
  assert.equal(centre.pan, 0);
  assert.equal(centre.elevation, 0);
  assert.ok(right.pan > 0.8);
  assert.ok(right.elevation < 0, 'lower-screen sources map below the listener');
  assert.ok(right.distance > centre.distance);
  assert.ok(right.gain < centre.gain);
  assert.ok(right.cutoff < centre.cutoff);
  assert.equal(spatializeSource({ x: 1, y: 1 }, listener, { centered: true }).pan, 0);
});

test('camera zoom and pan alter spatial placement, while non-positioned sources remain centered', () => {
  const source = { x: 0.75, y: 0.25 };
  const wide = spatializeSource(source, { cols: 100, rows: 60, fx: 50, fy: 30, zoom: 1 });
  const focused = spatializeSource(source, { cols: 100, rows: 60, fx: 50, fy: 30, zoom: 3 });
  const panned = spatializeSource(source, { cols: 100, rows: 60, fx: 75, fy: 15, zoom: 1 });
  assert.ok(Math.abs(focused.pan) > Math.abs(wide.pan));
  assert.notEqual(panned.pan, wide.pan);
  assert.deepEqual(spatializeSource({}, { cols: 100, rows: 60 }), {
    positioned: false, pan: 0, elevation: 0, radial: 0, distance: 2,
    gain: 1, cutoff: 18000, x: 0, y: 0, z: -2,
  });
});

test('panner positioning supports modern AudioParams and the legacy setPosition fallback', () => {
  const values = {};
  const modern = Object.fromEntries(['positionX', 'positionY', 'positionZ'].map((axis) => [axis, { setTargetAtTime(v, t, c) { values[axis] = [v, t, c]; } }]));
  assert.equal(setPannerPosition(modern, { x: -2, y: 1, z: -5 }, 10), true);
  assert.deepEqual(values.positionX, [-2, 10, 0.08]);
  let legacyPosition = null;
  assert.equal(setPannerPosition({ setPosition(...args) { legacyPosition = args; } }, { x: 1, y: 2, z: 3 }), true);
  assert.deepEqual(legacyPosition, [1, 2, 3]);
  assert.equal(setPannerPosition({}, { x: 0, y: 0, z: 0 }), false);
});

test('MatterEngine brush and erase actions emit bounded, source-positioned sounds', () => {
  const engine = new MatterEngine(30, 20);
  const events = [];
  engine.onSound = (event) => events.push(event);
  const water = BY_KEY.get('water').id;
  const result = engine.paint(10, 8, 2, water);
  assert.ok(result.changed > 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'event');
  assert.equal(events[0].cls, 'splash');
  assert.ok(events[0].x > 0 && events[0].x < 1);
  assert.ok(events[0].y > 0 && events[0].y < 1);

  const eraserEngine = new MatterEngine(30, 20);
  const eraseEvents = [];
  eraserEngine.onSound = (event) => eraseEvents.push(event);
  const glass = BY_KEY.get('glass').id;
  eraserEngine.set(20, 8, glass);
  const erased = eraserEngine.erase(20, 8, 0);
  assert.equal(erased.removed, 1);
  assert.equal(eraseEvents.length, 1);
  assert.equal(eraseEvents[0].cls, 'glassbreak');
  assert.ok(eraseEvents[0].x > 0.5);
});

test('MatterSound spatial toggle and changing listener are reflected in its live event adapter', () => {
  const sound = new MatterSound();
  try {
    sound.setListener({ cols: 100, rows: 50, fx: 25, fy: 25, zoom: 2 });
    const before = sound.spatialFor({ x: 0.75, y: 0.5 }, 'clink');
    assert.ok(before.pan > 0);
    sound.setSpatialEnabled(false);
    const after = sound.spatialFor({ x: 0.75, y: 0.5 }, 'clink');
    assert.equal(after.positioned, false);
    assert.equal(after.pan, 0);
    sound.setSpatialEnabled(true);
    sound.setListener({ cols: 100, rows: 50, fx: 74.25, fy: 24.5, zoom: 2 });
    const moved = sound.spatialFor({ x: 0.75, y: 0.5 }, 'clink');
    assert.equal(moved.pan, 0);
    sound.event('clink', 0.4, null, 0.75, 0.15, 0.5);
    assert.equal(sound.lastEvents.at(-1).position.x, 0.75);
    assert.equal(sound.lastEvents.at(-1).spatial.pan, 0);
  } finally {
    sound.dispose();
  }
});
