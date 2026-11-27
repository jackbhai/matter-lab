# Matter Lab — CSS Archaeology Audit (READ-ONLY)

Date: 2026-11-27 · Scope: `src/styles/*.css` vs `src/**/*.{jsx,js}` in the standalone Matter Lab repo.
No source file was edited. Method: scripted extraction (Python `re` over comment-stripped CSS + JSX `className` parsing), cross-checked by hand for dynamically-built classes. Raw extraction dumps were produced during the audit; headline numbers below are the verified ones.

**Counting conventions (read before quoting numbers)**
- "Rule blocks" = number of `{ … }` blocks in the comment-stripped file (includes `@media`/`@keyframes` inner blocks). It is a block count, not a selector count.
- "Distinct classes" = distinct `.class` names appearing in any selector of that file (compound selectors count each class once).
- "Used" = appears in a JSX `className` string / template literal / ternary in `src/**/*.jsx`, **plus** three classes only reachable dynamically (see §2d). Plain `.js` data files contain no JSX and no `classList`/`className=` manipulation anywhere in `src` (verified by grep — zero hits), so they contribute no classes. ⚠️ A naive "any quoted string in any .js file" pass inflates the used set with ordinary English/data words (`active`, `bus`, `coin`, `state`…) — those are element/reaction data strings, **not** classes, and are excluded here.

---

## 1. Per-file inventory

Import order (`src/main.jsx`): theme.css → w31-tools.css → w31-systems.css → ml-v2.css → tokens.css → ui-a.css. Plus ui-b.css imported by `src/tools/sandlab.jsx`.

| File | Bytes | Lines | Rule blocks | Distinct classes | `!important` | `@keyframes` / `@media` | Characterisation |
|---|---:|---:|---:|---:|---:|---:|---|
| theme.css | 164,945 | 2,651 | 1,492 | 687 | 29 | 64 / 35 | The inherited OmniTools design system: global base/reset, type ramp, and the full OmniTools surface library — home catalogue, music/party player, IPTV, maps, AI assistant, ~15 mini-games, settings/themes, skeletons. |
| w31-tools.css | 5,458 | 91 | 36 | 29 | 0 | 3 / 1 | W31 Phase-5 "tool-scope treatments": ToolFrame hero art/mesh, empty-state radar animation, editor/game/calculator flourishes for OmniTools tools. |
| w31-systems.css | 8,378 | 169 | 48 | 46 | 11 | 0 / 1 | W31 Phase-6 personalisation systems: rules keyed to the `<html>` attributes `settings.js` writes (`data-density`, `data-icons`, `data-motion`, `data-mood`, `--uiscale`), Day-theme parity, focus completion, print. |
| ml-v2.css | 9,007 | 172 | 72 | 43 | 0 | 1 / 2 | Matter Lab v2 "lab-glass" identity: `[data-ml-shell]` re-points the legacy palette vars to a deep slate/teal lab palette, plus all `ml-*` homepage styles. |
| tokens.css | 1,988 | 54 | 1 | 0 | 0 | 0 / 0 | Single `:root` block: the `--ml-*` token set (35 vars) aliasing the legacy theme vars — the intended single source of truth. No selectors. |
| ui-a.css | 8,980 | 188 | 51 | 25 | 7 | 1 / 3 | UI-A lab chrome (loaded last in main.jsx): top bar, dock, tool wheel, rail, picker head, stage, panel-fit/scroll fixes — scoped to `[data-mlroot]` / `.ml-*`. |
| ui-b.css | 2,213 | 40 | 20 | 12 | 1 | 0 / 1 | UI-B game-layer surfaces + accessibility: font-size scaling via `--ml-fsmul` keyed to `[data-mlroot][data-fs=…]`, progress/home tweaks. Imported by sandlab.jsx, so it lands after ui-a.css in the bundle cascade. |
| **Total (all 7)** | **200,969** | **3,365** | **1,720** | — | **48** | — | Main.jsx bundle alone (excl. ui-b.css): 198,756 bytes. |

