import React, { useEffect, useMemo, useRef } from 'react';
import * as SandlabNS from '../tools/sandlab.jsx';
import { CARDS, NAMED_REACTIVE_COUNT } from '../core/matter-reactions.js';
import * as Game from '../game/game.js';
import { SANDBOX_MODE_LIST, sandboxMode } from '../game/sandbox-modes.js';
import ChallengeBoard from '../ui/ChallengeBoard.jsx';
import { SUBSTANCE_COUNT } from '../core/matter-elements.js';
import { GEAR } from '../core/matter-engine.js';
import Logo from './Logo.jsx';

/* Contract data from the tool — every access is guarded so the homepage
   builds and renders even before the parallel sandlab exports land. */
const SCENES = Array.isArray(SandlabNS.MATTER_SCENES) && SandlabNS.MATTER_SCENES.length
  ? SandlabNS.MATTER_SCENES
  : [
      { id: 'volcano', name: 'Volcano', description: 'A built volcano scene, ready to erupt in the sandbox.' },
      { id: 'bench', name: 'The Bench', description: 'A laid-out lab bench scene with gear in place.' },
      { id: 'electrolysis', name: 'Electrolysis', description: 'Electrodes in water — split it into hydrogen and oxygen.' },
      { id: 'golden', name: 'Golden Rain', description: 'The classic golden-rain precipitation, staged as a scene.' },
    ];
const EXPERIMENTS = Array.isArray(SandlabNS.MATTER_EXPERIMENTS) ? SandlabNS.MATTER_EXPERIMENTS : [];
const renderThumb = typeof SandlabNS.renderSceneThumbnail === 'function' ? SandlabNS.renderSceneThumbnail : null;

/* Part D — real reaction names only, straight from the tool's CARDS data.
   Template cards ("{a} + {b} …") are pair patterns, not named reactions, so
   they are filtered out. No invented entries. */
const TICKER_NAMES = (() => {
  try {
    const names = [];
    /* Live element: the user's OWN discovered reactions lead the ticker
       (real session data from the discovery log, most recent first),
       then the wider named-reaction catalogue fills the strip. */
    try {
      const disc = Game.namedDiscoveries();
      Object.keys(disc).sort((a, b) => (disc[b] || 0) - (disc[a] || 0)).forEach((k) => {
        const c = CARDS.get(k);
        if (c && c.name && !c.name.includes('{')) names.push(`✓ ${c.name}`);
      });
    } catch { /* fresh device — catalogue only */ }
    for (const card of CARDS.values()) {
      if (card && card.name && !card.name.includes('{')) names.push(card.name);
    }
    return names.slice(0, 28);
  } catch { return []; }
})();

function SceneThumb({ sceneId }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!renderThumb || !ref.current) return;
    try { renderThumb(sceneId, ref.current); } catch { /* gradient fallback stays */ }
  }, [sceneId]);
  return (
    <div className="ml-thumb" aria-hidden="true">
      <canvas ref={ref} className="ml-thumb-canvas" width={320} height={180} />
    </div>
  );
}

/* UI-A (h): numbers are read LIVE from the data modules — never literals,
   so the homepage can never drift from the real counts again. */
const fmt = (n) => Number(n).toLocaleString('en-IN');
const STATS = [
  [fmt(SUBSTANCE_COUNT), 'substances'],
  [fmt(NAMED_REACTIVE_COUNT), 'named reactions'],
  ['100%', 'pair-decision coverage'],
  [fmt(GEAR.length), 'placeable lab items'],
  ['Procedural', 'sound — zero audio files'],
];
const SUB_N = fmt(SUBSTANCE_COUNT);
const RX_N = fmt(NAMED_REACTIVE_COUNT);
const GEAR_N = fmt(GEAR.length);

/* Continue: a previous session exists when a saved-scene slot exists in
   the LIVE slot store (Game.loadSlots — matterlab:slots, with the legacy
   omni slots imported) or the recents list is non-empty. (The previous
   version read the legacy omni:sandlab:scenes key directly and missed
   every current save.) */
