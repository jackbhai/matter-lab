/* One-step full-scene swap history for destructive loads/imports.
   DeltaStack remains the fast path for ordinary brush strokes; this small
   history owns one complete before/after engine serialization so Undo can
   restore gear, rigid bodies, dimensions and temperatures after replacing a
   scene without retaining many large worlds on a low-memory device. */
export class SceneSwapHistory {
  constructor() {
    this.before = null;
    this.after = null;
  }

  replace(engine, nextScene) {
    if (!engine || typeof engine.serialize !== 'function' || typeof engine.deserialize !== 'function' || !nextScene) return false;
    let previous;
    try { previous = engine.serialize(); } catch { return false; }
    try {
      if (!engine.deserialize(nextScene)) {
        try { engine.deserialize(previous); } catch { /* best-effort rollback */ }
        return false;
      }
    } catch {
      try { engine.deserialize(previous); } catch { /* best-effort rollback */ }
      return false;
    }
    let current;
    try { current = engine.serialize(); } catch { try { engine.deserialize(previous); } catch { /* best-effort rollback */ } return false; }
    return this.recordReplacement(previous, current);
  }

  /** Record a replacement built directly into the engine after a successful
      transactional build, without serializing/deserializing the new scene a
      second time. */
  recordReplacement(previousScene, nextScene) {
    if (!previousScene || !nextScene) return false;
    this.before = previousScene;
    this.after = null;
    return true;
  }

  undo(engine) {
    if (!this.before || !engine || typeof engine.serialize !== 'function' || typeof engine.deserialize !== 'function') return false;
    let current;
    try { current = engine.serialize(); } catch { return false; }
    try {
      if (!engine.deserialize(this.before)) {
        try { engine.deserialize(current); } catch { /* best-effort rollback */ }
        return false;
      }
    } catch {
      try { engine.deserialize(current); } catch { /* best-effort rollback */ }
      return false;
    }
    this.before = null;
    this.after = current;
    return true;
  }

  redo(engine) {
    if (!this.after || !engine || typeof engine.serialize !== 'function' || typeof engine.deserialize !== 'function') return false;
    let current;
    try { current = engine.serialize(); } catch { return false; }
    try {
      if (!engine.deserialize(this.after)) {
        try { engine.deserialize(current); } catch { /* best-effort rollback */ }
        return false;
      }
    } catch {
      try { engine.deserialize(current); } catch { /* best-effort rollback */ }
      return false;
    }
    this.before = current;
    this.after = null;
    return true;
  }

  discardRedo() { this.after = null; }
  clear() { this.before = null; this.after = null; }
}
