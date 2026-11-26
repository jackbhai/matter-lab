# Matter Lab v3 — Report

## P1+P2 — WebGL2 renderer + per-substance procedural textures (2026-11-27)

Scope honoured: only the render path of `src/tools/sandlab.jsx` plus the new
module `src/render/gl-renderer.js`. No simulation rules, data, serialize
format or pointer-mapping changes. The P0 plain-2D path is intact and is now
the fallback; the P0 watchdog supervises the GL output (see the tolerance
fix below). Gyro (P3) and UI layout untouched.

### Architecture

- **New module `src/render/gl-renderer.js`** — a `GLRenderer` class owning an
  offscreen WebGL2 canvas at grid resolution, plus `buildGLTables()` which
  derives the GPU substance tables from sandlab's existing render tables.
- **Detection/gating:** `getContext('webgl2')` failure or shader/link failure
  → renderer unavailable → the 2D path runs seamlessly (this is also the
  `--disable-3d-apis` software gate: WebGL is null there and verify passes).
  Any draw failure, and any `webglcontextlost` event (default prevented,
  restore re-inits the GL objects), latches the P0 fallback + notice for the
  session via the same `fbRef`/`setGfx('fallback')` path as a render throw.
- **Per-frame upload:** engine state is packed on the CPU into three RGBA
  textures via `texSubImage2D` on preallocated textures (reallocated only on
  grid resize): data0 = el id (16-bit split) + aux + tintR; data1 = temp
  (14-bit, 0.25 °C steps) + tintG/B; data2 = liquid depth-run (the 2D
  `depthRef` column scan, capped at 12 where the tint saturates), wet flag,
  smoke flag, translucency-surface flag. Substance data is uploaded once per
  table version: a LUT texture (one texel per id×variant — the exact lo→hi
  lerp the 2D path reads, class in alpha) and a meta texture (pattern kind,
  specular, per-substance seed, texture amplitude).
- **Shader colour (fragment, GLSL ES 3.00)** mirrors the 2D pipeline's math:
  LUT base, bit-identical hash jitter and burning flicker (same uint
  formulas), wet darkening, depth tint, smoke fade, reaction tint (0.55
  lerp), blackbody ramp, cold tint, glass shine. **Views:** Normal/Flow use
  the full pipeline (Flow's air arrows remain the existing 2D overlay);
  Heat and Pressure use in-shader ramps with the same stops as
  `HEAT_STOPS`/`PRESS_STOPS` (pressure sampled from a quarter-res texture
  filled via the engine's own `pressureAt()`).
- **Glow/bloom (≤1 extra pass):** the D2 radius-2 glow is accumulated with
  the 2D pass's exact falloff during the CPU pack (same 4,096-hot cap) into
  a small glow texture the shader adds — an in-shader 24-tap version was
  built first and removed: under SwiftShader it cost the same as every other
  variant (see numbers) and the CPU version is O(hot cells) like the 2D
  path. The existing blur soften composite (scratch canvas, 0.38 alpha,
  governor-gated exactly as before) doubles as the bloom-ish soft glow for
  the GL source.
- **Presentation:** the GL canvas is composited onto the visible 2D canvas
  with the *same* letterbox `drawImage` (same `geomRef` math) as the 2D
  path — a plain drawImage of a *different* canvas, the operation P0
  established as safe (the suspects were self-drawImage and filtered draws
  on the visible canvas; neither is used). All overlays (gear sprites,
  flame, meniscus, selection, gravity, flow arrows, heat shimmer — bands now
  also sourced from the world canvas) draw afterwards, unchanged. Because
  the visible canvas remains a 2D canvas, the watchdog's sampling, pointer
  mapping and `verify-local`'s pixel checks are untouched.
- **Watchdog tolerance fix (real bug found by fault injection):** the
  watchdog tested sampled pixels for *exact* equality with the bg colour
  (10,12,18). A WebGL canvas composited via drawImage perturbs that colour
  by ±1 (premultiplied round-trip + the 0.38-alpha blur blit — measured
  top colours on a sabotaged frame: (9,12,17), (10,11,18), (9,11,17)), so a
  GL output presenting pure background would have read as "visible" and the
  watchdog would never have struck. The bg test now allows ±2 per channel.
  Real substance colours differ from bg by far more, and the 2D path's bg
  is exact, so 2D supervision is unchanged.

### P2 — per-substance procedural textures (GL shader; 2D keeps its 13 tiles)

- **Per-substance, not per-class:** pattern family comes from the existing
  `TEX_TYPE` table (itself the `texFor()` decision from cls/fams/profile —
  grain for powders, speckle for stone, streaks for wood, sheen for liquids,
  sparkle for salt/crystal, brushed/fine-brushed for metals, cloudy for gas,
  ceramic, glass sheen, rubber matte, copper streaks), and a stable
  per-substance seed (FNV-1a of the substance key) offsets/varies the field
  so two substances sharing a family don't look identical.
- **World-anchored:** sampling uses cell coordinates; the texture is fixed
  to the world and does not swim when the view moves (liquid sheen scrolls
  with tick, like the 2D tile it mirrors).
- **Lighting (High):** the pattern's height noise is perturbed into a
  normal, lit by a fixed upper-left light; specular strength is derived per
  substance (metals hardness-scaled, glass 0.85, gem 0.6, ceramic 0.4, else
  matte). Fire/electric classes get an emissive pulse.
- **Translucency — approximation (honest):** true translucency needs what's
  beneath the cell, unavailable in a single forward pass. Surface
  liquid/gas cells (cell above is a different class, flagged in the pack)
  are brightened 8% as a cue. Nothing more is claimed.
- **Quality toggle:** Auto / Low / Med / High in the View panel (next to the
  existing Texture toggle), persisted at `omni:sandlab:texq`. Low = flat
  LUT colour + jitter (the P2 texture/lighting layer off; the P1 colour
  pipeline stays), Med = texture without normal/specular, High = full.
  Default Auto = High with governor auto-drop: ladderStep ≥ 3 caps at Med,
  ≥ 5 caps at Low — wired the same way the governor already gates the glow
  pass. Texture-off (existing toggle) also disables the P2 layer in GL.

### Numbers (throttled shared sandbox, SwiftShader — NOT device numbers)

Busy scene, 412×915 viewport, grid 242×536, **5,428 particles**, live sim,
300 rAF intervals per mode (`scripts/bench-p1.mjs`):

| Path | Median | p95 |
|---|---|---|
| 2D (P0 path) | 33.3 ms | 66.7 ms |
| GL Low | 183.3 ms | 200.1 ms |
| GL Med | 183.3 ms | 200.1 ms |
| GL High | 183.4 ms | 233.3 ms |

576×324 grid scene (**8,509 particles** after resize resampling + top-up):

| Path | Median | p95 |
|---|---|---|
| 2D | 16.7 ms | 16.7 ms |
| GL High | 199.9 ms | 216.7 ms |

**Honest reading:** in this sandbox the GL path is *slower* than 2D at every
quality, and quality makes no measurable difference — the cost is
SwiftShader executing the fragment shader on the same throttled 1.5 shared
CPUs as the sim (instrumentation: the CPU side of `draw()` — pack + uploads
+ drawArrays call — is ~3 ms/frame; a raw WebGL2 canvas + upload + composite
probe with a trivial shader runs at 16.7 ms; the deferred shader execution
lands at composite time). SwiftShader is a CPU JIT of a GPU workload: on any
real phone GPU this shader (≤7 texture fetches + one 3-octave noise at
High) is trivially cheap, and the CPU pack (~3 ms) replaces the 2D path's
much heavier per-cell JS colour loop. **No 60 fps claim is made from these
numbers** — 60 fps is shown only by the 2D 576×324 run (16.7 ms) in this
sandbox. Device numbers will differ and need one on-device check, same as
P0's status. Sandbox variance is also large (repeat GL High medians across
runs: 116–200 ms).

### Gates

- `npm run build` — PASS.
- `scripts/verify-local.mjs` — PASS (normal mode), PASS under
  `CHROME_FLAGS='--disable-gpu --disable-3d-apis'` (WebGL null → seamless
  2D). 0 page errors in every run.
- Screenshots at 412×915 in `~/workspace/matter-lab-shots/p1/`: `view-normal
  / view-heat / view-pressure / view-flow` (GL, High), `quality-low /
  quality-med / quality-high`, `scene-576x324-2d`, `fi-gl-black-fallback`.
- **Watchdog fault injection:** `__matterlab.sabotageGL(true)` forces the GL
  fragment output to the exact bg colour → watchdog struck twice → fallback
  latched, `gfx() = {fallback: true, notice: 'fallback'}`, notice present in
  the DOM (`data-gfxnotice="fallback"`), and the screenshot shows the world
  visible again via plain 2D under the fallback banner. (Engagement took
  ~6 s in the sandbox: the watchdog samples every 30th *frame* and sandbox
  GL frames are ~180 ms; at 60 fps on a device it is ~1 s.)
- Test hooks added: `__matterlab.gl()`, `setGLRenderer(b)`,
  `setTexQuality(q)`, `sabotageGL(b)`, `glTimings()`.

### PARTIALs

- **Sandbox perf:** GL is slower than 2D *in this SwiftShader sandbox* (see
  numbers). The architecture decision (GPU shading, ~3 ms CPU pack) is
  built for real GPUs; an on-device frame-time check is the deciding test,
  and if a real low-end GPU were slow, note the load governor currently
  keys on sim `emaMs` only — feeding it render time is a follow-up, not
  done here.
- **Translucency** is the surface-brightening approximation described above.
- **Bloom** is the glow texture + the existing blur composite, not a
  separate multi-pass bloom pipeline (by design, ≤1 extra pass).
- **Pressure view** samples the engine's `pressureAt()` at quarter-res
  block corners — the sealed-region term is therefore block-approximated
  vs the 2D path's per-cell call.
- Context *restore* re-initialises the renderer, but the fallback stays
  latched for the session (the P0 latch semantics); lifting it on restore
  is a possible follow-up.

---

## P5 — Publish infrastructure (2026-11-27)

Scope: publish plumbing only. No app-logic changes — `src/tools/sandlab.jsx`,
`src/core/*` (except the new migration module) and `src/home/*` untouched.
Baseline stayed green throughout: `npm run build` PASS, `scripts/verify-local.mjs` PASS (before and after).

### Changelog

1. **package.json** — `vite` and `@vitejs/plugin-react` moved from
   `dependencies` to `devDependencies`; `react`/`react-dom` stay in
   `dependencies`. Lockfile refreshed via `npm install`. Build still passes.
2. **PWA**
   - `public/manifest.webmanifest` — name "Matter Lab", short_name "Matter Lab",
     `display: standalone`, theme/background `#060d12` (lab-glass), relative
     `start_url`/`scope` so it works at any path (GitHub Pages project site).
   - Icons (original artwork, flask concept matching the site favicon),
     generated by `scripts/gen-icons.mjs` (inline SVG rendered in headless
     Chrome, exact-size PNGs): `public/icons/icon-192.png` (192×192),
     `icon-512.png` (512×512), `icon-maskable-512.png` (512×512, flask inside
     the maskable safe zone on a full-bleed background).
   - `public/sw.js` — cache name **`matter-lab-v3`** (versioned; bump to
     invalidate). Cache-first for the app shell + same-origin hashed assets
     with stale-while-revalidate refresh; navigations fall back to the cached
     shell offline; cross-origin requests are never cached. App is
     offline-capable after first load.
   - Registered from `src/main.jsx` (production builds only,
     `navigator.serviceWorker.register('./sw.js', { scope: './' })`) —
     registration confirmed present in the built bundle.
   - `index.html` gained the manifest link, apple-touch-icon and mobile
     web-app meta tags.
3. **Storage-key migration** — new standalone module
   `src/core/storage-migration.js`, imported by `main.jsx` and run **before**
   the app boots. It performs a SAFE one-way **copy** (old → new) for every
   known key: old keys are never deleted or modified, a copy is written only
   when the new key doesn't already exist (idempotent, flagged by
   `matterlab:migration:v3-done`), so existing saves keep loading exactly as
   before and a future rename of the app code loses nothing.
