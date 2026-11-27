# Matter Lab — Behavioural Audit (READ-ONLY)

Date: 2026-11-27 · Scope: current code in `~/workspace/matter-lab/src` · No files were edited.
Every claim carries a `file:line` citation or a grep count. Line numbers are from the files as read on this date.

---

## POINT 2 — HOME (`src/home/HomePage.jsx`, `src/App.jsx`)

### Exactly 3 big cards named Sandbox / Challenges / Scenes — YES
- The "Choose how to play" section (`HomePage.jsx:167-206`) contains exactly three `<article className="ml-card">` blocks in `.ml-modes`:
  - **Sandbox** — `HomePage.jsx:171-175` (`<h3>Sandbox</h3>`, launches `{mode:'free'}`)
  - **Challenges** — `HomePage.jsx:177-199` (`<h3>Challenges</h3>`, experiment list / `{mode:'experiments'}`)
  - **Scenes** — `HomePage.jsx:201-206` (`<h3>Scenes</h3>`, `{mode:'gallery'}` + a "Custom Lab" ghost button)
- Caveat: a fourth `.ml-card` exists elsewhere on the page — the conditional **Continue** card (`HomePage.jsx:146-152`, `data-continue="1"`), plus one card per scene in the Scene Gallery (`HomePage.jsx:214-221`). The modes section itself is exactly 3.

### Live reaction ticker — PRESENT but NOT live/session-driven
- Markup: `HomePage.jsx:154-165` (`.ml-ticker`, `aria-label="Named reactions in Matter Lab"`, tag "What's reacting").
- Data source: `TICKER_NAMES` at `HomePage.jsx:25-34` — built **once at module load** from `CARDS` in `src/core/matter-reactions.js` (named cards only; template cards containing `{` are filtered out), capped at 28 names. The track renders the list duplicated for a seamless loop (`HomePage.jsx:109`: `[...TICKER_NAMES, ...TICKER_NAMES]`).
- Motion is a pure CSS marquee: `src/styles/ml-v2.css:95-98` (`animation: ml-ticker-scroll 60s linear infinite`).
- **Verdict:** it does NOT update with real/session reaction data — no subscription to the engine, the reaction log, or discoveries. It is a static catalogue of reaction *names that exist in the data*, scrolling. It never shows a reaction that just happened.

### Continue-last-session affordance — PRESENT, but shallow (does not restore world state)
- Detection: `HAS_SAVE` at `HomePage.jsx:68-76`, computed once at module load. True when either:
  - `localStorage['omni:sandlab:scenes']` parses to an array with any truthy slot, **or**
  - `localStorage['omni:sandlab:recent']` parses to a non-empty array (recently used substance ids).
  - Key constants in the tool: `src/tools/sandlab.jsx:81` — `LS = { favs:'omni:sandlab:favs', recent:'omni:sandlab:recent', scenes:'omni:sandlab:scenes', recipes:'omni:sandlab:recipes' }`.
- UI: card at `HomePage.jsx:144-152`, shown only when `HAS_SAVE`; copy admits the limit: "jump back into the sandbox, or load a saved scene from Scenes in the lab."
- Action: the button only calls `onLaunch({ mode: 'free' })` (`HomePage.jsx:149`) — i.e. it opens a **fresh empty sandbox**. It restores **nothing itself**: no world snapshot, no autosave key exists (grep for `autosave` in `sandlab.jsx`: NOT FOUND). Actual world restoration is manual, via named save slots inside the lab (Scenes sheet, `sandlab.jsx:2353-2371`, stored via `matterlab:slots` in `src/game/game.js:21` / `getSlots`/`saveSlots` `game.js:186-199`).
- Note the trigger is weak: a non-empty *recents* list (just having picked a substance once) is enough to show "You have a previous session".

