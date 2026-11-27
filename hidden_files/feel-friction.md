# Matter Lab — FEEL OVERHAUL Phase 1: Play-Test Friction Report (BEFORE)

- **Build:** `npm run build` PASS (vite, 64 modules, dist/assets/index ~1,328 kB / 347 kB gzip).
- **Method:** headless Chrome, viewport 412×915, local dist server. All actions were real mouse clicks/drags on visible elements (found by visible text / aria-label). `window.__matterlab` was used **read-only** for measurement (object positions, temperatures, cell counts) — never to perform an action. Scripts: `scripts/feel-playtest.mjs`, `scripts/feel-playtest2.mjs`, `scripts/feel-playtest3.mjs`. Screenshots: `~/workspace/matter-lab-shots/feel-before/`.
- **Caveat:** headless pointermove rates differ from a real finger; where that matters it is noted. Both addendum defects were independently reproduced headless and match the device evidence.

---

## TOP BLOCKERS (addendum items, measured headless)

### B1. BEAKER SITS SUNK INTO THE BENCH — its base is at the very last pixel row of the world and the bench strip eats its bottom
- Freshly placed Beaker M: on-screen box **65×45 px** at (172, 754), bottom edge at **y=799**. The canvas itself ends at y=801 and the stage's brown bench strip (`.ml-stage::after`, 14 px tall) starts at **y=787**.
- **12 of the beaker's 45 px of height — 27% — lie below the bench-strip line.** The beaker's bottom sits **0 px above the floor**: there is no floor margin at all, so anything drawn over the bottom of the stage (bench strip today, anything tomorrow) cuts the vessel.
- Perceptually it is worse than 27%: the beaker's glass is dark on a black world, so in `job2-beaker-placed.png` and `job4-selected.png` only the upper, measurement-marked part reads clearly and the vessel looks **about half-buried** — exactly what the device test reported. Phase-2 requirement (base ON the bench surface, 100% of glass visible) is not met.
- Evidence: `job2-beaker-placed.png`, `job4-selected.png`, measurements above (engine anchor + render geometry, read-only).

### B2. DOTTED BRUSH — a fast stroke is a dotted line of separate blobs, most of the path gets nothing
- One fast diagonal (5 discrete pointer jumps, finger-flick style, ~346 px): **only 6% of the path had any paint on it.** Two unpainted gaps measured **150 cells (~160 px)** and **174 cells (~186 px)**; the only painted run on the line was 22 cells.
- `supp-stone-strokes.png` shows it plainly: the fast stroke is a literal dotted chain of round stamps, and its last ~40% produced only **3 isolated blobs** floating alone. Even the *slow* stroke in the same shot is a scalloped chain of overlapping blobs, not a smooth line.
- Cause (from behaviour): each pointermove stamps one brush disc; there is no interpolation between successive pointer positions, so stamp spacing = pointer speed. Phase-2 requirement (interpolate, spacing ≤ ~½ brush radius) is not met.
- Evidence: `supp-stone-strokes.png`, `job1-dotted-stroke.png` (isolated blobs + missing stroke segments), cell-profile measurement above. (Substance was Sand (Quartz) — "Stone" is not among the first 80 Solids chips, see O3; stamp spacing is substance-independent.)

---

## Per-job log

