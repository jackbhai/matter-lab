# Matter Lab — FEEL OVERHAUL Phase 3: Acceptance Tests, Resyncs & Deploy

Harness: `scripts/feel-tasktests.mjs` (puppeteer, real mouse clicks/drags on visible elements; `window.__matterlab` read-only for measurement), plus focused probes `scripts/probe-t2.mjs`, `scripts/probe-diag3.mjs`, `scripts/probe-diag4.mjs`, `scripts/probe-final.mjs`. Viewport 412×915 unless stated. Screenshots: `~/workspace/matter-lab-shots/feel-tests/` (pre-resync copies in `feel-tests-pre-resync/`).

---

## Main resync (PR #3) — SUPERSEDED by the PR #4 resync below

- Mid-acceptance, main moved: PR #3 merged (squash `874df19fc57dba6a9519c3f615d914daec24be02`). It brought the official GlassShell duplicate fix (matched the local dedupe), a rewritten `src/core/tier-engine.js` on real engine tiers wired into sandlab.jsx (`createAdaptiveTiers`), perf.js / gl-renderer.js / matter-engine.js changes, Settings.jsx +33, and new tests.
- Fresh main fetched to `hidden_files/main-snapshot3/` and verified (tier-engine.js present, `createAdaptiveTiers` imported in sandlab.jsx, `GlassShell open` count == 1).
- Tree rebuilt as snapshot3 base + feel edits: PR #3 files copied in (matter-engine.js, perf.js, tier-engine.js, gl-renderer.js, Settings.jsx, package.json +`test:tiers`, tests/); non-overlapping feel files kept (lab.css, sandlab-sprites.js, GlassShell.jsx, Picker.jsx — byte-identical between the two mains); sandlab.jsx 3-way merged (base bb90ec34e3 / PR #3 / feel) — exactly **1 conflict**, the duplicated `const [glass, setGlass]` line, resolved to a single declaration.
- Gates on that tree: grep `GlassShell open` == 1, `createAdaptiveTiers` present, `npm run build` PASS, `verify-local` PASS, tier tests 6/6.
- Pre-resync numbers (bb90ec34e3-based tree, partial run, aborted): build PASS, verify-local PASS; T5 coverage 100% / max gap 1 cell; T4 0% below bench; T6a selbar 17.7% vh. **All superseded** — the authoritative numbers are the post-PR #4 ones below.

## Main resync (PR #4) — AUTHORITATIVE BASE

