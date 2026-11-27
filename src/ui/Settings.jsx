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

export default function SettingsPanel({ open, onClose, tools, speeds, tool, setTool, cloneRef, brush, setBrush, shape, setShape, paused, setPaused, engine, handleSimError, undo, clearWorld, speedI, setSpeedI, viewMode, setViewMode, textureOn, setTextureOn, texQuality, setTexQualityQ, rendererPref, applyRendererPref, rendererNote, heatRamp, applyHeatRamp, zoom, setView, viewRef, fontScale, applyFontScale, hapticsOn, applyHaptics, openMessages, unread, openSheet, recipeLen, selObj, applyObjLevel, vesselKinds, fixedSizeKinds, refreshSel, removeSelObj, applyObjScale, toggleObjLock, duplicateSelObj, gyro, gravDir, setGrav, toggleGyro, calibrateGyro, muted, setMuted, perf, power, setPower }) {
  if (!open) return null;
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
      <div className="seclabel" style={{ marginTop: 12 }}>Simulation</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        <button className="btn sm" onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
        <button className="btn ghost sm" onClick={() => { const e = engine(); if (e) { setPaused(true); try { e.step(); } catch (err) { handleSimError(err, e); } } }}>Step</button>
        <button className="btn ghost sm" onClick={undo}>Undo</button>
        <button className="btn ghost sm" onClick={clearWorld}>Clear</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
        <span className="dim sm">Speed</span>
        {speeds.map((s, i) => <button key={s} className={`btn sm ${speedI === i ? '' : 'ghost'}`} onClick={() => setSpeedI(i)}>{s}×</button>)}
      </div>
      <div className="seclabel" style={{ marginTop: 12 }}>View</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="group" aria-label="View mode">
        {[['normal', 'Normal'], ['heat', 'Heat'], ['pressure', 'Pressure'], ['flow', 'Flow']].map(([m, l]) => (
          <button key={m} className={`btn sm ${viewMode === m ? '' : 'ghost'}`} onClick={() => setViewMode(m)}>{l}</button>
        ))}
      </div>
      <button className={`btn sm ${textureOn ? '' : 'ghost'}`} aria-pressed={textureOn} style={{ marginTop: 6 }} onClick={() => setTextureOn(!textureOn)}>Texture {textureOn ? 'on' : 'off'}</button>
      {textureOn && (
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
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }} role="group" aria-label="Particle cap">
            <span className="dim sm">Movement cap</span>
            {[0, 4000, 8000, 16000].map((n) => (
              <button key={n} className={`btn sm ${perf.capParts === n ? '' : 'ghost'}`} aria-pressed={perf.capParts === n} onClick={() => perf.applyCap(n)}>{n || 'Off'}</button>
            ))}
            <span className="dim sm"> (movement ~¼ duty when capped)</span>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }} className="sm">
            <input type="checkbox" checked={!!power} onChange={(e) => setPower(e.target.checked)} /> Power Mode — 10× speed, stronger gravity, Zoom 5×
          </label>
        </>
      )}
    </div>
  );
}
