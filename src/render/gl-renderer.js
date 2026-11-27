/**
 * Matter Lab v3 P1+P2 — WebGL2 cell-world renderer.
 *
 * Renders the engine's per-cell state (el id, temp, aux/variant, tint) into
 * an offscreen WebGL2 canvas at grid resolution, with an ES 1.00 WebGL1
 * renderer as the compatibility fallback. sandlab.jsx composites the active
 * GPU canvas onto the visible 2D canvas with the exact same letterbox drawImage
 * as the P0 2D path, so pointer mapping, gear/flame/meniscus overlays and
 * the P0 render watchdog (which samples the visible canvas) are untouched.
 *
 * Colour is done in the fragment shader and mirrors the 2D pipeline's math:
 * substance LUT (lo->hi variant lerp), per-cell hash jitter, wet darkening,
 * liquid depth tint, smoke fade, reaction tint, burning flicker, blackbody
 * ramp, cold tint, glass shine, and the D2 hot-cell glow (accumulated with
 * the 2D pass's exact falloff math during the CPU pack into a small glow
 * texture the shader adds — no extra render pass; the blur soften composite
 * in sandlab doubles as the bloom-ish soft glow, gated as before).
 *
 * P2 procedural textures are per-substance: the pattern family comes from
 * the existing TEX_TYPE table (itself derived from cls/fams/profile), a
 * stable per-substance seed comes from an FNV-1a hash of the substance key,
 * and sampling is world-anchored (cell coordinates), so texture never swims.
 * Quality: 0 Low = flat LUT + jitter, 1 Med = texture, no normal/specular,
 * 2 High = full (normal perturbation from the texture height + specular).
 *
 * Fallback contract: probe WebGL2, then WebGL1, then let sandlab use its
 * plain 2D renderer. Context loss, shader failure or a draw error latches the
 * caller into the P0 plain-2D fallback + watchdog notice. Nothing here
 * ever touches the visible canvas directly.
 */

const META_W = 256;

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uData0; // idLo, idHi, aux, tintR
uniform sampler2D uData1; // tempLo, tempHi, tintG, tintB
uniform sampler2D uData2; // depthRunAbove*21, wet, smoke, surface
uniform sampler2D uLut;   // per-(id,variant) base colour .rgb, cls .a — the same LUT the 2D path uses
uniform sampler2D uMetaC; // pattern, spec, seed, amp
uniform sampler2D uPress; // pressure encoded p/8 in r
uniform sampler2D uGlow;  // D2 glow accumulation, computed during the CPU pack (same math + 4096-hot cap as the 2D path)
uniform int uGlowOn;
uniform ivec2 uGrid;
uniform int uView;    // 0 normal/flow, 1 heat, 2 pressure
uniform int uQuality; // 0 low, 1 med, 2 high
uniform int uTexOn;
uniform int uTick;
uniform int uGlassId;
uniform int uSabotage;
uniform float uTimeMs;
out vec4 fragColor;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v; // ~0..0.875
}

/* Per-substance procedural height. wp = world (cell) coords — anchored to
   the world, never to the screen. Pattern kinds mirror TEX_TILES ids. */
float patHeight(int kind, vec2 wp, float seed) {
  vec2 off = vec2(seed * 371.3, seed * 719.7);
  if (kind == 1) return fbm(wp * 0.33 + off);                                  // grain (powders, generic solid)
  if (kind == 2) {                                                             // speckle (stone/mineral)
    float h = fbm(wp * 0.22 + off);
    if (hash21(floor(wp) + seed * 97.0) > 0.94) h *= 0.15;                     // sparse dark pits
    return h;
  }
  if (kind == 3) return fbm(vec2(wp.x * 0.045, wp.y * 0.5) + off);             // streaks (wood)
  if (kind == 4) return 0.5 + 0.5 * sin((wp.x + wp.y + float(uTick >> 3)) * 0.19635); // liquid sheen bands (scrolls like the 2D tile)
  if (kind == 5) {                                                             // sparkle (salt/crystal)
    float h = fbm(wp * 0.4 + off) * 0.7;
    if (hash21(floor(wp) + seed * 57.0) > 0.92) h += 1.5;                      // glints
    return h;
  }
  if (kind == 6) return vnoise(vec2(wp.x * 0.85, wp.y * 0.06) + off);          // brushed columns
  if (kind == 7) return fbm(wp * 0.06 + off);                                  // cloudy (gas)
  if (kind == 8) return vnoise(vec2(wp.x * 1.4, wp.y * 0.05) + off);           // fine brushed metal
  if (kind == 9) return fbm(wp * 0.08 + off);                                  // ceramic smooth
  if (kind == 10) return 0.5 + 0.5 * sin((wp.x - wp.y) * 0.19635);             // glass sheen
  if (kind == 11) return fbm(wp * 0.5 + off);                                  // rubber matte
  if (kind == 12) return fbm(vec2(wp.x * 0.05, wp.y * 0.45) + off);            // copper streaks
  return 0.5;
}