### Job 1 — Paint sand, then water; brush tracking — COMPLETED (with B2 defect)
Steps (6 taps, 5 drags, 0 swipes, 2 panel opens):
1. Tap "Enter Free Sandbox" (homepage).
2. Screenshot `job1-start-first-run.png` — coach card present (388×161, 17% of viewport).
3. Tap "Skip tutorial". (The demo-offer bar never appeared in any session — skipping the coach sets the same "seen" flag that suppresses it.)
4. Drag: paint sand pile (default substance is Sand (Quartz), default tool Paint) — `job1-mid-sand.png`.
5. Tap Dock "Liquids" (strip opens, 408×157 = 17% of viewport) → tap Water chip (64×67, first chip, no scrolling needed).
6. Drag ×2: paint water above the sand. Settle 3 s → `job1-end-sand-water.png`. World: 1,559 sand + 2,048 water cells. Water pools and sits on the sand; sand+water contact silently logged reactions (Menu badge showed 2–3, "First Reaction" achievement toast appeared during a later stroke).
7. Slow straight tracking stroke: brush ring in `job1-brush-mid.png` sits exactly at the stroke's end and the band follows the drag line — **no visible offset or lag at slow speed**. (A cell-exact offset number could not be taken with sand: the stroke fell ~46 cells before it could be measured. The failure mode is speed — B2 — not offset.)
8. Fast diagonal stroke → B2 evidence above; `job1-dotted-stroke.png`, `job1-dotted-settled.png`.

### Job 2 — THE BOIL JOB — **FAILED: water never heated (20.0 °C flat for 306 s, 0 steam)**
Total: **12 taps + 4 drags = 16 touch actions, 5 panel opens** to reach "setup complete", then a 306 s wait with zero progress.
1. Tap "Enter Free Sandbox" — tap 1.
2. Tap "Skip tutorial" — tap 2.
3. Tap Dock "Lab Gear" — tap 3 (picker sheet opens: 412×769 = **84% of viewport**).
4. Tap gear tile "Beaker M" (tile 87×80 incl. label) — tap 4. Beaker lands bottom-centre, 65×45 px → B1. `job2-beaker-placed.png`.
5. Tap Dock "Liquids" — tap 5; tap Water chip — tap 6.
6. Drag ×3 painting water into the beaker (996 water cells landed inside) — `job2-mid-filled.png`.
7. Tap Dock "Lab Gear" — tap 7; tap gear tile "Burner" — tap 8. Burner lands **beside** the beaker (floor-centre was taken; fallback shifted it +44 px right). It auto-lights at **level 2** and **auto-opens the side panel** (264×785 = 55% of viewport area, 86% of height) without being asked.
8. Tap side-panel × (close) — tap 9. (The × has no aria-label.)
9. Tap tool-wheel button — tap 10 (popover 264×344 = 24% of viewport); tap "Move gear" — tap 11.
10. Drag burner left, under the beaker centre — **burner did not move at all** (cx 249 → 249). The target cells are occupied by the beaker, and there is no stacking: supplementary runs confirmed the beaker also cannot be lifted on top of the burner, nor the burner lifted under the beaker (both drags: 0 px movement, `supp-lift-attempt.png`, `supp-burner-lift-attempt.png`). Root cause for most grab attempts: see C1 (hit-test covers only 7–13% of each object).
11. Tap burner in the world to set its level — tap 12: **level stayed 2** (see U2).
12. Wait 306 s, polling every ~6 s: hottest water in beaker **20.0 °C at every single poll**, steam = 0 the whole time. The burner's flame column rises straight up into empty air beside the beaker (`job2-end-boil.png`). **No boil. Job failed at step 10 (positioning) — everything after was already pointless.**
- Note the contrast with Job 3: the *scripted* bench scene (burner pre-stacked under the beaker) reached 99 °C in under 6 s. The physics works; the *manual* path to assemble it does not.

### Job 3 — Experiment "Boil Water" — COMPLETED (but the payoff happened behind a sheet)
Steps (6 taps, 0 drags, 4 panel opens):
1. Tap Enter (1), tap Skip tutorial (2).
2. Tap TopBar "Menu" (3) — menu sheet 412×732 = **80% of viewport**. `job3-mid-menu.png`.
3. Tap "Experiments" (4) — experiments sheet, also 80%. `job3-experiments-list.png`.
4. Tap "Set up" on the Boil Water card (5). Scene builds (burner 26×24 px under beaker 75×53 px, beaker bottom 829 = burner top 829 — stacked correctly by construction). **The sheet stays open.**
5. Tap "Close" (6) — **missed**: the Close button sits at content y≈1371, far below the sheet's fold; the click landed outside the visible sheet and the sheet never closed.
6. Objective completed **behind the sheet**: first poll (6 s) already showed hottest water **99 °C**, steam 194 cells. Re-opening the sheet showed "✓ Objective complete — Hottest water: 99°C / 95°C" and ★★★ (Progress ★ 3/12) — `job3-setup-world.png` is literally a screenshot of the sheet, because the world was never visible. The only quick exit a user has is tapping the thin backdrop sliver above the sheet; nothing tells them that.

