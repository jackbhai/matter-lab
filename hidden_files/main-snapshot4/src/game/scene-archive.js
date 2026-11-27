/* Portable, versioned Matter Lab scene archives.
   The engine's v1-v3 scene payloads remain unchanged: this layer adds names,
   summaries and an integrity checksum around them, and reads old ML0/ML1
   share codes for backwards compatibility. It has no DOM or engine imports. */

export const SCENE_PACKAGE_FORMAT = 'matter-lab-scene';
export const SCENE_PACKAGE_VERSION = 1;
export const MAX_SCENE_DIMENSION = 1024;
export const MAX_SCENE_CELLS = 200000;
export const MAX_SCENE_BYTES = 8 * 1024 * 1024;
export const MAX_SHARE_CODE_CHARS = Math.ceil(MAX_SCENE_BYTES * 4 / 3) + 64;
export const MAX_SCENE_OBJECTS = 64;
export const MAX_SCENE_BODIES = 1024;
export const MAX_SCENE_NAME_LENGTH = 48;

const encoder = () => new TextEncoder();
const decoder = () => new TextDecoder('utf-8', { fatal: true });

export function normalizeSceneName(value, fallback = 'Matter Lab scene') {
  const clean = String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SCENE_NAME_LENGTH);
  return clean || String(fallback).slice(0, MAX_SCENE_NAME_LENGTH);
}

function encodedBase64Bytes(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, (value.length / 4) * 3 - padding);
}

/** Structural/size validation performed before a payload reaches the engine. */
export function isSceneData(scene) {
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return false;
  if (![1, 2, 3].includes(scene.v)) return false;
  if (!Number.isInteger(scene.cols) || !Number.isInteger(scene.rows)) return false;
  if (scene.cols < 1 || scene.rows < 1 || scene.cols > MAX_SCENE_DIMENSION || scene.rows > MAX_SCENE_DIMENSION || scene.cols * scene.rows > MAX_SCENE_CELLS) return false;
  const cells = scene.cols * scene.rows;
  const elBytes = encodedBase64Bytes(scene.el);
  if (elBytes < cells * 2 || elBytes > MAX_SCENE_BYTES) return false;
  if (scene.temp != null) {
    const tempBytes = encodedBase64Bytes(scene.temp);
    if (tempBytes < cells * 2 || tempBytes > MAX_SCENE_BYTES) return false;
  }
  if (scene.objects != null && (!Array.isArray(scene.objects) || scene.objects.length > MAX_SCENE_OBJECTS)) return false;
  if (scene.bodies != null && (!Array.isArray(scene.bodies) || scene.bodies.length > MAX_SCENE_BODIES)) return false;
  if (Array.isArray(scene.objects)) {
    for (const object of scene.objects) {
      if (!object || typeof object.kind !== 'string' || object.kind.length > 64 || !Number.isFinite(object.x) || !Number.isFinite(object.y)) return false;
    }
  }
  if (Array.isArray(scene.bodies)) {
    for (const body of scene.bodies) {
      if (!body || typeof body.kind !== 'string' || body.kind.length > 64 || !Number.isFinite(body.x) || !Number.isFinite(body.y)) return false;
    }
  }
  return true;
}

