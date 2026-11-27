import test from 'node:test';
import assert from 'node:assert/strict';
import { MatterEngine } from '../src/core/matter-engine.js';
import {
  MAX_SCENE_CELLS, createScenePackage, decodeSceneCode, decodeSceneFileText,
  encodeShareCode, isSceneData, sceneChecksum, serializeSceneFile, summarizeScene,
} from '../src/game/scene-archive.js';

function smallScene() {
  const el = new Uint16Array([1, 0, 2, 0]);
  const temp = new Int16Array([20, 20, 120, 20]);
  return {
    v: 3,
    cols: 2,
    rows: 2,
    el: Buffer.from(el.buffer).toString('base64'),
    temp: Buffer.from(temp.buffer).toString('base64'),
    objects: [{ kind: 'beaker-s', x: 0, y: 1, level: 1, scale: 1 }],
    bodies: [],
  };
}

function legacyML0(scene) {
  return `ML0.${Buffer.from(JSON.stringify(scene)).toString('base64url')}`;
}

test('scene archives add names, world metadata, particle summary, and a verifiable checksum', () => {
  const scene = smallScene();
  const archive = createScenePackage(scene, { name: '  Golden   rain  ', createdAt: 1234 });
  assert.equal(archive.format, 'matter-lab-scene');
  assert.equal(archive.version, 1);
  assert.equal(archive.name, 'Golden rain');
  assert.equal(archive.createdAt, 1234);
  assert.deepEqual(archive.world, { cols: 2, rows: 2 });
  assert.deepEqual(archive.summary, { particles: 2, substances: 2, objects: 1, bodies: 0, cols: 2, rows: 2 });
  assert.equal(archive.checksum, sceneChecksum(scene));
  assert.deepEqual((awaitableUnpack(archive)).scene, scene);
});

function awaitableUnpack(archive) {
  // `decodeSceneFileText` is the public sync file-import path.
  return decodeSceneFileText(JSON.stringify(archive));
}

test('portable JSON files round-trip and still accept pre-archive engine JSON', () => {
  const scene = smallScene();
  const text = serializeSceneFile(scene, { name: 'Lab notes', createdAt: 4567 });
  const loaded = decodeSceneFileText(text);
  assert.equal(loaded.name, 'Lab notes');
  assert.equal(loaded.createdAt, 4567);
  assert.equal(loaded.legacy, false);
  assert.deepEqual(loaded.scene, scene);

  const old = decodeSceneFileText(JSON.stringify(scene));
  assert.equal(old.legacy, true);
  assert.deepEqual(old.scene, scene);
});

test('archive validation rejects checksum edits, dimension substitution, oversized worlds, and malformed cell buffers', () => {
  const archive = createScenePackage(smallScene());
  archive.scene.temp = Buffer.from(new Int16Array([999, 20, 120, 20]).buffer).toString('base64');
  assert.throws(() => decodeSceneFileText(JSON.stringify(archive)), /checksum/i);

  assert.equal(isSceneData({ ...smallScene(), cols: 1024, rows: 1024 }), false, 'the 200,000-cell safety cap is enforced before import');
  assert.equal(isSceneData({ ...smallScene(), el: 'not base64' }), false);
  assert.equal(MAX_SCENE_CELLS, 200000);
  assert.throws(() => decodeSceneFileText('x'.repeat(8 * 1024 * 1024 + 1)), /large/i);
});

test('ML2 share codes verify the archive and ML0 legacy codes continue to import', async () => {
  const scene = smallScene();
  const code = await encodeShareCode(scene, { name: 'Saved experiment', createdAt: 6789 });
  assert.match(code, /^ML2\.[GR]\./);
  const loaded = await decodeSceneCode(code);
  assert.equal(loaded.name, 'Saved experiment');
  assert.equal(loaded.createdAt, 6789);
  assert.equal(loaded.legacy, false);
  assert.deepEqual(loaded.scene, scene);

  const legacy = await decodeSceneCode(legacyML0(scene));
  assert.equal(legacy.legacy, true);
  assert.deepEqual(legacy.scene, scene);
  await assert.rejects(() => decodeSceneCode('ML9.bad'), /unknown|invalid/i);
  await assert.rejects(() => decodeSceneCode('ML2.G.@@@'), /invalid/i);
});

test('legacy ML1 gzip share codes remain readable when the runtime supports streaming gzip', async (t) => {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') {
    t.skip('CompressionStream is unavailable in this runtime');
    return;
  }
  const scene = smallScene();
  const raw = new TextEncoder().encode(JSON.stringify(scene));
  const zipped = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const code = `ML1.${Buffer.from(zipped).toString('base64url')}`;
  const loaded = await decodeSceneCode(code);
  assert.equal(loaded.legacy, true);
  assert.deepEqual(loaded.scene, scene);
});

test('streaming decompression stops over-limit gzip payloads before JSON parsing', async (t) => {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') {
    t.skip('CompressionStream is unavailable in this runtime');
    return;
  }
  const oversized = new TextEncoder().encode(' '.repeat(8 * 1024 * 1024 + 1));
  const zipped = await new Response(new Blob([oversized]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const code = `ML2.G.${Buffer.from(zipped).toString('base64url')}`;
  await assert.rejects(() => decodeSceneCode(code), /8 MB safety limit/i);
});

test('real MatterEngine scenes survive compressed share and deserialize on a second engine', async () => {
  const source = new MatterEngine(32, 24);
  assert.equal(source.set(7, 9, 'water'), true);
  assert.equal(source.set(8, 9, 'sand'), true);
  const original = source.serialize();
  const code = await encodeShareCode(original, { name: 'Engine round-trip' });
  const decoded = await decodeSceneCode(code);
  const target = new MatterEngine(16, 16);
  assert.equal(target.deserialize(decoded.scene), true);
  assert.deepEqual([target.cols, target.rows], [original.cols, original.rows]);
  assert.deepEqual(Array.from(target.el), Array.from(source.el));
  assert.deepEqual(summarizeScene(decoded.scene), { particles: 2, substances: 2, objects: 0, bodies: 0, cols: 32, rows: 24 });
});