vec3 ramp5(float v, vec3 c0, float v0, vec3 c1, float v1, vec3 c2, float v2, vec3 c3, float v3, vec3 c4) {
  if (v <= v0) return c0;
  if (v <= v1) return mix(c0, c1, (v - v0) / (v1 - v0));
  if (v <= v2) return mix(c1, c2, (v - v1) / (v2 - v1));
  if (v <= v3) return mix(c2, c3, (v - v2) / (v3 - v2));
  return c3 + (c4 - c3) * clamp((v - v3) / 600.0, 0.0, 1.0);
}

void main() {
  if (uSabotage == 1) { fragColor = vec4(10.0 / 255.0, 12.0 / 255.0, 18.0 / 255.0, 1.0); return; }
  ivec2 cell = ivec2(int(gl_FragCoord.x), uGrid.y - 1 - int(gl_FragCoord.y));
  if (cell.x < 0 || cell.y < 0 || cell.x >= uGrid.x || cell.y >= uGrid.y) { fragColor = vec4(10.0 / 255.0, 12.0 / 255.0, 18.0 / 255.0, 1.0); return; }
  vec4 d0 = texelFetch(uData0, cell, 0);
  vec4 d1 = texelFetch(uData1, cell, 0);
  int id = int(d0.r * 255.0 + 0.5) + 256 * int(d0.g * 255.0 + 0.5);
  int aux = int(d0.b * 255.0 + 0.5);
  float tv = (d1.r * 255.0 + 0.5) + 256.0 * (d1.g * 255.0 + 0.5);
  float temp = tv * 0.25 - 256.0;
  vec3 bg = vec3(10.0, 12.0, 18.0);

  if (uView == 1) { // heat — same stops as HEAT_STOPS in sandlab.jsx
    vec3 c = id == 0 ? bg : ramp5(temp, vec3(36.0, 86.0, 200.0), -100.0, vec3(18.0, 20.0, 30.0), 20.0, vec3(240.0, 138.0, 36.0), 200.0, vec3(226.0, 59.0, 46.0), 600.0, vec3(255.0, 255.0, 255.0));
    fragColor = vec4(c / 255.0, 1.0); return;
  }
  if (uView == 2) { // pressure — same stops as PRESS_STOPS
    ivec2 pdim = ivec2((uGrid.x + 3) / 4, (uGrid.y + 3) / 4);
    float p = max(0.0, texelFetch(uPress, ivec2(min(pdim.x - 1, max(0, cell.x / 4)), min(pdim.y - 1, max(0, cell.y / 4))), 0).r * 8.0);
    vec3 c;
    if (p <= 0.0) c = vec3(10.0, 20.0, 80.0);
    else if (p <= 0.5) c = mix(vec3(10.0, 20.0, 80.0), vec3(20.0, 160.0, 170.0), p / 0.5);
    else if (p <= 2.0) c = mix(vec3(20.0, 160.0, 170.0), vec3(240.0, 210.0, 60.0), (p - 0.5) / 1.5);
    else if (p <= 5.0) c = mix(vec3(240.0, 210.0, 60.0), vec3(226.0, 59.0, 46.0), (p - 2.0) / 3.0);
    else c = vec3(226.0, 59.0, 46.0);
    fragColor = vec4(c / 255.0, 1.0); return;
  }

  if (id == 0) { fragColor = vec4(bg / 255.0, 1.0); return; }
  vec4 d2 = texelFetch(uData2, cell, 0);
  int variant = aux & 3;
  float v = float(variant) / 3.0;
  int lidx = id * 4 + variant;
  vec4 lt = texelFetch(uLut, ivec2(lidx % 2048, lidx / 2048), 0);
  vec3 col = lt.rgb * 255.0;
  int cls = int(lt.a * 8.0 + 0.5);
  bool smoke = d2.b > 0.5;
  // pattern/spec/seed/amp only matter when texturing — skip the fetch at Low
  int kind = 0; float spec = 0.0, seed = 0.0, amp = 0.0;
  if (uTexOn == 1 && uQuality >= 1) {
    vec4 mc = texelFetch(uMetaC, ivec2(id % 256, id / 256), 0);
    kind = int(mc.r * 16.0 + 0.5);
    spec = mc.g; seed = mc.b; amp = mc.a * 0.25;
  }
  int i = cell.y * uGrid.x + cell.x;
  // D1 hash jitter — bit-identical formula to the 2D path
  uint h = uint(i) * 2654435761u;
  float jit = 1.0 + (float((h >> 8) % 13u) - 6.0) / 100.0;
  col *= jit;

  vec2 wp = vec2(float(cell.x), float(cell.y));
  // P2 texture + lighting
  if (uTexOn == 1 && uQuality >= 1 && kind > 0) {
    float hh = patHeight(kind, wp, seed);
    float tf = 1.0 + (hh - 0.5) * 2.0 * amp * 1.28;
    col *= tf;
    if (uQuality >= 2) {
      float hx = patHeight(kind, wp + vec2(1.0, 0.0), seed);
      float hy = patHeight(kind, wp + vec2(0.0, 1.0), seed);
      float strength = 2.2 * amp + 0.15;
      vec3 N = normalize(vec3(-(hx - hh) * strength, -(hy - hh) * strength, 1.0));
      vec3 L = normalize(vec3(-0.45, -0.55, 0.69)); // fixed upper-left light
      float diff = max(dot(N, L), 0.0);
      col *= 0.84 + 0.32 * diff;
      if (spec > 0.02) {
        vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
        float sp = pow(max(dot(N, H), 0.0), 26.0) * spec;
        col += sp * vec3(95.0, 93.0, 88.0);
      }
    }
  }
  // D3 depth tint + D5 wet darkening — both precomputed per-cell during
  // the CPU pack (uData2), the same way the 2D path uses its depthRef
  // column scan; the shader needs zero neighbour taps.
  if (cls == 2) {
    float above = d2.r * 255.0 / 21.0;
    float dk = min(0.35, (above + 1.0) * 0.03);
    col *= vec3(1.0 - dk, 1.0 - dk * 0.9, 1.0 - dk * 0.65);
  }
  if (cls == 4 && d2.g > 0.5) col *= 0.88;
  // D4 smoke fade
  if (smoke) {
    float f = clamp((55.0 - temp) / 50.0, 0.0, 0.65) * (0.7 + 0.3 * v);
    col += (bg - col) * f;
  }
  // reaction tint (0.55 lerp, same as 2D)
  vec3 tint = vec3(d0.a * 255.0, d1.b * 255.0, d1.a * 255.0);
  if (tint.r + tint.g + tint.b > 0.0) col += (tint - col) * 0.55;
  // burning flicker — same hash as 2D
  if ((aux & 32) != 0) {
    uint bh = (uint(i) * 2654435761u) ^ (uint(uTick) * 97u);
    float f = float((bh >> 8) % 40u);
    col.r = min(255.0, col.r + 60.0 + f);
    col.g = min(255.0, col.g + f);
  }
  // blackbody / cold
  if (temp > 600.0) {
    float k = min(1.0, (temp - 600.0) / 1800.0);
    vec3 bb = vec3(255.0, 60.0 + 160.0 * k, 10.0 + 140.0 * k * k);
    col += (bb - col) * min(0.85, (temp - 600.0) / 1400.0);
  } else if (temp < 0.0) {
    col += (vec3(120.0, 170.0, 255.0) - col) * vec3(0.25, 0.25, 0.3);
  }
  // glass shine
  if (id == uGlassId) {
    col += (vec3(235.0, 245.0, 250.0) - col) * 0.45;
    if (variant == 0) col = vec3(245.0, 250.0, 252.0);
  }
  // emissive pulse for fire / electric classes
  if (cls == 5 || cls == 6) {
    float pulse = 0.93 + 0.07 * sin(uTimeMs * 0.021 + seed * 40.0 + wp.x * 0.31 + wp.y * 0.27);
    col *= pulse;
  }
  // translucency cue (approximation): surface liquid/gas cells brighten —
  // the pack flags "cell above is not the same class" in uData2.a.
  if ((cls == 2 || cls == 3) && d2.a > 0.5) col *= 1.08;
  // D2 glow — pre-accumulated during the CPU pack into uGlow (radius-2
  // emissive falloff identical to the 2D pass; doing it per-pixel in-shader
  // cost 24 fetches x every pixel, which software GL cannot afford).
  if (uGlowOn == 1) col += texelFetch(uGlow, cell, 0).rgb * 255.0;
  fragColor = vec4(clamp(col, 0.0, 255.0) / 255.0, 1.0);
}`;

// WebGL1 fallback: a deliberately reduced, nearest-sampled cell renderer.
// It preserves substance colour, heat/pressure views and tint without GLSL
// ES 3.00 features. The 2D renderer remains the final compatibility path.
const VERT1 = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
const FRAG1 = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uData0;
uniform sampler2D uData1;
uniform sampler2D uLut;
uniform sampler2D uPress;
uniform vec2 uLutSize;
uniform vec2 uPressSize;
uniform float uView;
vec3 heat(float t) {
  if (t < 20.0) return mix(vec3(0.14,0.34,0.78), vec3(0.07,0.08,0.12), clamp((t+100.0)/120.0,0.0,1.0));
  if (t < 200.0) return mix(vec3(0.07,0.08,0.12), vec3(0.94,0.54,0.14), (t-20.0)/180.0);
  if (t < 600.0) return mix(vec3(0.94,0.54,0.14), vec3(0.88,0.23,0.18), (t-200.0)/400.0);
  return mix(vec3(0.88,0.23,0.18), vec3(1.0), clamp((t-600.0)/600.0,0.0,1.0));
}
void main() {
  vec2 uv = vec2(vUv.x, 1.0-vUv.y);
  vec4 d0 = texture2D(uData0, uv);
  vec4 d1 = texture2D(uData1, uv);
  float id = floor(d0.r*255.0+0.5) + floor(d0.g*255.0+0.5)*256.0;
  if (uView > 0.5 && uView < 1.5) {
    float tv = floor(d1.r*255.0+0.5) + floor(d1.g*255.0+0.5)*256.0;
    float temp = tv*0.25-256.0;
    gl_FragColor = vec4(id < 0.5 ? vec3(0.04,0.047,0.07) : heat(temp), 1.0);
    return;
  }
  if (uView > 1.5) {
    vec2 puv = floor(uv*uPressSize)/max(uPressSize,vec2(1.0));
    float p = texture2D(uPress, puv).r*8.0;
    vec3 c = p < 0.5 ? mix(vec3(0.04,0.08,0.31),vec3(0.08,0.63,0.67),p/0.5)
      : p < 2.0 ? mix(vec3(0.08,0.63,0.67),vec3(0.94,0.82,0.24),(p-0.5)/1.5)
      : mix(vec3(0.94,0.82,0.24),vec3(0.88,0.23,0.18),clamp((p-2.0)/3.0,0.0,1.0));
    gl_FragColor = vec4(c,1.0);
    return;
  }
  if (id < 0.5) { gl_FragColor = vec4(0.04,0.047,0.07,1.0); return; }
  float aux = floor(d0.b*255.0+0.5);
  float index = id*4.0 + mod(aux,4.0);
  vec2 lutCoord = (vec2(mod(index,uLutSize.x),floor(index/uLutSize.x))+0.5)/uLutSize;
  vec3 col = texture2D(uLut,lutCoord).rgb;
  vec3 tint = vec3(d0.a,d1.b,d1.a);
  if (max(max(tint.r,tint.g),tint.b) > 0.003) col = mix(col,tint,0.35);
  float tv = floor(d1.r*255.0+0.5) + floor(d1.g*255.0+0.5)*256.0;
  float temp = tv*0.25-256.0;
  if (temp > 600.0) col = mix(col,vec3(1.0,0.3,0.05),min(0.65,(temp-600.0)/1400.0));
  else if (temp < 0.0) col = mix(col,vec3(0.46,0.66,1.0),0.25);
  gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
}`;

