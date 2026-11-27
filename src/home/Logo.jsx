import React from 'react';

/* Matter Lab mark — original hand-drawn inline SVG: an Erlenmeyer flask with
   a bubbling teal liquid and a rising vapour curl. No copied assets. */
export default function Logo({ size = 44, title = 'Matter Lab logo' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} style={{ display: 'block', flex: '0 0 auto' }}>
      <defs>
        <linearGradient id="ml-logo-liq" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4ee" />
          <stop offset="100%" stopColor="#0e9db8" />
        </linearGradient>
        <linearGradient id="ml-logo-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#bfeef7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7fb6c4" stopOpacity="0.75" />
        </linearGradient>
      </defs>
      {/* vapour curl */}
      <path d="M32 3c-2.5 2.6 2.5 4.4 0 7" fill="none" stroke="#2dd4ee" strokeWidth="2.4" strokeLinecap="round" opacity="0.85" />
      {/* flask outline */}
      <path
        d="M26 10h12v3.2c0 1 .34 1.95.92 2.72L48.6 43.5c1.86 3.1-.38 7-3.98 7H19.38c-3.6 0-5.84-3.9-3.98-7L25.08 15.9A3.9 3.9 0 0 0 26 13.2V10z"
        fill="rgba(20,44,56,0.55)"
        stroke="url(#ml-logo-glass)"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* liquid */}
      <path
        d="M23.4 34.5c2.8-1.7 5.4 1.6 8.6 0 3.1-1.6 5.8 1.7 8.6 0l4.9 8.1c1.15 1.9-.27 4.4-2.5 4.4H21c-2.23 0-3.65-2.5-2.5-4.4l4.9-8.1z"
        fill="url(#ml-logo-liq)"
      />
      {/* bubbles */}
      <circle cx="28" cy="42" r="2.1" fill="#dffaff" opacity="0.9" />
      <circle cx="35.5" cy="39" r="1.5" fill="#dffaff" opacity="0.8" />
      <circle cx="32" cy="44.5" r="1.1" fill="#dffaff" opacity="0.7" />
      {/* glass highlight */}
      <path d="M24.5 20 17.8 35" stroke="#eafcff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
