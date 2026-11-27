import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/base.css';
import './styles/kit.css';
import './styles/home.css';
import './styles/lab.css';
import './styles/panels.css';
import { initTheme } from './core/theme.js';
import { applyPersonalisation } from './core/settings.js';
import { migrateStorageKeys } from './core/storage-migration.js';

// v3 storage migration: safe one-way copy of legacy omni:* keys to
// matterlab:* names (old keys untouched) — must run before the app boots.
try { migrateStorageKeys(); } catch { /* storage unavailable — defaults apply */ }

// Apply the saved theme before first paint, same as the OmniTools shell.
try { initTheme(); } catch { /* defaults in theme.css apply */ }
try { applyPersonalisation(); } catch { /* defaults apply */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: register the service worker (production builds only; the file is
// shipped from public/sw.js and served next to index.html).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => { /* offline support is best-effort */ });
  });
}
