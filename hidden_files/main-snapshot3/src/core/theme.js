/**
 * Theme Manager - Settings Page Feature
 * Supports multiple themes + Make Your Own Theme
 * Stores in localStorage, applies via CSS variables
 */

const THEME_KEY = 'omni:theme';
const CUSTOM_THEME_KEY = 'omni:custom-theme';

export const THEMES = {
  dark: {
    id: 'dark',
    name: 'Dark (Default)',
    nameHi: 'डार्क (डिफॉल्ट)',
    description: 'AMOLED black + green + cyan - Battery saving',
    colors: {
      '--bg': '#000000',
      '--s1': '#080B0A',
      '--s2': '#0E1412',
      '--s3': '#141C19',
      '--line': '#1C2724',
      '--line2': '#26332F',
      '--green': '#00FF9C',
      '--green-dim': '#00C77A',
      '--cyan': '#00E5FF',
      '--cyan-dim': '#00B4CC',
      '--grad': 'linear-gradient(135deg,#00FF9C 0%,#00E5FF 100%)',
      '--fg': '#E8FFF4',
      '--fg2': '#9DB5AC',
      /* W31 §3.4 contrast floor: raised from #6E857C (≈4.7:1 on --s2,
         borderline for 11px labels) to the spec target ≈#84A295 on
         black (≈7.6:1 on --bg, ≈6.7:1 on --s2). All other presets
         already clear body ≥4.5:1 for --fg2/--fg3 on --bg and --s2
         (checked 2026-11-23, see fixwave/w31-work/B1.md). */
      '--fg3': '#84A295',
      '--warn': '#FFD166',
      '--bad': '#FF5C7A',
    },
    isDark: true,
  },
  light: {
    id: 'light',
    name: 'Day',
    nameHi: 'डे',
    description: 'Clean white + deep green - Day mode for bright light',
    colors: {
      '--bg': '#FFFFFF',
      '--s1': '#F5F7F6',
      '--s2': '#E8EFEC',
      '--s3': '#DDE8E3',
      '--line': '#C5D6CF',
      '--line2': '#A8C0B5',
      /* Accents are deepened from the first cut (#00A86B / #0096C7, only
         ~3:1 on white) so small green/cyan text keeps real contrast in
         daylight: #00875A ≈ 4.6:1, #0077A8 ≈ 5:1, warn #9A6E00 ≈ 4.6:1. */
      '--green': '#00875A',
      '--green-dim': '#006B44',
      '--cyan': '#0077A8',
      '--cyan-dim': '#005E85',
      '--grad': 'linear-gradient(135deg,#00875A 0%,#0077A8 100%)',
      '--fg': '#0A1F18',
      '--fg2': '#4A6B5E',
      '--fg3': '#4E7263',
      '--warn': '#9A6E00',
      '--bad': '#D32F2F',
    },
    isDark: false,
  },
  amoled: {
    id: 'amoled',
    name: 'AMOLED Pure Black',
    nameHi: 'एमोलेड प्योर ब्लैक',
    description: 'Pure black #000000 - Maximum battery saving',
    colors: {
      '--bg': '#000000',
      '--s1': '#000000',
      '--s2': '#0A0A0A',
      '--s3': '#141414',
      '--line': '#1A1A1A',
      '--line2': '#2A2A2A',
      '--green': '#00FF88',
      '--green-dim': '#00CC6A',
      '--cyan': '#00D4FF',
      '--cyan-dim': '#00A8CC',
      '--grad': 'linear-gradient(135deg,#00FF88 0%,#00D4FF 100%)',
      '--fg': '#FFFFFF',
      '--fg2': '#A0A0A0',
      '--fg3': '#7A7A7A',
      '--warn': '#FFCC00',
      '--bad': '#FF3366',
    },
    isDark: true,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Blue',
    nameHi: 'ओशन ब्लू',
    description: 'Deep blue + cyan - Calm and cool',
    colors: {
      '--bg': '#001122',
      '--s1': '#001A33',
      '--s2': '#002244',
      '--s3': '#002A55',
      '--line': '#003366',
      '--line2': '#004477',
      '--green': '#00FFCC',
      '--green-dim': '#00CCAA',
      '--cyan': '#00CCFF',
      '--cyan-dim': '#0099CC',
      '--grad': 'linear-gradient(135deg,#00FFCC 0%,#00CCFF 100%)',
      '--fg': '#CCEEFF',
      '--fg2': '#88BBDD',
      '--fg3': '#6E93B8',
      '--warn': '#FFAA00',
      '--bad': '#FF5566',
    },
    isDark: true,
  },
  forest: {
    id: 'forest',
    name: 'Forest Green',
    nameHi: 'फॉरेस्ट ग्रीन',
    description: 'Deep green + earth - Natural',
    colors: {
      '--bg': '#0A1A0A',
      '--s1': '#102010',
      '--s2': '#152A15',
      '--s3': '#1A331A',
      '--line': '#204020',
      '--line2': '#2A552A',
      '--green': '#66FF66',
      '--green-dim': '#44CC44',
      '--cyan': '#88FF88',
      '--cyan-dim': '#66CC66',
      '--grad': 'linear-gradient(135deg,#66FF66 0%,#88FF88 100%)',
      '--fg': '#CCFFCC',
      '--fg2': '#88AA88',
      '--fg3': '#749974',
      '--warn': '#FFCC66',
      '--bad': '#FF7777',
    },
    isDark: true,
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Orange',
    nameHi: 'सनसेट ऑरेंज',
    description: 'Warm orange + purple - Energetic',
    colors: {
      '--bg': '#1A0A00',
      '--s1': '#261500',
      '--s2': '#331E00',
      '--s3': '#402600',
      '--line': '#553300',
      '--line2': '#774400',
      '--green': '#FFAA00',
      '--green-dim': '#CC8800',
      '--cyan': '#FF6600',
      '--cyan-dim': '#CC5200',
      '--grad': 'linear-gradient(135deg,#FFAA00 0%,#FF6600 100%)',
      '--fg': '#FFEECC',
      '--fg2': '#CCAA88',
      '--fg3': '#A98A66',
      '--warn': '#FFCC00',
      '--bad': '#FF4444',
    },
    isDark: true,
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight Purple',
    nameHi: 'मिडनाइट पर्पल',
    description: 'Deep purple + pink - Mysterious',
    colors: {
      '--bg': '#0F0A1A',
      '--s1': '#1A1030',
      '--s2': '#251540',
      '--s3': '#301A50',
      '--line': '#402060',
      '--line2': '#552A80',
      '--green': '#AA66FF',
      '--green-dim': '#8844CC',
      '--cyan': '#FF66CC',
      '--cyan-dim': '#CC44AA',
      '--grad': 'linear-gradient(135deg,#AA66FF 0%,#FF66CC 100%)',
      '--fg': '#EEDDFF',
      '--fg2': '#AA88CC',
      '--fg3': '#9A7BC0',
      '--warn': '#FFCC66',
      '--bad': '#FF6666',
    },
    isDark: true,
  },
};

