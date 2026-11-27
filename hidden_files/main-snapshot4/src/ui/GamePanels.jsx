/* P4 + UI-B: presentational panels for the game layer — Discovery log,
   Achievements, and the first-entry coach marks. All state + persistence
   lives in src/game/game.js and sandlab.jsx; these components only render
   what they are given. */
import React from 'react';
import { ACHIEVEMENTS } from '../game/game.js';

const substTpl = (t, aN, bN) => (t == null ? '' : String(t).replace(/\{a\}/g, aN || 'A').replace(/\{b\}/g, bN || 'B'));

export function DiscoveryPanel({ discoveries, total, cardOf, nameOfKey }) {
  const keys = Object.keys(discoveries || {}).sort((a, b) => (discoveries[b] || 0) - (discoveries[a] || 0));
  return (
    <div data-panel="discoveries">
      <b>Discovery log</b>
      <p className="sm" style={{ margin: '6px 0 0' }}>
        Discovered <b>{keys.length.toLocaleString('en-IN')}</b> / {Number(total).toLocaleString('en-IN')} named reactions.
      </p>
      <p className="dim sm" style={{ margin: '4px 0 0' }}>A reaction is logged only when it actually fires in your world — watch the Messages feed and mix new pairs to grow the log.</p>
      {keys.length === 0 ? (
        <p className="dim sm" style={{ margin: '10px 0 0' }}>Nothing discovered yet — try sodium in water, or vinegar on baking soda.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {keys.slice(0, 60).map((k) => {
            const card = cardOf ? cardOf(k) : null;
            const when = discoveries[k] ? new Date(discoveries[k]).toLocaleDateString() : '';
            return (
              <div key={k} className="glass" style={{ padding: 8, borderRadius: 10, marginTop: 6 }}>
                <b className="sm">{card ? substTpl(card.name, '', '') || k : k}</b>
                {card && card.eq ? <span className="dim sm"> · {card.eq}</span> : null}
                <span className="dim sm" style={{ float: 'right' }}>{when}</span>
                {card && card.line ? <p className="dim sm" style={{ margin: '3px 0 0' }}>{card.line}</p> : null}
              </div>
            );
          })}
          {keys.length > 60 && <p className="dim sm" style={{ margin: '8px 0 0' }}>Showing the 60 most recent of {keys.length}.</p>}
        </div>
      )}
    </div>
  );
}

export function AchievementsPanel({ earned }) {
  const got = earned || {};
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  return (
    <div data-panel="achievements">
      <b>Achievements</b>
      <p className="sm" style={{ margin: '6px 0 0' }}>{n} / {ACHIEVEMENTS.length} earned on this device.</p>
      <div style={{ marginTop: 8 }}>
        {ACHIEVEMENTS.map((a) => {
          const at = got[a.id];
          return (
            <div key={a.id} className="glass" style={{ padding: 8, borderRadius: 10, marginTop: 6, opacity: at ? 1 : 0.62 }}>
              <b className="sm">{at ? '★ ' : '☆ '}{a.name}</b>
              {at ? <span className="dim sm" style={{ float: 'right' }}>{new Date(at).toLocaleDateString()}</span> : null}
              <p className="dim sm" style={{ margin: '3px 0 0' }}>{a.desc}{at ? '' : ' — locked'}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Coach marks: a non-blocking overlay. The dim layer never eats pointer
   events except on the caption card itself, so step 2 ("paint!") can be
   completed by actually painting under the highlight. `anchor` is a rect
   in viewport coords (or null = centre of the stage). */
export const COACH_STEPS = [
  { id: 'pick', title: '1 · Pick a substance', text: 'Open the picker — the Substances button on the left rail, or a category in the dock — and choose a substance. Water is a friendly start.', anchor: 'dock' },
  { id: 'paint', title: '2 · Paint it into the world', text: 'Drag on the canvas to paint. Everything falls, flows and reacts for real.', anchor: 'canvas' },
  { id: 'beaker', title: '3 · Place a beaker', text: 'Open the picker, go to Lab Gear, and tap a beaker — gear lands on the floor of the world.', anchor: 'dock' },
  { id: 'burner', title: '4 · Light a burner', text: 'Place a burner from Lab Gear, slide it under the beaker with the Interact (Move gear) tool, then tap it to cycle its level. Heat makes chemistry happen.', anchor: 'canvas' },
];
export function CoachMarks({ step, anchorRect, onNext, onSkip }) {
  const s = COACH_STEPS[step];
  if (!s) return null;
  const ring = anchorRect ? {
    position: 'fixed', left: Math.max(4, anchorRect.left - 6), top: Math.max(4, anchorRect.top - 6),
    width: Math.min(window.innerWidth - 8, anchorRect.width + 12), height: anchorRect.height + 12,
    border: '2px solid var(--cyan, #37c8d9)', borderRadius: 14, pointerEvents: 'none', zIndex: 240,
    boxShadow: '0 0 0 9999px rgba(2,8,12,.45)',
  } : null;
  return (
    <div data-coach="1" style={{ position: 'fixed', inset: 0, zIndex: 239, pointerEvents: 'none' }}>
      {ring && <div style={ring} />}
      <div className="glass" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(96px + var(--safe-b, 0px))', width: 'min(420px, calc(100vw - 24px))', padding: 12, borderRadius: 14, pointerEvents: 'auto', zIndex: 241 }}>
        <b className="sm">{s.title}</b>
        <p className="sm" style={{ margin: '5px 0 0', lineHeight: 1.5 }}>{s.text}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
          <button type="button" className="btn sm" onClick={onNext}>{step >= COACH_STEPS.length - 1 ? 'Finish' : 'Next'}</button>
          <button type="button" className="btn ghost sm" onClick={onSkip}>Skip tutorial</button>
          <span className="dim sm" style={{ marginLeft: 'auto', alignSelf: 'center' }}>{step + 1} / {COACH_STEPS.length}</span>
        </div>
      </div>
    </div>
  );
}
