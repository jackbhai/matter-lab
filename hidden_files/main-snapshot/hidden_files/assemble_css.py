#!/usr/bin/env python3
"""Assemble the modular CSS from the audited sources.
Routing is block-level by selector class; the [data-ml-shell] block is
split at declaration level (vars -> tokens, paint -> lab)."""
import re

def blocks(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    i, n = 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j == -1: break
        prelude = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        yield prelude, css[j+1:k-1], css[i:k]
        i = k

def first_classes(sel):
    return re.findall(r'\.([A-Za-z0-9_-]+)', sel)

tokens_extra, base_extra, kit, home, lab, panels = [], [], [], [], [], []

# ---- theme drafts ----
tokens_extra.append(open('hidden_files/theme-tokens.css').read())
base_extra.append(open('hidden_files/theme-base.css').read())
kit.append(open('hidden_files/theme-kit.css').read())

# ---- ml-v2.css ----
LAB_ML = {'ml-toolwrap'}
for prelude, body, full in blocks(open('src/styles/ml-v2.css').read()):
    if prelude.startswith('[data-ml-shell]') and '--' in body:
        decls = [d.strip() for d in body.split(';') if d.strip()]
        vars_ = [d + ';' for d in decls if d.startswith('--')]
        paint = [d + ';' for d in decls if not d.startswith('--')]
        if vars_: tokens_extra.append('[data-ml-shell] {\n  ' + '\n  '.join(vars_) + '\n}')
        if paint: lab.append('[data-ml-shell] {\n  ' + '\n  '.join(paint) + '\n}')
        continue
    cls = first_classes(prelude)
    if cls and cls[0] in LAB_ML: lab.append(full)
    else: home.append(full)

# ---- ui-a.css ----
PANELS_CLS = {'ml-topbar2','ml-tb-btn','ml-tb-stats','ml-dock','ml-dock-tab','ml-dock-dot',
              'ml-chipstrip','ml-wheel','ml-wheel-btn','ml-wheel-cur','ml-wheel-grid','ml-wheel-more',
              'ml-wheel-pop','ml-picker-head','ml-picker-title','ml-picker-hint','ml-ticker','ml-ticker-track'}
for prelude, body, full in blocks(open('src/styles/ui-a.css').read()):
    if prelude.startswith(':root') or (prelude.startswith('[data-ml-shell]') and '--' in body):
        tokens_extra.append(full); continue
    cls = first_classes(prelude)
    if 'data-sidepanel' in prelude:
        # retire the rail-era override: Settings.jsx now inlines left:8px
        if 'left' in body and '80px' in body: continue
    if cls and cls[0] in PANELS_CLS: panels.append(full)
    else: lab.append(full)

# ---- ui-b.css -> panels (chrome + font-scale + progress) ----
panels.append(open('src/styles/ui-b.css').read())

# ---- w31-tools.css: only the live Empty/radar fragment -> kit ----
for prelude, body, full in blocks(open('src/styles/w31-tools.css').read()):
    if 'w31-empty' in prelude or 'radar' in prelude or prelude.startswith('@keyframes') and 'radar' in prelude:
        kit.append(full)
    if prelude.startswith('@keyframes') and ('w31-drawon' in prelude or 'w31-radar' in prelude or 'w31-float' in prelude):
        base_extra.append(full)

# ---- w31-systems.css: live fragments only ----
for prelude, body, full in blocks(open('src/styles/w31-systems.css').read()):
    if prelude in ('.t-body', '.t-body-sm') or 'data-density' in prelude and '.btn' in prelude:
        kit.append(full)
    elif 'data-density' in prelude and '--' in body:
        tokens_extra.append(full)
    elif 'data-theme="light"' in prelude and '--glass' in body:
        tokens_extra.append(full)
    elif 'data-motion' in prelude:
        base_extra.append(full)

HDR = '/* Matter Lab modular CSS — generated in the UI-redesign wave from the\n   audited live rules only (see UI-REDESIGN-REPORT.md). Do not re-add\n   legacy OmniTools surfaces here. */\n'

tokens = open('src/styles/tokens.css').read().rstrip() + '\n\n/* palette defaults + scoped var blocks (ex-theme.css / ex-ml-v2 / ex-w31-systems) */\n' + '\n\n'.join(tokens_extra) + '\n/* the lab accent the old code referenced but never defined */\n:root { --amber: #e8a13a; }\n'
base = HDR + '\n\n'.join(base_extra) + '\n'
kit_css = HDR + '\n\n'.join(kit) + '\n'
home_css = HDR + '\n\n'.join(home) + '\n/* scene cards (class was used in HomePage but never defined) */\n.ml-scene-card { position: relative; overflow: hidden; }\n'
lab_css = HDR + '\n\n'.join(lab) + '\n/* redesign fixes: centre the empty hint (rail retired) */\n.ml-empty-hint { left: 50%; }\n'
panels_css = HDR + '\n\n'.join(panels) + '''
/* redesign additions: inline chip strip dock + TopBar unread badge */
.ml-stripdock { position: relative; z-index: 30; margin: 0 2px; border-radius: var(--ml-r-lg); padding: 6px 8px; }
.ml-tb-badge { position: absolute; top: 2px; right: 2px; min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 999px; background: var(--bad, #e5534b); color: #fff; font-size: 10.5px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center; pointer-events: none; }
/* brief law: minimum 44px touch targets on compact buttons */
.btn.sm { min-width: 44px; min-height: 44px; }
.ml-wheel-grid .btn { white-space: nowrap; font-size: 12.5px; }
'''

for name, txt in [('tokens', tokens), ('base', base), ('kit', kit_css), ('home', home_css), ('lab', lab_css), ('panels', panels_css)]:
    open(f'hidden_files/new-{name}.css', 'w').write(txt)
    print(name, len(txt))