### Everything else on the home page (extras — not gaps; none displace the required items)
- Top bar with brand + "Part of OmniTools" link + "Open the lab" (`HomePage.jsx:102-112`).
- Hero: logo, title, sub-copy, "By Jack Bhai", two CTAs (Enter Free Sandbox / Browse scenes) (`HomePage.jsx:114-129`).
- Live-count stats strip (substances / named reactions / 100% pair coverage / gear count / procedural sound), read from data modules, not literals (`HomePage.jsx:56-64, 130-139`).
- Progress surface **inside the Challenges card**: total stars vs max, discovery-log count, today's + yesterday's daily-challenge status, "Play today's challenge" button (`HomePage.jsx:191-198`; data from `PROGRESS`, `HomePage.jsx:82-97`, via `src/game/game.js`).
- Scene Gallery section: 4 showcase scene cards with canvas thumbnails (`HomePage.jsx:208-224`; scenes from `SandlabNS.MATTER_SCENES` or a 4-item fallback list, `HomePage.jsx:11-19`).
- "What it is" about section + feature list + comparison list + hint (`HomePage.jsx:226-249`).
- Footer (`HomePage.jsx:251-257`).
- No "packs" UI as such; the closest equivalents are the Scene Gallery and the daily challenge. The 3 required cards, ticker and Continue all render (Continue/ticker conditional as noted) — extras sit below/around them, they do not displace them.
- Shell: `src/App.jsx:14-37` — `screen` state `'home' | 'tool'`; `openTool` stores launch config + `nonce: Date.now()` (`App.jsx:18-21`); tool's `onHome` returns (`App.jsx:22`).

---

## POINT 5 — REALISTIC FEEL + GESTURES

Files searched: `src/tools/sandlab.jsx`, `src/tools/sandlab-sprites.js`, `src/render/gl-renderer.js`, `src/core/matter-engine.js` (render-adjacent only).

### Dropper / pour animations when adding liquids
- **Pour micro-animation (UI overlay): YES, cosmetic only.** `pickAndClose` fires `setPourKey(k+1)` only when the picked substance's `cls === 'liquid'` (`sandlab.jsx:1789`); overlay `<div className="ml-pour">` rendered at `sandlab.jsx:1940-1941`; CSS droplet animation `src/styles/ui-a.css:152-159` (`.ml-pour`, `@keyframes ml-pour-drop`, 0.8s). It is a fixed-position droplet at top-centre of the stage — it does not track the cursor or the paint point. Disabled under reduced motion (`ui-a.css:178-182`).
- **Dropper tool: YES as a paint variant, no dedicated animation.** `dropper` is in `TOOLS` (`sandlab.jsx:65`); behaviour: density 0.12 and radius 1 in `paintAt` (`sandlab.jsx:1134-1135`), dispatched like paint (`sandlab.jsx:1214, 1275`). No drip/pour visual specific to it.
- **Actual liquid pouring from vessels** is simulation, not animation: tipping via `tipObject` (see tilt-pour below).

### Glass reflections on vessels — YES
- `glassSprite()` in `src/tools/sandlab-sprites.js:11-46`: translucent glass fill/stroke (line 17), bright rim strip (line 33), thicker base glass + inner edge (lines 34-35), beaker pouring-spout lip (lines 36-40), and a **vertical reflection streak**: linear gradient `rgba(255,255,255,0.34)` at 16–30% width, `sandlab-sprites.js:41-44`. Graduations with numbers baked in for beakers/cylinders (lines 45-50).
- Sprites are blitted per vessel in the realistic pass (`sandlab.jsx:1043`), plus a meniscus line + refraction bright band under the liquid surface (`sandlab.jsx:1053-1063`).
- GL path: reflections/specular are shader-side for the *world cells* (quality 2 = "normal perturbation + specular", `gl-renderer.js:22-23, 164`); vessel glass itself is drawn by the 2D sprite pass above in both paths (sprites composite after the world draw, `sandlab.jsx:1027-1035`).

### Steam / bubble particle effects — NO dedicated particle-effect system; steam/bubbles are real simulated cells + sound
- Steam wisps as sprites: **deliberately NOT FOUND / skipped** — comment at `sandlab.jsx:1031-1033`: "Steam wisps: SKIPPED deliberately — the engine already emits real steam cells, so fake sprite wisps would double-draw."
- Steam is a real substance the engine produces (boiling conversion: `matter-engine.js:1022`; steam counting for ambient sound: `sandlab.jsx:609-610`).
- Bubbles: no bubble *particle renderer* found in `sandlab.jsx` / `gl-renderer.js` (grep `particle` in both = only the particle *count* stat). "Bubble" exists as a **sound** counter in the engine (`matter-engine.js:174, 196` — `_snd.bubble`, `['bubble', cl(c.bubble, 50)]` loop). Gas/fizz products are simulated cells via reaction `gas`/`gasN` outputs (e.g. `matter-reactions.js:472`).
- Other sprite effects that DO exist: animated burner flame frames + halo (`sandlab-sprites.js:76-96`; blitted `sandlab.jsx:1066-1075`), frost sprite on cold coils (`sandlab-sprites.js:97-111`; `sandlab.jsx:1079`).

