#!/usr/bin/env bash
# SWARM - one-command dev launcher.
# Starts the backend (Fastify, :8787) and the frontend (Vite, :6767) together,
# installs deps on first run, and tears both down on Ctrl-C.
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

echo "Starting frontend -> http://localhost:6767"
(cd "$FRONTEND" && npm run dev) &

echo
echo "SWARM is starting. Open http://localhost:6767 (default login: admin / vibhackiscool)."
echo "Press Ctrl-C to stop both servers."
echo

wait