theme.css alone is **82.1 %** of all CSS bytes (164,945 / 200,969).

---

## 2. Class cross-reference

### 2a. Classes USED by this app (strict JSX extraction)

- Distinct classes used across all JSX: **87** literal (in `className` strings/templates) **+ 4 dynamic-only** (`err`, `info`, `out`, `radar` — §2d) = **91 total**.
- Of these, defined in theme.css: **24**. Defined only in the newer files: **66**. Defined nowhere: **1** (§2c).

Per-source-file used counts (distinct, literal): HomePage.jsx 43 · sandlab.jsx 18 · kit.jsx 11 · ToolWheel.jsx 10 · Dock.jsx 9 · InfoCard.jsx 6 · GamePanels.jsx 5 · TopBar.jsx 3 · App.jsx 1 · sandlab-tiles.jsx 1 · icons.jsx 1 · Logo.jsx 0.

### 2b. theme.css classes USED by this app — 24, grouped by surface

| Surface | Classes (24) | Where used |
|---|---|---|
| App shell / home | — none — | The shell/home uses **zero** theme.css classes: App.jsx is only `.ml-toolwrap` and HomePage.jsx is entirely `ml-*` (ml-v2.css). theme.css contributes to the home page only via element/base styles and CSS variables. |
| Lab chrome / panels | `glass`, `seclabel`, `dim` | sandlab.jsx (rail cards, reaction cards, notices, side panel), GamePanels.jsx, InfoCard.jsx |
| Picker / tiles | `sm` (tile name text) | sandlab-tiles.jsx `Tile`/`MiniTile` — note the tiles themselves are **inline-styled**; no theme tile class is used (theme's `.tile` is dead here) |
| Sheets | `sheet`, `sheet-bg`, `sheet-handle` | sandlab.jsx, InfoCard.jsx (bottom-sheet chrome) |
| Buttons / kit | `btn`, `ghost`, `sm`, `chip`, `card` | sandlab.jsx / Dock.jsx / GamePanels.jsx (`btn sm`, `btn ghost sm` patterns), kit.jsx `Card` → `.card` |
| Game panels | `glass`, `btn`, `ghost`, `sm`, `dim` (shared with lab chrome above) | GamePanels.jsx (discoveries, achievements, coach marks) — no game-specific theme class is used |
| Misc — state & toast kit | `state`, `state-h`, `state-ic`, `state-sub`, `toast`, `toasts`, `toast-ic`, `err`, `info`, `out` | kit.jsx `Empty` + `Toaster` (`err`/`info`/`out` are dynamic — §2d) |
| Misc — typography / icons | `t-body`, `t-body-sm`, `ico` | kit.jsx `Empty` text ramp; icons.jsx wraps every icon in `.ico` |

Used theme.css rule blocks: **115** of 1,492 blocks carry at least one used class.

### 2c. theme.css classes NEVER used in this standalone app — DEAD

- **663 of 687 distinct theme.css classes (96.5 %) are never used.**
- Byte estimate (method: a rule block counts as dead only if *every* class in its selector is unused — shared/element-only blocks excluded, so this is conservative): **1,091 dead rule blocks ≈ 109,595 bytes** of theme.css's 133,382 comment-stripped block bytes — i.e. **≈ 66 % of the file's raw 164,945 bytes is provably dead by this method alone**; the true dead share is higher (dead classes also ride inside mixed selectors, dead `@keyframes` — 64 defined, the app needs only a handful — and dead `[data-theme="light"]` overrides for dead surfaces).

Examples by dead family (all defined in theme.css, none present anywhere in this app's JSX):

| Dead family | Example classes | What it was for in OmniTools |
|---|---|---|
| AI assistant | `ai-ava, ai-body, ai-check, ai-composer, ai-dot, ai-full, ai-head, ai-hint, ai-iconbtn, ai-nowp, ai-nowp-main, ai-row, ai-spin, ai-status, ai-step, ai-steps, ai-summary, ai-title, aifab, aifab-backdrop, aifab-menu, aifab-menu-h, aifab-menu-note` (23) | Omni AI chat + floating AI button |
| Music "party" player | `party-art … party-viz-modes` (36), `art, art-disc, art-hole, art-in, art-in2, art-sheen, art-wrap, mini, mini-art, mini-btn, mini-ph, mini-prog, mini-restore, mini-row, mini-ttl, mini-txt, lyr, lyr-plain, lyr-src, lyrics, seek, seektrack, seekwrap, vol, volbtn, volpct, volrow, qbars, qchip-x, qchips, qhead, qnow, qnum, qrow-act, qrow-wrap` | Full music player, mini-player, lyrics, queue |
| IPTV / TV | `tv-bar, tv-grid, tv-letter, tv-logo, tv-overlay, tv-screen, tv-tile, tv-video` | TV channel grid |
| Mini-games | `g2048 (+ v2…v8192 tile values), c4-cell, c4-cols, c4-grid, ttt-cell, ttt-grid, sud-cell, sud-grid, sud-pad, ms-cell, ms-grid, mm-fb, mm-pal, mm-palette, mm-peg, mm-pegs, mm-pin, mm-row, mm-rows, hanoi (+base/disk/peg/rod), simon-grid, simon-pad, snake-cv, mole, mole-grid, mole-hole, dice-pair, dice-side, dice-stage, die-pip, bj-cards, bj-row, bj-table, rps-side, rps-stage, wheel-pin, wheel-svg, wheel-wrap, gseq-cell, gseq-grid, s15-grid, s15-tile, stroop-card, stroop-word, reflex-panel, aim-box, aim-clock, aim-start, aim-tgt` | 2048, Connect-4, TicTacToe, Sudoku, Minesweeper, Mastermind, Hanoi, Simon, Snake, Mole, Dice, Blackjack, RPS, Wheel, Stroop, aim trainer… |
| Maps | `leaflet-bar, leaflet-container, leaflet-control-attribution, leaflet-tooltip, leaflet-tooltip-top, mapbox, mapleaf, mapnote, mapsketchwrap, mapslot, mapswap, locbar` | Leaflet maps / metro / trip tools |
| OmniTools home catalogue | `catcard (+chev/ctl/d/ic/n/n2/p/tx), catface, catgrid, catview-grid, catview-h, catview-ic, catview-tx, cats, hubhead, hubico, shelf, shelf-chip, shelf-col, shelf-empty, shelf-row, app-greet, apptabs, sidenav` | Tool catalogue home of the suite |
| Legacy shell chrome | `topbar, nav, nav-ind, tb-dots, tb-home, tb-overflow, tb-sheet, tb-sheet-bg, tb-t, tb-wide, tb1, tb2, tb3, tbmeta, tbwhy, sb-* (14: backdrop/burger/clear/close/count/foot/head/item/n/open/scroll/search/sec/secbtn), bootcine (+aurora/mark/sub), install-banner, offlinebar, scrollprog, scrolltop` | Old OmniTools topbar/sidebar/boot cinema/PWA banners — replaced here by ml-v2/ui-a chrome |
| Settings / themes UI | `theme-card, theme-color-dot, theme-colors, theme-grid, theme-preview, shortcuts-list, shortcuts-row, layout-edit, layout-row, editpanel, editrow, edittools` | OmniTools Settings screens (no Settings page exists in this app) |
| Skeletons / misc tools | `skel, skel-card, skel-grid, skel-line, skel-pgrid, skel-poster, tile-skel, view-skel, eqband, eqdb, eqhz, eqrow, db-box, db-dot, db-edge, db-row, db-wrap, dl-size, dl-thumb, poster-* , stream-* , pal-* (17, command palette), math-card, math-q, maze-svg, reader-paper, rec-btn, rec-dot, viz, vizb, vizbox, vizpick, welcome-card, welcome-dots, welcome-ov, notfound, legal` | EQ, downloads, posters, streaming, command palette, welcome/onboarding, etc. |

(Full 663-class dead list is reproducible from the method in the header: theme.css selector classes minus the 24 in §2b.)

### 2d. Dynamic classes (hand-verified — a literal-only scan misses these)

| Class | Construction site | Defined in |
|---|---|---|
| `err`, `info` | kit.jsx Toaster: `` className={`toast ${t.kind} …`} ``, kind ∈ `ok`/`err`/`info` (`ok` has no dedicated rule — default `.toast` styling) | theme.css (`.toast.err`, `.toast.info`, `.toast.err .toast-ic`, `.toast.info .toast-ic`) |
| `out` | kit.jsx Toaster: `` ${t.out ? 'out' : ''} `` (exit fade) | theme.css (`.toast.out`) |
| `radar` | kit.jsx Empty: `` className={`state-ic ${icon === 'search' ? 'radar' : ''}`} `` | **w31-tools.css** (`.w31-empty .state-ic.radar`) — not theme.css |

All other template-literal classNames in the app only toggle `ghost` or `''` (already counted).

### 2e. Classes USED in JSX but NOT defined in theme.css — 66

| Defined in | Classes |
|---|---|
| ml-v2.css (34) | `ml-about, ml-brand, ml-brand-name, ml-btn, ml-btn-ghost, ml-btn-lg, ml-btn-sm, ml-card, ml-exp-btn, ml-exp-list, ml-exp-name, ml-feature-list, ml-footer, ml-h2, ml-h3, ml-hero, ml-hero-credit, ml-hero-cta, ml-hero-sub, ml-hero-title, ml-hint, ml-home, ml-modes, ml-scenes, ml-section, ml-section-sub, ml-stat, ml-stat-num, ml-stats, ml-thumb, ml-thumb-canvas, ml-ticker, ml-ticker-item, ml-ticker-tag, ml-ticker-viewport, ml-toolwrap, ml-topbar, ml-topbar-link` (overlaps with ui-a/ui-b for a few — §3) |
| ui-a.css (16) | `ml-chipstrip, ml-dock, ml-dock-dot, ml-dock-tab, ml-empty-hint, ml-picker-head, ml-picker-hint, ml-picker-title, ml-pour, ml-rail-btn, ml-rail-label, ml-stage, ml-tb-btn, ml-tb-stats, ml-topbar2, ml-wheel, ml-wheel-btn, ml-wheel-cur, ml-wheel-grid, ml-wheel-more, ml-wheel-pop` (21 names; 16 exclusive to ui-a, rest shared with ml-v2/ui-b per §3) |
| ui-b.css (2 exclusive) | `ml-progress, ml-progress-line` (font-scale rules in ui-b also re-style theme's `.sm/.btn.sm/.chip/.seclabel` — §3) |
| w31-tools.css (1) | `w31-empty` (+ dynamic `radar`, §2d) |
| **Defined NOWHERE (1)** | **`ml-scene-card`** — used in HomePage.jsx (`className="ml-card ml-scene-card"` on scene articles); no rule exists in any CSS file. It currently renders purely on `.ml-card`. Either a missing rule or a vestigial class — the redesign must decide. |
| Inline styles instead of classes | Picker tiles (sandlab-tiles.jsx), most sandlab.jsx panels/notices, GamePanels cards: layout/spacing/borders are largely inline `style={{…}}`, consuming theme vars (`var(--cyan)`, `var(--line)`, `var(--sh-1)`) directly. |

---

## 3. Duplication / conflicts

- **53 distinct classes are defined in more than one file.** Worst offenders:
  - `.btn` — defined in **5 files** (theme, w31-systems, ml-v2, ui-a, ui-b). Final effect depends on import order + sandlab.jsx's late ui-b import.
  - `.chip` — theme, ui-a, ui-b · `.sm` — theme, ml-v2, ui-b · `.glass` — theme, ui-b · `.seclabel` — theme, ui-b · `.sheet` — theme, ui-a.
  - Type ramp `.t-body, .t-body-sm, .t-caption` — theme, w31-tools **and** w31-systems (triple definition).
  - `.on, .stat, .t-*` family, `.state-ic, .skel, .skel-line, .toolframe-*` — theme ∩ w31-tools (15 shared) and theme ∩ w31-systems (**32 shared**: `app, card, catcard-ic, chev, cont-ic, fold-h, ic, ico, install-banner, live, meshbg, outline-num, row, sb-foot, tab, tile, topbar, view, aifab…` — mostly w31-systems re-skinning theme surfaces under personalisation attributes).
  - Newer files among themselves: `ml-dock-tab, ml-tb-btn` (ui-a ∩ ui-b), `ml-ticker-track` (ml-v2 ∩ ui-a), `ml-exp-goal, ml-home, ml-stat-label` (ml-v2 ∩ ui-b).
- **`!important` per file:** theme.css **29** · w31-tools.css 0 · w31-systems.css **11** · ml-v2.css 0 · tokens.css 0 · ui-a.css **7** · ui-b.css **1** — **48 total**. ui-a's are panel-fit overrides fighting theme.css layout (`[data-mlroot] [data-sidepanel] { left: 80px !important; … }`); w31-systems' are personalisation/Day-parity overrides. A clean modular rewrite should need ~0 outside a utilities layer.
- Cascade hazard: ui-b.css is imported from a *component* (sandlab.jsx), not main.jsx — its position in the final bundle depends on module graph order, yet it re-defines `.btn/.chip/.glass/.sm/.seclabel`. This is the single most fragile ordering dependency in the current setup.
- Variable-level duplication mirrors the class duplication: `--glass-bg, --glass-border, --glass-edge, --glass-blur, --sh-col, --sh-col-soft, --bloom, --bloom-dot, --d-1…--d-4, --ease-spring, --gap-card, --gap-section, --row-h` are defined in theme.css **and** re-defined in w31-systems.css and/or ml-v2.css (see §4).

---

## 4. Variable inventory

### theme.css definitions
- **75 distinct custom properties** defined across the file. The main `:root` (lines 5–76) defines 47: palette `--bg, --s1, --s2, --s3, --line, --line2, --green, --green-dim, --cyan, --cyan-dim, --grad, --fg, --fg2, --fg3, --warn, --bad`; radii `--r, --r-sm` (+ `--r-xs, --r-lg, --r-xl, --r-pill` later); spacing `--sp-1…--sp-16` subset, `--pad-screen, --gap-section, --gap-card, --row-h, --row-h-dense`; shadows `--sh-0…--sh-3, --sh-col, --sh-col-soft, --hairline, --edge-hi`; glass `--glass-bg, --glass-blur, --glass-border, --glass-edge`; motion `--ease, --ease-out, --ease-spring, --ease-move, --d-1…--d-4, --pulse, --theme-transition`; fonts `--font-display, --font-body, --font-mono, --font-dev, --font-ar, --font-pa, --font-ur`; safe areas `--safe-b, --safe-t`; plus stragglers `--aqi-mod, --bloom, --bloom-dot, --ca, --lp, --ptrp`.
- Further `:root` blocks at lines 732 (`--theme-transition`), 1224 (`--ease`) and 1370 re-define/extend tokens mid-file — the file has **at least 4 separate `:root` blocks**.
- `var(--…)` consumption: **1,386** `var()` uses in theme.css alone.

### How light/dark is actually switched — three layered mechanisms
1. **Runtime inline vars (the live one):** `src/core/theme.js` `applyTheme()` writes the palette as **inline styles on `<html>`** via `root.style.setProperty(...)`, which beats every stylesheet rule. It also sets `root.dataset.theme = 'dark' | 'light' | 'custom'` and `color-scheme`.
2. **Stylesheet `[data-theme="light"]` overrides in theme.css** (~35 blocks, e.g. lines 750–1990): surface-specific light fixes for `.topbar, .nav, .tile, .card, .glass, .glow, .art, .mini, .tripbar, .note, .chip.w, .viarow.now, .tlseg, .leaflet-*`, form controls, scrollbar, plus one var swap (`--aqi-mod`). Most of these target **dead classes**; the live ones are `.card` and `.glass`. There is also a vestigial `[data-theme="custom"]` block (comment only, no rules). A comment in theme.js (line ~248) records these rules "were dead because nothing ever set the attribute" until theme.js was fixed to set it.
3. **Shell re-skin:** ml-v2.css's `[data-ml-shell]` block re-points the same legacy vars (`--bg, --s1…--s3, --line…, --fg…, --cyan, --green, --glass-*`, 22 vars) to the always-dark lab palette for the lab/home shell, regardless of the selected theme.

`settings.js` adds a fourth layer: `applyPersonalisation()` sets `--uiscale`, guarded accent overrides `--green/--cyan/--grad`, and `data-density / data-icons / data-motion / data-mood` attributes on `<html>` — the attributes w31-systems.css keys off.

### tokens.css aliases (`--ml-*`, 35 vars, all in one `:root`)
Colour aliases of the legacy vars: `--ml-c-bg→--bg, --ml-c-surface→--s1, --ml-c-surface-2→--s2, --ml-c-surface-3→--s3, --ml-c-line→--line, --ml-c-line-2→--line2, --ml-c-fg→--fg, --ml-c-fg-2→--fg2, --ml-c-fg-3→--fg3, --ml-c-accent→--green, --ml-c-accent-2→--cyan, --ml-c-warn→--warn, --ml-c-bad→--bad`; glass `--ml-glass→var(--glass-bg, …)`, `--ml-glass-edge`; elevation `--ml-shadow, --ml-shadow-sm`; radii `--ml-r-sm/md/lg/pill` (8/12/16/999px); spacing `--ml-sp-1…5` (4/8/16/24/32px); type `--ml-fs-xs/sm/md/lg/xl/2xl` (11/12.5/14/17/22/30px); `--ml-touch: 44px`, `--ml-dur: 180ms`, `--ml-ease`.
Note: ui-a.css re-declares `--ml-glass` on `[data-ml-shell]` (round-2 token-scope fix) and ui-b.css defines `--ml-fsmul` — the "single token set" already has 3 homes.

### Vars theme.js sets at runtime
Every preset in `THEMES` (dark, light, amoled, ocean, forest, sunset, midnight, + custom/`my:*`) carries the **same 16 vars**: `--bg, --s1, --s2, --s3, --line, --line2, --green, --green-dim, --cyan, --cyan-dim, --grad, --fg, --fg2, --fg3, --warn, --bad` — written inline on `<html>` (117 `'--…'` literal occurrences in the file = 16 vars × 7 presets + derived `--grad` fallback + `color-scheme`). **These 16 are the irreducible runtime contract**: any replacement CSS must keep these names (or theme.js must be rewritten with it).

---

## 5. Modularisation plan (theme.css replacement)

Keep tokens.css as the token layer (promote the 16 runtime vars into it as defaults), keep ml-v2/ui-a/ui-b content but fold it into the modules below, delete w31-* except the two live fragments noted.

| Proposed module | Contents moved in | Source |
|---|---|---|
| `styles/tokens.css` (exists — extend) | All `--ml-*` tokens + the 16 theme.js palette vars as `:root` defaults + `[data-theme="light"]` var-level swaps only (no per-surface light rules) | tokens.css (1,988 B) + theme.css `:root` blocks |
| `styles/base.css` | Reset, `html,body,#root` sizing, body font/bg, scrollbar, focus-visible, reduced-motion gate, keyframes actually used (fade/draw-on for toast/state icons) | theme.css base sections + w31-systems focus/print fragments |
| `styles/kit.css` | `.btn, .ghost, .sm, .chip, .card, .ico, .dim, .seclabel, .t-body, .t-body-sm, .glass, .state, .state-h, .state-ic, .state-sub, .toasts, .toast, .toast-ic, .toast.err/.info/.out` — i.e. **all 24 live theme classes**, one definition each | theme.css (115 live blocks) + w31-tools `.w31-empty .state-ic.radar` fragment |
| `styles/home.css` | All `ml-*` homepage classes (hero, modes, scenes, stats, ticker, exp list, footer, topbar) + a real `.ml-scene-card` rule (fixes §2e orphan) | ml-v2.css |
| `styles/lab.css` | Lab chrome: `.ml-stage, .ml-pour, .ml-empty-hint, .ml-rail-btn, .ml-rail-label`, side-panel fit rules (currently ui-a's `!important` block — rewrite as plain scoped rules), sheet family (`.sheet, .sheet-bg, .sheet-handle` if not kept in kit) | ui-a.css + theme.css sheet blocks |
| `styles/panels.css` | TopBar/Dock/Wheel/GamePanels: `.ml-topbar2, .ml-tb-btn, .ml-tb-stats, .ml-dock, .ml-dock-tab, .ml-dock-dot, .ml-chipstrip, .ml-wheel*`, `.ml-picker-head/title/hint`, game-panel + progress styles (`.ml-progress, .ml-progress-line`), font-scale `[data-fs]` rules | ui-a.css + ui-b.css |
| `styles/personalisation.css` (optional, small) | Only the attribute-driven rules whose attributes settings.js still writes and that touch live surfaces (`data-motion` reduced gate, `--uiscale` type step, `data-fs`) | w31-systems.css (subset) |

**Deleted as dead:** all 663 unused theme.css classes (§2c families: AI, party/music, TV, 15+ mini-games, Leaflet/maps, catalogue, legacy topbar/sidebar, settings/themes UI, skeletons, command palette, welcome, EQ/downloads/posters/streaming…), 1,091 dead rule blocks ≈ **109,595 bytes from theme.css**; w31-tools.css except the `.w31-empty`/radar fragment (~5 KB of 5,458 B); w31-systems.css except the personalisation subset (~6–7 KB of 8,378 B); all duplicate `.btn/.chip/.sm/.glass/.t-*` re-definitions (53 multi-defined classes → 1 definition each); ~45 of 48 `!important`s.

**Estimated final size:** live theme.css content ≈ 115 blocks ≈ 15–20 KB after de-duplication, + ml-v2 9 KB + ui-a 9 KB + ui-b 2 KB + tokens ~3 KB + base/personalisation ~5 KB ⇒ **≈ 43–48 KB total, vs 200,969 bytes today — a ≈ 76–79 % reduction**, with one token set (`--ml-*` + the 16 runtime palette vars) and zero component-level CSS imports (ui-b's sandlab.jsx import should move back to main.jsx).

**Risks / must-preserve for the replacement**
1. theme.js writes 16 palette vars **inline on `<html>`** — renaming them breaks every preset incl. custom/`my:*` themes unless theme.js changes in the same commit.
2. `[data-ml-shell]` (ml-v2) and `[data-mlroot]`/`[data-fs]`/`[data-*]` attribute scopes (ui-a/ui-b/settings.js) are load-bearing selectors, not decoration.
3. Inline styles across sandlab.jsx/GamePanels/tiles consume `var(--cyan), var(--line), var(--sh-1), var(--safe-b), var(--amber)` (note: `--amber` is **not defined anywhere** — always falls back to `#e8a13a`) — token renames must grep inline styles too, not just CSS files.
4. `.ml-scene-card` (HomePage) and `--amber` are the two known undefined references; decide them explicitly in the redesign instead of carrying them over.