### Bench texture under/behind the world — NOT FOUND (as a bench)
- Canvas background is a flat colour: `background: '#0a0c12'` (`sandlab.jsx:1919`); empty cells render RGB (10,12,18) in the 2D loop (`sandlab.jsx:773` region / `d[o]=10,12,18`).
- Textures that exist are **per-substance procedural textures inside the world**, not a bench: 2D texture tiles (`sandlab.jsx:135-151, 790-800`, Normal view only, toggle at `sandlab.jsx:2012`) and GL per-substance pattern/normal textures (`gl-renderer.js:18-23, 164, 236-244`). No bench/worktop surface is drawn under or behind the world in any of the four files searched.

### Soft shadows — NOT FOUND
- Grep `shadow` across `sandlab.jsx`, `sandlab-sprites.js`, `gl-renderer.js`: no drop/soft shadow rendering for vessels or objects (the only hits are unrelated: CSS `boxShadow` in the coach-mark ring, `src/ui/GamePanels.jsx:84`, and `textShadow` on tile labels, `sandlab.jsx:2222`). Vessels sit on the world floor with no cast shadow; the burner *halo* glow (`sandlab.jsx:1072`) is a light glow, not a shadow.

### Gestures — per-gesture verdict
| Gesture | Verdict | Evidence |
|---|---|---|
| **Shake = stir** | FOUND, but gated behind Gyro being ON | DeviceMotion handler `hm` in the gyro effect: magnitude vs smoothed baseline, threshold `>13`, 900 ms debounce → one `e.stir(centre…)` + haptic (`sandlab.jsx:1646-1662`). Listeners are registered only inside `useEffect(..., [gyro])` (`sandlab.jsx:1602, 1663-1666`), and the Gyro enable flow requests DeviceMotion permission for exactly this (`sandlab.jsx:1595-1599`, toast "Gyro gravity on — tilt the phone (shake to stir)"). With Gyro off, shake does nothing. |
| **Swipe = ignite** | FOUND, narrower than "swipe": Spark-tool downward flick only | In `onMove`: with `tool==='spark'`, a fast downward flick (≥5 cells in one move frame, `dy > 2.2·|dx|`, moves ≤60 ms apart, 140 ms cooldown) fires 5 `e.sparkAt(...)` burst + haptic (`sandlab.jsx:1261-1275`). A generic swipe with any other tool does not ignite; horizontal/upward swipes do not trigger it. Documented in Help (`sandlab.jsx:2320`). |
| **Tilt = pour** | FOUND, with preconditions | DeviceOrientation handler: Gyro ON + a **vessel selected** + tilt >50° from straight-down held ~600 ms → `e2.tipObject(so.id)` (same tip the Interact double-tap uses), 2.5 s cooldown, toast "Poured — vessel tipped" (`sandlab.jsx:1627-1645`). Armed-state hint chip rendered at `sandlab.jsx:1952-1956`. Tilt without Gyro on, or with no vessel selected, does nothing (tilt otherwise drives gyro gravity, `sandlab.jsx:1604-1626`). |
| **Pinch = zoom** | FOUND | See pinch section below. |
| **Double-tap = undo** | FOUND (plus a bonus) | One-finger double-tap (<350 ms, <48 px) on second `pointerdown` → `undo()`, tap swallowed (`sandlab.jsx:1202-1210` region; code at `sandlab.jsx:1201-1210` in the onDown block, lines 1202-1210 of file). Two-finger double-tap = **Redo** (`sandlab.jsx:1186-1196`). Conflict rules documented `sandlab.jsx:1158-1164` and Help `sandlab.jsx:2320`. |

### Pinch zoom implementation (sandlab.jsx; game.js has NO zoom code — grep `zoom|pinch` in `src/game/game.js`: NOT FOUND)
- State: `zoom`/`setZoom` (`sandlab.jsx:348`), `viewRef {z, fx, fy}`, pointer map `ptrMapRef` (`sandlab.jsx:350`), `pinchRef {d0, z0, wx, wy, swallowed, t0}` (`sandlab.jsx:351`).
- Start: second finger landing creates the pinch record and cancels the in-progress stroke (`sandlab.jsx:1186-1199`).
- Move: distance ratio sets zoom — `z = clamp(z0 · d/d0, 1, 6)` (`sandlab.jsx:1246`); `setView` clamps identically (`sandlab.jsx:1171-1176`: `Math.max(1, Math.min(6, z))`, focus cleared at z≤1.001). **Min scale 1×, max scale 6×.**
- Pan: two-finger drag pans — the world point grabbed at pinch start stays under the moving pinch centre; focus recomputed at `sandlab.jsx:1240-1253`. (One-finger drag does NOT pan; it paints.)
- Render: presented world scales around the view focus in the present step (`sandlab.jsx:866-868`); pointer→grid mapping uses the same geometry so painting stays exact at any zoom (`sandlab.jsx:1127-1130`).
- Reset/other entry points: zoom % chip at top-right of the stage, tap = reset to 1× (`sandlab.jsx:1960`); Ctrl/Cmd+wheel zoom ×1.15 steps on the canvas (`sandlab.jsx:1918`).

