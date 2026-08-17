import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const BACKEND = process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8787';

// Proxy /api and /ws to the backend so the SPA is same-origin: the vh_session
// httpOnly cookie and the WebSocket handshake then "just work". Shared by the dev
// server (HMR) and the preview server (serves the built dist/ in production).
const proxy = {
  '/api': { target: BACKEND, changeOrigin: true },
  '/ws': { target: BACKEND, changeOrigin: true, ws: true },
};

// Extra hostnames allowed on the public preview server (Host-header check, guards
// against DNS-rebinding). IP-literal and localhost hosts are always allowed, so this
// only needs to list real domains. Set VITE_ALLOWED_HOSTS=my.domain.com when the
// production domain is added - no code change required. Left unset = IP access only.
const allowedHosts = process.env.VITE_ALLOWED_HOSTS
  ? process.env.VITE_ALLOWED_HOSTS.split(',').map((s) => s.trim()).filter(Boolean)
  : undefined;

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },

  // Dev server (HMR). SECURITY: bound to localhost only - a Vite *dev* server serves
  // the raw source tree (and, via server.fs, files across the repo), so it must never
  // be exposed on a public/LAN interface. For remote dev use an SSH tunnel, or hit the
  // preview/production server. The public surface is the preview server below.
  server: {
    host: '127.0.0.1',
    port: 6767,
    proxy,
  },

  // Preview server = the PUBLIC surface. `vite preview` serves ONLY the built dist/
  // (static assets), never source and never /@fs/, so it cannot leak project files.
  // Binds all interfaces for IP/domain access; still proxies /api + /ws to the backend
  // (which stays localhost-only).
  preview: {
    host: true,
    port: 6767,
    allowedHosts,
    proxy,
  },
});