### Job 4 — Select / move / resize / lock a beaker — PARTIAL: every operation is possible, none is discoverable
Main run: 12 taps + 2 drags. Setup (Gear tab + Beaker M tile = 2 taps) excluded from op counts below.
- **Select (3 taps):** tool-wheel open (1) → "Move gear" (1) → tap beaker centre (1). Result: a faint gold outline on the beaker — and **nothing else**: no panel, no controls, no label, no hint (`job4-selected.png`). Worse, the centre tap only "worked" as a selection because selection happens on pointer-down hit-or-miss with no feedback either way; the beaker's centre cell is **not** a hit cell (see C1).
- **Move (1 drag):** dragging from the beaker's centre moved it **0 px**. Dragging from its left wall also moved **0 px**. Dragging from a *verified hit cell* (bottom-centre glass line) moved it **59 px** first try (probe 3, `supp-hit-drag.png`). The feature works only if you grab the ~1–2 px glass outline.
- **Reach the controls (2 taps + a long scroll):** Menu (1) → "Tools & controls panel" (1) opens the side panel (264×785, 55% of viewport). The panel's scroll height is **1,978 px**; the "GEAR — BEAKER M" section is 5th of 6 sections (BRUSH, SIMULATION, VIEW, PANELS, GEAR, GRAVITY). In the main run, the "Larger" and "Lock item" buttons sat at y=1766 and y=1816 — **physically off-screen** — and my clicks on them did nothing (resize/lock silently no-opped).
- **Resize (1 tap, after scrolling the panel ~1,200 px):** "Larger" (+) grew the beaker 70×49 → 82×57 px in the same layout (`supp-resize-lock.png`, `supp-panel-scrolled.png`).
- **Lock (1 tap, after scrolling):** "Lock item" worked — `locked=true` verified. A subsequent drag correctly failed to move it.
- Verdict: controls are **not contextual** — they live at the bottom of a giant general-purpose settings panel, reachable only via Menu, and only after scrolling inside that panel.

### Job 5 — Reaction + Messages — COMPLETED only on the third attempt; feed is noisy
Main run: 9 taps + 3 drags, 4 panel opens — and the feed said **"No reactions yet — mix something!"** (`job5-end-messages.png`).
- Attempt 1–2 (main + supp S-D): painted elemental Sodium (selection verified: substance bar read "Sodium") above/near a water pool → **no reaction, no badge, empty feed**. Cause: painted *solid-class* substances hang in mid-air exactly where painted — the sodium slab floated above the pool forever, silently. Nothing in the UI warns that a painted solid never falls.
- Attempt 3 (probe 3): sodium painted **directly into** the pool → reaction fired instantly: hydrogen 302 cells, sodium hydroxide 241 cells, badge "Menu — 9 new reaction messages". `supp-sodium-in-pool.png`.
- **Messages access: 2 taps** (TopBar Menu → "Messages" in the menu sheet). There is no Messages button on the main screen; the only sign is the badge on the Menu button.
- **Feed quality:** one sodium splash produced **9 entries**. The actual entry — "Sodium + Water → Sodium Hydroxide Solution + Hydrogen — Sodium rips oxygen from water so eagerly that the hydrogen released can catch fire. · 2Na + 2H2O → 2NaOH + H2↑" — is good, but it sits **4th**, buried under derivative template entries ("Hydrogen Dissolves in Water" ×2) and chain entries whose headline is a raw template: "Sodium Hydroxide Solution + Sodium → **metal + strong alkali → salt + H2↑**". The sheet also opens with two giant dropdowns ("Check a reaction": Water / Sodium + button) that push the actual feed down. `supp-feed-after-sodium.png`.
- Feed flooding: after Job 2's 5 minutes next to a lit burner, the Menu badge read **99+** — a standing flame generates endless chain entries and destroys the feed's usefulness.