---

## POINT 6 — TEACHING

### Onboarding coach-marks
- **Steps: 4.** `COACH_STEPS` in `src/ui/GamePanels.jsx:69-74`:
  1. `pick` — "1 · Pick a substance" (anchor: `dock`)
  2. `paint` — "2 · Paint it into the world" (anchor: `canvas`)
  3. `beaker` — "3 · Place a beaker" (anchor: `dock`)
  4. `burner` — "4 · Light a burner" (anchor: `canvas`)
- Component: `CoachMarks` (`GamePanels.jsx:75-98`) — highlight ring + card with Next/Finish, "Skip tutorial", and `n / 4` counter.
- Anchoring in the tool: rendered at `sandlab.jsx:2460-2481`; anchor element = `[data-dock="1"]` or fallback `[data-rail="menu"]` for dock steps, else the canvas (`sandlab.jsx:2466-2469`).
- Auto-advance on real actions (not just Next): pick → step 1 (`sandlab.jsx:1116`); particles > 0 → step 2; a vessel placed → step 3; a lit burner → finish (`sandlab.jsx:1440-1444`, polled in an effect on `coachStep`).
- **Dismissal storage key:** `omni:sandlab:seen` (via `lsSet`, `sandlab.jsx:1427` in `endCoach()`; the same key also suppresses the demo-offer banner — Skip there sets it too, `sandlab.jsx:1912`). Auto-start: on first ready, if `!lsGet('omni:sandlab:seen')`, coach starts after 700 ms (`sandlab.jsx:1428-1432`).
- **Replayable: YES** — "Replay the tutorial" buttons in the Help sheet (`sandlab.jsx:2325`) and the Menu sheet (`sandlab.jsx:2338`), both calling `startCoach()` (`sandlab.jsx:1426`); also exposed as `window.__matterlab.startCoach` (`sandlab.jsx:1763`).

### Per-reaction result cards
- **Data:** `CARDS` map in `src/core/matter-reactions.js:131-133` — each card is `C(id, name, eq, line, watch)`: `name` (what happened, e.g. "Baking Powder + Water"), `eq` (equation/products, e.g. `'NaHCO3 + acid salt + H2O → CO2↑'`), `line` (plain-language explanation), `watch` (what to look for). Example full entry: `matter-reactions.js:472`. Template cards use `{a} + {b}` placeholders, substituted with real names before display (`sandlab.jsx:1816-1823`).
- **Component:** inline in `sandlab.jsx` (not a separate component file): `rxEntryLine` (`sandlab.jsx:1811-1824`) builds the entry; `renderRxEntry` (`sandlab.jsx:1825-1856`) renders the feed line plus an expandable **"▸ Result card"** (`aria-expanded`, `sandlab.jsx:1841-1843`). Expanded card (`sandlab.jsx:1844-1854`, `data-rxcard="1"`) contains:
  - card name (title),
  - equation (`eqTxt`),
  - **"What happened:"** — `A + B → products (condition)` where products are the engine's actual outputs (`outA/outB/gas`), falling back to the card equation,
  - **"Why:"** — the card's plain-language `line`,
  - the `watch` hint, and a "✓ In your Discovery log" marker when discovered.
- **Verdict:** YES — what happened + products + plain-language explanation are all present, and all text comes from the reaction's own card data / real engine outputs (comment at `sandlab.jsx:1838-1840` states no invented text).
- Related but different: the substance **InfoCard** (`src/ui/InfoCard.jsx`, 30 lines) is a per-*substance* data card (description, class, density, melt/boil, pH, burns/conducts + "Reacts with…" profile children passed from `sandlab.jsx:2297-2310`) — not a reaction result card.

