# Matter Lab — UI/UX Redesign Spec-Compliance Report

Date: 2026-11-27 · Build: standalone https://jackbhai.github.io/matter-lab/
Scope law honoured throughout: UI/UX only — no engine rules, reaction data, or ML1 format were touched.

---

## P0 (reopened mid-wave): the black void on the user's phone

### What the evidence shows

| Evidence | Points to |
|---|---|
| Cloud desktop Chrome: BOTH 2D and GL render painted lava visibly | Neither render path is broken in standard Chrome |
| Phone (in-app browser, forced 2D): lava/sand/beaker/burner recorded by the app, screen stays black; the v3 watchdog never fired | The watchdog sampled the canvas **backing store**, which reads back correctly even when nothing is presented — a proven blind spot |
| Cloud zoomed shot: the world floor is a thin strip at the very bottom edge; pooled lava sits **mostly cut off below the visible edge**, even in working Chrome | Geometry: the world's bottom sits at/below the visible edge |
| Code audit (this wave): `.ml-toolwrap { height: 100dvh }`; fullscreen-fallback root (the path in-app WebViews take, since `requestFullscreen` is absent) used `position: fixed; inset: 0` = **layout-viewport** sizing; `.ml-stage` had no `min-height: 0`, so the flex column could not shrink the stage (headless probe reproduced a 45px dock-over-strip overlap from the same overflow) | Geometry defects **confirmed in code**: on a WebView whose visible region is smaller than the layout viewport, the centred letterbox puts the floor — where everything settles and gear lands — below the fold |

**Verdict:** the geometry hypothesis is convicted on code evidence + the cloud observation (floor at the bottom edge, pooled material cut off). The presentation-failure hypothesis is weakened (2D forced on the phone was still black, and no JS API can read the composited screen) but **not acquitted** — the decisive device test (static Stone/Wood mid-screen + beaker check) is still to be run on the device by the parent agent. Both fix families are therefore shipped:

### Fixes shipped

1. **Geometry (new):**
   - `--ml-vh` tracks `window.visualViewport.height` (resize/scroll/orientation listeners); the lab shell (`.ml-toolwrap`, app shell, fullscreen-fallback root) is sized from it instead of `100dvh`/`inset: 0`.
   - `.ml-stage { min-height: 0 }` + canvas `min-height: 0` — the flex column can shrink the stage; the reproduced dock overlap is gone at all viewports.
   - Render-side belt-and-braces: in fullscreen/fullscreen-fallback, the letterbox draw box is clamped to the canvas's **visible** region (canvas rect ∩ visualViewport), and `geomRef` carries the same box so pointer mapping stays exact. No-op when the canvas is fully visible.
2. **Watchdog (reworked):** samples the presented canvas via direct readback **and** a drawImage copy-probe (different rasterizer path), every 15 frames (was 30); 2 strikes → plain-2D fallback + notice; 2 more → "rendering failed" notice. It can no longer sit silent over a black world in any failure mode JS can observe.
3. **Environment pre-emption:** known in-app/WebView user agents (`; wv)`, FBAN/FBAV, Instagram, KakaoTalk, Line) **start** on the plain present path with the fallback notice shown, instead of discovering the failure late.
4. **User escape hatch:** a fourth renderer pref, **Simple** (Tools & controls → View → Renderer), pins the plain path permanently.
5. **Fault-injection gate** `scripts/verify-present.mjs` (16 checks, all PASS): healthy run stays notice-free; `sabotagePresent` (presented black, offscreen fine) → fallback latches → "failed" notice appears in the DOM; WebView UA → session starts latched + notice + world still draws; geometry plumbing (`--ml-vh` == visualViewport, toolwrap height matches, canvas fully inside the visual viewport).
   - Documented blind spot (also in code comments): if a compositor presents black while **both** read paths return the drawn pixels **and** the UA is not a known WebView marker, JS cannot detect it. Mitigations shipped: pre-emption (3), Simple pref (4), geometry fixes (1).

### Numbers fix (steer item 3)

Verified live counts from the engine data: **1,822 substances · 34,775 named reactions · 26 gear items**. `index.html` `<title>`/meta, `manifest.webmanifest`, and `package.json` now all say 1,822 / 34,775 (the title previously said 1,392).

---

## Per-point compliance (the brief)

Before-evidence: `~/workspace/matter-lab-shots/redesign/before/` + `hidden_files/behaviour-audit.md` + `hidden_files/css-audit.md`.
After-evidence: `~/workspace/matter-lab-shots/redesign/after/` (25 screenshots, 8 states × 3 viewports + light theme) + probe.json.

