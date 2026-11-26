# Matter Lab

**A falling-sand sandbox × a real chemistry lab — in one open world.**
Paint any of **1,392 substances**, place working lab gear (beakers, burners, cooling
coils, wires, switches, electrodes…), and watch everything react with everything.

🔴 **Live demo:** https://jackbhai.github.io/matter-lab/
Part of the [OmniTools](https://omnitools-8cf.pages.dev) suite — this repo is the
standalone edition of its flagship tool.

## v2 — homepage & modes

The app now opens on a **landing homepage** (its own flask logo, live numbers, and a
"What's reacting" ticker fed by real reaction names from the data) with four ways in:

- **Free Sandbox** — the open world, everything unlocked, no goals.
- **Experiments** — guided runs with a goal to hit.
- **Scene Gallery** — four showcase scenes (Volcano, The Bench, Electrolysis,
  Golden Rain) with real rendered thumbnails; opening one loads it in the sandbox.
- **Custom Lab** — define your own substance by its properties; it reacts by the
  same rules as the built-in 1,392.

One tap on the tool's Home control returns to the homepage. The whole app wears the
v2 **lab-glass** identity — deep slate/teal glass panels, fine borders, one teal-cyan
accent — applied through the shell's CSS variables so the tool re-skins in place.
The simulation's realism pack (property-driven verdicts, in-world proofs like
beaker-on-burner boiling and electrolysis) is unchanged underneath.

## By the numbers (all measured, none rounded up)

| | |
|---|---|
| Substances | **1,392** — elements, compounds, solutions, alloys, foods, fuels, explosives, lab reagents |
| Named reactions | **22,542** pairs with a real, distinct reaction outcome |
| Decision coverage | **100%** — all 968,136 substance pairs resolve via a named mechanism (pair rule → family rule → property-computed verdict); no pair is a shrug |
| Property engine | Real data underneath: standard potentials (E°), solubility products (Ksp), pKa, Hansen solubility parameters — verdicts cite the numbers they used |
| In-world proofs | Beaker-on-burner boils at 100.0 °C · electrolysis splits water · thermite makes iron · golden-rain PbI₂ · pour conservation 0.00% drift |

## What's inside

- **One open world, no modes** — the lab lives inside the sandbox: place a beaker
  (S ≈ 35% of screen width, M ≈ 51%, L ≈ 66%), put it on a burner, boil, electrolyse,
  precipitate, pour from vessel to vessel.
- **Full control of every object** — select anything placed: drag it, resize it,
  lock it (a locked item won't move, even in an explosion), duplicate it, tip it.
  Gear has real controls: burner flame level, cooling-coil cold level, heater coils,
  lamps, switches, sensors.
- **Air, pressure & heat** — a pressure/velocity field drives blasts and boiling
  points (water boils at 112 °C under pressure); view modes for Heat / Pressure / Flow.
- **Electronics gear** — wires, batteries, switches, lamps and heater coils that
  actually complete circuits.
- **Procedural sound, zero audio files** — bubbles sized by Minnaert resonance,
  modal impacts, layered explosions, scene reverb; volume follows intensity.
- **Per-substance texture** — grain, speckle, streaks, sheen and sparkle rendered
  from pre-baked tiles at ~0% frame cost.
- **Smooth on phones** — chunked active-region simulation (sleeping areas cost
  nothing), fixed-timestep frame pacing, and a governor that holds a stable frame
  rate; square cells on every screen shape, fullscreen on open, gyro gravity.
- **Reaction log & chains** — a collapsible live feed of what reacted with what to
  make what, plus a two-substance lookup (plain / hot / electrified / pressurised).
- **Share codes & scenes** — export/import whole worlds as compact codes (ML1),
  a built-in showcase of scenes, a recipe book, and a **custom substance creator**:
  define your own material by its properties and it reacts by the same rules.

## Run it locally

```bash
npm install
npm run dev     # develop
npm run build   # production build → dist/
```

React + Vite, no backend, no accounts, no tracking — the whole lab runs in the
browser. `node scripts/verify-local.mjs` runs a headless smoke check of the build.

## Layout

- `src/tools/sandlab.jsx` — the tool UI (toolbar, tile panel, side rail, sheets)
- `src/core/matter-engine.js` — the simulation engine
- `src/core/matter/` + `matter-elements.js` — the 1,392-substance catalogue
- `src/core/matter-reactions.js` — the named-reaction grids
- `src/core/matter-verdicts.js` + `matter-chemdata.js` — the property/verdict engine
- `src/core/matter-sound.js` + `matter-acoustics.js` — procedural audio

---

**By Jack Bhai** — built with the OmniTools workshop. Extracted from OmniTools so
the lab can be shared on its own; the original stays live inside the suite.

## Installable (PWA) & Android

Matter Lab is a PWA: install it from the browser for a standalone, offline-after-first-load
app (manifest + service worker ship in `public/`). A Capacitor Android project
(appId `com.jackbhai.matterlab`) lives in `android/` — build the AAB on a machine
with Android Studio: `npm run build && npx cap sync android && npx cap open android`.
Privacy: everything is stored locally on your device — see `privacy.html` in the app.