4. **Privacy page** — `public/privacy.html`: plain language — data is local
   saves only, no tracking, no accounts, no cookies; contact line "By Jack
   Bhai". Linked from a small footer line in `index.html` (the in-app footer
   lives in `src/home/HomePage.jsx`, owned by another builder, so the link
   ships via `index.html` instead).
5. **Scripts Chrome-path fix** — new shared helper `scripts/chrome-path.mjs`:
   resolves `$CHROME_PATH` → puppeteer cache glob (newest version first,
   headless-shell and full chrome) → common system paths → the old hardcoded
   path as last-resort fallback. All 8 scripts that referenced Chrome
   (`verify-local`, `verify-live`, `verify-live-v2`, `verify-v2`,
   `phase0-audit`, `phase0-audit2`, `phase0-retest`, `phase0-retest2`) now use
   it; no hardcoded `/home/hatch/.cache/...` path remains outside the helper.
   Behaviour is identical when the old path exists (it is in the cache glob).
6. **CI** — `.github/workflows/build.yml` (YAML validated): on push/PR to
   `main` — `npm ci`, `npm run build`, installs `chrome-headless-shell` via
   `@puppeteer/browsers`, resolves `CHROME_PATH`, runs the real
   `scripts/verify-local.mjs`, uploads `dist` as an artifact. A `deploy` job
   (pushes to `main` only) publishes `dist/` to the `gh-pages` branch via
   `peaceiris/actions-gh-pages` — the same effect as the repo's existing
   `gh_pages_deploy.py` route (source → `main`, build → `gh-pages`,
   `.nojekyll` included by default).
7. **Capacitor — PARTIAL** (see status below).
8. **Lighthouse (performance)** — run locally against the served `dist/`
   build with the full Chrome from the puppeteer cache: **Performance 46**
   (LCP 9.9 s, Total Blocking Time 2,380 ms, CLS 0.002, Speed Index 2.2 s).
   Honest context: measured on this shared 1.5-CPU VM under Lighthouse's
   default mobile throttling; the app boots a heavy simulation on load.
   Treat 46 as a this-machine baseline, not a field score.

### Storage-key map (found by grepping `src/` — all keys are legacy `omni:*`)

| Old key (app reads this today) | Proposed new key (copy target) | Used for |
|---|---|---|
| `omni:settings` | `matterlab:settings` | App settings (`src/core/settings.js`) |
| `omni:theme` | `matterlab:theme` | Active theme (`src/core/theme.js`, `settings.js`) |
| `omni:custom-theme` | `matterlab:custom-theme` | Custom theme definition |
| `omni:my-themes` | `matterlab:my-themes` | User-saved themes |
| `omni:sandlab:favs` | `matterlab:sandlab:favs` | Favourite substances |
| `omni:sandlab:recent` | `matterlab:sandlab:recent` | Recently used substances |
| `omni:sandlab:scenes` | `matterlab:sandlab:scenes` | Saved scenes |
| `omni:sandlab:recipes` | `matterlab:sandlab:recipes` | Saved recipes |
| `omni:sandlab:neutral` | `matterlab:sandlab:neutral` | Gyro neutral calibration |
| `omni:sandlab:seen` | `matterlab:sandlab:seen` | Intro demo seen flag |
| `omni:matterlab:customs` | `matterlab:customs` | Custom substances |

