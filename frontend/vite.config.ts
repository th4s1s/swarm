import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const BACKEND = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8787';

// Proxy /api and /ws to the backend so the SPA is same-origin in dev:
// the vh_session httpOnly cookie and the WebSocket handshake then "just work".
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Listen on all interfaces so the dev server is reachable from other hosts
    // on the LAN (e.g. http://<machine-ip>:6767), not just localhost.
    host: true,
    port: 6767,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/ws': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
});