/* Build the per-substance meta textures' backing arrays from sandlab's
   existing render tables (COLS ramps, TEX_TYPE/TEX_AMP pattern choice,
   CLSARR class codes, ISSMOKE). Pattern family therefore stays exactly the
   texFor() decision; the seed varies it per substance. */
export function buildGLTables(SUBSTANCES, COLS, TEX_TYPE, TEX_AMP, CLSARR, ISSMOKE, GLASS_ID, LUT) {
  const n = SUBSTANCES.length;
  const H = Math.max(1, Math.ceil(n / META_W));
  const metaC = new Uint8Array(META_W * H * 4);
  // LUT texture: one texel per (id, variant) from sandlab's LUT (the exact
  // lo->hi lerp the 2D path reads), cls packed in alpha.
  const LUT_W = 2048, LUT_H = Math.max(1, Math.ceil((n * 4) / LUT_W));
  const lutTex = new Uint8Array(LUT_W * LUT_H * 4);
  for (let id = 0; id < n; id++) {
    for (let v = 0; v < 4; v++) {
      const so = (id * 4 + v) * 3, dof = (id * 4 + v) * 4;
      lutTex[dof] = Math.max(0, Math.min(255, Math.round(LUT[so])));
      lutTex[dof + 1] = Math.max(0, Math.min(255, Math.round(LUT[so + 1])));
      lutTex[dof + 2] = Math.max(0, Math.min(255, Math.round(LUT[so + 2])));
      lutTex[dof + 3] = Math.round((CLSARR[id] || 0) / 8 * 255);
    }
  }
  for (const rec of SUBSTANCES) {
    if (!rec || rec.id == null) continue;
    const id = rec.id, o = id * 4;
    // stable per-substance seed: FNV-1a over the key
    let hs = 0x811c9dc5;
    const key = rec.key || String(id);
    for (let k = 0; k < key.length; k++) { hs ^= key.charCodeAt(k); hs = Math.imul(hs, 0x01000193); }
    const seed = ((hs >>> 0) % 10000) / 10000;
    // specular: metals (hardness-scaled), glass, gem, ceramic; else matte
    const fams = rec.fams || [];
    let spec = (rec.hardness || 0) * 0.2;
    if (fams.includes('metal') || rec.profile === 'metal') spec = 0.35 + 0.55 * (rec.hardness || 0.5);
    else if (id === GLASS_ID || rec.cat === 'glass') spec = 0.85;
    else if (fams.includes('gem')) spec = 0.6;
    else if (fams.includes('ceramic')) spec = 0.4;
    metaC[o] = Math.round((TEX_TYPE[id] || 0) / 16 * 255);
    metaC[o + 1] = Math.round(Math.max(0, Math.min(1, spec)) * 255);
    metaC[o + 2] = Math.round(seed * 255);
    metaC[o + 3] = Math.round(Math.min(0.25, TEX_AMP[id] || 0) / 0.25 * 255);
  }
  return { lutTex, lutW: LUT_W, lutH: LUT_H, metaC, metaW: META_W, metaH: H, glassId: GLASS_ID, clsArr: CLSARR, isSmoke: ISSMOKE };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('gl shader: ' + log);
  }
  return sh;
}