No `ml:`-prefixed keys exist. The keys are NOT yet matter-lab-specific, so
the copy migration ships as designed; the app still reads the old names
(renaming those reads is app-code work for the owning builders — when they
switch, the data is already waiting under the new names).

### Capacitor status — PARTIAL

Done in this environment:
- `npm i @capacitor/core @capacitor/android @capacitor/splash-screen`,
  `@capacitor/cli` in devDependencies.
- `npx cap init` → `capacitor.config.json`: appId **`com.jackbhai.matterlab`**,
  appName "Matter Lab", webDir `dist`.
- `npx cap add android` → `android/` platform created; `npx cap sync android` passes.
- Config: SplashScreen plugin (1.2 s, auto-hide, background `#060d12`, no
  spinner), `android.allowMixedContent: false`; `AndroidManifest.xml` gained
  the `WAKE_LOCK` permission and `android:screenOrientation="fullSensor"` on
  MainActivity.

**Exact blocker:** no Java and no Android SDK on this machine —
`./gradlew assembleDebug` fails with
`ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH`
(`ANDROID_HOME`/`ANDROID_SDK_ROOT` unset, no SDK directories present).
No AAB/APK was faked.

**On a machine with Android Studio installed, run:**
```bash
cd ~/workspace/matter-lab
npm install
npm run build
npx cap sync android
npx cap open android   # then Build > Generate Signed App Bundle (AAB) in Android Studio
# …or headless:  cd android && ./gradlew bundleRelease
```

### Test steps (all run, all green unless noted)

1. `npm run build` → PASS.
2. `node scripts/verify-local.mjs` → `VERIFY: PASS` (entered lab, canvas
   ticking, substance panel tiles OK, zero page errors) — also proves the
   patched Chrome-path resolution and that existing saves still load.
3. `dist/` after build contains `manifest.webmanifest`, `sw.js`,
   `privacy.html`, `icons/icon-192.png`, `icons/icon-512.png`,
   `icons/icon-maskable-512.png`; `serviceWorker.register('./sw.js', …)`
   present in the built JS bundle; `matter-lab-v3` cache name in `dist/sw.js`.
4. Icon PNG dimensions verified programmatically (192×192 / 512×512 / 512×512).
5. `.github/workflows/build.yml` parsed with a YAML loader → valid.
6. Lighthouse performance run → 46 (see context above).
7. Capacitor: init/add/sync PASS; Gradle build BLOCKED (no Java/SDK) — PARTIAL.

### PARTIALs

- **Capacitor AAB/APK build** — blocked on Java + Android SDK (exact error
  and the commands to finish it are above).
- **Privacy link placement** — shipped via `index.html`; linking it from the
  in-app homepage footer (`src/home/HomePage.jsx`) is a one-line change for
  that file's owner if wanted.

---

## P0 — Real-device black-void render failure (2026-11-27)

### Root cause (one sentence, with the honest caveat)

The failure could **not** be reproduced in headless Chromium under any
constrained condition tried, so there is no single proven culprit; the
evidence narrows it to the class of **Android-WebView GPU-rasterizer
presentation failures triggered by two operations the old render path
performed on the visible canvas every frame — a `ctx.filter='blur(2px)'`
drawImage pass and a self-referential `ctx.drawImage(cv, …)` heat-shimmer
copy** — a failure class in which the canvas presents as a pure black void
while engine state, DOM/UI and even pixel readback stay correct, which
matches the device evidence exactly (toasts/panels/engine all alive, canvas
pure black, even for bright lava).

### Diagnosis evidence (probe numbers)

Built app driven headless (puppeteer-core, 412×915, real engine hook:
605 lava + 257 sand cells placed, beaker-l placed, 30 steps, 1,013
particles). Pixel census = strided RGB sample of the visible canvas,
background = (10,12,18):

| Scenario | Flags / UA / DPR | WebGL | Non-bg samples (of 10,118) | rAF errors |
|---|---|---|---|---|
| normal | default, DPR 1 | WebGL 2.0 | 620 (149 bright) | 0 |
| sw1 | `--disable-gpu --use-gl=angle --use-angle=swiftshader`, DPR 2.625 | WebGL 2.0 (SwiftShader) | 616 | 0 |
| sw2 | `--disable-gpu --use-gl=swiftshader-webgl`, DPR 2.625 | **null** | 611 | 0 |
| no3d | `--disable-gpu --disable-3d-apis`, DPR 2.625 | **null** | 612 | 0 |
| wv | sw1 flags + Android WebView UA (`; wv)`), DPR 3 | WebGL 2.0 | 616 | 0 |

Ruled out by the probes: render() throwing (0 rAF errors, `lastError`
null in every run), the offscreen grid canvas being 0-sized (canvas
410×913, grid 242×536 in all runs), letterbox scale collapse (fullscreen
engaged, geometry sane), `ctx.filter` being unsupported (probe:
`'filter' in prototype` = true, assignment round-trips `'blur(2px)'`),
and WebGL absence (canvas is 2D; renders with WebGL fully disabled).
What headless cannot emulate is the device GPU rasterizer's
*presentation* of a filtered / self-copied canvas — hence hardening by
construction (below) rather than a claimed pinpoint fix.

### The fix (src/tools/sandlab.jsx, render path only)

1. **The visible canvas's context never carries a filter again.** The
   blur/glow pass now renders into a scratch canvas (`blurRef`) and is
   blitted onto the visible canvas as a plain drawImage at the same 0.38
   alpha — visually identical, one whole failure class removed.
2. **No self-referential drawImage.** Heat-shimmer bands are now copied
   from the offscreen grid canvas instead of `drawImage(cv, …)` onto
   itself; same bands, same ±1 px sine offset.
3. **Sizing guards.** The backing store is only resized from a positive
   client size (a mid-fullscreen-transition 0 is ignored instead of
   pinning the canvas to 0), the frame is skipped if the canvas is
   0-sized, and a non-positive/non-finite letterbox scale aborts the
   frame instead of drawing nothing forever.
4. **Offscreen self-heal.** If the offscreen canvas or ImageData no
   longer matches the engine grid (0-sized after a resize rebuild, stale
   after a tier change), `rebuildOff(e)` runs before any pixel work.

### Render watchdog

- Every 30th frame (two small `getImageData` patches — canvas centre +
  the patch around the first live cell; readback failure never
  false-triggers), if the world is non-empty (strided cell scan or any
  placed object) but both patches sample as pure background, that's a
  strike. **Two strikes → plain-2D fallback** (no filter, no smoothing
  upscale, no shimmer; direct drawImage; gear overlays still draw) plus a
  visible, dismissible notice: “Graphics fallback on — simpler drawing is
  in use so the world stays visible on this device.” with a
  tap-for-details expansion.
- A render() throw does the same: fallback engages and the frame retries
  in place; only a fallback-path throw falls through to the existing
  pause banner.
- **Two further strikes while in fallback → the notice escalates to
  “Rendering failed — the simulation is running, but this device could
  not draw the picture, even in fallback mode.”** A silent black void is
  no longer a possible end state.

### Gate results

Software-rendering headless run (`--disable-gpu --use-gl=angle
--use-angle=swiftshader`, 412×915, DPR 2.625), screenshots in
`~/workspace/matter-lab-shots/p0/`:

- **BASE (post-fix):** 1,348 particles placed; census non-bg = **591**
  (176 bright) — sand/lava/water/beaker visible; fallback correctly NOT
  engaged; 0 page errors. Shot: `after-software.png`.
- **FI-A (smoothed draws to the visible canvas silently dropped —
  simulated presentation failure):** watchdog engaged the fallback
  (`gfx() = {fallback: true, notice: 'fallback'}`, notice in DOM) and the
  world stayed visible (non-bg 337 → 273). Shots:
  `fi-watchdog-before.png`, `fi-watchdog-after.png`.
