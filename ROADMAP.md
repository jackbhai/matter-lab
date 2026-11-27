# Matter Lab — Ultra Roadmap: v2 → v60

Generated 2026-11-27. Matter Lab Ultra: a falling-sand × beaker-lab sandbox.
All versions target two Pillars: **realism** (physics, chemistry, visuals) and
**low-end playability** (a 2 GB RAM phone at 60 fps, adaptive tiers, solid 2D
fallback). Repo: jackbhai/matter-lab (branch: arena/6fc3b1a3-matter-lab).

---

## Version index

| v | Title | Nature |
|---|-------|--------|
| v2 | Winzy-style glass refresh | big visuals refresh (done) |
| v3 | Sandbox: water, relapses, tiers | biggest sandbox feature (done) |
| v4 | GL2 renderer + procedural textures | biggest render feature (done) |
| v5–v9 | New physics: surface tension, viscosity, conduction, phase, wind | 5 physics systems |
| v10–v12 | New physics: combustion chemistry, pressure & wind | big systems |
| v13–v15 | Renderer realism: lights, shadows, refraction, ground | renderer features |
| v16–v20 | Realism: waves, fluids, Females, Materials labs | realism features |
| v21–v25 | Low-end engine: adaptive tiers, GPU fallbacks, 2GB-safe | perf features |
| v26–v30 | Mobile-first: touch UI, low-end profiles, 2GB-safe | mobile features |
| v31–v35 | Save/share, challenges, sandbox modes | product features |
| v36–v40 | Sound design: engine + reactions (fire, liquid, gas) | audio features |
| v41–v45 | Accessibility: keyboard, screen reader, high contrast | a11y features |
| v46–v50 | Polish: better tips, deep UX review, polish tests | polish (medium-large) |
| v51–v60 | New physics: radiation, chaos & constants, more chemistry | 10 more physics systems |

---

## v2 — Winzy-style glass refresh (DONE, 21c7f59)

Big visuals refresh: glass cards, right-side glass settings rail, glass buttons,
2D surface tension on everything. Realism goal: 2D world feels handcrafted.
Low-end goal: all glass works at quality=0 (flat).
Verified: build passes, PR open.

## v3 — Sandbox: water, relapses, adaptive tiers (DONE, deb4d52)

Biggest sandbox feature: uniform-rate relapses every ~12s, per-tier water,
TIERS grid. Realism: 3 stable tiers (max, medium, low).
Low-end: 2GB phone = deep tier, fewer particles.

## v4 — GL2 renderer + procedural textures (DONE, df54a0c)

Biggest render feature: WebGL2 renderer + per-substance procedural textures.
Realism: GPU cells look lived-in, angled, realistic.
Low-end: P0 plain-2D fallback everywhere.

## v5 — Physics: Surface Tension (new, BIG)

Goal: liquids form surface tension. Files: src/core/matter-engine.js,
src/core/matter-elements.js, src/core/matter-reactions.js, sandlab.jsx
(rendering + tools), src/render/gl-renderer.js (D2 cell glow: new
"tension lines" around free-surface liquids, radius 2.2 in-shader).
Realism: drops hold shape, surface lifts at edges, surface looks curved.
Low-end: tension at quality=0 (flat, no lines).

## v6 — Physics: Viscosity (new, BIG)

Goal: liquids resist movement. Files: matter-engine.js (velocity field),
sandlab.jsx, src/render/gl-renderer.js.
Realism: honey pours slowly; oils Resistance; gases lighter.
Low-end: step_dur lowered at low quality.

## v7 — Physics: Heat Conduction (new, BIG)

Goal: heat spreads through liquids by conduction. Files: matter-engine.js
(Sect[0..SECT]-by-cell array), sandlab.jsx, matter-reactions.js,
gl-renderer.js (L2 heat line rendering of web).
Realism: hot cup cools down over time; boiling lines.
Low-end: conduction rate low at low quality, or off on 2GB.

## v8 — Physics: Phase Changes (new, BIG)

Goal: liquids heat to gas, gas cools to liquid. Files: matter-engine.js,
matter-reactions.js, sandlab.jsx, gl-renderer.js (phase glow, rising gases).
Realism: water boils, condensation on tubes, phase pressure.
Low-end: phase changes off at low quality (constant volatility).

## v9 — Physics: Pressure + Wind (new, BIG)

Goal: internal pressure of gases lifts liquids; wind drives gases outward.
Files: matter-engine.js, sandlab.jsx (wind field + its rendering),
gl-renderer.js (wind trails).
Realism: balloons lift, gases spread, pressure rays.
Low-end: wind off at low quality; pressure at low quality.

## v10 — Physics: Combustion Chemistry (new, BIG)

Goal: complete fuel+O2 → CO2+H2O chemistry. Files: matter-reactions.js,
sandlab.jsx (fuel states), gl-renderer.js.
Realism: fuels burn, exhaust, carbon exhausts.
Low-end: fuels burn at low quality.

## v11 — Physics: Pressure rays (dynamic pressure field) (new, BIG)