### Empty-state hints
| Empty state | Status | Evidence |
|---|---|---|
| Empty world (in-lab) | FOUND | Overlay hint when `parts===0`: "Pick a substance below and paint — or place a beaker from Lab Gear" (`sandlab.jsx:1942-1945`, `data-emptyhint="1"`, CSS `src/styles/ui-a.css:140`). Plus a separate first-run demo offer: "Start with a demo scene?" with Volcano & Lake / The Bench / Skip (`sandlab.jsx:1907-1914`). |
| Empty favourites | PARTIAL / effectively NOT FOUND | In the picker, the Favourites strip is only rendered when `favs.length > 0` (`sandlab.jsx:2248-2252`) — no empty-favourites hint text exists in the picker. In the Dock chip strip, an empty category renders a generic "Nothing here yet." (`src/ui/Dock.jsx:46`). No favourites-specific guidance (e.g. "long-press a tile to favourite") anywhere. |
| No reactions yet | FOUND | Messages/log sheet: `<Empty t="No reactions yet — mix something!" icon="flask" />` when `rxLog.length===0` (`sandlab.jsx:2424`). |
| Empty scenes (no saves) | FOUND (for save slots) | Scenes sheet: "No saves yet." when `slots.length===0` (`sandlab.jsx:2363`). Built-in showcase scenes are never empty (always listed below the slots, `sandlab.jsx:2372-2390`). |
| Others found | — | Search with no hits: "No substance matches that search" (`sandlab.jsx:2208`); Discovery log empty: "Nothing discovered yet — try sodium in water, or vinegar on baking soda." (`src/ui/GamePanels.jsx:20`); engine-construction failure: "The simulation engine could not start" + Retry (`sandlab.jsx:1858-1865`); undo/redo empty: toasts "Nothing to undo/redo" (`sandlab.jsx:1105, 1111`). |

---

## POINT 7 — ACCESSIBILITY

### aria / role counts (grep -o counts over `src/`)
Totals: **aria-label = 44, aria-pressed = 10, role= = 24** (plus aria-expanded/aria-hidden occurrences not in these three counts).

| File | aria-label | aria-pressed | role= |
|---|---|---|---|
| `src/tools/sandlab.jsx` | 21 | 5 | 16 |
| `src/ui/TopBar.jsx` | 6 | 1 | 0 |
| `src/ui/Dock.jsx` | 5 | 1 | 1 |
| `src/ui/ToolWheel.jsx` | 4 | 2 | 1 |
| `src/ui/InfoCard.jsx` | 2 | 0 | 0 |
| `src/tools/sandlab-tiles.jsx` | 2 | 0 | 2 |
| `src/home/HomePage.jsx` | 2 | 0 | 0 (also 1 aria-hidden via Logo) |
| `src/home/Logo.jsx` | 1 | 0 | 1 |
| `src/ui/kit.jsx` | 0 | 0 | 1 |
| `src/core/sfx.js` | 1 | 0 | 0 |
| `src/ui/icons.jsx` | 0 | 0 | 0 (uses aria-hidden) |
| All other src files | 0 | 0 | 0 |

Notable individual uses: ToolWheel group `role="group" aria-label="Tools"` (`ToolWheel.jsx:18`), result-card toggle `aria-expanded` (`sandlab.jsx:1842`), coach/dock groups, zoom chip aria-label with live % (`sandlab.jsx:1960`), alert banners `role="alert"` (`sandlab.jsx:1888, 1896`), achievement toast `role="status"` (`sandlab.jsx:1949`).

### prefers-reduced-motion
- **CSS — app shell (inherited OmniTools styles):** `src/styles/theme.css:2431-2446` — `@media (prefers-reduced-motion: reduce)` block plus the `html[data-motion="reduced"]` mirror (animations off, `.tfx/.flywrap` hidden, press transforms removed); animation-gating `@media (prefers-reduced-motion: no-preference)` at `theme.css:1211, 2217`.
- **CSS — Matter Lab's own styles:** `src/styles/ml-v2.css:99` (ticker animation off); `src/styles/ui-a.css:178-182` (`.ml-pour` hidden, ticker off, all transitions in `[data-mlroot]` cut to .01ms); `src/styles/w31-tools.css:75` (no-preference gate).
- **JS:** `src/core/settings.js:271-275` — `applyPersonalisation()` reads `matchMedia('(prefers-reduced-motion: reduce)')`; OS-reduce wins over the user's `motionPref` and sets `data-motion="reduced"`; a `change` listener re-applies (`settings.js:344-348`). In the lab itself, the pour overlay is described as "reduced-motion safe" (`sandlab.jsx:1940`) and is CSS-killed as above. No JS check gates the canvas simulation/render loop itself (motion there is the simulation, not decoration).