- **FI-B (offscreen canvas zeroed mid-run via test hook):** self-healed
  with no fallback and no errors — non-bg 590 → 569. Shot:
  `fi-offscreen-healed.png`.
- **FI-C (all draws to the visible canvas dropped):** census non-bg = 0,
  fallback engaged, notice escalated to `failed` in the DOM. Shot:
  `fi-failed.png`.
- **scripts/verify-local.mjs: PASS** in normal mode and **PASS** under
  the software-rendering flags (a `CHROME_FLAGS` env hook was added to
  the script for the second run).
- **Frame time:** busy-scene median rAF frame interval post-fix =
  **33.3 ms** vs the v2 sandbox baseline median of 50.0 ms — no
  regression (the scratch-canvas blur pass costs no measurable frame
  time; sandbox variance noted).

### Status: PARTIAL (honest)

The device bug itself was not reproduced headlessly, so the fix is
hardening-by-construction against the evidenced candidate classes, each
guard proven by fault injection above — not a verified on-device cure.
Final confirmation needs one live-site check on the user's phone: if the
world renders, done; if not, the fallback notice (or the “rendering
failed” notice) will now be visible on his screen instead of a silent
void, which also tells us which branch fired.

---

## Redesign acceptance list (logged 2026-11-27 — NOT fixed in P0; the UI phase owns these)

Real-device UI defects reported from the user's phone:

- (a) Tools panel cut off at right/bottom — Speed “2×” sliced, “4×”
  off-screen, “Flow” half-cut.
- (b) “Move with vessel” pill truncated to “Move with ve…”.
- (c) Duplicate “GEAR — BURNER” block shown twice on selection.
- (d) Left rail is icon-only, NO text labels.
- (e) Confusing dual size system — global S/M/L/XL selector AND separate
  Beaker S/M/L tiles, unexplained.
- (f) Menu heading wraps to two lines; the “long-press a tile = details”
  hint is squeezed.
- (g) Empty world has no bench/floor/hint — the first screen feels broken.
- (h) Homepage numbers must be verified-only. Checked 2026-11-27:
  `src/home/HomePage.jsx` renders **hardcoded literals** ('1,822' /
  '34,775'), NOT live values from the data modules. Live data says
  SUBSTANCE_COUNT = **1,822** (matches) but NAMED_PAIR_COUNT =
  **34,793** — the homepage's “34,775 named reactions” is stale by 18.
  The redesign phase should wire the homepage to the live counts (or
  re-verify the literals) so the numbers can never drift again.

## P3 — Gravity & Gyro (+ engine cleanup) (2026-11-27)

Scope honoured: render path in sandlab.jsx untouched (P0 hardening intact);
edits confined to `src/core/matter-engine.js` gravity, gyro/orientation +
engine wiring in `src/tools/sandlab.jsx`, and the haptics vocabulary in
`src/core/sfx.js`. No simulation-rule changes beyond the gravity work, no
reaction/substance data changes, serialize/share format (ML1) unchanged.

State note: a prior partial pass had already landed the engine-side
continuous gravity (`setGravityVector`/`_gravDom`/lateral-probability) and
the GEAR cleanup; this pass verified them against the pristine engine,
finished the sandlab wiring (which still used the old 4-way + wind hack),
added shake + haptics, and ran the full proof suite.

### 0) Cleanup
- GEAR export diffed against `/tmp/matter-engine-pristine.js`: **26 kinds in
  both** — the partial extra kinds were already removed from the export;
  their behaviour code stays dormant (picker reads GEAR only).
- Node smoke: every GEAR kind places and steps 60 ticks, no exceptions —
  **ALL PLACE+STEP OK**.

### 1) Continuous gravity vector (engine)
- `gx/gy` are a float unit direction; `gravMag` is strength.
  `setGravityVector(vx, vy, mag)` normalises + clamps mag 0..1 and keeps
  `this.gravity` as the nearest legacy 4-way code. Movement consumes the
  dominant-axis step (identical to old gx/gy at axis alignment) plus a
  lateral diagonal-first step with probability pLat = |minor|/|major|
  (0 at axis alignment → **zero extra RNG consumed at the default**).
  Legacy `setGravity(dir)` kept for compat. windX/windY no longer carry
  gravity — they are purely the fan/wind field again.
- **HARD GATE — exact match vs pristine engine** (same seeds, same deps,
  final per-substance censuses, proof script
  `hidden_files/p3-gravity-proof.mjs`, run from a pristine/current pair):
  - sand-pile settle (300 ticks): EXACT — {sand 540, glass 720}
  - water levelling (300 ticks): EXACT — {glass 1948, water 1372}
  - gas rise (300 ticks): EXACT — {hydrogen 600, glass 720}
  - beaker-boil census (1200 ticks, lava-drop heated beaker — a genuinely
    boiling scene: 800 water → 677 water + 149 steam): EXACT —
    {steam 149, glass 835, cracked-glass 6, water 677}
- New-capability proofs (numbers from the same script):
  - 30° diagonal gravity: sand-pile centroid (59.67, 78.73) under (0,1) →
    (90.16, 80.87) under the diagonal — **dx +30.49 cells** toward the
    tilt, dy +2.14.
  - Gravity (0,−1): centroid y = **5.27** (vs 78.73 down) — sand falls up
    and piles on the ceiling.
- Soak: busy scene, **20,000 ticks, no exceptions, 0 NaN temps**,
  1,180 particles at end (~28 s wall in node).

### 2) Orientation (sandlab gyro path)
- DeviceOrientation handler now rotates the device-frame tilt vector by
  `screen.orientation.angle` (fallback `window.orientation`) into the
  current screen frame — portrait and landscape map correctly.
- Near-flat hold: when |sin(beta)| < 0.25 (~within 14.5° of flat, where
  pitch/roll are unreliable) the last good vector is kept, no jitter.
- Kept: low-pass smoothing (α 0.18), tilt strength → gravMag + vector via
  `e.setGravityVector(...)` every frame (the old windX/windY gravity hack
  is gone), one-tap calibration — calibration persists in localStorage
  (`omni:sandlab:neutral`, already the storage key; verified in place).
- iOS `DeviceOrientationEvent.requestPermission` flow unchanged; the
  DeviceMotion permission is requested in the same tap (best-effort).
- On-canvas gravity indicator now reads the ENGINE's effective vector
  (`getGravityVector()`: unit direction × gravMag) for both arrow angle
  and % — not the raw sensor state. Gyro-off and the manual gravity
  arrows also route through `setGravityVector`.

### 3) Shake + haptics
- Shake: `devicemotion` listener (active while gyro is on) — acceleration
  magnitude vs a slow smoothed baseline, threshold 13 m/s² deviation,
  900 ms debounce → **one** `engine.stir(centre, radius)` per shake.
- Haptics (`src/core/sfx.js`): new `hapticFx` vocabulary —
  tap (8 ms), blast ([35,40,70]), pop (18 ms), success ([10,40,16]) —
  all via `navigator.vibrate`, no-op where unsupported. Wired into the
  existing sound-event path in sandlab's `eng.onSound`: `boom` events →
  blast, `pop` events (explosions' small-radius pops + lid pops, which
  the engine emits as pop) → pop. Shake also fires tap.
  **Muting is tied to the existing sound toggle** (`sfx.enabled()`):
  sounds off ⇒ no vibration. No new settings surface.

### Verify
- `npm run build` — PASS.
- `node scripts/verify-local.mjs` — PASS (ERRORS none).
- Gravity proof suite — ALL PASS (above).

### PARTIALs / known deltas
- A burner-heated boil variant of the census scene diverges between
  pristine and current (steam 620 vs 675): traced to the pre-existing
  Phase-0 burner-stamp portrait scaling (burner 18×16 vs 9×8 — different
  heater geometry), NOT to gravity; the lava-heated boil census above is
  exact. Burner stamp is another workstream's change; left alone.
