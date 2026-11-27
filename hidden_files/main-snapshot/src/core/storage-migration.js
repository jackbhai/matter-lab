/**
 * Storage-key migration (v3, P5) — SAFE, copy-only, one-way.
 *
 * The app was extracted from OmniTools and still reads legacy `omni:*`
 * localStorage keys. Renaming the keys the app reads would require editing
 * app code owned by other builders, so this module does NOT rename anything
 * in place. Instead, on boot (before the app reads storage) it performs a
 * one-way COPY of every known legacy key to its future `matterlab:*` name:
 *
 *   - old keys are never deleted or modified — existing saves keep loading
 *     exactly as before (the app still reads the old names);
 *   - a copy is only written when the new key does not already exist, so the
 *     migration is idempotent and can never clobber newer data;
 *   - a future rename (app code switched to `matterlab:*`) then loses
 *     nothing, because the data is already waiting under the new names.
 *
 * Key map (also documented in V3-REPORT.md, P5 section):
 */
export const STORAGE_KEY_MAP = [
  ['omni:settings', 'matterlab:settings'],
  ['omni:theme', 'matterlab:theme'],
  ['omni:custom-theme', 'matterlab:custom-theme'],
  ['omni:my-themes', 'matterlab:my-themes'],
  ['omni:sandlab:favs', 'matterlab:sandlab:favs'],
  ['omni:sandlab:recent', 'matterlab:sandlab:recent'],
  ['omni:sandlab:scenes', 'matterlab:sandlab:scenes'],
  ['omni:sandlab:recipes', 'matterlab:sandlab:recipes'],
  ['omni:sandlab:neutral', 'matterlab:sandlab:neutral'],
  ['omni:sandlab:seen', 'matterlab:sandlab:seen'],
  ['omni:matterlab:customs', 'matterlab:customs'],
];

const DONE_FLAG = 'matterlab:migration:v3-done';

export function migrateStorageKeys() {
  try {
    if (localStorage.getItem(DONE_FLAG)) return 0;
    let copied = 0;
    for (const [oldKey, newKey] of STORAGE_KEY_MAP) {
      try {
        const value = localStorage.getItem(oldKey);
        if (value != null && localStorage.getItem(newKey) == null) {
          localStorage.setItem(newKey, value);
          copied++;
        }
      } catch { /* per-key guard: quota / privacy mode */ }
    }
    try { localStorage.setItem(DONE_FLAG, '1'); } catch { /* ignore */ }
    return copied;
  } catch {
    return 0; // storage unavailable — app defaults apply, nothing breaks
  }
}

export default migrateStorageKeys;
