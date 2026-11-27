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
| v21–v23 | Low-end engine: adaptive tiers, GPU fallbacks, 2GB-safe | performance features |
| v24–v25 | Mobile-first: touch controls and precision levels | mobile interaction |
| v26–v28 | Portable scene archives, challenges, sandbox modes | product features |
| v29–v30 | Sound design: engine + reactions (fire, liquid, gas) | audio features |
| v31–v33 | Accessibility: keyboard, screen reader, high contrast | accessibility features |
| v34–v35 | Polish: better tips, deep UX review, polish tests | polish (medium-large) |
| v36–v40 | New physics: radiation, chaos & constants, more chemistry | 10 more physics systems |

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

## v21 — Low-end: Adaptive Tiers (new, MEDIUM)

Goal: 4-tier adaptive quality (10-60 fps). Files: src/core/perf.js,
src/core/matter-engine.js, gl-renderer.js, sandlab.jsx.
Realism: all tiers look good.
Low-end: 2GB-safe automatic tier switching.

## v22 — Low-end: GPU Fallbacks (new, MEDIUM)

Goal: 4 fallback variants (Low, Mid, High, Max). Files: gl-renderer.js,
sandlab.jsx (quality=0 path, avg cell style).
Realism: fallbacks have surface tension, wind.
Low-end: all at quality=0.

## v23 — Low-end: 2GB-Safe (new, MEDIUM)

Goal: 2GB RAM safe at quality=0. Files: gl-renderer.js, sandlab.jsx.
Realism: 2GB phone runs at quality=0.
Low-end: quality=0 on 2GB.

## v24 — Mobile-first: Touch UI (DONE — thumb-first controls and continuous strokes)

**Intent:** Make the simulation practical to operate one-handed on phones without
changing the engine grid, weakening the existing two-pointer camera gestures, or
making mouse/stylus input feel less precise.

**Integrated implementation:**
- `src/ui/TouchActionBar.jsx` adds a narrow-screen/coarse-pointer toolbar for
  Undo, Redo, brush decrement/increment, live brush size, and the active touch
  profile. Buttons have accessible action names and 44 px minimum targets.
- `src/tools/sandlab.jsx` wires the toolbar to the same undo/redo stacks and
  brush state as the desktop UI. Touch pointer identity now travels through the
  real paint, spray, dropper, erase, heat, cool, stir, and shape paths. Touch
  strokes fill gaps between sparse pointer-move events; object interaction,
  pinch zoom/pan, zoom reset, spark flick, and the two-finger redo gesture keep
  their existing meanings.
- `src/styles/panels.css` makes the action strip responsive, wraps it safely on
  very narrow screens, and lays out the profile cards as a mobile sheet.
- `src/core/touch-controls.js` owns tested, bounded input helpers, so the React
  component and canvas use the same radius, interpolation, and tap rules.

**Acceptance and tests:** `tests/touch-controls.test.js` proves accessible
profile lookup, touch-only brush scaling, gap-filling endpoints, bounded work
for large pointer jumps, and the single-/two-finger double-tap rules. Desktop
mouse and pen keep their exact base brush radius. The existing pinch/pan and
canvas paths remain the app's production handlers; no parallel demo controls.

## v25 — Mobile-first: Touch Levels (DONE — Easy / Medium / Hard assistance)

**Intent:** Make touch difficulty a real, explainable precision setting rather
than a label. The profile is persisted in `matterlab:touch-level`, exposed from
the touch action strip and the main menu, and affects finger input only.

**Profile contract (`src/core/touch-controls.js`):**
- **Easy:** 1.30× brush radius, 0.62-cell interpolation spacing, 460 ms / 64 px
  one- or two-finger double-tap window. Larger targets in world space and denser
  gap filling forgive less accurate thumbs and less frequent touch events.