---

## FRICTION LIST

### CONTROLS
- **C1 (blocker) — Gear hit-test covers only the glass outline: 7% of a beaker, 13% of a burner.** Measured cell-by-cell (probe 3): Beaker M responds on 110 of 1,551 bounding-box cells; its **centre is a dead zone**. Burner: 32 of 240 cells. Every natural gesture — tap the body, drag the body — silently does nothing: no error, no hint, no "grab the edge" affordance. This single defect caused Job 2's failed positioning, Job 4's failed move, and most failed burner taps. Evidence: probe-3 hit map; `supp-hit-drag.png` (drag from a hit cell works, 59 px).
- **C2 (blocker) — Dotted brush: no stamp interpolation.** See B2. Fast stroke = 6% path coverage, gaps up to ~186 px. Evidence: `supp-stone-strokes.png`.
- **C3 (annoying) — Double-tap = Undo is a landmine on the canvas.** Any two quick taps within 350 ms / 48 px on the canvas undo a stroke instead of doing the second tap's job (e.g. cycling a burner twice, tapping a vessel twice to tip is a *different* 700 ms gesture on the same spot). Nothing on screen teaches either gesture; both punish experimentation.
- **C4 (annoying) — Burner level from the world is unreliable.** Centre taps on the burner changed nothing in 3 of 3 attempts across two sessions (level stayed 2); a tap on its bottom-edge hit cell worked first try (2→3). Combined with C1, users cannot tell whether they misclicked, the tool is wrong, or the burner is broken. Evidence: Job 2 step 11; supp S-B (two slow-press centre taps, level 2→2→2); probe 3 (bottom-edge tap, 2→3).
- **C5 (minor) — Tool switching is a 2-tap popover every time.** The wheel button (96×44) opens a 264×344 popover (24% of viewport); "Move gear" is one of 9 primary + 8 secondary tools. Every gear interaction in Jobs 2/4 started with these 2 taps because Paint is the persistent default.

### IN-GAME UI
- **U1 (blocker) — Selected-object controls are buried, not contextual.** Selecting shows only a faint outline. Resize/lock/level/remove live in the side panel: Menu → "Tools & controls panel" (2 taps), then ~1,200 px of scrolling inside a 1,978 px-tall panel where GEAR is section 5 of 6. Off-screen buttons give zero feedback when "tapped" (Job 4 main run). Evidence: `job4-selected.png`, `job4-sidepanel.png`, `supp-panel-scrolled.png`.
- **U2 (annoying) — Sheets swallow the screen and the moment.** Picker 84% of viewport, Menu/Experiments 80%. The Experiments sheet stays open after "Set up" with its Close button below the fold (content y≈1371) — the Boil objective completed at 99 °C *behind the sheet*. Evidence: `job3-setup-world.png`.
- **U3 (annoying) — Placing a burner hijacks the screen.** The side panel (55% of viewport, 86% of height) auto-opens on burner placement, uninvited, and must be dismissed before you can see/place anything else. Its close × has no aria-label. Evidence: Job 2 step 7 panel measurement.
- **U4 (annoying) — The world rescales when UI opens.** The same Beaker M measured 65×45, 70×49, 75×53 and (after one resize tap) 82×57 px in different chrome states; cell size varied 1.07–1.60 px. Opening a chip strip/panel re-derives the grid from the new aspect, so the world visibly breathes/reflows under the user's fingers.
- **U5 (annoying) — Messages is 2 taps away and flooded.** No main-screen Messages entry (badge on Menu only); a single reaction = 9 feed entries with template headlines on top of the real one; a lit burner alone floods the badge to 99+. The feed's first screen is a "Check a reaction" lookup form, not the feed. Evidence: `job5-end-messages.png`, `supp-feed-after-sodium.png`, `job2-end-boil.png` (99+ badge).
- **U6 (minor) — The tutorial teaches a UI that no longer exists.** Coach step 1 says "the Substances button on the left rail" — the side rail was retired; there is no left rail. First-run users are sent looking for a phantom control. (Coach card itself: 388×161, 17% of viewport, auto-appears ~0.7 s after entry.)
- **U7 (minor) — First screen is a void.** The world is a 412×739 black rectangle; everything interesting sits in the bottom ~60 px. The empty-state hint is small text at the top. Nothing about the first screen suggests beakers, burners or boiling exist.

