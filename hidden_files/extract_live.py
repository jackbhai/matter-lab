#!/usr/bin/env python3
"""Extract LIVE rule blocks from theme.css: blocks whose selector uses a
live class, element/base selectors, :root blocks, and @keyframes that kept
rules reference. Output: hidden_files/theme-live.css (for hand assembly)."""
import re, sys

SRC = open('src/styles/theme.css').read()
# strip comments
SRC_NC = re.sub(r'/\*.*?\*/', '', SRC, flags=re.S)

LIVE = {'glass','seclabel','dim','sm','sheet','sheet-bg','sheet-handle','btn','ghost',
        'chip','card','state','state-h','state-ic','state-sub','toast','toasts','toast-ic',
        'err','info','out','t-body','t-body-sm','ico'}

def blocks(css):
    """Yield (prelude, body, full) top-level blocks, tracking brace depth."""
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

def selector_classes(sel):
    return set(re.findall(r'\.([A-Za-z0-9_-]+)', sel))

kept, dropped = [], 0
keyframes = {}
media_kept = []
for prelude, body, full in blocks(SRC_NC):
    if prelude.startswith('@keyframes'):
        name = prelude.split()[1]
        keyframes[name] = full
        continue
    if prelude.startswith('@media') or prelude.startswith('@supports'):
        inner_kept = []
        for p2, b2, f2 in blocks(body):
            cls = selector_classes(p2)
            if cls & LIVE or (not cls and not p2.startswith('@')):
                inner_kept.append(f2)
        if inner_kept:
            media_kept.append((prelude, inner_kept))
        continue
    if prelude.startswith('@'):
        kept.append(full); continue
    cls = selector_classes(prelude)
    if cls & LIVE or not cls:   # live class, or element/base/:root selector
        kept.append(full)
    else:
        dropped += 1

# which keyframes do kept rules reference?
kept_css = '\n'.join(kept) + '\n'.join(f for _, fs in media_kept for f in fs)
used_kf = set(re.findall(r'animation(?:-name)?\s*:\s*([A-Za-z0-9_-]+)', kept_css))
# also keyframes referenced by the other live stylesheets / inline styles
import glob
for f in glob.glob('src/styles/*.css') + glob.glob('src/**/*.jsx', recursive=True):
    if f.endswith('theme.css'): continue
    used_kf |= set(re.findall(r'animation(?:-name)?\s*:\s*([A-Za-z0-9_-]+)', open(f).read()))

out = ['/* EXTRACTED LIVE BLOCKS FROM theme.css (auto, for hand assembly) */']
out += kept
for prelude, fs in media_kept:
    out.append(f'{prelude} {{')
    out += fs
    out.append('}')
kf_out = [f'/* @keyframes {n} */\n{keyframes[n]}' for n in sorted(used_kf) if n in keyframes]
out += kf_out
res = '\n\n'.join(out)
open('hidden_files/theme-live.css', 'w').write(res)
print(f'kept bytes: {len(res)}  dropped blocks: {dropped}  keyframes kept: {sorted(used_kf & set(keyframes))}  keyframes missing: {sorted(used_kf - set(keyframes))}')