- Shake + gyro orientation correctness on a physical phone (esp. iOS
  permission for DeviceMotion and landscape mapping) can only be fully
  confirmed on-device; the code paths are exercised in the local verify
  only for absence of errors.
- tap/success haptics are exported vocabulary; blast/pop are the two wired
  into the sim sound-event path today (tap also fires on shake).

---

## UI Redesign A — design system + component split + home + main-screen chrome (2026-11-27)

Scope honoured: only the files owned by this phase. No simulation rules,
reaction/substance data, or ML1 serialize/share format touched (the one
behaviour addition is a Redo stack beside the existing Undo — see below).
Engine (`src/core/matter-*.js`) and `src/render/gl-renderer.js` untouched.
Every pre-existing feature remains reachable (inventory re-checked in the
tap-through: substances+gear picker, tools incl. all secondary tools, gear
select/move/resize/lock/levels, Messages feed/chains/pair-lookup, Experiments,
Scenes, Recipes, custom-substance creator, share codes, save/load slots, view
modes, texture quality + governor, gravity + gyro/calibration, sound +
haptics toggles, themes/fonts via existing settings, fullscreen, undo + redo).

### Design tokens (`src/styles/tokens.css`, 54 lines)

One token set as CSS variables: colours aliased to the live theme variables
(so the existing theme mechanism keeps working), radii (8/12/16/pill),
spacing on an 8pt grid (4/8/16/24/32), a 6-step type scale, glass surface +
two shadow levels, `--ml-touch: 44px`, one motion duration/easing.
**Token-scope lesson (round 2):** the app shell (`[data-ml-shell]`,
ml-v2.css) pins an always-dark lab palette (`--fg #e9f6f8`, `--glass-bg
rgba(10,24,33,.72)`), while `theme.css` defines a *different* `--glass-bg`
at `:root`. `--ml-glass` declared at `:root` resolved to the global version
(white glass in the Day theme → white-on-light chrome). It is now declared
on `[data-ml-shell]` in `ui-a.css` and resolves to the shell's lab glass in
every theme — verified by computed style (`rgba(10,24,33,0.72)`) and the
`light-lab-412x915.png` screenshot. Light + dark both verified (dark in the
full tap-through; light via `hidden_files/probe4.mjs`, 0 errors).

### Split map (monolith 2,141 → 1,996 lines; behaviour identical)