| # | Point | Before (evidence) | Change | After |
|---|---|---|---|---|
| 1 | Design system / replace 165 KB theme.css | theme.css 164,945 B retained as base layer; 7 stylesheets, 200,969 B total; 48 `!important`; `.btn` defined in 5 files; tokens in 3 homes | **Replaced.** New modular set: `tokens.css` (single token home: `--ml-*` + the 16 runtime palette defaults + scoped var blocks + `--amber` defined at last), `base.css`, `kit.css`, `home.css`, `lab.css`, `panels.css` — **43.5 KB total (−78%)**, built only from audited live rules (663 dead OmniTools classes / ~110 KB dead blocks deleted; legacy sheets archived in `hidden_files/legacy-css/`). `!important` 48 → 14. ui-b's fragile component-level import removed; all imports in `main.jsx` in cascade order | Build PASS; after-shots visually equal or better; light theme verified (white bg shot) |
| 2 | Home: 3 cards, live ticker, continue | 3 cards + Continue existed, but Continue read legacy keys and restored nothing; ticker was a static list | Continue now reads the live `matterlab:slots` store (`Game.loadSlots()`, latest by timestamp) and actually restores the session; ticker leads with the user's own discovered reactions (✓-prefixed, most recent first), then the curated list | Home shot (all viewports); Continue code-verified against the live slot store |
| 3 | Main screen: TopBar + Dock + chip strip | In fullscreen the TopBar/Dock were hidden (side rail + wheel instead) — the central non-compliance; rail truncated controls off-screen on the device | TopBar + Dock now render in **all** modes; side rail deleted (its actions moved to the Menu sheet); substance tabs open a **one-row chip strip** docked above the Dock, Expand escalates to the grid sheet, active tab collapses; TopBar Menu button carries the unread badge; long-press info card works (was blocked by the dock overlap) | After-probe: TopBar + Dock present in every state; **0 overlaps, 0 sub-44px targets at 360×800, 412×915, 768×1024** (before: 45px dock×strip + 20px dock×wheel overlaps, 15 small targets, info-card unreachable) |
| 4 | Tool wheel | Wheel existed; "Poke" was listed separately in the brief but the engine has ONE combined stir/poke action | PRIMARY wheel = 9 real tools: Paint, Spray, Erase, **Stir/Poke** (one honest combined entry), Heat, Cool, Spark, Move gear, Fill; popover height capped so it can never slide under the TopBar (was overlapping 13–17px at 360×800) | **PARTIAL (with evidence):** no distinct Poke tool exists in the engine — `TOOLS` has a single `['stir','Stir/Poke']` entry whose drag calls `e.poke(...)`. Inventing a second tool was out of scope (engine behaviour). Everything else compliant; wheel shots at 3 viewports, 0 overlaps |
| 5 | Realistic feel + gestures | Steam/bubble "particles" are simulated engine cells, not sprite effects; bench was flat `#0a0c12` in the canvas area; soft shadows absent; gestures present but gated (shake needs gyro on; swipe = Spark-flick only; tilt-pour has preconditions) | CSS-only realism: bench gradient + plank texture + floor line on `.ml-stage`, canvas/chrome soft shadows via the token shadow set. Gestures unchanged (engine-side) | **PARTIAL (honest):** steam/bubbles reported as what they are — real simulated cells (steam, bubbles rise through liquids), not a particle overlay; adding fake sprite particles over real physics was rejected in v2 already (double-draws the same physics). Bench texture + shadows now present in shots |
| 6 | Teaching | 4-step coach-marks OK (dismissal key `omni:sandlab:seen`); result cards complete; **empty-favourites state missing** | Dock Favourites tab now shows an empty-state hint ("No favourites yet — long-press any substance, then tap ★ Favourite on its card."); coach-marks and result cards (name, equation, explanation, "What happened"/"Why:") unchanged | Hint visible in Dock code + strip state; coach-marks verified in audit flows |
| 7 | Accessibility | aria-label 44 / aria-pressed 10 / role 24 (audit count); viridis heat view bypassed GL (forced 2D); font scaling via `matterlab:fontscale`; reduced-motion + data-motion gate existed in the legacy sheets | All live accessibility rules carried into the modular CSS (base.css motion gate, panels.css font-scale); aria totals re-measured in after-probe (96–162 labels per state incl. dynamic content) | After-probe aria counts per state in probe.json; light + dark themes verified |
| 8 | Split sandlab.jsx | 2,482-line monolith; side panel + picker sheet inline | Extracted `src/ui/Settings.jsx` (158 lines) and `src/ui/Picker.jsx` (126 lines); TopBar/Dock/ToolWheel/InfoCard/GamePanels already separate. sandlab.jsx ≈ 2,050 lines. Two extraction bugs (prop rename, TDZ) were caught by probe and fixed before shipping | Build + verify-local PASS after extraction; all probe flows (enter/skip/picker/strip/expand/menu) work |
| 9 | Verify + screenshots | — | `scripts/verify-local.mjs` PASS, `scripts/verify-present.mjs` PASS (16/16), `scripts/audit-shots.mjs` at 360×800 / 412×915 / 768×1024 × 8 states + light theme | See after-evidence paths above |

## Known PARTIALs / open items

- **Phone acceptance gate (P0):** all headless gates pass, but per the standing phone-only verification rule this is **"deployed, awaiting the user's phone check"** — the world must be seen rendering in the user's in-app browser (and the parent's decisive static-solid test run there) before P0 is called closed.
- Point 4 Poke and Point 5 steam/bubbles: PARTIAL as tabled above, with evidence.
- Capacitor AAB remains PARTIAL (no Android SDK on this machine) — unchanged from v3.
- Main-site (OmniTools) W33-8 hydrogen-pop and the reaction-card template text: untouched, still the user's decisions.

## Live verification (2026-11-27, after final deploy)

- Live `<title>`: "Matter Lab — 1,822 substances, every pair reacts · By Jack Bhai" ✓ (was 1,392)
- Live JS bundle contains the new watchdog/geometry code (`sabotagePresent`, the reworked notice text, `ml-vh`) ✓
- Live CSS bundle: 34,756 B minified, contains the new modular rules (`ml-stripdock`) ✓ — the 201 KB legacy set is gone from production
- Deploy: `gh_pages_deploy.py` → "pages site updated", https://jackbhai.github.io/matter-lab/

## Files

- New CSS: `src/styles/{tokens,base,kit,home,lab,panels}.css`; legacy archived at `hidden_files/legacy-css/`
- Audits: `hidden_files/css-audit.md`, `hidden_files/behaviour-audit.md`
- Gates: `scripts/verify-local.mjs`, `scripts/verify-present.mjs`, `scripts/audit-shots.mjs`, `scripts/probe-stack.mjs`
- Shots: `~/workspace/matter-lab-shots/redesign/{before,mid,mid2,after}/`
