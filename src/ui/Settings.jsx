/* REDESIGN (brief pt.8): the Tools & controls side panel, extracted from
   sandlab.jsx into its own component (the brief's "Settings" piece —
   tools, brush, simulation, view/texture/renderer/accessibility
   settings, panel shortcuts, selected-gear controls, gravity).
   Presentational: every state value and handler arrives as a prop;
   behaviour stays single-sourced in sandlab.jsx. */
import React from 'react';
import { Icon } from './icons.jsx';
import { toast } from './kit.jsx';
import { GEAR } from '../core/matter-engine.js';
import * as Game from '../game/game.js';

export default function SettingsPanel({ open, onClose, tools, speeds, allowedSpeedIndices = [], tool, setTool, cloneRef, brush, setBrush, shape, setShape, paused, setPaused, engine, handleSimError, undo, clearWorld, speedI, setSpeedI, sandboxModeId, sandboxModes = [], sandboxStatus, onSandboxModeChange, soundOn, applySound, spatialAudioOn, applySpatialAudio, viewMode, setViewMode, textureOn, setTextureOn, texQuality, setTexQualityQ, rendererPref, applyRendererPref, rendererNote, heatRamp, applyHeatRamp, zoom, setView, viewRef, fontScale, applyFontScale, hapticsOn, applyHaptics, openMessages, unread, openSheet, recipeLen, selObj, applyObjLevel, vesselKinds, fixedSizeKinds, refreshSel, removeSelObj, applyObjScale, toggleObjLock, duplicateSelObj, gyro, gravDir, setGrav, toggleGyro, calibrateGyro, muted, setMuted, perf, power, setPower }) {
  if (!open) return null;
  const activeSandboxMode = sandboxModes.find((mode) => mode.id === sandboxModeId);
  return (
    <div className="glass" data-sidepanel="1" style={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: 'min(264px, calc(100% - 16px))', zIndex: 7, overflowY: 'auto', padding: 10, borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>Tools</b>
        <button className="btn ghost sm" onClick={onClose}><Icon n="x" size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 8 }}>
        {tools.map(([v, l]) => (
          <button key={v} className={`btn sm ${tool === v ? '' : 'ghost'}`} style={{ justifyContent: 'flex-start' }}
            onClick={() => { setTool(v); if (v === 'clone' && cloneRef.current) { cloneRef.current = null; toast('Clone: drag a region to pick a new stamp'); } }}>{l}</button>
        ))}
      </div>
      <div className="seclabel" style={{ marginTop: 12 }}>Brush</div>
      <label className="dim sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Size {brush}
        <input type="range" min={1} max={64} value={brush} onChange={(e) => setBrush(Number(e.target.value))} style={{ flex: 1 }} />
      </label>
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
        {['circle', 'square', 'spray'].map((s) => (
          <button key={s} className={`btn sm ${shape === s || (s === 'spray' && tool === 'spray') ? '' : 'ghost'}`} onClick={() => { if (s === 'spray') { setTool('spray'); } else { setShape(s); if (tool === 'spray') setTool('paint'); } }}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      <div className="seclabel" style={{ marginTop: 12 }}>Sandbox mode</div>
      {activeSandboxMode && <p className="dim sm" style={{ margin: '3px 0 7px', lineHeight: 1.4 }}>{activeSandboxMode.description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }} role="group" aria-label="Sandbox mode">
        {sandboxModes.map((mode) => (
          <button key={mode.id} type="button" className={`btn sm ${sandboxModeId === mode.id ? '' : 'ghost'}`} aria-pressed={sandboxModeId === mode.id} onClick={() => onSandboxModeChange?.(mode.id)}>
            {mode.icon} {mode.shortName || mode.name}
          </button>
        ))}
      </div>
      {sandboxModeId === 'field-kit' && sandboxStatus && (
        <div className="ml-field-kit-meter" aria-label={`Field Kit has ${sandboxStatus.credits} of ${sandboxStatus.cap} supply credits`}>
          <div className="ml-field-kit-meter-head"><b>Field Kit supply</b><span>{sandboxStatus.credits.toLocaleString()} / {sandboxStatus.cap.toLocaleString()} cr</span></div>
          <div className="ml-field-kit-meter-track" role="progressbar" aria-label="Field Kit supply remaining" aria-valuemin="0" aria-valuemax={sandboxStatus.cap} aria-valuenow={sandboxStatus.credits}>
            <span style={{ width: `${sandboxStatus.cap ? Math.round(100 * sandboxStatus.credits / sandboxStatus.cap) : 0}%` }} />
          </div>
          <span className="dim sm">New material and gear use credits; live reactions replenish supply.</span>
        </div>
      )}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 9 }} className="sm">
        <input type="checkbox" checked={!!soundOn} onChange={(e) => applySound?.(e.target.checked)} /> Simulation &amp; app sound
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }} className="sm">
        <input type="checkbox" checked={!!spatialAudioOn} disabled={!soundOn} onChange={(e) => applySpatialAudio?.(e.target.checked)} /> Spatial positioning
      </label>
      <div className="seclabel" style={{ marginTop: 12 }}>Simulation</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
        <button className="btn ghost sm" onClick={() => { const e = engine(); if (e) { setPaused(true); try { e.step(); } catch (err) { handleSimError(err, e); } } }}>Step</button>
        <button className="btn ghost sm" onClick={undo}>Undo</button>
        <button className="btn ghost sm" onClick={clearWorld}>Clear</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
        <span className="dim sm">Speed</span>
        {speeds.map((s, i) => <button key={s} className={`btn sm ${speedI === i ? '' : 'ghost'}`} aria-pressed={speedI === i} disabled={!allowedSpeedIndices.includes(i)} title={!allowedSpeedIndices.includes(i) ? 'This speed is not available in the current sandbox mode' : undefined} onClick={() => setSpeedI(i)}>{s}×</button>)}
      </div>
      <div className="seclabel" style={{ marginTop: 12 }}>View</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="View mode">
        {[['normal', 'Normal'], ['heat', 'Heat'], ['pressure', 'Pressure'], ['flow', 'Flow']].map(([m, l]) => (
          <button key={m} className={`btn sm ${viewMode === m ? '' : 'ghost'}`} onClick={() => setViewMode(m)}>{l}</button>
        ))}
      </div>
      <button className={`btn sm ${textureOn && !perf?.adaptive?.safeMode ? '' : 'ghost'}`} aria-pressed={textureOn && !perf?.adaptive?.safeMode} disabled={!!perf?.adaptive?.safeMode} style={{ marginTop: 6 }} onClick={() => setTextureOn(!textureOn)}>Texture {perf?.adaptive?.safeMode ? 'off (2GB safe)' : textureOn ? 'on' : 'off'}</button>
      {textureOn && !perf?.adaptive?.safeMode && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }} role="group" aria-label="Texture quality">
          <span className="dim sm">Detail</span>
          {[['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']].map(([q, l]) => (
            <button key={q} className={`btn sm ${texQuality === q ? '' : 'ghost'}`} aria-pressed={texQuality === q} onClick={() => setTexQualityQ(q)}>{l}</button>
          ))}
        </div>
      )}
      {/* UI-B: renderer safeguard + accessibility finishers */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Renderer">
        <span className="dim sm">Renderer</span>
        {[['auto', 'Auto'], ['gl', 'GL'], ['2d', '2D'], ['simple', 'Simple']].map(([v, l]) => (
          <button key={v} className={`btn sm ${rendererPref === v ? '' : 'ghost'}`} aria-pressed={rendererPref === v} onClick={() => applyRendererPref(v)}>{l}</button>
        ))}
      </div>
      {rendererNote && <p className="dim sm" style={{ margin: '4px 0 0' }}>{rendererNote}</p>}
      {viewMode === 'heat' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Heat colours">
          <span className="dim sm">Heat colours</span>
          {[['classic', 'Classic'], ['viridis', 'Colour-blind safe']].map(([v, l]) => (
            <button key={v} className={`btn sm ${heatRamp === v ? '' : 'ghost'}`} aria-pressed={heatRamp === v} onClick={() => applyHeatRamp(v)}>{l}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Zoom">
        <span className="dim sm">Zoom {Math.round(zoom * 100)}%</span>
            {[1.5, 2, 3, ...(power ? [5] : [])].map((z) => (
          <button key={z} className={`btn sm ${Math.abs(zoom - z) < 0.01 ? '' : 'ghost'}`} onClick={() => setView(z, viewRef.current.fx, viewRef.current.fy)}>{z}×</button>
        ))}
        <button className="btn ghost sm" onClick={() => setView(1, null, null)}>Reset</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Text size">
        <span className="dim sm">Text size</span>
        {[['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']].map(([v, l]) => (
          <button key={v} className={`btn sm ${fontScale === v ? '' : 'ghost'}`} aria-pressed={fontScale === v} onClick={() => applyFontScale(v)}>{l}</button>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }} className="sm">
        <input type="checkbox" checked={hapticsOn} onChange={(e) => applyHaptics(e.target.checked)} /> Haptics (vibration)
      </label>
      <div className="seclabel" style={{ marginTop: 12 }}>Panels</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn ghost sm" onClick={openMessages}>Messages{unread > 0 ? ` (${unread} new)` : ''}</button>
        <button className="btn ghost sm" onClick={() => openSheet('experiments')}>Experiments</button>
        <button className="btn ghost sm" onClick={() => openSheet('challenges')}>Daily &amp; weekly challenges</button>
        <button className="btn ghost sm" onClick={() => openSheet('discoveries')}>Discoveries ({Game.discoveryCount()})</button>
        <button className="btn ghost sm" onClick={() => openSheet('achievements')}>Achievements</button>
        <button className="btn ghost sm" onClick={() => openSheet('scenes')}>Scenes</button>
        <button className="btn ghost sm" onClick={() => openSheet('recipes')}>Recipes ({recipeLen})</button>
        <button className="btn ghost sm" onClick={() => openSheet('menu')}>Menu</button>
      </div>
      {selObj && (
        <>
          <div className="seclabel" style={{ marginTop: 12 }}>Gear — {(GEAR.find((g) => g.kind === selObj.kind) || {}).name || selObj.kind}</div>
          {(selObj.kind === 'burner' || selObj.kind === 'cooling-coil' || selObj.kind === 'heater-coil') && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Level">
              {[['Off', 0], ['Low', 1], ['Med', 2], ['High', 3]].map(([l, lv]) => (
                <button key={lv} className={`btn sm ${selObj.level === lv ? '' : 'ghost'}`} onClick={() => applyObjLevel(lv)}>{l}</button>
              ))}
            </div>
          )}
          {selObj.kind === 'heater-coil' && <p className="dim sm" style={{ margin: '6px 0 0' }}>Heats only when wired in a powered circuit</p>}
          {selObj.kind === 'sensor' && (
            <>
              <div className="dim sm" style={{ marginBottom: 4 }}>Trips at</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Trip temperature">
                {[['60°', 1], ['150°', 2], ['300°', 3]].map(([l, lv]) => (
                  <button key={lv} className={`btn sm ${selObj.level === lv ? '' : 'ghost'}`} onClick={() => applyObjLevel(lv)}>{l}</button>
                ))}
              </div>
            </>
          )}
          {selObj.kind === 'switch' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Switch state">
              {[['Open', 0], ['Closed', 1]].map(([l, lv]) => (
                <button key={lv} className={`btn sm ${selObj.level === lv ? '' : 'ghost'}`} onClick={() => applyObjLevel(lv)}>{l}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {vesselKinds.has(selObj.kind) && <button className="btn ghost sm" onClick={() => { const e = engine(); if (e && typeof e.tipObject === 'function') { const ok = e.tipObject(selObj.id); if (ok === false) toast(selObj.locked ? 'That item is locked' : 'Could not tip that item'); else refreshSel(selObj.id); } }}>Tip</button>}
            <button className="btn ghost sm" onClick={removeSelObj}>Remove</button>
          </div>
          {!fixedSizeKinds.has(selObj.kind) ? (
            <div style={{ marginTop: 8 }}>
              <div className="dim sm" style={{ marginBottom: 4 }}>Size — {Math.round((selObj.scale || 1) * 100)}%</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button className="btn ghost sm" aria-label="Smaller" onClick={() => applyObjScale((selObj.scale || 1) - 0.15)}>−</button>
                <input key={`${selObj.id}:${selObj.scale || 1}`} type="range" min={0.6} max={2.6} step={0.05} defaultValue={selObj.scale || 1} aria-label="Item size" style={{ flex: 1, minWidth: 0 }}
                  onPointerUp={(ev) => applyObjScale(parseFloat(ev.currentTarget.value))}
                  onKeyUp={(ev) => applyObjScale(parseFloat(ev.currentTarget.value))} />
                <button className="btn ghost sm" aria-label="Larger" onClick={() => applyObjScale((selObj.scale || 1) + 0.15)}>+</button>
              </div>
            </div>
          ) : <p className="dim sm" style={{ margin: '8px 0 0' }}>Fixed size</p>}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button className="btn ghost sm" onClick={toggleObjLock}>{selObj.locked ? 'Unlock item' : 'Lock item'}</button>
            <button className="btn ghost sm" onClick={duplicateSelObj}>Duplicate</button>
          </div>
          {selObj.locked && <p className="dim sm" style={{ margin: '6px 0 0' }}>Locked — it cannot be moved, resized, tipped or deleted.</p>}
          <p className="dim sm" style={{ margin: '6px 0 0' }}>Tip: drag a placed item with the Interact tool to move it.</p>
        </>
      )}
      <div className="seclabel" style={{ marginTop: 12 }}>Gravity</div>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        {[['↓', 0], ['↑', 1], ['←', 2], ['→', 3]].map(([a, d]) => (
          <button key={d} className={`btn sm ${!gyro && gravDir === d ? '' : 'ghost'}`} onClick={() => setGrav(d)}>{a}</button>
        ))}
        <button className={`btn sm ${gyro ? '' : 'ghost'}`} onClick={toggleGyro}>Gyro {gyro ? 'on' : 'off'}</button>
      </div>
      {gyro && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn ghost sm" onClick={calibrateGyro}>Calibrate — this pose = neutral</button>
          <span className="dim sm">Tilt steers gravity 360°; steeper tilt = stronger pull. Manual arrows turn gyro off.</span>
        </div>
      )}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12 }} className="sm">
        <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} /> Mute reaction cards
      </label>
      {perf && (
        <>
          <div className="seclabel" style={{ marginTop: 12 }}>Performance</div>
          <p className="dim sm" style={{ margin: 4, fontSize: 11, lineHeight: 1.35 }}>{perf.device}</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }} role="group" aria-label="Particle movement cap">
            <span className="dim sm">Movement cap</span>
            {[0, 4000, 8000, 16000].map((n) => (
              <button key={n} className={`btn sm ${perf.capParts === n ? '' : 'ghost'}`} aria-pressed={perf.capParts === n} onClick={() => perf.applyCap(n)}>{n || 'Off'}</button>
            ))}
            <span className="dim sm"> (movement ~¼ duty when capped)</span>
          </div>
          {perf.adaptive && (
            <section aria-label="Adaptive performance" style={{ marginTop: 12, padding: 9, border: '1px solid var(--line)', borderRadius: 10, background: 'rgba(255,255,255,0.025)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                <b className="sm">Adaptive quality</b>
                <span className="sm" aria-live="polite">{perf.adaptive.label}</span>
                {perf.adaptive.safeMode && <span className="dim sm">2GB guard active</span>}
              </div>
              <p className="dim sm" style={{ margin: '5px 0', lineHeight: 1.4 }}>
                {Math.round(perf.adaptive.fps || 0)} FPS · {Math.round((perf.adaptive.memoryPressure || 0) * 100)}% memory pressure · {perf.adaptive.engineTier?.cols}×{perf.adaptive.engineTier?.rows} grid
              </p>
              <p className="dim sm" style={{ margin: '0 0 6px', lineHeight: 1.4 }}>
                {perf.adaptive.particleBudget > 0
                  ? `${perf.adaptive.particles || 0} / ${perf.adaptive.particleBudget} particle budget`
                  : `${perf.adaptive.particles || 0} particles · adaptive budget`}
                {perf.adaptive.safeMode ? ' · procedural textures off · world textures ≤512px' : ''}
              </p>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '5px 0 7px' }} className="sm">
                <input type="checkbox" checked={!!perf.adaptive.auto} onChange={(e) => perf.adaptive.setAuto(e.target.checked)} /> Automatic tier switching
              </label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="Quality tier">
                {[[0, 'Max'], [1, 'High'], [2, 'Mid'], [3, 'Low'], [4, perf.adaptive.safeMode ? '2GB Safe' : 'Min grid']].map(([index, label]) => {
                  const disabled = !!perf.adaptive.safeMode && index < 4;
                  return <button key={index} type="button" className={`btn sm ${perf.adaptive.index === index ? '' : 'ghost'}`} aria-pressed={perf.adaptive.index === index} disabled={disabled} onClick={() => perf.adaptive.setTier(index)}>{label}</button>;
                })}
              </div>
              <p className="dim sm" style={{ margin: '6px 0 0', lineHeight: 1.4 }}>
                Auto uses sustained FPS and memory signals with hysteresis. 2GB Safe locks the world to the engine's smallest grid and enforces a hard particle budget.
              </p>
            </section>
          )}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }} className="sm">
            <input type="checkbox" checked={!!power} onChange={(e) => setPower(e.target.checked)} /> Power Mode — 10× speed, stronger gravity, Zoom 5×
          </label>
        </>
      )}
    </div>
  );
}