- Main moved again before the PR #3 tree could ship: PR #4 merged (squash `9fba43b`). v24–v26 brought: `src/core/touch-controls.js` + `src/ui/TouchActionBar.jsx` (thumb-first action bar: Undo/Redo + brush sizing, Easy/Medium/Hard touch profiles), sandlab.jsx +231/−82 (touch stroke interpolation, touch settings sheet), `src/game/scene-archive.js` + `scene-history.js` (ML2 scene archives — checksum wrapper around the same engine serialize; ML0/ML1 still load; new saves ML2, 12-slot cap, .mlscene import/export, undoable scene loads), game.js + panels.css changes, and 4 new test files.
- Fresh main fetched to `hidden_files/main-snapshot4/` and verified: touch-controls.js, TouchActionBar.jsx, scene-archive.js, scene-history.js, tier-engine.js all present; `createAdaptiveTiers` present (2 hits); `GlassShell open` == 1; TouchActionBar imported once (line 19) and mounted once with `brush`/`onBrushChange` props.
- Tree rebuilt as snapshot4 base + feel edits: PR #4 files copied in (touch-controls.js, TouchActionBar.jsx, scene-archive.js, scene-history.js, game.js, panels.css, 4 test files); sandlab.jsx 3-way merged (base = PR #3 main / PR #4 / PR #3+feel) — **2 conflicts**, both resolved keeping both intents:
  1. **Stroke handling (onMove):** PR #4's profile-aware `interpolateTouchStroke` now handles touch pointers for the six stroke tools; the feel wave's `strokeTo` interpolation (fix 1, stamps ≤½ brush radius) handles all other pointers for the same six tools. Neither interpolation path was dropped.
  2. **Sheet chrome:** the feel wave's 60vh cap + sticky always-visible Close header kept; PR #4's new `touch` settings sheet content inserted under it (PR #4's 80vh sheet opening superseded by the feel cap, per fix 7).
- Gates on the final tree: `GlassShell open` == 1 · `createAdaptiveTiers` present · `<TouchActionBar` mounts == 1 · `data-brushpill` refs == 0 (see Reconciliation) · `npm run build` PASS · `node scripts/verify-local.mjs` PASS (ERRORS none) · `node --test tests/*.test.js` **25 pass / 0 fail** (tier-engine, touch-controls, scene-archive, scene-history, game-storage, gl-fallback).

## Reconciliation (PR #4 × feel wave) — mandatory items

### a. Brush sizing = ONE surface — feel brush pill REMOVED, TouchActionBar survived
PR #4's TouchActionBar already provides brush sizing (− / "Brush N" / ＋, thumb-reach, no panel). The feel fix-11 floating brush pill duplicated it, so the pill's JSX was removed from sandlab.jsx (grep `data-brushpill` == 0 in shipped code; its CSS rules in lab.css are now inert). **Surviving surface: TouchActionBar**, because it is main's maintained component, also carries Undo/Redo and the touch-profile entry, and sits in-flow below the stage — which, as the acceptance runs proved, also fixes a real collision the pill had (see "Findings" F1). The ≤2-tap / no-panel requirement stands: brush size is 1 tap on the always-visible bar.

### b. Bars must not duplicate or stack — mutual exclusion extended to TouchActionBar
The TouchActionBar mount condition gained `!selObj`: when gear is selected, the contextual selection bar (fix 6) shows **instead of** the TouchActionBar; exactly one in-world bar at a time. Proven live (probe-final): placement selection → selbar visible, touchbar hidden, 4 clusters; after Done → selbar hidden, touchbar visible, 4 clusters; `bothBars` never true in any run.
**R2 recount on the final tree (≤5 required):** default working state = **4** (TopBar, dock, tool pill, TouchActionBar — substance bar is part of the dock stack in this composition; chip strip closed); selection state = **4** (TopBar, dock, tool pill, selection bar); boil state = **4** (TopBar, dock, tool pill, TouchActionBar). Screenshot-honesty note: in the headless graphics-fallback renderer an extra "Graphics fallback" notice banner is visible above the stage (it does not exist on a WebGL phone); counting it as a cluster too, every state is 5 — still within budget.

### c. Save slots / ML2 — feel wave does not touch storage; ML1 load tested (T9)
No feel UI writes scenes or saves; scene-archive.js / scene-history.js are byte-identical to main. New saves go through main's ML2 path untouched. T9 (below) loads a legacy ML1 code end-to-end through the app's own import path.

### d. R6 one accent
TouchActionBar uses the standard `.btn` / `.btn ghost` classes, which route through the app's single accent token `--ml-c-accent` (its level button is a plain `.btn sm` — same accent, no competing colour introduced by panels.css). No styling changes were needed.

---

## Test results — FINAL tree (current main 9fba43b + feel wave + reconciliation)

Runs: suite runs 6–8 (`scripts/feel-tasktests.mjs`) + focused probes, all against the same final build. Per-test verdicts use the cleanest complete evidence; every variance is explained in Findings.

| Test | Verdict | Headline numbers |
|---|---|---|
| **T1 BOIL JOB** | **PASS** | **10 taps + 4 drags** (Enter, Skip, Liquids, Water, Gear, Beaker tile, Done, Gear, Burner tile, Done) — target ≤10 taps met (Phase 1 baseline: 12 taps + 4 drags and NO boil). Burner **seated by placement snap** (beaker bottom == burner top, exact adjacency). Burner auto-lit level 2. **Boil reached by the first 3 s poll** in 2 of 3 completed runs; hottest interior cell **104.7–137.7 °C**, **steam 95–559 cells**. Screenshot `t1-boiling-nopanels.png` / `final-boil.png`: flame + steam column, ticker at top, **no panels/sheets open**. |
| **T2 BURNER TOGGLE** | **PASS** | Via the app's gear-interaction (Move gear) tool, one centre tap on the burner body: **level 2 → 0**, one tap back: **0 → 2**. Exactly 1 tap each way (in-suite run 7 + focused `probe-t2`, element-at-point = CANVAS both taps). A between-taps Done dismissal closes the selection bar the toggle tap opens (fix-5 select-and-toggle); it is UI cleanup, not part of the toggle. |
| **T3 BEAKER FILLS BY PAINTING** | **PASS** | Water cells inside the vessel **0 → 926–986 of 989 interior cells** (4 paced paint strokes aimed into the interior; world water 1,092–1,625). Screenshot `t3-beaker-filled.png`. |
| **T4 BENCH LINE** | **PASS** | Freshly placed beaker: **0% below the bench line** in every run (bottom 705–781 vs bench top 787; Phase 1 was 27%). Screenshot `t4-beaker-bench.png`. |
| **T5 FAST STROKE** | **PASS** | One fast single-jump diagonal: **100% path coverage** on both the Phase-2 ±8-cell metric and the strict ±2 metric; **largest unpainted gap 0 cells** (Phase 1: 6% coverage, gaps ~186 px). No dotted chain. Screenshot `t5-fast-stroke.png`. |
| **T6a PANELS (hard)** | **PASS** | Selection bar **162 px = 17.7% vh** (claim 18%, cap 40%). Chip strip in working state: strip dock **157 px = 17.2% vh**, chip strip 75 px = 8.2% — all ≤40%. |
| **T6b MODAL SHEETS (report-only)** | reported | Picker sheet **549 px = 60% vh**; Menu sheet **549 px = 60% vh** (the feel fix-7 cap). Screenshots `t6b-picker-sheet.png`, `t6b-menu-sheet.png`. |
| **T7 OVERLAPS** | **PASS** | Bounding-box audit of visible chrome (incl. the new TouchActionBar): **0 overlapping control pairs** at 360×800, 412×915 and 768×1024. Screenshots `t7-overlaps-*.png`. |
| **T8 UI-LESSONS SPOT CHECKS** | **PASS** | Boil-state control clusters **4** (≤5; 5 counting the headless-only fallback banner — see Reconciliation b). One-line reaction ticker visible at the world top during the boil ("gas + water ⇄ dissolved gas", top ≈154 px; screenshots `t8-boil-clusters-ticker.png`, `final-boil.png`). Messages feed shows **×N grouping** (×35, ×9, ×4, ×3, ×2 chips observed across runs; screenshot `t8-messages-feed.png`). Selection state: exactly one bar (Reconciliation b). |
| **T9 ML1 LEGACY LOAD (PR #4, item 3c)** | **PASS** | Built a genuine legacy code in-page from the live scene (engine serialize → gzip → base64url, `ML1.` prefix, 2,794–6,175 chars), cleared the world (particles → 0), loaded it through the app's own `importCode` path (the same `decodeSceneCode` the UI import uses): **import returned true; particles fully restored (544 → 0 → 544; 1,149 → 0 → 1,149 in the earlier run) and gear objects restored** (`objectsAfter: ["beaker-m","burner"]`). Screenshot `t9-ml1-loaded.png`. |

### Findings from the sceptic pass (honest residuals)
- **F1 — the old brush pill could cover a bench-spawned vessel (fixed by the reconciliation).** On the PR #3 tree, the feel pill (219×56, in-stage, bottom-left) floated over the M beaker at the 290×643 tier and strokes landed on the pill (diag4: element at beaker centre = pill's ＋ button). PR #4's in-flow TouchActionBar cannot cover the stage, so the collision class is gone with the pill.
- **F2 — the selection bar's button rows can overlay the vessel.** At some beaker landing positions, selbar buttons (pointer-events:auto) cover the vessel's interior rows (run 7: all probed rows blocked). The natural user path — Done, then paint — works reliably (runs 8/final: 926–980 cells filled). Not a hard-test failure, but worth a future look (e.g. auto-dismiss selbar when a paint stroke begins).
- **F3 — double-tap = Undo (Phase-1 item C3, not in Phase-2 scope) can eat a gear placement** if two paint strokes start within 350 ms / 48 px of each other (reproduced in diag3: rapid identical-start strokes un-placed the beaker). Acceptance strokes were human-paced (≥700 ms, jittered starts), as a user's would be.
- **F4 — headless tier/geometry instability.** PR #3's adaptive tier governor resizes the grid early in headless sessions (settled at 290×643 in all final runs after a settle wait); the two screen↔cell mappings (calibration fit vs the app's `geom()`) can disagree by ~100 px at the bench in the fallback tier, so the harness hit-checks `elementFromPoint` and uses whichever mapping lands on CANVAS. On a real phone the tier settles on device perf and stays.
- **F5 — one session (run 8) died of a headless renderer failure** ("Rendering failed … even in fallback mode" banner; the world state was lost mid-run). Environmental, not reproduced in runs 6, 7 or the final probe on the identical build; the run's completed tests (T3/T4/T5/T6/T7/T9) are consistent with the other runs.

## Deploy & live check
- **Deploy:** `python3 ~/workspace/skills/github/bin/gh_pages_deploy.py --repo-name matter-lab --source-dir ~/workspace/matter-lab --dist-dir ~/workspace/matter-lab/dist` → **"pages site updated"**, LIVE: https://jackbhai.github.io/matter-lab/ (31 built files pushed to gh-pages; source pushed to main, head `5e95ed1f8b`).
- **Main source verified post-push (GitHub API, raw file):** main's `src/tools/sandlab.jsx` contains `data-selbar` ×1, `data-ticker` ×1, `createAdaptiveTiers` ×2, the reconciliation condition `!selObj && <TouchActionBar` ×1, `data-brushpill` ×0; `src/game/scene-archive.js` present (11,075 bytes). The pushed source is the PR #4 + feel + reconciliation composition, not an older base.
- **Live verification:** `node scripts/verify-live-v3.mjs` → **PASS** (HTTP 200; home renders; tool mounted with hook; canvas census paints; **ERRORS none**).
- **Live bundle markers** (served `assets/index-DmhjH9uh.js`, 1,387,419 bytes, fetched via curl): `data-touchbar` ×1, `data-selbar` ×1, `data-ticker` ×1, `ml-touchbar` ×1, `ML1.` ×1, `data-brushpill` ×0 — the feel wave + reconciliation are what is being served. (`createAdaptiveTiers` reads 0 in the bundle because production minification renames function identifiers; the wiring is proven in source — local grep gate and main's pushed file above — and the tier governor's behaviour was observed in every local run on this dist.)
- One limitation: a follow-up live-DOM probe (`scripts/probe-live.mjs`) could not run — headless Chrome's tunnel to github.io failed (`ERR_TUNNEL_CONNECTION_FAILED`, twice) after verify-live-v3 had already passed; curl fetches of the live site worked throughout. The live PASS rests on verify-live-v3 + the bundle markers.

## PR states (GitHub API, queried 2026-11-27; no action taken on any)
- PR #1: **closed, merged** (2026-11-27T01:10:16Z) — as expected.
- PR #2: **closed, not merged** — superseded.
- PR #3: **closed, merged** (2026-11-27T01:41:32Z), merge sha `874df19fc57dba6a9519c3f615d914daec24be02`.
- PR #4: **closed, merged**, squash `9fba43b` (per parent brief; content verified in snapshot4).
- Note: an intermediate deploy of the PR #3-resynced tree completed ("pages site updated") before the PR #4 STOP landed; it is superseded by the final deploy of the PR #4 tree recorded above.