### Font scaling — YES, a user setting (two separate systems exist)
- **Matter Lab's own (the one the lab + home actually use):** 4 steps `s/m/l/xl`, stored at `matterlab:fontscale` (`src/game/game.js:24, 208-209` — `getFontScale`/`setFontScale`). UI: "Text size" button group in the lab's side panel (`sandlab.jsx:2044-2048`, `aria-pressed` per step, handler `applyFontScale` at `sandlab.jsx:1418`). Effect: sets `data-fs={fontScale}` on the lab root (`sandlab.jsx:1869`) and on the home root (`HomePage.jsx:100`); CSS maps it to `--ml-fsmul` 0.92 / 1 / 1.15 / 1.3 (`src/styles/ui-b.css:10-13` for `[data-mlroot]`, `ui-b.css:21-24` for `.ml-home`).
- **OmniTools legacy (present in the bundle, not wired to Matter Lab UI):** `uiText` in `src/core/settings.js:44` — 5 steps `TEXT_STEPS [0.875…1.125]` (`settings.js:172`), applied as `--uiscale` on `<html>` (`settings.js:261`); plus a reader-only `textSize` 0.85–1.35 (`settings.js:40`). No Matter Lab surface writes `uiText`.

### Colour-blind-safe heat view — YES (viridis), both render paths covered by forcing 2D
- Palette: `HEAT_STOPS_CB` at `sandlab.jsx:55-57` — viridis-style stops (purple 68,1,84 → teal → green → yellow 253,231,37), luminance-ordered; classic ramp is `HEAT_STOPS` (`sandlab.jsx:54`).
- Selection: persisted `matterlab:heat-ramp` (`src/game/game.js:23, 206-207` — `getHeatRamp`/`setHeatRamp`, default `'classic'`); UI in the side panel View section: `[['classic','Classic'], ['viridis','Colour-blind safe']]` buttons (`sandlab.jsx:2032`, handler wiring via `heatRampRef`, `sandlab.jsx:758`).
- **2D path:** heat view lerps through `HEAT_STOPS_CB` when viridis is selected (`sandlab.jsx:773`).
- **GL path:** the GL shader's heat ramp is fixed/classic, so when `vm==='heat' && ramp==='viridis'` the code sets `cbHeat` and **bypasses GL entirely**, presenting through the 2D pipeline (`sandlab.jsx:754-759` — comment states "the user sees the viridis ramp regardless of renderer"). So viridis applies in both paths, at the cost of losing GL rendering while in viridis Heat view. Pressure/Flow views have no alternate palette.

### Haptic toggle — YES
- Setting: `matterlab:haptics` (`src/game/game.js:22, 202-203` — `getHaptics` default true / `setHaptics`).
- UI: checkbox "Haptics (vibration)" in the side panel (`sandlab.jsx:2051`) and a second one in the Menu sheet noting it "also needs sounds on" (`sandlab.jsx:2344`); handler `applyHaptics` (`sandlab.jsx:1419`). Firing is double-gated: lab toggle (`buzz()` wrapper, `sandlab.jsx:336-338`) AND the sfx module's own gate inside `hapticFx` (`src/core/sfx.js:589` — the only `navigator.vibrate` caller).

### Where user settings are stored
**A) `src/core/settings.js` — the OmniTools-wide store.** Single key `localStorage['omni:settings']` (`settings.js:13`), defaults at `settings.js:27-49`. All keys:
`proxyUrl`, `useBuiltin`, `autoRadio`, `fancyLyrics`, `autoCache`, `sfx`, `textSize`, `readerPaper`, `lowData`, `uiText`, `density`, `iconStyle`, `motionPref`, `accent`, `themeMood`, `themeSchedule`, `lang`. (`resetPersonalisation`, `settings.js:327-337`, additionally writes `homeBackdrop`, `quietHome`, `seasonalOff`, which are not in DEFAULTS.) Of these, Matter Lab surfaces consume essentially none directly — this file is inherited app chrome (proxy/personalisation); theme id lives separately at `localStorage['omni:theme']` (read at `settings.js:265`).

**B) Matter Lab's own settings — `src/game/game.js` `K` map (`game.js:13-25`), one localStorage key each:**
`matterlab:stars`, `matterlab:discoveries`, `matterlab:achievements`, `matterlab:rx-total`, `matterlab:daily`, `matterlab:flags`, `matterlab:slots`, `matterlab:haptics`, `matterlab:renderer`, `matterlab:heat-ramp`, `matterlab:fontscale`.

**C) Legacy `omni:sandlab:*` keys used directly in `sandlab.jsx`:** `omni:sandlab:favs`, `omni:sandlab:recent`, `omni:sandlab:scenes` (legacy slots, migrated at `game.js:186-199`), `omni:sandlab:recipes` (constants at `sandlab.jsx:81`); `omni:sandlab:seen` (coach/demo dismissal), `omni:sandlab:neutral` (gyro calibration, `sandlab.jsx:1669`), `omni:sandlab:texq` (texture quality).