export class GLRenderer {
  /** onLost: called when the context is lost (caller latches 2D fallback). */
  constructor(onLost) {
    this.ok = false;
    this.lost = false;
    this.sabotage = false;
    this.tablesVer = -1;
    this.mode = 'none';
    this.fallback = null;
    this.resourceProfile = { maxWorldTextureDimension: 2048, maxWorldCells: Infinity, maxTextureQuality: 2 };
    this.onLost = onLost || null;
    this.canvas = document.createElement('canvas');
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch { gl = null; }
    if (!gl) { this.gl = null; this._tryWebGL1(); return; }
    this.gl = gl;
    this.mode = 'webgl2';
    this.canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.ok = false; this.lost = true;
      if (this.onLost) { try { this.onLost(); } catch { /* noop */ } }
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      try { this._initGL(); this.ok = true; this.lost = false; this.tablesVer = -1; this._gridKey = ''; } catch { this.ok = false; }
    });
    try { this._initGL(); this.ok = true; }
    catch { this.ok = false; this.gl = null; this.mode = 'none'; this._tryWebGL1(); }
  }

  _tryWebGL1() {
    try {
      const renderer = new WebGL1Renderer(this.onLost);
      if (!renderer.ok) return;
      renderer.setResourceProfile(this.resourceProfile);
      this.fallback = renderer;
      this.canvas = renderer.canvas;
      this.gl = renderer.gl;
      this.mode = 'webgl1';
      this.ok = true;
    } catch { this.fallback = null; this.gl = null; this.mode = 'none'; this.ok = false; }
  }

  setResourceProfile(profile = {}) {
    const hardwareMax = (() => { try { return this.gl?.getParameter(this.gl.MAX_TEXTURE_SIZE) || 2048; } catch { return 2048; } })();
    this.resourceProfile = {
      maxWorldTextureDimension: Math.max(64, Math.min(hardwareMax, Number(profile.maxWorldTextureDimension) || 2048)),
      maxWorldCells: Math.max(1, Number(profile.maxWorldCells) || Infinity),
      maxTextureQuality: Math.max(0, Math.min(2, Number(profile.maxTextureQuality) || 0)),
    };
    if (this.fallback) this.fallback.setResourceProfile(this.resourceProfile);
  }

  get estimatedBytes() {
    if (this.fallback) return this.fallback.estimatedBytes;
    let bytes = 0;
    for (const key of ['buf0', 'buf1', 'buf2', 'glowBuf', 'glowAcc', 'pressBuf', 'depthRun']) {
      const value = this[key];
      if (ArrayBuffer.isView(value)) bytes += value.byteLength;
    }
    if (this.tables) bytes += (this.tables.lutTex?.byteLength || 0) + (this.tables.metaC?.byteLength || 0);
    return bytes;
  }

  _initGL() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('gl link: ' + gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.u = {};
    for (const name of ['uData0', 'uData1', 'uData2', 'uLut', 'uMetaC', 'uPress', 'uGlow', 'uGlowOn', 'uGrid', 'uView', 'uQuality', 'uTexOn', 'uTick', 'uGlassId', 'uSabotage', 'uTimeMs']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    this.tex = {};
    for (const k of ['data0', 'data1', 'data2', 'lut', 'metaC', 'press', 'glow']) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.tex[k] = t;
    }
    this.vao = gl.createVertexArray();
    this._gridKey = '';
    this._pressKey = '';
    this.buf0 = null; this.buf1 = null; this.pressBuf = null;
    if (this.tables) this._uploadTables();
  }

  setTables(tables, ver) {
    this.tables = tables;
    this.tablesVer = ver;
    if (this.fallback) { this.fallback.setTables(tables, ver); return; }
    if (this.ok) this._uploadTables();
  }

  _uploadTables() {
    const gl = this.gl, t = this.tables;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.lutW, t.lutH, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.lutTex);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.metaC);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.metaW, t.metaH, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.metaC);
    this.glassId = t.glassId;
  }

  /** Pack engine state into the data textures and draw one frame.
      Returns false if the GL path cannot present (caller uses 2D). */
  draw(e, opts, hotBands) {
    if (!this.ok || this.lost) return false;
    if (this.fallback) return this.fallback.draw(e, opts, hotBands);
    const gl = this.gl;
    if (!gl) { this.ok = false; return false; }
    const T0 = performance.now();
    const { cols, rows, el, temp, aux, tint } = e;
    const n = cols * rows;
    const cap = this.resourceProfile || {};
    if (cols > (cap.maxWorldTextureDimension || 2048) || rows > (cap.maxWorldTextureDimension || 2048) || n > (cap.maxWorldCells || Infinity)) {
      this._lastError = new Error(`world texture ${cols}x${rows} exceeds active resource profile`);
      return false;
    }
    const key = cols + 'x' + rows;
    try {
    if (this._gridKey !== key || !this.buf0 || this.buf0.length !== n * 4) {
      this._gridKey = key;
      this.buf0 = new Uint8Array(n * 4);
      this.buf1 = new Uint8Array(n * 4);
      this.buf2 = new Uint8Array(n * 4);
      this.depthRun = new Int16Array(cols);
      this.glowBuf = new Uint8Array(n * 4);
      this.glowAcc = new Float32Array(n * 3);
      this.hotList = [];
      this.canvas.width = cols; this.canvas.height = rows;
      for (const k of ['data0', 'data1', 'data2', 'glow']) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex[k]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }
    const b0 = this.buf0, b1 = this.buf1, b2 = this.buf2;
    const clsArr = this.tables ? this.tables.clsArr : null;
    const isSmoke = this.tables ? this.tables.isSmoke : null;
    const depthRun = this.depthRun;
    const hot = this.hotList; hot.length = 0;
    let o = 0;
    for (let y = 0; y < rows; y++) {
      const rowBase = y * cols;
      const band = Math.min(7, (y * 8 / rows) | 0);
      for (let x = 0; x < cols; x++, o += 4) {
        const i = rowBase + x;
        const id = el[i], tn = tint[i], t = temp[i];
        b0[o] = id & 255; b0[o + 1] = id >> 8; b0[o + 2] = aux[i]; b0[o + 3] = (tn >> 16) & 255;
        let tvv = (t + 256) * 4; tvv = tvv < 0 ? 0 : tvv > 65535 ? 65535 : tvv | 0;
        b1[o] = tvv & 255; b1[o + 1] = tvv >> 8; b1[o + 2] = (tn >> 8) & 255; b1[o + 3] = tn & 255;
        // uData2: liquid depth-run above (the 2D depthRef scan, capped at
        // 12 where the tint saturates), wet flag for solids, smoke flag,
        // and the translucency surface flag (cell above is another class).
        let dep = 0, wet = 0, surf = 0;
        if (clsArr && id) {
          const cls = clsArr[id];
          if (cls === 2) { dep = Math.min(12, depthRun[x]); depthRun[x]++; } else depthRun[x] = 0;
          if (cls === 4) {
            if ((x + 1 < cols && clsArr[el[i + 1]] === 2) || (x > 0 && clsArr[el[i - 1]] === 2) || (y + 1 < rows && clsArr[el[i + cols]] === 2) || (y > 0 && clsArr[el[i - cols]] === 2)) wet = 255;
          }
          if (cls === 2 || cls === 3) { const aboveCls = y > 0 ? clsArr[el[i - cols]] : 0; if (aboveCls !== cls) surf = 255; }
        } else depthRun[x] = 0;
        b2[o] = dep * 21; b2[o + 1] = wet; b2[o + 2] = isSmoke && id && isSmoke[id] ? 255 : 0; b2[o + 3] = surf;
        if (t > 550 && hot.length < 4096) hot.push(i);
        if (hotBands && t > 800) hotBands[band] = 1;
      }
    }
    // D2 glow accumulation (identical falloff to the 2D pass) into a texture
    let glowOn = 0;
    if (hot.length && opts.view === 0) {
      glowOn = 1;
      const acc = this.glowAcc, gb = this.glowBuf;
      acc.fill(0);
      for (let h = 0; h < hot.length; h++) {
        const i = hot[h], t = temp[i];
        const glow = Math.min(1, (t - 550) / 1450);
        const hx = i % cols, hy = (i / cols) | 0;
        for (let dy = -2; dy <= 2; dy++) {
          const ny = hy + dy; if (ny < 0 || ny >= rows) continue;
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = hx + dx; if (nx < 0 || nx >= cols) continue;
            const fall = glow * (1 - (Math.abs(dx) + Math.abs(dy)) / 6) * 90;
            if (fall <= 0) continue;
            const a3 = (ny * cols + nx) * 3;
            acc[a3] += fall; acc[a3 + 1] += fall * 0.55; acc[a3 + 2] += fall * 0.2;
          }
        }
      }
      for (let i = 0, m = n * 4, a3 = 0; i < m; i += 4, a3 += 3) {
        gb[i] = Math.min(255, acc[a3]); gb[i + 1] = Math.min(255, acc[a3 + 1]); gb[i + 2] = Math.min(255, acc[a3 + 2]); gb[i + 3] = 255;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex.glow);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, gb);
    }
    const T1 = performance.now();
    gl.bindTexture(gl.TEXTURE_2D, this.tex.data0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, b0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.data1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, b1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.data2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, b2);
    if (opts.view === 2) {
      // Pressure view: quarter-res grid via the engine's own pressureAt()
      const pw = Math.max(1, Math.ceil(cols / 4)), ph = Math.max(1, Math.ceil(rows / 4));
      const pk = pw + 'x' + ph;
      if (this._pressKey !== pk || !this.pressBuf) {
        this._pressKey = pk;
        this.pressBuf = new Uint8Array(pw * ph * 4);
        gl.bindTexture(gl.TEXTURE_2D, this.tex.press);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, pw, ph, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      const pb = this.pressBuf;
      let po = 0;
      for (let qy = 0; qy < ph; qy++) for (let qx = 0; qx < pw; qx++, po += 4) {
        let p = 0;
        try { p = e.pressureAt(Math.min(cols - 1, qx * 4), Math.min(rows - 1, qy * 4)) || 0; } catch { p = 0; }
        pb[po] = Math.max(0, Math.min(255, (p / 8) * 255));
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex.press);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, pb);
    }
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    this._lastError = null;
    } catch (err) {
      this._lastError = err;
      this.ok = false;
      if (this.onLost) { try { this.onLost(); } catch { /* noop */ } }
      return false;
    }
    const bind = (unit, tex, loc) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, unit); };
    bind(0, this.tex.data0, this.u.uData0);
    bind(1, this.tex.data1, this.u.uData1);
    bind(2, this.tex.lut, this.u.uLut);
    bind(3, this.tex.metaC, this.u.uMetaC);
    bind(5, this.tex.press, this.u.uPress);
    bind(6, this.tex.glow, this.u.uGlow);
    bind(7, this.tex.data2, this.u.uData2);
    gl.uniform1i(this.u.uGlowOn, glowOn);
    gl.uniform2i(this.u.uGrid, cols, rows);
    gl.uniform1i(this.u.uView, opts.view | 0);
    gl.uniform1i(this.u.uQuality, Math.min(cap.maxTextureQuality ?? 2, Math.max(0, Math.min(2, opts.quality | 0))));
    gl.uniform1i(this.u.uTexOn, opts.texOn && (cap.maxTextureQuality ?? 2) > 0 ? 1 : 0);
    gl.uniform1i(this.u.uTick, e.tick | 0);
    gl.uniform1i(this.u.uGlassId, this.glassId != null ? this.glassId : -1);
    gl.uniform1i(this.u.uSabotage, this.sabotage ? 1 : 0);
    gl.uniform1f(this.u.uTimeMs, opts.now || 0);
    const T2 = performance.now();
    gl.viewport(0, 0, cols, rows);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const T3 = performance.now();
    this.timings = { pack: +(T1 - T0).toFixed(2), upload: +(T2 - T1).toFixed(2), draw: +(T3 - T2).toFixed(2) };
    return true;
  }

  dispose() {
    if (this.fallback) this.fallback.dispose();
    else if (this.gl) { try { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch { /* noop */ } }
    this.ok = false;
  }
}