| Old (in sandlab.jsx) | New module |
|---|---|
| Tile + MiniTile components | `src/tools/sandlab-tiles.jsx` (35) |
| MATTER_SCENES / MATTER_EXPERIMENTS / buildSceneInto / computeObjective | `src/tools/sandlab-scenes.js` (93) — re-exported from sandlab so HomePage's namespace contract is unchanged |
| Gear sprite painters (glass/burner/coil/flame/halo/frost/heat-tint + bucket) | `src/tools/sandlab-sprites.js` (111) |
| Top chip row | `src/ui/TopBar.jsx` — Home, Undo/**Redo (new stack)**, Pause, Speed (tap cycles), Menu; Scenes/Experiments/Recipes/Messages/PNG/Help moved into the Menu sheet (same handlers) |
| (new) | `src/ui/Dock.jsx` — bottom dock (5 tabs + Search) + `PickerStrip` (chip strip ⇄ grid) |
| (new) | `src/ui/ToolWheel.jsx` — floating wheel, current tool always labelled; primary ring Paint/Spray/Erase/Stir/Heat/Cool/Poke/Stir/Spark/Move gear, secondary scroll section carries Line/Rect/Circle/Fill/Wind/Clone/Inspect/Blast/Interact/Dropper |
| Data-card sheet | `src/ui/InfoCard.jsx` — presentational shell, profile block passed as children |
| theme.css patchwork | **PARTIAL** — `theme.css` (2,651 lines) retained as the base layer; the new modular layer (`tokens.css` + `ui-a.css`, 242 lines) owns all new chrome and the acceptance-fix overrides. Deleting the legacy sheet wholesale risked untheming surfaces this phase cannot re-verify one by one; total CSS grew by the new layer only. |

Still in the monolith (honest): the Picker sheet body and the Settings
surfaces (Menu sheet: export/import, mute, sound) — deeply state-bound;
the Dock/PickerStrip/InfoCard boundaries cover the picker's new paths.

### Home (`src/home/HomePage.jsx`)

- **(h) Numbers are LIVE**: `SUBSTANCE_COUNT` (1,822), `NAMED_REACTIVE_COUNT`
  (34,775) and `GEAR.length` imported from the data modules; no literals
  remain (grep-verified). Note the provenance finding: the old hardcoded
  "34,775 named reactions" equals `NAMED_REACTIVE_COUNT` exactly (the P5
  audit compared against `NAMED_PAIR_COUNT` = 34,793, which includes inert
  pairs), while the old hardcoded "**34** placeable lab items" was simply
  wrong — live `GEAR.length` is **26**, now rendered.
- 3 big cards: **Sandbox**, **Challenges** (experiment list), **Scenes**
  (gallery; Custom Lab kept as a secondary button on the card so the custom
  creator stays reachable from home). Live reaction ticker unchanged.
- **Continue card** (`data-continue`) renders when a saved-scene slot or a
  recents list exists in local storage.
- Footer gained the **Privacy** link (`./privacy.html`, shipped by P5).

### Main screen

- Canvas stage carries the bench visual: bench-surface band + wood tone at
  the world floor and a subtle bench texture behind the canvas area
  (`.ml-stage`), plus soft shadows under panels.
- **TopBar** (sticky) + **bottom Dock** (sticky, so it is reachable without
  scrolling the tall portrait world). A dock tab opens the picker filtered
  to that category: recents-first one-row chip strip, expandable to a full
  grid sheet; Lab Gear tab shows the gear grid + vessel-size selector;
  Favourites tab lists favourites. Long-press any chip/tile → InfoCard.
- **Tool wheel** floats over the stage (bottom-right, clear of the gravity
  pill); collapsed button always shows the current tool's name.
- Side rail kept (fullscreen mode hides TopBar/Dock by the existing UI2
  design; the rail + wheel remain there) — every rail control now carries a
  visible text label; rail and dock never duplicate a *behaviour* (dock =
  categories, rail = tools/messages/world actions; Messages/Scenes/etc.
  route through the same handlers everywhere).
- **Redo**: new redo stack beside Undo (snapshot clears redo; Ctrl+Z path
  unchanged). The TopBar spec asked for Undo/Redo and only Undo existed.

### Acceptance fixes (a)–(g) + (h) — evidence in `~/workspace/matter-lab-shots/ui-a/`

- **(a) Panel cut-off** — side panel is viewport-clamped (`max-width:
  calc(100vw - 96px)`, internal scroll, rows wrap). Measured at all 3 sizes:
  panel inside viewport, **Speed 4× right edge = 170px ≤ viewport**, Flow
  fully visible. Shots: `tools-panel-{360x800,412x915,768x1024}.png`.
- **(b) Truncated pill** — the literal "Move with vessel" string does not
  exist in the current source (device build was older); the truncation
  *class* is fixed globally: `.btn`/`.chip` inside the lab wrap text
  (`white-space: normal; overflow-wrap: anywhere`), and chip names in
  strips now 2-line clamp instead of ellipsis (MiniTile widened 58→64px).
  No truncated label found in the final screenshot pass.
- **(c) Duplicate GEAR block** — DOM count after placing/selecting a burner
  through the UI: **"GEAR — BURNER" occurs exactly 1×** at all 3 sizes
  (probe `hidden_files/probe3.mjs`). Shots: `selection-{size}.png`.
- **(d) Icon-only rail** — every rail button now shows a text label under
  its icon (Tools, Home, Messages, Substances, Pause, Clear, Fullscreen);
  labels fit inside the 64px pill (round-1 spill fixed — see defect hunt).
  Shot: `lab-main-{size}.png`.
- **(e) Dual size system** — one microcopy in both places the selector
  appears: "Vessel size — applies to flasks, tubes, cylinders and funnels
  when placed. Beakers, lids and burners use their own sizes below."
  (Beaker S/M/L tiles are the intrinsic-size exceptions, as the engine
  already treated them.) Shot: `dock-liquids-…` / gear tab in tap-through.
- **(f) Menu heading/hint** — picker heading is one line at 360px
  (`white-space: nowrap`, 17px), the long-press hint sits on its own line
  below it; Menu sheet heading measured 20px tall = one line at all sizes.
  Shots: `dock-liquids-360x800.png`, `menu-{size}.png`.
- **(g) Empty world** — bench/floor visual on the stage + empty-state hint
  ("Pick a substance below and paint — or place a beaker from Lab Gear")
  shown while `parts === 0` and gone after the first paint (asserted both
  ways). Shot: `lab-main-{size}.png` (hint), `lab-painted-{size}.png` (gone).
- **(h)** — see Home above.

### Realistic feel (visual only)

Pour/dropper micro-animation on liquid picks (`.ml-pour`, CSS-only, killed
by `prefers-reduced-motion`); glass reflection streak kept/extended in the
extracted sprites (unchanged painters); bench texture + panel shadows.
**Steam/bubble particles: deliberately NOT faked** — the engine already
emits real steam cells; an overlay would double-draw.

### Accessibility

aria-labels on all new icon buttons (TopBar, Dock tabs, wheel, picker
close, InfoCard actions); ≥44px targets enforced by CSS on lab buttons;
`prefers-reduced-motion` disables the pour animation and ticker motion;
font scaling still flows through the existing settings (`uiText`).

### Defect hunt (self-test rounds — before/after shots kept)

1. **Sticky Dock/TopBar drew OVER open sheets** (z-150 vs sheet 120) —
   found in `toolwheel-360x800-BEFORE.png` / `infocard-360x800-BEFORE.png`.
   Fix: TopBar and Dock unmount while any sheet/picker/card/side-panel is
   open. After: `infocard-360x800.png` (clean), `tools-panel-*.png`.
2. **InfoCard sheet translucent** — picker text bled through the stacked
   sheet (shell `--s1` is rgba by design). Fix: InfoCard sheet fully opaque
   in the shell palette. Before/after: `infocard-360x800-BEFORE.png` →
   `infocard-360x800.png`.
3. **Rail labels spilled outside their pills** ("Messages", "Substances",
   "Fullscreen" wider than 54px) — rail widened to 64px, label 8.5px
   nowrap. Before/after: `lab-main-360x800.png` (round-1 vs final).
4. **Dock label "Favourites" broke mid-word** ("Favouri tes") — short
   visible labels (Favs / Gear) with full aria-labels; nowrap.
5. **Empty hint anchored to the stage bottom = below the fold** on the
   tall portrait world — moved to the top of the stage.
6. **Side panel overlapped the widened rail by 12px** — panel offset
   60→80px. After: `selection-412x915.png`.
7. **Light-theme white-on-light chrome** — the `--ml-glass` token-scope
   bug above. After: `light-lab-412x915.png` + computed-style proof.
8. Test-harness lessons (not app bugs, recorded so they aren't re-chased):
   a tile whose long-press just fired suppresses its next click *by
   design* (the tap-through now starts picks with a fresh pointerdown);
   a painted liquid pool legitimately blocks floor gear placement ("no
   clear space") — the harness clears the world before the gear flow;
   `.seclabel` is CSS-uppercased, so DOM text reads "GEAR — BURNER".

### Verification (all run on the final build)

- `npm run build` — PASS.
- `scripts/verify-local.mjs` — **PASS** normal mode, **PASS** under
  `CHROME_FLAGS='--disable-gpu --disable-3d-apis'`. 0 page errors.
- Tap-through (`hidden_files/verify-ui-a.mjs`, puppeteer touch, mobile
  emulation) at **360×800, 412×915, 768×1024**: home (live numbers, 3
  cards, ticker, privacy link) → lab (exit fullscreen via rail) → every
  dock tab → grid expand → long-press InfoCard → pick + paint (hint
  disappears) → **all 9 primary tools switched (9/9)** → beaker + burner
  placed through the UI (2 objects), burner lit → tools panel fit →
  Heat/Pressure/Flow/Normal → selection count → Messages → Menu.
  **0 page errors at every size**; bounding-box audit on the main screen:
  **no horizontal overflow, no overlapping controls in TopBar/Dock/wheel,
  0 buttons outside the viewport** at all 3 sizes. 44 screenshots in
  `~/workspace/matter-lab-shots/ui-a/` (incl. `-BEFORE` defect shots,
  `selection-*`, `light-home/light-lab-412x915`).
- Frame-time spot check (busy scene, 412×915, SwiftShader sandbox — NOT
  device numbers, same caveat as P1): ~560–700 particles live scene,
  median rAF interval **GL 116.7–183.3 ms vs 2D 16.7–33.3 ms** across runs
  (2D baseline 33.3 ms from P0/P1 reproduced). GL remains slower *under
  SwiftShader only*, exactly as P1 concluded; the CPU pack argument is
  unchanged and the deciding test is still an on-device check.

### PARTIALs

- **theme.css not deleted**: retained as base layer under the new modular
  CSS (see split map) — a full rewrite of 2,651 lines of legacy themed
  surfaces was judged higher-risk than the token-layer approach; every
  surface the tap-through touches is themed and verified.
- **Picker sheet body + Menu-sheet settings remain in the monolith**
  (state-bound); the split covers tiles/sprites/scenes + TopBar/Dock/
  ToolWheel/InfoCard. Monolith: 2,141 → 1,996 lines.
- **Fullscreen mode** keeps the existing UI2 behaviour (TopBar/Dock hidden,
  rail + wheel + panels carry the chrome) — deliberate pre-existing design,
  not changed by this phase.
- Frame times are SwiftShader sandbox numbers, not device numbers (above).

---

## P4 + UI-B — Game layer, delta undo/redo, save slots, gestures, renderer safeguard, accessibility finishers (2026-11-27)

Scope honoured: no simulation rules, reaction/substance data, or ML1/ML0
serialize/share format changed; engine + gl-renderer untouched (read-only).
New code: `src/game/game.js` (pure game logic + persistence + DeltaStack),
`src/ui/GamePanels.jsx` (Discovery / Achievements / CoachMarks), wiring in
`src/tools/sandlab.jsx`, progress surface in `src/home/HomePage.jsx`,
`src/styles/ui-b.css`. All NEW storage keys use the `matterlab:` namespace
per the P5 map. Test tooling: `scripts/verify-uib.mjs` (tap-through) +
`scripts/probe-evidence.mjs`. Screenshots: `~/workspace/matter-lab-shots/ui-b/`.

### 1. Progression — stars + unlocks
- `Game.experimentStars()` extends `computeObjective` (unchanged) with real
  measured quantities: boil 2★ = 25+ steam cells, 3★ = that within 120 s of
  setup (elapsed engine ticks); electrolysis 2★ = 151+ H₂, 3★ = + 41+ O₂;
  golden 2★ = 201+ PbI₂, 3★ = within 120 s; chill 2★ = 101+ ice, 3★ = 301+.
  Awarded on the existing 500 ms stats cadence; persisted `matterlab:stars`.
- Unlocks (total stars): experiments [0, 1, 3, 5] by list order; scenes
  volcano/bench 0, electrolysis 2, golden 4. Locked cards show the exact
  requirement and a disabled Set up/Open button; experiment setups bypass
  the scene gate via their own (stricter) experiment gate. Sandbox is
  never locked. Progress surface: Experiments sheet header + Home
  Challenges card (stars, discoveries, daily today/yesterday).
- Evidence: tap-test boiled the bench setup (temp-forced) → **boil = 3★**
  at all 3 viewports; home progress rendered "★ 3 / 12".

### 2. Discovery log
- Fed ONLY by the engine's real `onReaction` events in `wireEngine`, keyed
  by `evt.card`. **Named cards only**: family/template cards (name contains
  `{a}`/`{b}` placeholders — the same test the homepage ticker uses) are
  pair patterns, not named reactions, and are excluded; reads are
  self-healing (`namedDiscoveries()` filters any pre-rule data).
- Denominator is the live `NAMED_REACTIVE_COUNT` import = **34,775**
  (verified in-page: `total=34775`). No backfill: a fresh profile reads 0.
- Panel (Menu + side-panel Panels + Experiments header): "Discovered X /
  34,775", 60 most recent with card name + equation + line + date.
- Evidence: sodium painted INTO water + stir (the engine requires mixing —
  resting contact does not react; verified against the raw engine in Node)
  fired card `sodium-water` → discovery recorded at all 3 viewports.

### 3. Daily challenge
- Pool of 5 templates (Rolling Boil 200 hot-water cells, Deep Freeze 50 ice,
  Golden Rain 40 PbI₂, Steam Room 100 steam, Five Reactions = 5 distinct
  named cards today), picked by FNV-1a seed of `YYYY-MM-DD`; checkers scan
  live engine state on the stats cadence; completion persisted per date
  (`matterlab:daily`), midnight rollover handled in-session. Home card
  shows today's challenge + done state and yesterday's done/not. No
  streaks, no pressure mechanics.
- Evidence: during tap-tests the Steam Room challenge completed for real
  (boil test produced 100+ steam) and persisted; sheet card now labels the
  live count "live now:" once done (defect fix, below).

### 4. Achievements
- 14 achievements, all wired to real events: first reaction / first
  discovery / first boil (live scan: any water cell ≥ 100 °C) / first
  explosion (engine `boom` sound event) / 10·100·1,000 total reactions
  (persistent counter fed by onReaction) / 10·50·250 discoveries / first
  custom substance / first share code / all experiments ≥ 1★ / daily done.
- Panel lists earned (with date) + locked (with condition text). Unlock
  surface: ONE brief toast at the **top of the stage** (chosen over the
  bottom app toaster — no bottom spam) + success haptic when allowed.

### 5. Onboarding (coach marks)
- 4 steps (pick → paint → place a beaker → light a burner), anchored to the
  REAL current chrome: Dock when present, else the rail's Substances button
  (the Dock is hidden in fullscreen — defect fix, below); canvas steps
  anchor the canvas. Progress is checked against real state (a pick,
  particles > 0, a vessel object, a lit burner object) on a 400 ms poll;
  Next/Skip always available. Persisted via the existing
  `omni:sandlab:seen` flag (P5 map already copies it to
  `matterlab:sandlab:seen`); re-runnable from Help and Menu.

### 6. Per-reaction result card
- Every Messages feed entry with card data gets a "▸ Result card" toggle:
  card name (with real {a}/{b} substitution), equation, "What happened"
  (pair → actual engine products + condition), "Why" (card line), the
  card's watch text, and a Discovery-log marker. Text comes ONLY from
  CARDS data + the event's own products — nothing invented.
  Screenshot: `feed-result-card-412.png`.

### 7. Delta undo/redo (proof)
- Replaced UI-A's full copies (`el.slice()` Uint16 + `temp.slice()` Float32
  = **6 B/cell = 778,272 B/step** on the 129,712-cell test grid, cap 10) with
  `Game.DeltaStack`: ONE full base (el + temp quantised to Int16 — the same
  1 °C precision ML1 serialize itself keeps; **518,848 B**) + bidirectional
  run-length patches of changed cells between consecutive snapshot states.
  A patch > 70% of full is stored as a new full base. Caps: **30 steps AND
  24 MB budget**; trimming materialises the next entry as a full base so the
  chain always reconstructs exactly. Restore semantics identical to before
  (target rebuilt and set wholesale; objects/resize handling unchanged).
- Measured (in-page, `__matterlab.deltaStats()`):
  - quiet world, small stroke: **delta step = 32 B** vs 518,848 B base
    (old scheme: 778,272 B) — ~24,000× smaller.
  - busy world (8,696 particles, 2.5 s of drift + stroke): **delta step =
    144,992 B** = 28% of the delta base, **5.4× smaller** than an old-style
    full copy.
  - census tap-test at all 3 viewports: paint → census 226 → undo → 0 →
    redo → 226 (exact).
- PARTIAL (honest): temp is restored at 1 °C precision (was Float32). This
  matches the save/share format's own precision; cell identity (el) is
  bit-exact.

### 8. Save slots
- Named slots (`matterlab:slots`): save (name input, stores particle +
  distinct-substance counts), load, rename (prompt), delete; payloads are
  the existing `serialize()` output — share codes untouched. Legacy
  `omni:sandlab:scenes` numeric slots are imported as named slots on first
  read ("Slot N (imported)"); the old key is left intact.
- Evidence: round-trip at 412/768 (and 360 in the full run): save 317
  particles → clear → 0 → load → **317**.

### 9. Gestures (conflict rules also documented in Help)
- **Pinch zoom**: two-finger pinch scales the presented world 1–6× around
  the grabbed world point; two-finger drag pans; zoom buttons + reset in
  the View panel; % chip on stage resets; Ctrl/⌘+wheel zooms on desktop.
  `geomRef` always describes the PRESENTED geometry, so `toGrid` mapping
  is unchanged code and exact at any zoom — tap-test at 2.5×: the cell
  under the finger changed synchronously on pointerdown (read in the same
  JS turn; sand falls within frames, so a delayed read measures gravity,
  not accuracy — a test-method note, not an app defect).
- **Swipe ignite**: Spark tool + fast downward flick (≥ 5 cells in one
  move frame, dy > 2.2·|dx|, 140 ms cooldown) = 5-spark burst + haptic.
- **Tilt-pour**: gyro ON + vessel selected + tilt > 50° from straight-down
  held ~0.6 s → `tipObject` on the selected vessel (2.5 s cooldown);
  hint chip on stage while armed. (Code-verified + hint UI; no gyro
  hardware in this VM — PARTIAL, needs a phone check.)
- **Double-tap = undo** (one finger, quick, unmoved, detected on the
  second pointerdown so the tap is swallowed — no stray paint);
  **two-finger double-tap = redo** (a real pinch that changes zoom never
  arms it). One finger always paints exactly as before; a second finger
  cancels the in-progress stroke's painting (its snapshot remains, so
  Undo still works) — the first finger's initial dot is inherent to
  "one finger paints" and is documented in Help.

### 10. Renderer auto-safeguard
- View panel: Renderer Auto/GL/2D (persisted `matterlab:renderer`). Auto:
  GL first; presented-frame (render-call) times sampled once the world is
  busy (> 1,500 particles); after ~4 s, if median > 40 ms while sim
  emaMs < 20, GL is dropped for the session and the setting shows
  "Auto — using 2D (GL was slow on this device)". Watchdog precedence
  preserved (the sampler never runs once fbRef latches, and never
  un-latches anything); context-loss still latches 2D per P0.
- **Evidence (this VM, SwiftShader GL)**: busy world 8,696 particles →
  27 samples, **median 72.0 ms**, sim emaMs 10.65 → auto-dropped to 2D,
  `gl().renderer === '2d'`. On a fast GPU the same code path records
  "Auto — using GL".

### 11. Accessibility finishers
- **Haptics toggle** (Menu + side panel), persisted `matterlab:haptics`,
  default on: all sim haptic call sites now route through a gate — fire
  only if haptics toggle ON AND the existing sound-toggle gate inside
  `hapticFx` allows.
- **Colour-blind-safe Heat view**: viridis-style ramp (purple→teal→green→
  yellow, luminance-ordered) in the View panel, persisted
  `matterlab:heat-ramp`. 2D path uses it directly. PARTIAL (honest): the
  GL shader's ramp is compiled in and gl-renderer is read-only this
  phase, so with viridis selected the Heat view is presented through the
  2D pipeline (same present step) — the user always sees the chosen ramp;
  GL resumes for other views.
- **Font-size scaling**: no control existed. Added S/M/L/XL
  (`matterlab:fontscale`, `data-fs` on the lab root + home) scaling the
  small-text classes via `--ml-fsmul` in ui-b.css. Verified in tap-test:
  side-panel small text 12px → 15.6px at XL.

### Defect hunt (found in my own work, fixed, before/after in shots)
1. Coach step text anchored to "the dock below" — but the Dock is hidden
   in fullscreen mode. Text rewritten (rail Substances OR dock) and the
   anchor falls back to `[data-rail="menu"]`. (coach-412.png is the
   before; behaviour re-verified in the final runs.)
2. Daily card read "✓ Done today · 0 / 100 steam cells" — historical
   completion vs live count looked contradictory. Now: "✓ Done today ·
   live now: …".
3. Family/template reaction cards were initially logged as discoveries —
   they are pair patterns, not part of the 34,775 named denominator.
   Restricted to named cards (`isNamedCard`), reads self-heal.
4. `setPointerCapture` could throw NotFoundError (inactive/synthetic
   pointers) and abort `onDown` — now guarded; this was also the root
   cause of the first tap-test's pinch failure.
5. Midnight rollover: daily done-state + today's reaction set now reset
   when the date key changes mid-session.

### Verification
- `npm run build` PASS. `scripts/verify-local.mjs` PASS (normal) and PASS
  (software/SwiftShader flags), 0 page errors, after all fixes.
- `scripts/verify-uib.mjs`: **70 checks, 0 failures, run twice** — at
  360×800, 412×915, 768×1024: coach on first entry, chrome no-overlap
  audit (dock/topbar/wheel pairwise; the wheel is a designed canvas
  overlay), no horizontal overflow, boil → 3★, named discovery recorded,
  discovery + achievements panels, experiments progress + daily card,
  save-slot round-trip, delta census undo/redo, double-tap undo, pinch
  zoom 2.5× + paint accuracy, viridis persisted, renderer pref applies,
  font XL scaling, home progress surface, 0 page errors everywhere.
- PARTIALs: tilt-pour + swipe-ignite need a real-device gyro/touch check
  (no sensor hardware in this VM; logic + hints are in and the flick
  thresholds are unit-reasoned, not device-verified); viridis-in-GL as
  noted in §11; temp restore precision as noted in §7.

## FINAL — Integration, deploy, live verification (coordinator, 2026-11-27)

**Deploy:** `gh_pages_deploy.py --repo-name matter-lab` — source pushed to `main`, 31 built files to `gh-pages`, "pages site updated". **LIVE: https://jackbhai.github.io/matter-lab/**

**Live re-check** (`scripts/verify-live-v3.mjs`, new this wave): HTTP 200; homepage shows the LIVE numbers (1,822 substances · 34,775 named reactions) and the 3 mode cards (Sandbox / Challenges / Scenes); Sandbox enters, canvas mounts, engine hook present; **P0 gate on the live build: canvas census pre-paint 0 non-bg → post-paint 12 non-bg samples (painted stroke presents visibly), 0 page errors → LIVE V3 VERIFY: PASS.** Screenshot: `~/workspace/matter-lab-shots/live-v3-tool-412.png`. Final on-device confirmation by the user is still the deciding test for P0 (see P0 section).

**Coordinator's own final gates (fresh, post-everything):** `npm run build` PASS; `scripts/verify-local.mjs` PASS in normal mode AND under `--disable-gpu --disable-3d-apis` (software rendering), 0 errors both.

**Data state (measured):** SUBSTANCE_COUNT 1,822 (baseline 1,392, +430); NAMED_REACTIVE_COUNT 34,775 / 34,793 total named pairs (baseline 22,524 / 22,542); AUDIT 0 errors / 0 duplicates; RX_WARNINGS 0; decidePair 60k-pair sample → 0 null verdicts (decision coverage intact). NOTE: catalogue expansion was cancelled by the master brief AFTER workstreams 1–2 had already landed and passed every audit; the landed data was kept (removing it would have been the riskier change) and no further expansion was done. All counts in the app UI are read live from the data modules.

**Lighthouse:** P5 measured Performance 46 on this shared 1.5-CPU VM (LCP 9.9 s, TBT 2,380 ms, CLS 0.002) BEFORE P1/UI phases. A coordinator re-run at the end failed at Chrome launch (`chrome-launcher: waiting for dynamic debugging port`) in this environment, so 46 remains the only measured figure — a this-machine baseline, NOT a field score; the brief's ">90" is not claimable from this sandbox and is recorded as an environment PARTIAL. On real hardware the renderer auto-safeguard (UI-B) also protects perceived performance by dropping slow GL to the 2D path per-device.

**Phase roll-up:**
- P0 render hardening — DONE (root cause narrowed to the WebView GPU-raster presentation class with code-level causes ruled out by probes; trigger operations removed; watchdog + fallback fault-injection-proven; on-device confirmation pending the user's check).
- P1 WebGL2 renderer — DONE (all 4 views in-shader; 2D fallback seamless; watchdog supervises GL — one real watchdog bug found by FI and fixed: ±2 bg tolerance). Sandbox perf: GL slower under SwiftShader (median 183 ms vs 2D 33.3 ms at 242×536) — a software-GL artefact; UI-B's auto-safeguard makes the device decide.
- P2 per-substance textures — DONE (per-substance seeds, world-anchored, normal/specular/emissive at High; Auto/Low/Med/High + governor).
- P3 gravity & gyro — DONE (continuous vector; EXACT census match vs pristine on 4 proof scenes; diagonal/up-gravity proven; shake→stir; haptics; GEAR export = pristine 26 kinds).
- P4 game layer — DONE (stars/unlocks on real objectives, discovery log vs live 34,775, date-seeded daily challenge, 14 achievements, onboarding, result cards).
- UI redesign — DONE (design tokens, TopBar/Dock/ToolWheel/InfoCard, acceptance items (a)–(h) all fixed and screenshot-verified at 360×800 / 412×915 / 768×1024; delta undo/redo — 32 B quiet step vs 778,272 B full copy; save slots; pinch zoom 1–6× with verified paint accuracy; renderer auto-safeguard fired for real in testing: GL median 72.0 ms > 40 ms → session dropped to 2D with the reason shown).
- P5 publish — DONE except Capacitor AAB (PARTIAL: no Java/Android SDK in this environment; project configured, exact finishing commands in the P5 section) and the Lighthouse >90 target (environment PARTIAL, above).

**Standing PARTIALs roll-up:** P0 on-device confirmation outstanding (user's phone, post-deploy — either the world renders or the fallback/failed notice will be visible and self-reporting); GL device perf unproven from the sandbox (mitigated by the auto-safeguard); viridis colour-blind Heat view presents via the 2D pipeline (GL shader ramp is in the read-only renderer module); delta-undo restores temperature at 1 °C precision (same as the ML1 format itself; substance grid is bit-exact); tilt-pour and swipe-ignite logic verified headlessly but need a real-device sensor check; theme.css retained as a base layer under the new modular CSS (wholesale replacement risked untheming unverifiable surfaces); sandlab.jsx split is substantial but the picker-sheet body and menu-sheet settings remain in the monolith (deeply state-bound); fullscreen keeps the pre-existing UI2 chrome behaviour (rail + wheel + panels, TopBar/Dock hidden) by design.
