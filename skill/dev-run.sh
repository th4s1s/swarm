#!/usr/bin/env bash
# vibehack dev-run: launch the skill by hand for debugging, replicating what the SWARM app
# does before it spawns claude (create the workspace, seed the schema, set the env vars).
# The skill targets the app's environment only; this helper is the lightweight by-hand path.
#
# Usage: skill/dev-run.sh <project-path> [phase|mode]
#   phase|mode defaults to "full". Examples: recon | audit | fpcheck | report | source | full
#   Pass a verify target quoted:  skill/dev-run.sh /path/to/proj "verify G2-F1"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT_PATH="${1:-}"
STEP="${2:-full}"
if [[ -z "$PROJECT_PATH" || ! -d "$PROJECT_PATH" ]]; then
  echo "usage: $0 <project-path> [phase|mode]   (recon|deploy|audit|fpcheck|verify|report|source|full)" >&2
  exit 1
fi
PROJECT_PATH="$(cd "$PROJECT_PATH" && pwd)"
PROJECT="$(basename "$PROJECT_PATH")"

AUDITS_DIR="${AUDITS_DIR:-/vibe/hack/audits}"
AUDIT_DIR="${VIBEHACK_AUDIT_DIR:-${AUDITS_DIR}/${PROJECT}/audit-$(date -u +%Y%m%d-%H%M%S)}"
mkdir -p "${AUDIT_DIR}/files" "${AUDIT_DIR}/artifacts" "${AUDIT_DIR}/archived-poc" "${AUDIT_DIR}/.app/runs"

# Seed the schema exactly as the app does (same schema.sql, single source of truth).
sqlite3 "${AUDIT_DIR}/audit.db" < "${SCRIPT_DIR}/schema.sql"

case "$STEP" in
  full)   CMD="/vibehack" ;;
  source) CMD="/vibehack:source" ;;
  *)      CMD="/vibehack:${STEP}" ;;   # recon|deploy|audit|fpcheck|verify|report, or "verify G2-F1"
esac

echo "dev-run: project=${PROJECT}  audit_dir=${AUDIT_DIR}  cmd=${CMD}" >&2

cd "$PROJECT_PATH"
VIBEHACK_APP=1 \
VIBEHACK_AUDIT_DIR="$AUDIT_DIR" \
VIBEHACK_PROJECT="$PROJECT" \
  claude "$CMD"
