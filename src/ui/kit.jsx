/**
 * Minimal stand-in for OmniTools' src/ui/kit.jsx — ONLY the pieces Matter Lab
 * imports (Card, Empty, toast, Toaster), reproduced faithfully from the
 * originals (same markup, same class names, same behaviour). The full kit
 * pulls in the whole OmniTools app shell (router engine, string tables),
 * which a standalone Matter Lab does not need. Nothing here changes how the
 * tool itself works — this is app chrome only.
 */
import React, { useEffect, useState } from 'react';
import { play as sfxPlay } from '../core/sfx.js';
import { Icon } from './icons';

export const Card = ({ children, ...p }) => <div className="card" {...p}>{children}</div>;

/* §6.10 Empty — 44px tinted icon disc, bold line, optional sub + action. */
export const Empty = ({ t = 'No results', sub, icon = 'search', action }) => (
  <div className="state w31-empty">
    <span className={`state-ic ${icon === 'search' ? 'radar' : ''}`}><Icon n={icon} size={24} /></span>
    <span className="state-h t-body" style={{ fontWeight: 600 }}>{t}</span>
    {sub && <span className="state-sub t-body-sm">{sub}</span>}
    {action}
  </div>
);

/* ------------------------------------------------------------- toast
   One-line confirmations, a tiny emitter so any component can announce
   without prop drilling; <Toaster/> is mounted once in the shell. */
const toastSubs = new Set();
/* kind: 'ok' (default) answers with the soft success notes, 'err' with the
   low thud and a red edge, 'info' stays silent. */
export function toast(msg, kind = 'ok') {
  for (const f of toastSubs) { try { f(String(msg), kind); } catch {} }
}

/* §6.8: max 2 stacked, kind icon (check / warn / info), errors persist
   5s (others 2.6s), exit is a --d-1 fade. */
const TOAST_ICON = { ok: 'check', err: 'warn', info: 'info' };
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const push = (msg, kind = 'ok') => {
      const id = Date.now() + Math.random();
      if (kind === 'err') sfxPlay('error');
      else if (kind === 'ok') sfxPlay('success');
      setItems((cur) => [...cur.slice(-1), { id, msg, kind, out: false }]);
      const dur = kind === 'err' ? 5000 : 2600;
      setTimeout(() => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, out: true } : x))), dur - 150);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), dur);
    };
    toastSubs.add(push);
    return () => toastSubs.delete(push);
  }, []);
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div className={`toast ${t.kind} ${t.out ? 'out' : ''}`} key={t.id}>
          <span className="toast-ic"><Icon n={TOAST_ICON[t.kind] || 'info'} size={15} /></span>
          <span>{t.msg}</span>
        </div>))}
    </div>
  );
}
