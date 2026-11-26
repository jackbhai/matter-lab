#!/usr/bin/env python3
"""Split hidden_files/theme-live.css into module drafts:
   tokens part (:root blocks), base part (element/base + keyframes),
   kit part (class rules + media). Prints a manifest for hand assembly."""
import re

SRC = open('hidden_files/theme-live.css').read()
SRC = re.sub(r'/\* EXTRACTED.*?\*/', '', SRC, flags=re.S)

def blocks(css):
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

tokens, base, kit = [], [], []
for prelude, body, full in blocks(SRC):
    if prelude.startswith('@keyframes'):
        base.append(full); continue
    if prelude.startswith(':root') or prelude.startswith('html[data-theme'):
        # var-definition blocks -> tokens (html[data-theme] var swaps too)
        if 'var(' not in body and '--' not in body:
            kit.append(full)
        else:
            tokens.append(full)
        continue
    cls = re.findall(r'\.([A-Za-z0-9_-]+)', prelude)
    if not cls and not prelude.startswith('@'):
        base.append(full); continue
    kit.append(full)

for name, parts in [('theme-tokens', tokens), ('theme-base', base), ('theme-kit', kit)]:
    txt = '\n\n'.join(parts)
    open(f'hidden_files/{name}.css', 'w').write(txt)
    print(name, len(txt), 'bytes,', len(parts), 'blocks')