/* WebGL1 compatibility renderer. It intentionally exposes the same small
   surface as GLRenderer so callers can keep one GL2 → GL1 → Canvas2D policy.
   The ES 1.00 shader trades procedural detail for a broad device baseline. */
class WebGL1Renderer {
  constructor(onLost) {
    this.ok = false;
    this.lost = false;
    this.mode = 'webgl1';
    this.onLost = onLost || null;
    this.tables = null;
    this.tablesVer = -1;
    this.resourceProfile = { maxWorldTextureDimension: 2048, maxWorldCells: Infinity, maxTextureQuality: 0 };
    for (const kind of ['webgl', 'experimental-webgl']) {
      const canvas = document.createElement('canvas');
      let gl = null;
      try { gl = canvas.getContext(kind, { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch { gl = null; }
      if (!gl) continue;
      this.canvas = canvas;
      this.gl = gl;
      try {
        this._init();
        this.ok = true;
        canvas.addEventListener('webglcontextlost', (event) => {
          event.preventDefault(); this.ok = false; this.lost = true;
          if (this.onLost) { try { this.onLost(); } catch { /* noop */ } }
        });
        canvas.addEventListener('webglcontextrestored', () => {
          try { this._init(); this.ok = true; this.lost = false; } catch { this.ok = false; }
        });
        break;
      } catch { this.ok = false; this.gl = null; this.canvas = null; }
    }
  }

  setResourceProfile(profile = {}) {
    const hardwareMax = (() => { try { return this.gl?.getParameter(this.gl.MAX_TEXTURE_SIZE) || 2048; } catch { return 2048; } })();
    this.resourceProfile = {
      maxWorldTextureDimension: Math.max(64, Math.min(hardwareMax, Number(profile.maxWorldTextureDimension) || 2048)),
      maxWorldCells: Math.max(1, Number(profile.maxWorldCells) || Infinity),
      maxTextureQuality: 0,
    };
  }

  get estimatedBytes() {
    let bytes = 0;
    for (const key of ['buf0', 'buf1', 'pressBuf']) if (ArrayBuffer.isView(this[key])) bytes += this[key].byteLength;
    if (this.tables) bytes += (this.tables.lutTex?.byteLength || 0) + (this.tables.metaC?.byteLength || 0);
    return bytes;
  }

  _texture(name) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex[name] = texture;
  }

  _init() {
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT1));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG1));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('webgl1 link: ' + gl.getProgramInfoLog(program));
    this.program = program;
    this.aPosition = gl.getAttribLocation(program, 'aPosition');
    this.u = {};
    for (const name of ['uData0', 'uData1', 'uLut', 'uPress', 'uLutSize', 'uPressSize', 'uView']) this.u[name] = gl.getUniformLocation(program, name);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.tex = {};
    for (const name of ['data0', 'data1', 'lut', 'press']) this._texture(name);
    this.dimensions = {};
    this.gridKey = '';
    this.pressKey = '';
    this.buf0 = null; this.buf1 = null; this.pressBuf = null;
    if (this.tables) this._uploadTables();
  }

  setTables(tables, ver) {
    this.tables = tables;
    this.tablesVer = ver;
    if (this.ok) this._uploadTables();
  }

  _uploadTables() {
    if (!this.tables || !this.gl) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.tables.lutW, this.tables.lutH, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.tables.lutTex);
    this.dimensions.lut = `${this.tables.lutW}x${this.tables.lutH}`;
  }

  _allocate(name, width, height) {
    const key = `${width}x${height}`;
    if (this.dimensions[name] === key) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.dimensions[name] = key;
  }

  draw(engine, opts = {}) {
    if (!this.ok || this.lost || !this.gl) return false;
    const gl = this.gl;
    const { cols, rows, el, aux, tint, temp } = engine;
    const count = cols * rows;
    const cap = this.resourceProfile;
    if (cols > cap.maxWorldTextureDimension || rows > cap.maxWorldTextureDimension || count > cap.maxWorldCells) return false;
    try {
      const key = `${cols}x${rows}`;
      if (this.gridKey !== key || !this.buf0) {
        this.gridKey = key;
        this.buf0 = new Uint8Array(count * 4);
        this.buf1 = new Uint8Array(count * 4);
        this.canvas.width = cols; this.canvas.height = rows;
        this._allocate('data0', cols, rows); this._allocate('data1', cols, rows);
      }
      const d0 = this.buf0, d1 = this.buf1;
      for (let i = 0, o = 0; i < count; i++, o += 4) {
        const id = el[i], tintValue = tint[i];
        d0[o] = id & 255; d0[o + 1] = id >> 8; d0[o + 2] = aux[i]; d0[o + 3] = tintValue >>> 16 & 255;
        let tv = Math.max(0, Math.min(65535, ((temp[i] + 256) * 4) | 0));
        d1[o] = tv & 255; d1[o + 1] = tv >>> 8; d1[o + 2] = tintValue >>> 8 & 255; d1[o + 3] = tintValue & 255;
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.data0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, d0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex.data1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, d1);
      if (opts.view === 2) {
        const pw = Math.max(1, Math.ceil(cols / 4)), ph = Math.max(1, Math.ceil(rows / 4));
        const pkey = `${pw}x${ph}`;
        if (this.pressKey !== pkey || !this.pressBuf) {
          this.pressKey = pkey; this.pressBuf = new Uint8Array(pw * ph * 4); this._allocate('press', pw, ph);
        }
        for (let y = 0, o = 0; y < ph; y++) for (let x = 0; x < pw; x++, o += 4) {
          let value = 0;
          try { value = engine.pressureAt(Math.min(cols - 1, x * 4), Math.min(rows - 1, y * 4)) || 0; } catch { /* no pressure API */ }
          this.pressBuf[o] = Math.max(0, Math.min(255, Math.round(value / 8 * 255)));
        }
        gl.bindTexture(gl.TEXTURE_2D, this.tex.press);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, this.pressBuf);
      }
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.enableVertexAttribArray(this.aPosition);
      gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0);
      const bind = (unit, name, uniform) => {
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.tex[name]); gl.uniform1i(this.u[uniform], unit);
      };
      bind(0, 'data0', 'uData0'); bind(1, 'data1', 'uData1'); bind(2, 'lut', 'uLut'); bind(3, 'press', 'uPress');
      gl.uniform2f(this.u.uLutSize, this.tables?.lutW || 2048, this.tables?.lutH || 1);
      gl.uniform2f(this.u.uPressSize, Math.max(1, Math.ceil(cols / 4)), Math.max(1, Math.ceil(rows / 4)));
      gl.uniform1f(this.u.uView, opts.view || 0);
      gl.viewport(0, 0, cols, rows);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    } catch (error) {
      this.lastError = error;
      this.ok = false;
      if (this.onLost) { try { this.onLost(); } catch { /* noop */ } }
      return false;
    }
  }

  dispose() {
    try { const ext = this.gl?.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch { /* noop */ }
    this.ok = false;
  }
}
