/* v28 — named, persistent sandbox playstyles. The simulation remains the
   same MatterEngine; modes configure its boundary conditions and (for the
   Field Kit) a real, deterministic placement budget without mutating saves. */

export const DEFAULT_SANDBOX_MODE = 'creative';
export const FIELD_KIT_CAPACITY = 1800;
export const FIELD_KIT_STARTING_SUPPLY = 1200;
export const FIELD_KIT_REACTION_REWARD = 8;

export const SANDBOX_MODES = Object.freeze({
  creative: Object.freeze({
    id: 'creative', name: 'Creative', shortName: 'Creative', icon: '✦',
    description: 'Open sandbox with unlimited placement, Earth gravity and room-temperature air.',
    gravity: 'earth', ambientT: 20, supplyCap: 0, startingSupply: 0, maxSpeed: 4, powerMode: true,
  }),
  'field-kit': Object.freeze({
    id: 'field-kit', name: 'Field Kit', shortName: 'Field Kit', icon: '▣',
    description: 'Work within a finite 1,800-unit field supply. New matter costs credits; genuine reactions replenish a small amount.',
    gravity: 'earth', ambientT: 20, supplyCap: FIELD_KIT_CAPACITY, startingSupply: FIELD_KIT_STARTING_SUPPLY, maxSpeed: 2, powerMode: false,
  }),
  moon: Object.freeze({
    id: 'moon', name: 'Moon Lab', shortName: 'Moon', icon: '☾',
    description: 'One-sixth gravity with cold lunar ambient air. Liquids and powders settle slowly; hot/cold transitions still follow material data.',
    gravity: 'moon', ambientT: -10, supplyCap: 0, startingSupply: 0, maxSpeed: 4, powerMode: true,
  }),
  jupiter: Object.freeze({
    id: 'jupiter', name: 'Jupiter Lab', shortName: 'Jupiter', icon: '♃',
    description: 'High-gravity laboratory with the engine’s extra gravity pass. The standard adaptive and particle guardrails remain active.',
    gravity: 'jupiter', ambientT: 20, supplyCap: 0, startingSupply: 0, maxSpeed: 2, powerMode: false,
  }),
  'deep-freeze': Object.freeze({
    id: 'deep-freeze', name: 'Deep-Freeze Chamber', shortName: 'Freeze', icon: '❄',
    description: 'A controlled −25°C chamber at Earth gravity; the engine’s heat-transfer and phase-change rules decide what freezes.',
    gravity: 'earth', ambientT: -25, supplyCap: 0, startingSupply: 0, maxSpeed: 4, powerMode: true,
  }),
});

export const SANDBOX_MODE_LIST = Object.freeze(Object.values(SANDBOX_MODES));
export const normalizeSandboxMode = (id) => Object.hasOwn(SANDBOX_MODES, id) ? id : DEFAULT_SANDBOX_MODE;
export const sandboxMode = (id) => SANDBOX_MODES[normalizeSandboxMode(id)];

export function sandboxGravityStrength(modeId, power = false) {
  const def = sandboxMode(modeId);
  const base = def.gravity === 'moon' ? 0.17 : 1;
  return base * (power && def.powerMode ? 4 : 1);
}

/** Cost is based on actual material metadata, so custom and hazardous matter
    is never accidentally cheaper than common sand/water. */
export function materialCellCost(material) {
  if (!material || typeof material !== 'object') return 1;
  const cls = String(material.cls || '').toLowerCase();
  const fams = Array.isArray(material.fams) ? material.fams : [];
  let cost = 1;
  if (['fire', 'electric', 'special', 'explosive'].includes(cls)) cost += 2;
  if (material.flammability >= 0.7 || material.acidity >= 0.8 || material.oxidiser >= 0.7) cost += 1;
  if (fams.some((family) => /rare|radioactive|explosive|strong-acid|strong-oxid/i.test(String(family)))) cost += 1;
  if (material.custom || String(material.key || '').startsWith('custom-')) cost += 1;
  return Math.max(1, Math.min(6, cost));
}

