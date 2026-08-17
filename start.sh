#!/usr/bin/env bash
# SWARM - one-command launcher (public/production).
# Runs the backend (Fastify, localhost:8787) and serves the BUILT frontend via
# `vite preview` (static dist/ only, :6767) - so no source tree is ever exposed.
# Installs deps on first run, builds the frontend, and tears both down on Ctrl-C.
# For local UI development with HMR, instead run `cd frontend && npm run dev`
# (that dev server is localhost-only) alongside `cd backend && npm start`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo "SWARM launcher - root: $ROOT"

# First-run setup: env file + node_modules.
if [ ! -f "$BACKEND/.env" ] && [ -f "$BACKEND/.env.example" ]; then
  echo "  - creating backend/.env from .env.example"
  cp "$BACKEND/.env.example" "$BACKEND/.env"
fi
if [ ! -d "$BACKEND/node_modules" ]; then
  echo "  - installing backend dependencies…"
  (cd "$BACKEND" && npm install)
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "  - installing frontend dependencies…"
  (cd "$FRONTEND" && npm install)
fi
if [ ! -d "$ROOT/tools" ]; then
  echo "  - installing scanner toolchain into ./tools…"
  bash "$ROOT/scripts/install-tools.sh"
fi

# Kill the whole process group on exit so Ctrl-C stops both servers.
# Disarm the traps first so the handler runs exactly once (kill 0 signals our own
# group, which would otherwise re-fire the trap, spam the message, and crash).
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Shutting down SWARM…"
  kill 0 2>/dev/null
}
trap cleanup INT TERM EXIT

echo "Starting backend  -> http://127.0.0.1:8787"
(cd "$BACKEND" && npm start) &

echo "Building frontend (static bundle)…"
(cd "$FRONTEND" && npm run build)

echo "Serving frontend -> http://<host>:6767  (vite preview - static dist/ only, no source)"
(cd "$FRONTEND" && npm run preview) &

echo
echo "SWARM is starting. Open http://<host>:6767 (default login: admin / vibhackiscool)."
echo "Press Ctrl-C to stop both servers."
echo

wait