### BEAKER
- **K1 (blocker) — Beaker is sunk into the bench.** See B1: bottom 27% below the bench-strip line, base at the world's last pixel row, reads as ~half-buried in screenshots.
- **K2 (annoying) — Beaker M is tiny: 65×45 px** (16% of screen width) in the default layout, dark glass on black. Its measurement markings are the only readable part. Filling it precisely with a 6-cell brush (~17 px wide) is fiddly; the interior target is ~50 px wide.
- **K3 (annoying) — A beaker cannot be put on a burner, and a burner cannot be put under a beaker.** All three stacking routes were tried (slide burner under, lift beaker on top, lift burner up under): 0 px movement each — placement/move refuses any overlap, and gear auto-lands on the floor line only. The one arrangement the whole app is about (vessel on heat) is unreachable by hand; only scripted scenes/experiments have it. Evidence: Job 2 step 10; `supp-lift-attempt.png`, `supp-burner-lift-attempt.png`.

### BURNER
- **N1 (blocker) — A burner beside a beaker heats the water by 0.0 °C.** 306 s at level 2, flame column rising into empty air, hottest water cell never left 20.0 °C, zero steam. Since K3 makes "beside" the only manually reachable arrangement, manual boiling is impossible. Evidence: Job 2 polls; `job2-end-boil.png`.
- **N2 (annoying) — Burner is 22×21 px** — half the 44 px minimum touch target, smaller than a fingertip, at the very bottom edge of the screen, partly under the bench strip like the beaker. Its 3 level pips are ~5 px. Evidence: Job 2/S-B measurements.
- **N3 (annoying) — No visible level state in the world.** The burner auto-lights at level 2 on placement (good), but after that the only confirmation of a level change is a transient toast ("Level 3") or opening the side panel. Taps that miss (C4) look identical to taps that worked.
- **N4 (minor) — Burner placement is positional roulette.** It auto-lands at floor-centre, or shifted by a fallback offset if occupied (landed +44 px from the beaker, touching its wall). The user gets no say in where gear lands — placement position is chosen by the app, then moving it hits C1/K3.

### OTHER
- **O1 (annoying) — Painted solids float forever, silently.** Paint a solid-class substance (e.g. Sodium) in mid-air and it hangs there permanently; two of three Job 5 attempts failed this way with zero feedback. Either solids should fall as chunks or the UI should make the behaviour obvious.
- **O2 (minor) — Water on sand reads as a blue dome, not a liquid.** In `job1-end-sand-water.png` the settled water sits as a rounded blue mound on the sand pile rather than a flat-surfaced pool — first-time users see "blue hill", not "water".
- **O3 (minor) — Chip strips hide most substances.** The Solids strip renders only the first ~80 chips; "Stone" is not among them (MISS in supp S-A) — finding a specific substance means Expand grid or full Search. Water and Sand are early chips (good); most of the 1,822 are not reachable from the strip.
- **O4 (minor) — Tap targets are uniformly 44 px tall and several are narrower than a thumb.** TopBar buttons 52×44, dock tabs 64×44, wheel button 96×44, gear tile graphic 48 px tall (87×80 incl. label), substance chips 64×67, side-panel level buttons 52×44, "Larger" 44×44, "Lock item" 83×44. Nothing is unusably small except the in-world burner itself (N2) — the chrome is fine; the *world objects* are the small targets.