---

## POINT 4 detail — "Poke" in ToolWheel vs sandlab tool list

- `src/ui/ToolWheel.jsx:7-10`: `PRIMARY = [paint, spray, eraser, stir('Stir'), heat, cool, **stir('Poke')**, spark, interact('Move gear')]` — the "Poke" entry maps to tool value **`'stir'`**, identical to the "Stir" entry two positions earlier. Both buttons therefore call `onSelect('stir')`; whichever is active, both show `aria-pressed` state for `tool==='stir'` (`ToolWheel.jsx:22`). There is no `'poke'` tool value anywhere in the UI layer.
- `sandlab.jsx` tool list — `TOOLS` at `sandlab.jsx:61-66`, **17 tools**: `paint, spray, line, rect, circle, fill, eraser, heat, cool, wind, stir` (labelled **"Stir/Poke"**), `clone, inspect, spark, blast, interact, dropper`. (Tool state default `'paint'`, `sandlab.jsx:262`; keyboard 1–9 quick-select, `sandlab.jsx:1701`.)
  - `poke?` — **no standalone `poke` tool value exists** in `TOOLS`.
  - `interact/move` — value is `'interact'`, labelled "Interact" in `TOOLS` and "Move gear" in the wheel's PRIMARY list.
- **Distinct poke behaviour: YES, but only as a sub-behaviour of the stir tool, at engine level.** In `onMove`, `tool==='stir'` calls `e.stir(...)` and, when the pointer moves, additionally `e.poke(g.x, g.y, brush, dx, dy)` (`sandlab.jsx:1280`) — a directional push. `poke` is an engine method invoked with drag direction; it is never selectable as its own tool, has no brush/own dispatch in `onDown` (a stationary stir tap only stirs, `sandlab.jsx:1329`), and no separate icon/label beyond the merged "Stir/Poke".
- **Exact report:** ToolWheel "Poke" = alias button for `'stir'`; sandlab has no `'poke'` tool; the only distinct poke behaviour is the drag-direction `e.poke()` call inside the stir tool's move handler (`sandlab.jsx:1280`).

---

## POINT 3 detail — TopBar / Dock in fullscreen (`sandlab.jsx`)

- Fullscreen state: `fs` (real Fullscreen API) + `fsFb` (in-page full-bleed fallback); combined `fsMode = fs || fsFb` (`sandlab.jsx:291-294`). Fullscreen is attempted on open (`sandlab.jsx:1536-1582`).
- **TopBar: hidden in fullscreen.** Render condition `!fsMode && !sheet && !picker && !dataCard` (`sandlab.jsx:1873`, comment at `1870-1872`: "hidden in fullscreen"). The selected-substance bar above the Dock is also `!fsMode`-gated (`sandlab.jsx:2137`).
- **Dock: hidden in fullscreen.** Render condition `!fsMode && !sheet && !picker && !dataCard && !sideOpen` (`sandlab.jsx:2147-2149`; imported from `src/ui/Dock.jsx`, 5 category tabs + Search).
- **What chrome shows in fullscreen instead:**
  - The **side rail** — round glass floating buttons over the canvas: Tools & controls, Home, Messages (with unread badge), Substances & items, Play/Pause, Clear world, Fullscreen toggle (`sandlab.jsx:1920-1937`). It is NOT fs-gated; it hides only while a sheet/picker/data card is open (`!sheet && !picker && !dataCard`, `sandlab.jsx:1922`).
  - The **ToolWheel** — floating current-tool button + popover (`sandlab.jsx:1939`), same modal-only gating, no fs condition.
  - The **zoom % chip** (tap = reset zoom, `sandlab.jsx:1960`), the expandable **side panel** when the rail's Tools button opens it (`sideOpen`, `sandlab.jsx:1973` onward), the empty-world hint, pour overlay, achievement toast and tilt-pour hint chip — all stage overlays with no fs gating.
  - Coach marks explicitly cope with this: dock anchor falls back to the rail's Substances button in fullscreen (`sandlab.jsx:2466-2469`).

---

## POINT 8 detail — What still lives inside `sandlab.jsx` (2,482 lines) vs components

