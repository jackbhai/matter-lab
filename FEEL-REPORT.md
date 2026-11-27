# Matter Lab — FEEL OVERHAUL Report

**Live:** https://jackbhai.github.io/matter-lab/ · **Repo:** jackbhai/matter-lab
**Wave:** Phase 1 (play-it-like-a-user friction list) → Phase 2 (rebuild controls / in-game UI / beaker / burner) → Phase 3 (scripted task tests, deploy, live re-check).
**Phase docs:** `hidden_files/feel-friction.md` · `hidden_files/feel-fixes.md` · `hidden_files/feel-tasktests.md`
**Screenshots:** `~/workspace/matter-lab-shots/feel-before/` (37) · `feel-after/` (11) · `feel-tests/` (17)

**Verdict:** the four things the user called "kharab" — controls, in-game UI, beaker, burner — were rebuilt experience-first and are now proven by task tests on the deployed build. The boil job, impossible by hand before this wave, now completes in **10 taps** with the water at **104.7–137.7 °C**. Every hard acceptance test passes on the final tree; the honest residuals are listed at the end, not buried.

---

## Phase 1 — the friction list (this wave's spec)

Played the pre-wave build at 412×915 like a user, 5 jobs, every tap counted. Full log: `hidden_files/feel-friction.md`.

| Job | Result |
|---|---|
| 1. Paint sand + water | Completed — but see C2 below |
| 2. **Boil water by hand** | **FAILED** — 12 taps + 4 drags = 16 touch actions, 5 panel opens, 306 s wait: hottest water stayed at exactly **20.0 °C**, 0 steam |
| 3. Run an experiment | Completed (★★★, 99 °C) — but the result happened *behind* the Experiments sheet, whose Close button sits below the fold |
| 4. Move / resize / lock an object | All exist, none discoverable: centre drags moved the beaker **0 px**; resize/lock only after ~1,200 px of scrolling inside the side panel |
| 5. Read a reaction in Messages | Completed on the 3rd attempt; Messages = Menu → Messages (2 taps) |

**The blockers (verbatim essence):**
- **K1/B1** — Beaker sunk into the bench: **27% of its height below the bench line**, base on the world's last pixel row (device-confirmed: "half-buried").
- **C2/B2** — Dotted brush: a fast stroke painted **6% of its path**, gaps up to ~186 px. No stamp interpolation.
- **K3** — A beaker cannot be put on a burner, nor a burner under a beaker: all three stacking routes moved **0 px** (placement/move refuses overlap; gear only lands on the floor line). The one arrangement the app exists for was unreachable by hand.
- **N1** — A burner *beside* a beaker heats the water by **0.0 °C** — and "beside" was the only reachable arrangement.
- **C1** — Gear hit-test covered only the glass outline: **7% of a beaker's bbox, 13% of a burner**; the centre was a dead zone. Burner centre taps: 3/3 no-ops (C4).
- **U1** — Selected-object controls buried: Menu → panel (2 taps) + ~1,200 px scroll; GEAR was section 5 of 6 in a 1,978 px panel.
- **U2** — Sheets swallowed the screen: Picker 84% of viewport, Menu/Experiments 80%.
- Plus: a lit burner flooded Messages to a **99+ badge** of identical entries; the world grid **rescaled when chrome opened** (beaker 65×45 → 75×53 px); painted solid sodium hangs in mid-air (engine behaviour, out of scope).

**What three earlier passes missed:** every feature verified in isolation, but only from invisible sweet spots — a 1–2 px glass line, a bottom-edge cell, a button 1,200 px down a hidden panel, a pre-stacked scripted scene. A user touching the *visible body* of things got silent nothing.

## Phase 2 — the rebuild (per fix: before → after)

All work in the UI layer (`sandlab.jsx`, `sandlab-sprites.js`, `src/ui/*`, `src/styles/*`). No engine sim/reaction rules, reaction data, ML1 format, homepage/modes/game-layer logic changed by the feel fixes. Full notes: `hidden_files/feel-fixes.md`.