---

## Before-numbers summary

| Measure | Value |
|---|---|
| Boil job (Job 2) total | **12 taps + 4 drags = 16 touch actions, 5 panel opens → NO BOIL** (306 s wait, water 20.0 °C flat, 0 steam) |
| Boil job failure point | Step 10: burner cannot be positioned under the beaker (K3/C1) |
| Toggle burner from the world | Auto-lights to level 2 on placement (0 taps). Manual Interact tap: **failed 3/3 at centre, worked 1/1 at bottom edge** (2→3). Reliable route = side-panel level buttons (auto-open on placement, else Menu → Tools & controls = 2 taps + scroll) |
| Select beaker → reach resize/lock | 3 taps to select (outline only) + 2 taps (Menu → Tools & controls) + ~1,200 px scroll inside side panel; resize = 1 tap, lock = 1 tap once visible |
| Move a beaker | Works only from glass-line hit cells: centre drag 0 px, wall drag 0 px, bottom-edge drag 59 px. Hit coverage: beaker 7% (110/1,551 cells), burner 13% (32/240) |
| Messages after a reaction | 2 taps (Menu → Messages); badge works; 1 sodium splash = 9 entries; lit burner alone → badge 99+ |
| Experiment Boil Water | 5 taps to "Set up"; objective done in ≤6 s at 99 °C — behind the still-open sheet (Close at content y≈1371) |
| Panel coverage (% of 412×915) | Picker sheet 412×769 = **84%** · Menu sheet 412×732 = **80%** · Experiments sheet **80%** · Messages sheet 412×397 = **43%** · Side panel 264×785 = **55%** (86% of height; internal scroll height 1,978 px) · Tool-wheel popover 264×344 = **24%** · Chip strip 408×157 = **17%** · Coach card 388×161 = **17%** |
| Beaker M on screen | **65×45 px** default layout (70×49 / 75×53 in other chrome states); bottom 12 px (27%) below bench-strip line (strip top y=787, beaker bottom y=799, canvas bottom y=801) |
| Burner on screen | **22×21 px** (24×22 / 26×24 in other states), level pips ~5 px |
| Dotted brush (fast stroke) | **6% of path painted**; gaps 150 cells (~160 px) and 174 cells (~186 px); slow stroke continuous but scalloped |
| Tap targets (main chrome) | TopBar 52×44 · Dock tabs 64×44 · Wheel 96×44 · Gear tile 87×80 (graphic 48 tall) · Substance chip 64×67 · Level buttons 52×44 · Larger 44×44 · Lock item 83×44 |

Screenshots index (all in `~/workspace/matter-lab-shots/feel-before/`): job1-start-first-run, job1-mid-sand, job1-brush-mid, job1-end-sand-water, job1-tracking-stroke, job1-dotted-stroke, job1-dotted-settled, job2-beaker-placed, job2-mid-filled, job2-burner-placed, job2-positioned, job2-mid-first-steam (not taken — no steam ever appeared), job2-end-boil, job3-mid-menu, job3-experiments-list, job3-setup-world, job3-mid-objective, job3-end-status, job4-selected, job4-mid-moved, job4-sidepanel, job4-end-locked, job5-mid-search, job5-reaction, job5-end-messages, supp-stone-strokes, supp-stone-strokes-settled, supp-lift-attempt, supp-burner-lift-attempt, supp-tap-test, supp-edge-move, supp-panel-scrolled, supp-resize-lock, supp-sodium-reaction, supp-messages-feed, supp-hit-drag, supp-sodium-in-pool, supp-feed-after-sodium.
