import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build runs at any path — GitHub Pages project
// site (/matter-lab/), a custom domain root, or a local preview.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 3000, strictPort: true, allowedHosts: true },
  build: { outDir: 'dist', target: 'es2020' },
});
