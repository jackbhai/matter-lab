import test from 'node:test';
import assert from 'node:assert/strict';
import { GLRenderer, buildGLTables } from '../src/render/gl-renderer.js';

function fakeGL() {
  const constants = {
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, NEAREST: 0x2600, CLAMP_TO_EDGE: 0x812f,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, FLOAT: 0x1406, TEXTURE0: 0x84c0,
    TRIANGLES: 0x0004, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, UNPACK_ALIGNMENT: 0x0cf5,
    MAX_TEXTURE_SIZE: 0x0d33, NO_ERROR: 0,
  };
  return new Proxy({}, {
    get(_target, key) {
      if (key in constants) return constants[key];
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return () => true;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'getUniformLocation') return (_program, name) => ({ name });
      if (key === 'getParameter') return () => 4096;
      if (key.startsWith('create')) return () => ({ key });
      if (key === 'getShaderInfoLog' || key === 'getProgramInfoLog') return () => '';
      if (key === 'getError') return () => 0;
      if (key === 'getExtension') return () => null;
      return () => {};
    },
  });
}

function canvasFor(contextFactory) {
  return {
    width: 0,
    height: 0,
    addEventListener() {},
    getContext: contextFactory,
  };
}

function sampleTables() {
  const substances = [{ id: 0, key: 'empty', fams: [] }];
  return buildGLTables(substances, [], new Uint8Array(1), new Float32Array(1), new Uint8Array(1), new Uint8Array(1), -1, new Uint8Array(12));
}

test('renderer selects WebGL1 after WebGL2 is absent and draws through the fallback shader', () => {
  const originalDocument = globalThis.document;
  const gl = fakeGL();
  globalThis.document = { createElement: () => canvasFor((kind) => kind === 'webgl2' ? null : kind === 'webgl' ? gl : null) };
  try {
    const renderer = new GLRenderer();
    assert.equal(renderer.mode, 'webgl1');
    assert.equal(renderer.ok, true);
    renderer.setResourceProfile({ maxWorldTextureDimension: 512, maxWorldCells: 256, maxTextureQuality: 0 });
    renderer.setTables(sampleTables(), 1);
    const engine = { cols: 16, rows: 16, el: new Uint16Array(256), aux: new Uint8Array(256), tint: new Uint32Array(256), temp: new Float32Array(256).fill(20), tick: 0 };
    assert.equal(renderer.draw(engine, { view: 0, quality: 2, texOn: true, now: 0 }, new Uint8Array(8)), true);
    assert.ok(renderer.estimatedBytes > 0);
    assert.equal(renderer.draw({ ...engine, cols: 64, rows: 64 }, { view: 0 }, null), false, 'resource profile rejects an over-budget world before texture allocation');
    renderer.dispose();
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test('renderer reports no GL context so the sandbox can use its 2D fallback', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => canvasFor(() => null) };
  try {
    const renderer = new GLRenderer();
    assert.equal(renderer.ok, false);
    assert.equal(renderer.mode, 'none');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