const LATEST_SLOT = (() => {
  try {
    const slots = Game.loadSlots();
    if (Array.isArray(slots) && slots.length) return slots.reduce((a, b) => ((b.at || 0) > (a.at || 0) ? b : a), slots[0]);
  } catch { /* fall through */ }
  return null;
})();
const HAS_SAVE = (() => {
  if (LATEST_SLOT) return true;
  try {
    const recent = JSON.parse(localStorage.getItem('omni:sandlab:recent') || '[]');
    return Array.isArray(recent) && recent.length > 0;
  } catch { return false; }
})();

/* Home progress is sampled on mount so returning from a lab run immediately
   reflects its newly earned challenge points, streak, and completion stamps. */
function readHomeProgress() {
  try {
    const tot = Game.totalStars();
    const disc = Game.discoveryCount();
    const tKey = Game.dateKey();
    const yKey = Game.yesterdayKey();
    const ds = Game.getDailyState();
    const sandbox = Game.getSandboxState();
    return {
      tot, disc,
      maxStars: EXPERIMENTS.length * 3,
      daily: Game.dailyFor(tKey),
      weekly: Game.weeklyFor(tKey),
      challengeSummary: Game.getChallengeSummary(new Date()),
      todayDone: !!(ds[tKey] && ds[tKey].done),
      yDone: !!(ds[yKey] && ds[yKey].done),
      fontScale: Game.getFontScale(),
      selectedMode: sandboxMode(sandbox.mode),
    };
  } catch { return null; }
}