1. **Brush interpolation** — stamps interpolated between pointer samples at ≤½ brush radius. Fast-stroke coverage **6% → 100%** (landscape grid); on the taller portrait grid the strict path metric reads 67% because sand falls off the painted line before the read — the band itself is visibly gap-free (`feel-after/fast-stroke.png`); Phase 3's method (T5) measures **100% coverage, 0-cell max gap** on the final tree.
2. **Gear lands ON the bench** — **27% → 0%** of the beaker below the bench line.
3. **Full-bbox hit-test** — smallest-bbox `objAtBbox` for tap + drag; the body of a beaker/burner now responds everywhere, centre included.
4. **Stacking by hand** — placement seats both directions with exact adjacency; drag-on and drag-under both seat (raise-first + tryMove offsets). Hand-stacked water reached **98.9 °C** with 243–253 steam cells in Phase 2 verification.
5. **One-tap burner toggle** — tap on the burner body: 2 → 0 → 2, restoring the last level (choice documented in code).
6. **Contextual selection bar** — selecting gear shows only its controls, all word-labelled: **162 px = 18% of viewport height**, 0 extra taps, no scrolling (was: 2 taps + 1,200 px scroll).
7. **Sheets tamed** — 60% vh cap, sticky always-visible Close, experiment Set-up auto-closes so the result is watchable.
8. **World stability** — canvas/world geometry identical with chrome open vs closed (no more rescale).
9. **Messages dedupe** — consecutive duplicates grouped with a ×N chip (live check: "×9 — same reaction repeated", badge "2 new" after a 20 s flood).
10. **Beaker/burner sprites** — built on the user's PR sprites (see incorporation below), extended by fix #12.
11. **On-canvas brush pill + beaker default size L** — implemented, then **superseded by PR #4 reconciliation** (see Phase 3): the pill was removed in favour of main's TouchActionBar as the single brush-size surface.
12. **Visual realism bar** — see UI-LESSONS compliance below. Root cause of the hidden-hero problem found in main's own code: `GlassShell.jsx` used class `toolwrap` while its CSS ships `.mz-shell`/`[data-open]`, so the SETTINGS rail rendered in-flow, always visible. Wiring repaired (content unchanged; verified off-canvas when closed). Mutual exclusivity between surfaces + **light-to-dismiss**: lighting a burner clears every surface so the boil is watchable — proven end-to-end.

## PR #1 incorporation (statement required by the wave brief)

**PR #1 is incorporated.** It reached this wave as **main @ bb90ec34e3** — the parent reviewed and squash-merged PR #1 himself, with content grown beyond the original PR snapshot: ROADMAP.md (v2–v60), `src/ui/GlassShell.jsx`, CSS token/panel/kit additions, `sandlab.jsx` +123/−18, `gl-renderer.js` +9, engine +58 (all additive/opt-in: 192×108 tier, `setMaxParts`, Power Mode gravity via `setGravityStrength`, flight log, and one small realism hunk — viscous-liquid surface-tension sideways hop). The local tree was rebuilt as that main snapshot + the feel edits re-applied by block transplant, every overlap resolved keep-both-intents. **Adaptations recorded:** (a) the original PR diff (saved as `hidden_files/pr1.diff`) was superseded by the main-snapshot route; (b) two inherited breakages in main's `sandlab.jsx` were fixed locally — the duplicated `<GlassShell open={glass} setGlass={setGlass} />` (snapshot lines 2388/2390, plus its stray `</div>`; grep count on the final file == 1) and a duplicated `const [glass, setGlass]` declaration (parse error). The GlassShell dedupe is identical to the official fix later shipped in PR #3. The PR's realistic beaker/burner sprites are the base the feel work built on — not replaced. The wave took **no action** on the PR itself (no close, no comment): it was already merged.

Main moved twice more during the wave and the base was re-synced each time before deploy: **PR #3 (874df19)** — rewritten `tier-engine.js` on real engine TIERS wired into `sandlab.jsx` (`createAdaptiveTiers`), perf.js/gl-renderer +299, Settings +33, official GlassShell fix — and **PR #4 (9fba43b)** — `touch-controls.js` + `TouchActionBar.jsx`, `scene-archive.js`/`scene-history.js` (ML2 archives over the same serialize; ML0/ML1 still load). PR #2 is closed as superseded. The deployed tree is **current main (PR #4) + feel fixes + reconciliation**, confirmed via API after deploy.

## Fix #12 + UI-LESSONS compliance (style principles only — clean-room, nothing copied)

Reference: `~/workspace/matter-lab-shots/reference/UI-LESSONS.md` + VNS/Unreal screenshots (style target only).