export function gearCreditCost(kind) {
  const name = String(kind || '').toLowerCase();
  if (name.includes('beaker') || name.includes('flask') || name.includes('testtube') || name.includes('cylinder')) return 30;
  if (name.includes('battery') || name.includes('electrode') || name.includes('heater') || name.includes('cooling')) return 42;
  if (name === 'burner' || name === 'benchlamp') return 36;
  if (name === 'rack' || name === 'stand') return 24;
  return 18;
}

/** Compute the finite supply needed to load an engine scene. The reader is
    intentionally bounded by the serialized dimensions and stops counting as
    soon as the Field Kit capacity is exceeded. */
export function sceneSupplyCost(scene, materialOfId = () => null) {
  if (!scene || typeof scene !== 'object' || typeof scene.el !== 'string' || !Number.isSafeInteger(scene.cols) || !Number.isSafeInteger(scene.rows)) return Infinity;
  if (scene.cols < 1 || scene.rows < 1) return Infinity;
  const cells = scene.cols * scene.rows;
  if (!Number.isSafeInteger(cells) || cells > 200000 || scene.el.length > 8 * 1024 * 1024) return Infinity;
  let binary;
  try {
    if (typeof atob === 'function') binary = atob(scene.el);
    else if (typeof Buffer !== 'undefined') binary = Buffer.from(scene.el, 'base64').toString('binary');
    else return Infinity;
  } catch { return Infinity; }
  if (binary.length < cells * 2) return Infinity;
  let cost = 0;
  for (let i = 0; i < cells; i++) {
    const id = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    if (id > 0) {
      cost += materialCellCost(materialOfId(id));
      if (cost > FIELD_KIT_CAPACITY) return cost;
    }
  }
  const objects = Array.isArray(scene.objects) ? scene.objects.slice(0, 64) : [];
  for (const object of objects) {
    cost += gearCreditCost(object && object.kind);
    if (cost > FIELD_KIT_CAPACITY) return cost;
  }
  return cost;
}

export function normalizeSupply(modeId, credits) {
  const def = sandboxMode(modeId);
  if (!def.supplyCap) return 0;
  const n = Number(credits);
  return Number.isFinite(n) ? Math.max(0, Math.min(def.supplyCap, Math.floor(n))) : def.startingSupply;
}

export function createSandboxSession(modeId = DEFAULT_SANDBOX_MODE, credits = undefined) {
  const mode = normalizeSandboxMode(modeId);
  const def = sandboxMode(mode);
  let supply = normalizeSupply(mode, credits == null ? def.startingSupply : credits);
  return {
    get mode() { return mode; },
    get credits() { return supply; },
    get cap() { return def.supplyCap; },
    get unlimited() { return def.supplyCap === 0; },
    canSpendCredits(amount = 1) { return this.unlimited || supply >= Math.max(0, Math.floor(Number(amount) || 0)); },
    spendCredits(amount = 1) {
      if (this.unlimited) return { ok: true, spent: 0, balance: 0 };
      const cost = Math.max(0, Math.floor(Number(amount) || 0));
      if (cost > supply) return { ok: false, spent: 0, balance: supply };
      supply -= cost;
      return { ok: true, spent: cost, balance: supply };
    },
    canSpend(material) { return this.canSpendCredits(materialCellCost(material)); },
    spend(material, cells = 1) {
      const count = Math.max(0, Math.floor(Number(cells) || 0));
      return this.spendCredits(materialCellCost(material) * count);
    },
    rewardReaction(count = 1) {
      if (this.unlimited) return { gained: 0, balance: 0 };
      const n = Math.max(0, Math.floor(Number(count) || 0));
      const before = supply;
      supply = Math.min(def.supplyCap, supply + FIELD_KIT_REACTION_REWARD * n);
      return { gained: supply - before, balance: supply };
    },
    refill() {
      if (this.unlimited) return 0;
      const before = supply;
      supply = def.startingSupply;
      return supply - before;
    },
    snapshot() { return { mode, credits: supply, cap: def.supplyCap, unlimited: def.supplyCap === 0 }; },
  };
}

