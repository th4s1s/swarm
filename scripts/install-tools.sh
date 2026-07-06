#!/usr/bin/env bash
# SWARM - install the self-contained scanner toolchain into ./tools (gitignored).
#
# Tools are NEVER placed on the global PATH: the app invokes them by absolute path inside tools/,
# so a fresh clone is reproducible and there are zero command/version conflicts with the host.
# Idempotent - re-running skips anything already installed. Linux x86_64 / arm64.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS="$ROOT/tools"
BIN="$TOOLS/bin"
mkdir -p "$BIN"

# Pinned versions (bump deliberately).
SEMGREP_VERSION="1.156.0"
GITLEAKS_VERSION="8.21.2"

arch_tag() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "unsupported" ;;
  esac
}

# semgrep -> a self-contained venv; invoked as tools/semgrep/venv/bin/semgrep (venv shebang, no PATH).
install_semgrep() {
  if [ -x "$TOOLS/semgrep/venv/bin/semgrep" ]; then
    echo "semgrep: present ($("$TOOLS/semgrep/venv/bin/semgrep" --version 2>/dev/null || echo '?'))"
    return
  fi
  echo "semgrep: creating venv + installing ${SEMGREP_VERSION}"
  python3 -m venv "$TOOLS/semgrep/venv"
  "$TOOLS/semgrep/venv/bin/pip" install --quiet --upgrade pip
  "$TOOLS/semgrep/venv/bin/pip" install --quiet "semgrep==${SEMGREP_VERSION}"
  "$TOOLS/semgrep/venv/bin/semgrep" --version
}

# gitleaks -> a single static binary at tools/bin/gitleaks.
install_gitleaks() {
  if [ -x "$BIN/gitleaks" ]; then
    echo "gitleaks: present ($("$BIN/gitleaks" version 2>/dev/null || echo '?'))"
    return
  fi
  local arch tmp
  arch="$(arch_tag)"
  if [ "$arch" = "unsupported" ]; then echo "gitleaks: unsupported arch $(uname -m); skipping"; return; fi
  echo "gitleaks: downloading ${GITLEAKS_VERSION} (linux ${arch})"
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz" -o "$tmp/gitleaks.tgz"
  tar -xzf "$tmp/gitleaks.tgz" -C "$tmp" gitleaks
  mv "$tmp/gitleaks" "$BIN/gitleaks"
  chmod +x "$BIN/gitleaks"
  rm -rf "$tmp"
  "$BIN/gitleaks" version
}

install_semgrep
install_gitleaks

# --- later slices (not installed yet; uncomment + implement when the slice lands) ---
# install_osv_scanner   # Slice B - dependency CVE ingest (single Go binary)
# install_joern         # Slice B - code-property-graph dataflow (needs a JVM)
# install_codeql        # Slice B/C - deep taint + fpcheck reachability (toolchain bundle)
# install_ffuf / install_nuclei / install_sqlmap   # Slice D - live PoC confirmation

echo "tools ready under ${TOOLS} (self-contained; not on PATH)"