| Rule | Status | Evidence |
|---|---|---|
| R1 Hero-first: zero panels over the beaker during the boil | **Met** | `feel-after/hero-boil-nopanels.png`, `feel-tests/t1-boiling-nopanels.png` — light-to-dismiss clears all surfaces |
| R2 Max 3–5 in-world controls; rest behind one menu | **Met** | Boil-state clusters **8 → 4** (default/selection/boil all 4 on the final tree; 5 counting the headless-only graphics-fallback banner that doesn't exist on a WebGL phone) |
| R3 Flame layered + coloured, vessel-sized, unmissable | **Met** | Layered cone (blue core → orange), spans **55% of the seated beaker's width**, licking its base; burner body redrawn on the PR composition: cylindrical brushed-metal gradient, lit base plate + bolts, gas inlet, radial knob, jet ring (render-only overdraw +36%/+12%, geometry untouched) |
| R4 Liquid: translucent, bright meniscus, bubbles, glow on black | **Met** | Meniscus glow pass + brighter surface line in the render layer; bubbles are the engine's real cells |
| R5 Reaction info = one line at top; readouts on demand only | **Met** | One-line ticker at the world top from the app's own `rxEntryLine` data; full Messages feed stays behind Menu |
| R6 One accent colour for in-world controls | **Met with one documented deviation** | Unified to token primary `--ml-c-accent` (green); the Messages badge stays red as an alert convention — documented, deliberate |

**Hero proof:** `feel-after/hero-boil-nopanels.png` — giant beaker (the app's own Resize at 2.6×), thick double-edge glass, legible graduations, translucent blue liquid with bright surface line, big layered flame, steam column, ticker at top, zero panels.

## Phase 3 — task tests on the final deployed tree (before → after)

Harness: `scripts/feel-tasktests.mjs`; full record `hidden_files/feel-tasktests.md`; shots in `feel-tests/`. Gates: **build PASS · verify-local PASS · node tests 25/25**.

| Test | Phase 1 (before) | Final (after) |
|---|---|---|
| T1 Boil job | 16 touch actions, **failed** (20.0 °C, 0 steam) | **PASS — 10 taps** + 4 drags, snap-seated stack, boiling by first 3 s poll, **104.7–137.7 °C**, 95–559 steam cells, no panels in the boil shot |
| T2 Burner toggle from the world | centre taps 3/3 no-ops | **PASS — exactly 1 tap each way** (2→0→2) |
| T3 Beaker fills by painting into it | not directly measured (fill was part of the failed boil) | **PASS — 0 → 926–986 of 989 interior cells** filled by painting |
| T4 Beaker vs bench line | 27% below | **PASS — 0% below** |
| T5 Fast stroke | 6% coverage, gaps ~186 px | **PASS — 100% coverage, 0-cell max gap** |
| T6a Working panels ≤40% | selection controls inside a 1,978 px panel | **PASS — selection bar 17.7% vh, chip strip 17.2% vh** |
| T6b Modal sheets (report-only) | Picker 84%, Menu 80% | Picker **60%**, Menu **60%** (capped; modal state, see PARTIALs) |
| T7 Overlaps @ 360×800 / 412×915 / 768×1024 | panel cut-offs, truncated pills | **PASS — 0 overlapping pairs** at all three |
| T8 UI-LESSONS spot checks | 8 boil-state clusters | **PASS — 4 clusters**, ticker at world top, Messages ×N grouping (×35 peak) |
| T9 ML1 compatibility (added for PR #4) | — | **PASS — genuine ML1 code → clear → import → full restore** (544→0→544 particles; objects [beaker-m, burner] back) |

**Reconciliation with PR #4:** the feel brush pill was **removed** (`data-brushpill` count 0 live) — TouchActionBar is the single brush-size surface, and being in-flow it also eliminates a collision the pill had over bench-spawned vessels. TouchActionBar mount gained `!selObj`: exactly one bar at a time, proven live both ways. Storage untouched by the feel wave; ML2 respected, ML1 verified by T9.

**Deploy + live:** `gh_pages_deploy.py --repo-name matter-lab` → "pages site updated". Live re-check: **verify-live-v3 PASS** (HTTP 200, no errors); the served bundle carries `data-touchbar` / `data-selbar` / `data-ticker` and zero `data-brushpill`; main's pushed source confirmed via API to be the PR #4 + feel + reconciliation composition. PR states (API-queried, no action taken): **#1 merged · #2 closed-superseded · #3 merged (874df19) · #4 merged (9fba43b)**.

## Honest PARTIALs / residuals

1. **Hero composition vs the reference:** in `hero-boil-nopanels.png` the beaker+burner sit on the bench at the frame's bottom — the world is a tall portrait grid and gear lands on the bench; the app's wheel-zoom pans its anchor to the frame top, so a centre-frame VNS-style composition wasn't reachable in the harness. The burner body also stays proportionally smaller than the reference's heating platform: its engine stamp is 16×15 cells and the engine refuses burner resize ≥2.0 while a vessel is seated (render overdraw only partially compensates).
2. **Modal sheets at 60% vh** (T6b) exceed the 40% figure that governs *working-state* surfaces. They are capped (from 80–84%), have sticky Close, and never appear during world work — but if the 40% rule is read as applying to modals too, this is a PARTIAL, reported as measured.
3. **Selection bar can overlay a vessel** at some landing spots (its buttons are pointer-events:auto over the vessel's interior rows). The reliable user path — tap Done, then paint — fills 926–986 cells; a future refinement (auto-dismiss the bar when a paint stroke begins) is noted, not shipped.
4. **Double-tap-Undo can eat a placement** if strokes begin <350 ms apart (Phase-1 item C3, pre-existing gesture conflict, unchanged).
5. **Live verification caveat:** a follow-up live-DOM probe after deploy hit a Chrome tunnel failure; the live PASS rests on verify-live-v3 + the served-bundle markers, not on that probe.
6. **Painted solid sodium hangs in mid-air** (Phase 1 observation) — engine behaviour, outside this wave's no-engine-rules scope.
7. One headless session during Phase 3 died of a renderer failure and did not reproduce on the identical build — environmental, recorded in `feel-tasktests.md`.