export function getCurrentThemeId() {
  try {
    return localStorage.getItem(THEME_KEY) || 'dark';
  } catch {
    return 'dark';
  }
}

export function getCustomTheme() {
  try {
    const custom = localStorage.getItem(CUSTOM_THEME_KEY);
    return custom ? JSON.parse(custom) : null;
  } catch {
    return null;
  }
}

export function saveCustomTheme(theme) {
  try {
    localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(theme));
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(themeId) {
  const custom = getCustomTheme();
  
  let theme;
  if (themeId === 'custom' && custom) {
    theme = custom;
  } else if (typeof themeId === 'string' && themeId.startsWith('my:')) {
    /* Saved "My Themes" (made by hand in Settings or created by the
       AI) apply through this same path by 'my:<id>'; data-theme still
       resolves to dark/light from the palette itself below. */
    theme = getMyThemes().find((t) => t.id === themeId.slice(3)) || THEMES.dark;
  } else {
    theme = THEMES[themeId] || THEMES.dark;
  }

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value);
  }
  /* The gradient is part of the theme, not a fixed brand colour: every
     built-in theme carries its own --grad; a custom theme derives one
     from its green/cyan pair so buttons and headings re-skin there too. */
  if (!theme.colors['--grad'] && theme.colors['--green'] && theme.colors['--cyan']) {
    root.style.setProperty('--grad',
      `linear-gradient(135deg, ${theme.colors['--green']} 0%, ${theme.colors['--cyan']} 100%)`);
  }
  /* The stylesheet's [data-theme] rules were dead because nothing ever
     set the attribute. 'light' now reaches them; 'custom' gets its own. */
  root.dataset.theme = themeId === 'custom' ? 'custom' : (theme.isDark ? 'dark' : 'light');

  // Set color-scheme for browser widgets
  root.style.setProperty('color-scheme', theme.isDark ? 'dark' : 'light');

  // Update theme-color meta
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = theme.colors['--bg'] || '#000000';
  }

  // Save
  try {
    localStorage.setItem(THEME_KEY, themeId);
  } catch {}

  return theme;
}

export function initTheme() {
  const themeId = getCurrentThemeId();
  return applyTheme(themeId);
}

// For settings page - list all themes including custom if exists
export function getAllThemes() {
  const custom = getCustomTheme();
  const all = { ...THEMES };
  if (custom) {
    all.custom = custom;
  }
  return all;
}

/* ---------- My Themes: the named palette library ----------
   An array under one key, separate from the single legacy custom
   slot above. Entries: {id, name, colors (the 16 theme vars),
   isDark, source: 'ai' | 'hand', createdAt}. The AI writes here via
   theme.create; Settings mirrors the same store by hand. */
const MY_THEMES_KEY = 'omni:my-themes';

export function getMyThemes() {
  try {
    const raw = localStorage.getItem(MY_THEMES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string'
      && t.colors && typeof t.colors === 'object' && typeof t.colors['--bg'] === 'string');
  } catch {
    return [];
  }
}

export function saveMyTheme(theme) {
  try {
    const list = getMyThemes().filter((t) => t.id !== theme.id);
    list.unshift(theme);
    localStorage.setItem(MY_THEMES_KEY, JSON.stringify(list.slice(0, 60)));
    return true;
  } catch {
    return false;
  }
}

export function deleteMyTheme(id) {
  try {
    localStorage.setItem(MY_THEMES_KEY, JSON.stringify(getMyThemes().filter((t) => t.id !== id)));
    return true;
  } catch {
    return false;
  }
}

/* Loose name lookup for "meri <name> theme lagao": normalised
   containment either way, so 'royal' finds 'Royal Gold'. */
export function matchMyTheme(query) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097F]+/g, ' ').trim();
  const q = norm(query);
  if (!q) return null;
  const list = getMyThemes();
  return list.find((t) => norm(t.name) === q)
    || list.find((t) => norm(t.name).includes(q) || q.includes(norm(t.name)))
    || null;
}