- **Medium (default):** 1.00× radius, 1-cell spacing, 350 ms / 48 px gestures.
- **Hard:** 0.72× radius, 1.45-cell spacing, 260 ms / 30 px gestures for more
  exact placement and less accidental undo/redo. All radii remain clamped to
  1–64 world cells. Stroke interpolation is capped at 256 points per move and
  further scales down with brush footprint (minimum four points), protecting
  low-memory phones from large-brush pointer bursts.
- Profiles are read through `Game.getTouchLevel()` / `Game.setTouchLevel()`;
  invalid or absent values safely resolve to Medium. Mouse and pen preserve the
  requested radius and are not gap-interpolated by touch assistance.

**Acceptance and tests:** unit coverage asserts profile ordering, persistence
fallback, radius clamping, interpolation density/endpoints/work caps, and the
profile-dependent tap thresholds. The touch settings sheet describes the real
behavior and shows the active choice; the quick toolbar reflects it immediately.

## v26 — Save/Share (DONE — portable, verified scene archives)

**Intent:** Turn scene saving into a durable, inspectable, portable workflow
while keeping the engine's established v1–v3 scene payloads unchanged.

**Integrated implementation:**
- `src/game/scene-archive.js` wraps a normal engine payload in a versioned
  `matter-lab-scene` archive with a user-visible name, creation time, world
  dimensions, particle/substance/object/body summary, and an FNV-1a integrity
  checksum. New share codes use `ML2.G.` (gzip) or `ML2.R.` (raw fallback).
  The decoder verifies the checksum and metadata before exposing the payload.
- Imports enforce the engine's 1,024-dimension / 200,000-cell world ceiling,
  8 MB decoded payload ceiling, bounded object/body lists, and bounded streaming
  decompression. `.mlscene` JSON archives and legacy raw engine JSON are both
  accepted; old `ML0.` and gzip `ML1.` share codes remain readable.
- Named local saves store compressed ML2 codes (with a 12-slot cap); saving an
  existing name updates that slot. Legacy numbered local slots remain
  non-destructively readable. Each slot can load, use the platform share sheet
  or clipboard, export a portable `.mlscene` file, rename, and delete.
- `src/game/scene-history.js` provides a bounded, one-step `SceneSwapHistory`.
  Current-world import validates before changing the engine; Undo/Redo then
  restores the complete before/after scene, including grid dimensions, cells,
  temperatures, lab gear and rigid bodies; ordinary brush strokes continue
  using the existing compact delta-history path. Native Web Share is used where available, with a
  clipboard/import-box fallback. Portable exports include metadata and a
  checksum, while PNG export remains available.
- `src/tools/sandlab.jsx`, `src/game/game.js`, `src/home/HomePage.jsx`'s
  existing Continue route, and the scenes sheet all use the same live save
  store and archive decoder; the package is not an isolated export utility.

**Acceptance and tests:** `tests/scene-archive.test.js` covers package/file
round trips, checksum and size rejection, ML0/ML1 compatibility, ML2 encoding,
and a real MatterEngine serialize → share → decode → deserialize round trip.
`tests/scene-history.test.js` proves full-world load Undo/Redo restores grid size,
cells and gear, while `tests/game-storage.test.js` covers touch-profile
settings, same-name slot updates, save caps, storage failures, name limits and
non-destructive legacy-slot migration. A 2 GB device
still uses the existing safe cell/particle budgets; archive handling adds hard
input/decompression bounds and does not require a new renderer or large asset.

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

1. Each version is a substantial, integrated upgrade: app-wired behavior,
   behavior-proving tests, and documented acceptance criteria—not dead modules.
2. Adjacent versions may ship as one batch when the requested work spans them;
   keep the implementation coherent and identify each version's scope here.
3. Use the active Arena session branch and its branch policy; do not hard-code a
   branch name into the roadmap or create a second branch outside that flow.
4. Verify the complete test suite and production build, review the diff, then
   push and open/update the requested PR. Stop for review when asked; do not
   merge a review PR unless the user explicitly requests it.