function decodeBase64(value) {
  if (encodedBase64Bytes(value) < 0) throw new TypeError('invalid scene base64');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function checksumText(text) {
  const bytes = encoder().encode(text);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a32-${h.toString(16).padStart(8, '0')}`;
}

export function sceneChecksum(scene) {
  return checksumText(JSON.stringify(scene));
}

export function summarizeScene(scene) {
  if (!isSceneData(scene)) throw new TypeError('invalid Matter Lab scene');
  const bytes = decodeBase64(scene.el);
  const ids = new Set();
  let particles = 0;
  const count = Math.min(scene.cols * scene.rows, Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < count; i++) {
    const id = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
    if (id) { particles++; ids.add(id); }
  }
  return {
    particles,
    substances: ids.size,
    objects: Array.isArray(scene.objects) ? scene.objects.length : 0,
    bodies: Array.isArray(scene.bodies) ? scene.bodies.length : 0,
    cols: scene.cols,
    rows: scene.rows,
  };
}

export function createScenePackage(scene, options = {}) {
  if (!isSceneData(scene)) throw new TypeError('invalid Matter Lab scene');
  const payload = {
    format: SCENE_PACKAGE_FORMAT,
    version: SCENE_PACKAGE_VERSION,
    name: normalizeSceneName(options.name),
    createdAt: Number.isFinite(options.createdAt) && options.createdAt > 0 ? Math.floor(options.createdAt) : Date.now(),
    world: { cols: scene.cols, rows: scene.rows },
    summary: summarizeScene(scene),
    checksum: sceneChecksum(scene),
    scene,
  };
  return payload;
}

/** Unwrap an archive, or accept a valid pre-archive engine payload. */
export function unpackScenePackage(value) {
  if (isSceneData(value)) {
    return { scene: value, name: 'Imported scene', createdAt: null, summary: summarizeScene(value), version: 0, legacy: true };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.format !== SCENE_PACKAGE_FORMAT) throw new TypeError('not a Matter Lab scene archive');
  if (value.version !== SCENE_PACKAGE_VERSION) throw new TypeError('unsupported Matter Lab archive version');
  if (!isSceneData(value.scene)) throw new TypeError('invalid Matter Lab scene payload');
  if (!value.world || value.world.cols !== value.scene.cols || value.world.rows !== value.scene.rows) throw new TypeError('scene dimensions do not match archive metadata');
  if (typeof value.checksum !== 'string' || value.checksum !== sceneChecksum(value.scene)) throw new TypeError('scene checksum mismatch');
  const summary = summarizeScene(value.scene);
  return {
    scene: value.scene,
    name: normalizeSceneName(value.name, 'Imported scene'),
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : null,
    summary,
    version: value.version,
    legacy: false,
  };
}

export function serializeSceneFile(scene, options = {}) {
  const archive = createScenePackage(scene, options);
  const text = JSON.stringify(archive, null, 2);
  if (encoder().encode(text).byteLength > MAX_SCENE_BYTES) throw new RangeError('scene archive is too large');
  return text;
}

export function decodeSceneFileText(text) {
  if (typeof text !== 'string' || text.length > MAX_SCENE_BYTES || encoder().encode(text).byteLength > MAX_SCENE_BYTES) throw new RangeError('scene file is too large');
  return unpackScenePackage(JSON.parse(text));
}

function base64UrlEncode(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) throw new TypeError('invalid share-code encoding');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64url'));
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + (normalized.length % 4 ? '='.repeat(4 - normalized.length % 4) : '');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function transformStream(bytes, Constructor, format, maxBytes) {
  if (typeof Constructor === 'undefined' || typeof Blob === 'undefined') throw new Error(`${format} compression is unavailable`);
  const reader = new Blob([bytes]).stream().pipeThrough(new Constructor(format)).getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError('scene archive exceeds the 8 MB safety limit');
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

function parseJsonBytes(bytes) {
  if (bytes.byteLength > MAX_SCENE_BYTES) throw new RangeError('scene archive exceeds the 8 MB safety limit');
  return JSON.parse(decoder().decode(bytes));
}

/** New package codes use ML2.G (gzip) or ML2.R (raw); both carry a checksum. */
export async function encodeShareCode(scene, options = {}) {
  const archive = createScenePackage(scene, options);
  const raw = encoder().encode(JSON.stringify(archive));
  if (raw.byteLength > MAX_SCENE_BYTES) throw new RangeError('scene archive exceeds the 8 MB safety limit');
  let marker = 'R', bytes = raw;
  if (typeof CompressionStream !== 'undefined') {
    try {
      const compressed = await transformStream(raw, CompressionStream, 'gzip', MAX_SCENE_BYTES);
      if (compressed.byteLength < raw.byteLength) { marker = 'G'; bytes = compressed; }
    } catch { /* Raw codes remain portable on browsers without gzip support. */ }
  }
  const code = `ML2.${marker}.${base64UrlEncode(bytes)}`;
  if (code.length > MAX_SHARE_CODE_CHARS) throw new RangeError('share code is too large');
  return code;
}

/**
 * Parse modern ML2 archives and legacy ML0 raw / ML1 gzip codes. Returns the
 * verified scene plus its user-facing metadata; the caller decides whether to
 * mutate the live world or save it as a named slot.
 */
export async function decodeSceneCode(code) {
  const text = String(code == null ? '' : code).trim();
  if (!text || text.length > MAX_SHARE_CODE_CHARS) throw new RangeError('share code is empty or too large');
  if (text.startsWith('ML2.')) {
    const match = /^ML2\.([GR])\.([A-Za-z0-9_-]+)$/.exec(text);
    if (!match) throw new TypeError('invalid ML2 share-code header');
    const encoded = base64UrlDecode(match[2]);
    const raw = match[1] === 'G'
      ? await transformStream(encoded, typeof DecompressionStream === 'undefined' ? undefined : DecompressionStream, 'gzip', MAX_SCENE_BYTES)
      : encoded;
    return unpackScenePackage(parseJsonBytes(raw));
  }
  if (text.startsWith('ML1.')) {
    const encoded = base64UrlDecode(text.slice(4));
    const raw = await transformStream(encoded, typeof DecompressionStream === 'undefined' ? undefined : DecompressionStream, 'gzip', MAX_SCENE_BYTES);
    return unpackScenePackage(parseJsonBytes(raw));
  }
  if (text.startsWith('ML0.')) {
    const raw = base64UrlDecode(text.slice(4));
    return unpackScenePackage(parseJsonBytes(raw));
  }
  throw new TypeError('unknown Matter Lab share-code version');
}

export async function decodeShareCode(code) {
  return (await decodeSceneCode(code)).scene;
}