### Components in `src/ui/` (plus tiles)
| File | Lines | Covers |
|---|---|---|
| `src/ui/TopBar.jsx` | 20 | Top bar chrome (Home, Undo/Redo, Pause, Speed, Menu, stats line) — presentational, handlers via props. |
| `src/ui/Dock.jsx` | 56 | Bottom dock: 5 category tabs (Solids/Liquids/Gases/Lab Gear/Favourites) + Search, and the picker chip strip (Recents first, expandable). |
| `src/ui/ToolWheel.jsx` | 41 | Floating tool wheel: PRIMARY ring + scrolling secondary list; calls the same `setTool`. |
| `src/ui/InfoCard.jsx` | 30 | Substance data-card shell (name/formula, desc, property lines, favourite/close/use); "Reacts with…" block arrives as children from sandlab. |
| `src/ui/GamePanels.jsx` | 98 | Discovery log panel, Achievements panel, `COACH_STEPS` data + `CoachMarks` overlay. |
| `src/ui/kit.jsx` | 63 | Minimal chrome kit: `Card`, `Empty`, `toast`, `Toaster`. |
| `src/ui/icons.jsx` | 191 | Hand-written 24×24 stroke icon set (`Icon` component), no emoji. |
| `src/tools/sandlab-tiles.jsx` | (in tools/) | `Tile` / `MiniTile` picker tiles with 550 ms long-press → info card. |

### Still inline in `sandlab.jsx`
- **Substance picker sheet body: `sandlab.jsx:2168-2295` ≈ 128 JSX lines.** The whole `{picker && (...)}` sheet: header + close, Dock chip strip vs full-grid modes, Favourites/Recent strips, "Common — start here" grid, Lab Gear section with vessel-size selector, category sections, search results. It depends on a large slice of component state: `picker, dockTab, dockExpanded, query/searchHits, favs, recent, selId, selRec, COLS, customsVer, vesselSize` and handlers `pickAndClose, setDataCard, openPanel` + helpers `tileGrid, catItems, sortedSubs, dockItems` (defined `sandlab.jsx:1776-1800`). Only the leaf tiles (`Tile`/`MiniTile`) and the Dock strip are extracted.
- **Menu / settings sheet: `sandlab.jsx:2311-2458` ≈ 148 JSX lines** for the single generic `{sheet && (...)}` block, which inlines **eight** sheet bodies: `help` (2315-2327), `menu` (2328-2346 — navigation buttons + the settings rows incl. the haptics checkbox at 2344), `discoveries` (2347-2349, delegating to `DiscoveryPanel`), `achievements` (2350-2352, delegating to `AchievementsPanel`), `scenes` ×2 blocks (2353-2390 — save slots + share code + showcase), `recipes` (2391-2404), `log` (2405-2425 — the reaction feed incl. result cards), `experiments` (2426-2454). State it depends on: `sheet, slotName, slots, shareInput, recipes/recipeLen, rxLog, rxMode, collapsedRx, expandedRx, discoveries, hapticsOn` and ~15 handlers (`openSheet, saveSlot, loadSlot, renameSlot, deleteSlot, copyShareCode, importShareCode, buildDemo, buildExperiment, startCoach, applyHaptics…`).
- **Also inline (for completeness):** the expanded side panel (`sandlab.jsx:1973-~2135`, ≈160 lines) — tool grid, brush/shape controls, and the View settings cluster (renderer, texture, heat ramp `2032`, font size `2044-2048`, haptics `2051`, gyro, sheet shortcuts `2056-2061`); the reaction-feed entry renderer (`renderRxEntry`, `sandlab.jsx:1825-1856`); the rail (`railBtn`, `sandlab.jsx:1803-1809` + render `1920-1937`); inspect card, demo offer, error/fallback banners — none of these are components.

---

## One-line summary of gaps vs the brief
1. Ticker is a static catalogue marquee, not a live reaction feed (Point 2).
2. Continue detects a prior session but restores nothing itself — no autosave exists (Point 2).
3. No bench texture behind the world; no soft shadows; no steam/bubble particle-effect layer (steam/bubbles are simulated cells + sound only) (Point 5).
4. Shake-to-stir only works while Gyro is on; swipe-ignite is Spark-tool downward flicks only (Point 5).
5. "Poke" is not a tool — it's a duplicate `'stir'` button in the wheel; real poke is a stir-drag sub-behaviour (Point 4).
6. Empty-favourites state has no dedicated hint (section silently absent in the picker) (Point 6).
7. Viridis heat view forces the 2D renderer (GL bypassed) — correct colours, no GL (Point 7).
8. Picker sheet (~128 lines) and the 8-in-1 menu/settings sheet (~148 lines) remain inline in the 2,482-line `sandlab.jsx` (Point 8).