/** Apply only mode boundary conditions. Calling this never clears or edits a
    scene, so a mode change cannot discard a user's world. */
export function applySandboxPreset(engine, modeId) {
  if (!engine) return false;
  const def = sandboxMode(modeId);
  if (typeof engine.setGravityPreset === 'function') engine.setGravityPreset(def.gravity);
  if (typeof engine.setAmbientT === 'function') engine.setAmbientT(def.ambientT);
  return { mode: def.id, gravity: def.gravity, ambientT: def.ambientT };
}

export function speedAllowed(modeId, multiplier, power = false) {
  const def = sandboxMode(modeId);
  if (power && !def.powerMode) return false;
  const value = Math.max(0, Number(multiplier) || 0);
  return value <= def.maxSpeed;
}

/** Apply the Field Kit's real cell-credit policy to a MatterEngine brush.
    Credits are spent only for newly changed cells, never for a blocked write
    or repainting the same material. */
export function paintWithSandboxPolicy(engine, session, x, y, radius, id, options = {}, material = null) {
  if (!engine || typeof engine.paint !== 'function') return { written: 0, changed: 0 };
  if (!session || session.mode !== 'field-kit' || id === 0) return engine.paint(x, y, radius, id, options);
  const rec = material || {};
  const cost = materialCellCost(rec);
  let blocked = 0;
  const result = engine.paint(x, y, radius, id, {
    ...options,
    canPaintCell: ({ oldId }) => {
      if (oldId === id) return true;
      const allowed = session.canSpendCredits(cost);
      if (!allowed) blocked++;
      return allowed;
    },
    onPaintCell: ({ oldId }) => { if (oldId !== id) session.spendCredits(cost); },
  });
  return { ...result, blocked };
}

/** Charge for gear only after a valid object has been placed. */
export function placeGearWithSandboxPolicy(engine, session, kind, ...args) {
  if (!engine || typeof engine.placeObject !== 'function') return { id: null, blocked: false };
  const kit = session && session.mode === 'field-kit';
  const cost = kit ? gearCreditCost(kind) : 0;
  if (kit && !session.canSpendCredits(cost)) return { id: null, blocked: true };
  const id = engine.placeObject(kind, ...args);
  if (kit && id != null) session.spendCredits(cost);
  return { id, blocked: false, spent: kit && id != null ? cost : 0 };
}

export function duplicateGearWithSandboxPolicy(engine, session, sourceId) {
  if (!engine || typeof engine.duplicateObject !== 'function') return { id: null, blocked: false, spent: 0 };
  const source = typeof engine.getObject === 'function' ? engine.getObject(sourceId) : null;
  const kit = session && session.mode === 'field-kit';
  const cost = kit ? gearCreditCost(source && source.kind) : 0;
  if (kit && !session.canSpendCredits(cost)) return { id: null, blocked: true, spent: 0 };
  const id = engine.duplicateObject(sourceId);
  if (kit && id != null) session.spendCredits(cost);
  return { id, blocked: false, spent: kit && id != null ? cost : 0 };
}

/** Apply cell credits to flood-fill/clone writes; erasure is free and never refunds. */
export function setWithSandboxPolicy(engine, session, x, y, id, options = {}, material = null) {
  if (!engine || typeof engine.set !== 'function') return false;
  const previous = typeof engine.get === 'function' ? engine.get(x, y) : 0;
  const kit = session && session.mode === 'field-kit';
  const shouldCharge = kit && id !== 0 && previous !== id;
  const cost = shouldCharge ? materialCellCost(material || {}) : 0;
  if (shouldCharge && !session.canSpendCredits(cost)) return false;
  const placed = engine.set(x, y, id, options);
  if (placed && shouldCharge) session.spendCredits(cost);
  return placed;
}