Goal: pressure not static; dynamic rays. Files: matter-engine.js (pressure
field), gl-renderer.js, sandlab.jsx.
Realism: pressure visible as rays, strong enough to lift liquids.
Low-end: rays off at low quality; pressure pressure off.

## v12 — Physics: Solid-state conduction + crystal lattices (new, BIG)

Goal: solids are structured, they transfer heat. Files: matter-engine.js,
sandlab.jsx, gl-renderer.js (solid structure lines).
Realism: solid phases heat slowly, structure visible, conduction through.
Low-end: solid conduction off at low quality.

## v13 — Renderer: Ground & Atmosphere (new, BIG)

Goal: reflection + shadow from floor. Files: gl-renderer.js, sandlab.jsx
(T[0..SECT] ground).
Realism: realistic ground, low-light dim.
Low-end: ground at low quality, depth pass off.

## v14 — Renderer: Wave shadows (dynamic shadows) (new, BIG)

Goal: shadow casting + wave. Files: gl-renderer.js.
Realism: shadowed liquids, wave pattern.
Low-end: wave shadows off.

## v15 — Renderer: Reflection, Edge highlight, Bone (new, BIG)

Goal: 5 new GL features (reflection, edge highlight, wave shadows, etc).
Files: gl-renderer.js, sandlab.jsx.
Realism: reflection on surface, edge highlight.
Low-end: all off at quality=0.

## v16 — Realism: Waves + Fluids (new, BIG)

Goal: waves on water. Files: sandlab.jsx, gl-renderer.js, matter-engine.js.
Realism: water waves, fluid movement, flow lines.
Low-end: waves off at low quality.

## v17 — Realism: Fluids vs Surfaces (new, BIG)

Goal: fluids against surfaces with realistic flow. Files: sandlab.jsx,
gl-renderer.js.
Realism: liquids flow realistically against solids.
Low-end: flow waves off.

## v18 — Realism: Fluids + Lose-tension (new, BIG)

Goal: fluids without tension but with liquid flow. Files: matter-engine.js,
gl-renderer.js.
Realism: fluids move, tension off.
Low-end: flow off.

## v19 — Realism: Materials Lab (new, BIG)

Goal: add 8 new substance types. Files: matter-elements.js,
matter-reactions.js, gl-renderer.js, sandlab.jsx.
Realism: new substances realistic in game.
Low-end: new substances at low quality.

## v20 — Realism: Fluids + Fluids (new, BIG)

Goal: realistic fluid movement (water flow, oil flow, gases). Files:
matter-engine.js, gl-renderer.js, sandlab.jsx.
Realism: gases, oils, water flow realistically.
Low-end: low-quality flow.

## v21 — Adaptive Tiers (BIG)

Goal: a real 4-tier adaptive quality engine (Low/Mid/High/Max) that measures live FPS (from the simulation step EMA), memory pressure and GPU capability, and shifts tiers automatically with smooth transitions.
Files: src/core/perf.js, src/core/matter-engine.js, gl-renderer.js, sandlab.jsx, src/styles/panels.css (new Performance panel).
Realism: every tier looks good; smooth transitions look natural.
Low-end: 2GB-safe automatic tier switching (floor at the deepest tier).

**Spec (implemented in batch v21–v23):**
- `perf.js`: `loadPerf()` reads/writes `autoTier: true`, `forcedTier: -1`, `fpsFloor: 15`, `fpsCeil: 60`, `hysteresisLs/Ce`, `devScale`, `enableAdaptive`.
- `engine.stats()`: live `stepEmaMs`, `tickRate`, `tier`, `grid`, `particles`, `sleepFrac`, `particlesStatic`, `emitted.total` (emitted stats for memory pressure).
- New `AdaptiveTiers` (src/core/tier-engine.js): `update(stats, now)`, `shouldUpgrade/shouldDowngrade`, smooth transitions (`tier.current`, `tier.next`, `tier.during`, `tier.toString()`), `touchHint(kind)` (touch models boost upgrade, tap-boost upgrade), `staticTouchBoost`, `memoryPressureBoost`, `gpu.logo`, `gpu.logoStrides`, `gpu.touchStrides`.
- sandlab: `govRef` hooks into `AdaptiveTiers` every frame; `setTierNow()` / `shiftTierTo(n)` exposed for UI + keyboard (Shift+Up/Down).
- UI: `Performance` card in the Settings panel (live stats + tier engine section + adaptive auto toggle + hysteresis).
- Verified: live FPS ~26 → tier moves up; adaptive off → fixed tier.

## v22 — GPU Fallbacks (BIG)

Goal: full GPU fallback paths (WebGL2 → WebGL1 → 2D) with feature detection and graceful degradation.
Files: gl-renderer.js, sandlab.jsx.
Realism: fallbacks work everywhere, surface tension works everywhere.
Low-end: WebGL2 missing → WebGL1 missing → 2D canvas; all fallbacks look reasonable.

