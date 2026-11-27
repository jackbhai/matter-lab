# Matter Lab — v2 Report

**Status: SHIPPED & LIVE** — https://jackbhai.github.io/matter-lab/ (repo: jackbhai/matter-lab, `main` = source, `gh-pages` = build)
**Date:** 2026-11-26 · **Scope:** standalone only (`~/workspace/omnitools` untouched)
**Verification:** local gate 23/23 PASS (`scripts/verify-v2.mjs`), live gate PASS (`scripts/verify-live-v2.mjs`), 0 page errors at 360×740 and 412×915.

## Part A — Homepage + Modes
- Real landing homepage is now the default screen: hand-drawn inline-SVG flask logo + "Matter Lab" wordmark + "By Jack Bhai", hero with verified numbers only (1,822 substances · 34,775 named reactions · 100% pair-decision coverage · 26 placeable lab items · procedural sound), About/comparison section.
- Four mode cards, each launching a genuinely different tool configuration via `{mode, sceneId?, experimentId?, nonce}`:
  - **Free Sandbox** — the tool as-is.
  - **Experiments** — guided panel with 4 experiments (Boil Water, Electrolysis of Water, Golden Rain, Chill to Freezing), one-tap scene setup, numbered steps, and **real objective checking** for all 4, scanned against the live world (water ≥ 95 °C / hydrogen > 40 cells / lead-iodide > 40 cells / ice forms or water ≤ 0 °C). Verified live in the gate: "Objective complete — Hottest water: 99 °C / 95 °C". No fake ticks.
  - **Scene Gallery** — the 4 built-in showcase scenes as cards with **thumbnails rendered from the scenes themselves** (a throwaway engine builds the scene and rasterises it), each launching straight into that scene with the Scenes sheet open.
  - **Custom Lab** — opens the tool with the picker up and the Create-a-substance form expanded.
- Home is one tap from inside the tool (rail button + top-chip button).

## Part B — UI identity
Lab-glass identity (deep slate/teal glass, fine 1px borders, teal-cyan accent) applied to the homepage **and** the tool chrome by re-pointing the CSS variables the tool already consumes — no forked tool code. English UI text throughout. No-overlap verified at 360/412 px, including a fix found in review: **the floating side rail now hides whenever any sheet/panel is open** (it previously drew over panel titles).

## Part C — Realistic pack
All effects are **pre-rendered sprites, cached and blitted** — no per-frame vector drawing.
- **Real glassware:** transparent walls with thickness, rim highlight, heavy base, specular streak, pouring-spout lip, and **graduation marks with numbers baked into the sprite** (50–250 on beakers, scaled per vessel). **Meniscus:** the liquid surface line is scanned from the vessel interior (spray/foam columns excluded, 3-column smoothing after review found a jagged-skyline defect) with a refraction bright band at the surface.
- **Real burner + flame:** Bunsen sprite (heavy base, barrel, collar, brass inlet); flame = 12 pre-rendered layered frames (blue outer cone, brighter inner cone, near-white core), height scales with burner level (boosted ×1.1/×1.2/×1.35 after screenshot review — closer to a real Bunsen's proportions), tick-hash flicker, soft halo gated off when the quality governor is under load.
- **Everything heats up visibly:** gear sprites tint neutral → dull red → orange with their real local temperature (sampled, 4 cached bands); contents already glow via the engine's blackbody pipeline; cooling coil grows a frost overlay by cold level. Steam wisps were deliberately **not** added — the engine already emits real steam cells; sprites would double-draw the same physics.
- **Texture pack:** 5 new finishes on top of the original 8 tiles (fine brushed metal, ceramic, glass sheen, rubber matte, copper streaks), all generated once at load, same one-read-per-cell cost.
- **XL beaker:** new size above L. Measured at 412×915: 210×140 cells ≈ **340 px ≈ 82.5% of screen width** (target ≈ 80%). Ladder is now S 35% / M 51% / L 66% / XL ~80%.

## Part D — Extras
- Homepage "What's reacting" ticker fed by **real** reaction names from the reaction data (template cards filtered out).
- Keyboard shortcuts in the tool (Space play/pause, [ ] brush, 1–9 tools, F fullscreen, Ctrl/Cmd+Z undo, H home), documented in Help, guarded while typing.

## Part E — Reaction messages redesign
- Bottom reaction cards/toasts are **gone**; the auto-popup was deleted entirely.
- New **Messages** entry in the side rail (upper area) with a red **unread badge** — new reactions only increment it silently (gate: Zn + CuSO₄ → badge 15, nothing at the bottom).
- Tapping it opens the reaction feed as a panel (live feed + chains + pair lookup, one consistent entry from rail/top-chip/side panel); opening clears the badge.
- **Template defect fixed:** all card name/line/equation text now passes through {a}/{b} substitution — the feed shows "Copper Sulfate Solution + Zinc → Zinc Sulfate Solution + Copper", and the gate asserts zero `{a}`/`{b}` strings on the page.

## Performance
Busy-scene frame times, same headless sandbox, identical scene (~5,400 particles): **v2 median 50.0 ms = live v1 median 50.0 ms (0.0% regression)**; p95 improved (83 ms vs 117–133 ms across runs). Absolute numbers are throttled-sandbox figures, not phone figures.

## Screenshots (`~/workspace/matter-lab-shots/`)
`home-412.png`, `home-360.png`, `tool-360.png`, `gallery-golden-412.png`, `experiments-412.png`, `custom-412.png`, **`hero-xl-burner-412.png`** (XL beaker, numbered graduations, meniscus, boiling water, lit burner, Messages badge visible), `flame-L1.png`, `flame-L3.png`, `frost-coil-412.png`, `messages-badge-412.png`, `messages-panel-412.png`, `live-tool-412.png`.

## Honest PARTIALs
- **Beaker height:diameter ≈ 1.3:1 — PARTIAL.** Vessel proportions are engine stamp geometry (XL = 210×140 cells); the sprite faithfully follows the stamp. Changing the ratio needs an engine stamp change beyond this wave's scope.
- **Liquid magnification through glass — PARTIAL (approximation).** Meniscus line + refraction bright band at the surface only; no per-cell refraction shift (would cost a second world pass).
- **Frost visibility — PARTIAL (evidence).** The frost overlay is implemented and the mechanism is temperature-verified (coil cells reached −48 °C in the tray scene, −97 °C in an earlier probe), but at phone world-scale the coil is small and the pale frost reads weakly in screenshots.
- **Homepage shortcuts hint — PARTIAL.** The homepage hint line describes the real in-lab flow; the shortcuts themselves live in the tool's Help (Part D above).
- **Electrolysis objective** is a real check, but completing it depends on the user completing the circuit in-world — the steps say so plainly.
