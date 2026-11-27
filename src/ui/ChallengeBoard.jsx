import React from 'react';

function ChallengeCard({ label, challenge, status, done }) {
  if (!challenge) return null;
  const progress = status?.progress || null;
  const complete = !!(done || status?.done || progress?.done);
  const pct = progress ? Math.round(Math.max(0, Math.min(1, progress.progress || 0)) * 100) : (complete ? 100 : 0);
  return (
    <article className="ml-challenge-card" data-challenge={challenge.period || label.toLowerCase()}>
      <div className="ml-challenge-card-top">
        <span className="ml-challenge-kicker">{label} · {challenge.reward} lab points</span>
        <span className={`ml-challenge-state${complete ? ' is-done' : ''}`} aria-label={complete ? 'Challenge complete' : 'Challenge active'}>{complete ? '✓ Complete' : 'Active'}</span>
      </div>
      <h3>{challenge.name}</h3>
      <p>{challenge.text}</p>
      {progress ? (
        <>
          <div className="ml-challenge-track" role="progressbar" aria-label={`${challenge.name} progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="ml-challenge-detail" aria-live="polite">{complete ? 'Verified in the live world' : progress.detail}</div>
        </>
      ) : <div className="ml-challenge-detail">{complete ? 'Recorded in your challenge log' : 'Progress is checked against the live world in the lab.'}</div>}
    </article>
  );
}

export default function ChallengeBoard({ daily, weekly, summary, onOpenLab }) {
  return (
    <section className="ml-challenge-board" aria-label="Daily and weekly Matter Lab challenges">
      <div className="ml-challenge-board-head">
        <div>
          <div className="ml-challenge-kicker">LIVE PROGRESS</div>
          <h2>Challenge board</h2>
        </div>
        <div className="ml-challenge-stats" aria-label={`${summary?.points || 0} points, ${summary?.streak || 0} day streak`}>
          <b>{summary?.points || 0}</b><span>points</span><i aria-hidden="true">·</i><b>{summary?.streak || 0}</b><span>day streak</span>
        </div>
      </div>
      <div className="ml-challenge-grid">
        <ChallengeCard label="Daily" challenge={daily?.challenge} status={daily} done={summary?.dailyDone} />
        <ChallengeCard label="Weekly" challenge={weekly?.challenge} status={weekly} done={summary?.weeklyDone} />
      </div>
      {onOpenLab && <button type="button" className="ml-btn ml-btn-ghost" onClick={onOpenLab}>Open the live challenge lab</button>}
    </section>
  );
}