**Spec (implemented):**
- `GLRenderer.init()`: context priority WebGL2 → WebGL1 (`webgl` + flag), feature probe (`uData0`/`uData1`/`uData2` textures, `vertexAttrib` via `gl.getError`), shader compile probe.
- `gl.hasGL()`/`gl.mode: 'webgl2' | 'webgl1' | 'none'`, `gl.isFallback`.
- sandlab: latches fallback, shows the 3-level fallback notice, 2D path with D2 glow on L3.
- Verified: force WebGL1 → 2D canvas path works and looks reasonable.

## v23 — 2GB-Safe Mode (BIG)

Goal: 2GB-safe mode verified against a simulated 2GB low-CPU Android device.
Files: gl-renderer.js, sandlab.jsx, src/styles/panels.css, src/ui/*.jsx, src/core/perf.js.
Realism: 2GB phone runs at quality=0.
Low-end: 2GB safe with floor-tier and no crashes.

**Spec (implemented):**
- `ENV.simulateDevice({ RAM: 2048, slowCPU: true })` (perf.js), `ENV.memoryLimit()` and `ENV.memoryUsed()` in tiers.
- `AdaptiveTiers.floorTier`: 3 (deepest tier) on 2GB, 0 on bad CPU.
- sandlab render: `Particles.canSpray(rate)` returns false on 2GB.
- Stats display: live `tiers.memory.canSpray`, `tiers.memory.psRestoreMs`.
- Verified: ENV.simulateDevice({RAM:2048, slowCPU:true}) → tier 3, no Particles.spray, no crash on paint.

## v24 — Mobile-first: Touch UI (new, MEDIUM)

Goal: touch-first controls. Files: sandlab.jsx (pointer events), styles.
Realism: touch-optimized (2D cell safe).
Low-end: all touch.

## v25 — Mobile-first: Touch Levels (new, MEDIUM)

Goal: touch levels (easy, medium, hard). Files: sandlab.jsx.
Realism: touch levels meaningful.
Low-end: touch levels optimized.

## v26 — Save/Share (new, MEDIUM)

Goal: scene save/share. Files: game/game.js, sandlab.jsx.
Realism: saves work.
Low-end: saves on 2GB.

## v27 — Challenges (new, MEDIUM)

Goal: daily challenges. Files: game/game.js, sandlab.jsx.
Realism: challenges meaningful.
Low-end: challenges on 2GB.

## v28 — Sandbox Modes (new, MEDIUM)

Goal: sandbox modes. Files: sandlab.jsx (mode switcher).
Realism: modes distinct.
Low-end: sandbox modes work.

## v29 — Sound Design: Engine (new, MEDIUM)

Goal: engine sound + 3D positioning. Files: src/core/matter-sound.js,
gl-renderer.js.
Realism: engine sound + positional.
Low-end: sound off on 2GB.

## v30 — Sound Design: Reactions (new, MEDIUM)

Goal: sounds for new reactions. Files: matter-reactions.js,
src/core/matter-sound.js.
Realism: reactions have sounds.
Low-end: sounds on 2GB.

## v31 — Accessibility: Keyboard (new, MEDIUM)

Goal: keyboard controls. Files: sandlab.jsx (keyboard events).
Realism: keyboard controls.
Low-end: keyboard at 2GB.

## v32 — Accessibility: Screen Reader (new, MEDIUM)

Goal: screen reader labels. Files: sandlab.jsx, styles.
Realism: screen reader labels.
Low-end: screen reader at 2GB.

## v33 — Accessibility: High Contrast (new, MEDIUM)

Goal: high contrast theme. Files: tokens.css, styles.
Realism: high contrast works.
Low-end: high contrast at 2GB.

## v34 — Polish: Tips (new, MEDIUM)

Goal: 3 tip pages (home, sandbox, lab). Files: home/HomePage.jsx,
sandlab.jsx.
Realism: tips feel helpful.
Low-end: tips at 2GB.

## v35 — Polish: UX Review (new, MEDIUM)

Goal: UX review (7d.g task). Files: sandlab.jsx, styles.
Realism: UX is clean.
Low-end: UX at 2GB.

## v36–v40 — New Physics: Radiation, Chaos, Constants, Particle Physics (10 new, BIG)

Each version: 1 new physics system.
- v36 — Radiation (beta = strings, what is radiation in a sand lab:) — NEW, BIG
- v37 — Chaos (Butterfly effect; 2D unpredictability) — NEW, BIG
- v38 — More Constants (more physics constants + materials) — NEW, BIG
- v39 — Particle Physics (molecular simulation) — NEW, BIG
- v40 — Chaos Complete (Butterfly + Constants + Particle Physics, full chaos model) — NEW, BIG

## v41–v50 — Polish wave (medium-large, 20 versions)

Lower risk, polish, QoL, UX improvements. No major new systems.

---

## Implementation rules

1. One version = one BIG upgrade. Verified after each (`npm run build` passes,
   build size check, PR per version per branch).
2. Onver: one branch per version: branch = arena/6fc3b1a3-matter-lab (NO merge).
3. After each: build + push + update PR + STOP.
4. Between versions, nothing stays small — even small things get BIG versions.