export default function HomePage({ onLaunch }) {
  const ticker = useMemo(() => [...TICKER_NAMES, ...TICKER_NAMES], []);
  const progress = useMemo(() => readHomeProgress(), []);
  const firstExperiment = EXPERIMENTS[0];

  return (
    <div className="ml-home" data-fs={progress ? progress.fontScale : 'm'}>
      <header className="ml-topbar">
        <span className="ml-brand">
          <Logo size={30} />
          <span className="ml-brand-name">Matter Lab</span>
        </span>
        <span style={{ flex: 1 }} />
        <a className="ml-topbar-link" href="https://omnitools-8cf.pages.dev" target="_blank" rel="noreferrer">Part of OmniTools</a>
        <button type="button" className="ml-btn ml-btn-sm" onClick={() => onLaunch({ mode: 'free' })}>Open the lab</button>
      </header>

      <section className="ml-hero">
        <Logo size={84} />
        <h1 className="ml-hero-title">Matter Lab</h1>
        <p className="ml-hero-sub">
          A falling-sand sandbox crossed with a real chemistry lab. Paint any substance,
          place working lab gear, and watch everything react with everything — every pair
          of substances has a decided outcome.
        </p>
        <p className="ml-hero-credit">By Jack Bhai</p>
        <div className="ml-hero-cta">
          <button type="button" className="ml-btn ml-btn-lg" onClick={() => onLaunch({ mode: 'free' })}>Enter Free Sandbox</button>
          <button type="button" className="ml-btn ml-btn-ghost ml-btn-lg" onClick={() => onLaunch({ mode: 'gallery' })}>Browse scenes</button>
        </div>
        <div className="ml-stats">
          {STATS.map(([num, label]) => (
            <div className="ml-stat" key={label}>
              <div className="ml-stat-num">{num}</div>
              <div className="ml-stat-label">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {HAS_SAVE && (
        <section className="ml-section" style={{ paddingTop: 0 }}>
          <article className="ml-card" data-continue="1">
            <h3>Continue</h3>
            {LATEST_SLOT ? (
              <>
                <p>Your latest saved scene <b>“{LATEST_SLOT.name}”</b>{LATEST_SLOT.at ? ` — saved ${new Date(LATEST_SLOT.at).toLocaleDateString()}` : ''} — is ready to reload exactly where you left it.</p>
                <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'continue' })}>Continue — reload latest save</button>
              </>
            ) : (
              <>
                <p>You have a previous session on this device — jump back into the sandbox with your recent substances ready.</p>
                <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'free' })}>Continue in the sandbox</button>
              </>
            )}
          </article>
        </section>
      )}

      {ticker.length > 0 && (
        <div className="ml-ticker" aria-label="Named reactions in Matter Lab">
          <span className="ml-ticker-tag">What&rsquo;s reacting</span>
          <div className="ml-ticker-viewport">
            <div className="ml-ticker-track">
              {ticker.map((n, i) => <span className="ml-ticker-item" key={i}>{n}</span>)}
            </div>
          </div>
        </div>
      )}

      <section className="ml-section">
        <h2 className="ml-h2">Choose how to play</h2>
        <div className="ml-modes">
          <article className="ml-card">
            <h3>Sandbox</h3>
            <p>The open world. All {SUB_N} substances and every piece of lab gear, no goals — build, mix and set things off.</p>
            <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'free' })}>Launch Free Sandbox</button>
          </article>

          <article className="ml-card">
            <h3>Sandbox Modes</h3>
            <p>Choose the physical rules and resource policy for this world. Switching modes preserves the scene; only gravity, ambient temperature, speed limits and the Field Kit budget change.</p>
            <div className="ml-exp-list" aria-label="Available sandbox modes">
              {SANDBOX_MODE_LIST.map((mode) => (
                <button type="button" className="ml-exp-btn" key={mode.id} onClick={() => onLaunch({ mode: 'free', sandboxMode: mode.id })}>
                  <span className="ml-exp-name">{mode.icon} {mode.name}{progress?.selectedMode.id === mode.id ? ' · last used' : ''}</span>
                  <span className="ml-exp-goal">{mode.description}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="ml-card">
            <h3>Experiments &amp; Challenges</h3>
            <p>Run guided experiments or work toward a rotating daily and weekly objective, verified against the live world.</p>
            {EXPERIMENTS.length > 0 ? (
              <div className="ml-exp-list">
                {EXPERIMENTS.map((ex) => { const locked = progress ? !Game.isExpUnlocked(ex.id, progress.tot) : false; const st = progress ? (Game.getStars()[ex.id] | 0) : 0; return (
                  <button type="button" className="ml-exp-btn" key={ex.id} disabled={locked} onClick={() => onLaunch({ mode: 'experiments', experimentId: ex.id })}>
                    <span className="ml-exp-name">{locked ? `🔒 ${ex.name}` : ex.name} <span aria-label={`${st} of 3 stars`}>{'★'.repeat(st)}{'☆'.repeat(3 - st)}</span></span>
                    {ex.goal && <span className="ml-exp-goal">{locked ? `Locked — earn ${Game.expUnlockNeed(ex.id)}★ total to open.` : ex.goal}</span>}
                  </button>
                ); })}
              </div>
            ) : (
              <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'experiments' })}>Open Experiments</button>
            )}
            {firstExperiment && EXPERIMENTS.length > 1 && (
              <button type="button" className="ml-btn ml-btn-ghost" onClick={() => onLaunch({ mode: 'experiments', experimentId: firstExperiment.id })}>Start the first experiment</button>
            )}
            {progress && (
              <div className="ml-progress" data-progress="1">
                <span className="ml-progress-line">Experiments: <b>★ {progress.tot} / {progress.maxStars}</b> — stars unlock later experiments and scenes.</span>
                <span className="ml-progress-line">Discovery log: <b>{fmt(progress.disc)} / {RX_N}</b> named reactions found in your worlds.</span>
                <span className="ml-progress-line">Challenge record: <b>{progress.challengeSummary.points} points</b> · <b>{progress.challengeSummary.streak}-day streak</b> · yesterday <b>{progress.yDone ? '✓ complete' : 'not complete'}</b>.</span>
                <ChallengeBoard
                  daily={{ challenge: progress.daily }}
                  weekly={{ challenge: progress.weekly }}
                  summary={progress.challengeSummary}
                  onOpenLab={() => onLaunch({ mode: 'challenges' })}
                />
              </div>
            )}
          </article>

          <article className="ml-card">
            <h3>Scenes</h3>
            <p>Ready-made worlds — a volcano, a laid-out bench, electrolysis and golden rain — built and waiting in the gallery below.</p>
            <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'gallery' })}>Browse scenes</button>
            <button type="button" className="ml-btn ml-btn-ghost" onClick={() => onLaunch({ mode: 'custom' })}>Custom Lab — make your own substance</button>
          </article>
        </div>
      </section>

      <section className="ml-section">
        <h2 className="ml-h2">Scene Gallery</h2>
        <p className="ml-section-sub">Four showcase scenes, built and ready. Open one and it loads straight into the sandbox.</p>
        <div className="ml-scenes">
          {SCENES.map((s) => (
            <article className="ml-card ml-scene-card" key={s.id}>
              <SceneThumb sceneId={s.id} />
              <h3>{s.name}</h3>
              <p>{s.description}</p>
              <button type="button" className="ml-btn" onClick={() => onLaunch({ mode: 'gallery', sceneId: s.id })}>Open scene</button>
            </article>
          ))}
        </div>
        <button type="button" className="ml-btn ml-btn-ghost" onClick={() => onLaunch({ mode: 'gallery' })}>Open the gallery</button>
      </section>

      <section className="ml-section ml-about">
        <h2 className="ml-h2">What it is</h2>
        <p>
          Matter Lab is one open world where a falling-sand toy and a chemistry lab share the
          same bench. Substances fall, flow, burn, freeze and dissolve under one simulation —
          and on top of that sit {GEAR_N} placeable lab items: beakers in three sizes, burners,
          cooling coils, wires, batteries, switches and electrodes that actually work. Put a
          beaker on a burner and its contents boil; wire up electrodes and water splits.
        </p>
        <ul className="ml-feature-list">
          <li><strong>{SUB_N} substances</strong> — elements, compounds, solutions, alloys, foods, fuels, explosives and lab reagents.</li>
          <li><strong>{RX_N} named reactions</strong> — real pair outcomes with names and equations, not generic fizz.</li>
          <li><strong>100% pair-decision coverage</strong> — every substance pair resolves to a decided verdict; no pair is a shrug.</li>
          <li><strong>Working lab gear</strong> — vessels, heat, cold and circuits you place, move, resize and lock.</li>
          <li><strong>Air, pressure and heat fields</strong> — blasts push, pressure shifts boiling points, view modes show heat, pressure and flow.</li>
          <li><strong>Procedural sound</strong> — bubbles, impacts and explosions synthesised live; there are no audio files.</li>
          <li><strong>Custom substances</strong> — define a material by its properties and it joins the same reaction rules.</li>
          <li><strong>Share codes</strong> — export and import whole worlds as compact codes.</li>
        </ul>
        <h3 className="ml-h3">How it compares to a typical falling-sand toy</h3>
        <ul className="ml-feature-list">
          <li>Most falling-sand toys ship a few dozen materials; Matter Lab ships {SUB_N} substances.</li>
          <li>Reactions here are named and counted — {RX_N} of them — instead of a handful of hard-coded interactions.</li>
          <li>Lab gear is part of the world, not a menu: vessels, burners and circuits sit inside the simulation.</li>
          <li>Sound is procedural and follows what is actually happening, rather than a loop or silence.</li>
        </ul>
        <p className="ml-hint">
          In the lab: pick a substance from the panel, paint it into the world, then add heat,
          a spark or a piece of gear — and keep an eye on the side Messages feed to see what reacted.
        </p>
      </section>

      <footer className="ml-footer">
        <Logo size={22} />
        <span>Matter Lab — By Jack Bhai</span>
        <span style={{ flex: 1 }} />
        <a className="ml-topbar-link" href="https://omnitools-8cf.pages.dev" target="_blank" rel="noreferrer">OmniTools</a>
        <a className="ml-topbar-link" href="./privacy.html">Privacy</a>
      </footer>
    </div>
  );
}
