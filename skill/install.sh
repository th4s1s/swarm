#!/usr/bin/env bash
# install.sh - Install the vibehack skill for Claude Code CLI.
#
# Design:
#   - Skill dir:  ~/.claude/skills/vibehack  -> SYMLINK to this repo, so edits to
#                 SKILL.md / workflows / references are picked up live (no reinstall).
#   - Launchers:  ~/.claude/commands/vibehack.md
#                 ~/.claude/commands/vibehack/
#                 SYMLINKED to this repo too. They reference the skill via the fixed
#                 install path ~/.claude/skills/vibehack, so no substitution is needed
#                 and launcher edits are picked up live as well.
#
# Claude Code auto-discovers the skill from ~/.claude/skills/ (by SKILL.md's
# description) and exposes the launchers as /vibehack and /vibehack:<phase>.
#
# Usage:
#   ./install.sh                  # install (symlink skill dir + launchers)
#   ./install.sh --uninstall      # remove the symlink + the installed launchers
#   ./install.sh -h | --help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SKILL_NAME="vibehack"

CLAUDE_SKILL_DIR="${HOME}/.claude/skills/${SKILL_NAME}"
CLAUDE_COMMANDS_DIR="${HOME}/.claude/commands"

UNINSTALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

# ---- sanity ----
if [[ ! -f "${SCRIPT_DIR}/SKILL.md" ]]; then
  echo "ERROR: SKILL.md not found next to install.sh." >&2
  exit 1
fi

# Symlink src -> dst, replacing an existing symlink or an older real copy in place.
link_cmd() {
  local src="$1" dst="$2"
  [[ -e "${src}" ]] || return 0
  mkdir -p "$(dirname "${dst}")"
  if [[ -L "${dst}" ]]; then rm -f "${dst}"
  elif [[ -e "${dst}" ]]; then rm -rf "${dst}"; fi  # older installs copied launchers; replace with a symlink
  ln -sfn "${src}" "${dst}"
  echo "  -> ${dst} -> ${src}"
}

uninstall() {
  echo "[vibehack] uninstalling"
  # Remove the skill symlink (only if it is a symlink - never delete a real dir).
  if [[ -L "${CLAUDE_SKILL_DIR}" ]]; then
    echo "  removing symlink ${CLAUDE_SKILL_DIR}"
    rm -f "${CLAUDE_SKILL_DIR}"
  elif [[ -e "${CLAUDE_SKILL_DIR}" ]]; then
    echo "  WARNING: ${CLAUDE_SKILL_DIR} exists and is NOT a symlink - leaving it untouched."
  fi
  rm -f "${CLAUDE_COMMANDS_DIR}/${SKILL_NAME}.md"
  rm -rf "${CLAUDE_COMMANDS_DIR}/${SKILL_NAME}"
  echo "Uninstalled."
}

install() {
  echo "[vibehack] installing"
  echo "  skill dir:    ${CLAUDE_SKILL_DIR}  (symlink -> ${SCRIPT_DIR})"
  echo "  commands dir: ${CLAUDE_COMMANDS_DIR}"

  # 1) Symlink the skill dir to this repo (live edits).
  mkdir -p "$(dirname "${CLAUDE_SKILL_DIR}")"
  if [[ -L "${CLAUDE_SKILL_DIR}" || ! -e "${CLAUDE_SKILL_DIR}" ]]; then
    ln -sfn "${SCRIPT_DIR}" "${CLAUDE_SKILL_DIR}"
  else
    echo "ERROR: ${CLAUDE_SKILL_DIR} already exists and is not a symlink." >&2
    echo "       Remove or rename it, then re-run install.sh." >&2
    exit 1
  fi

  # 2) Symlink the command launchers (they reference the skill via the fixed install
  #    path ~/.claude/skills/vibehack, so no substitution is needed and edits are live).
  link_cmd "${SCRIPT_DIR}/commands/${SKILL_NAME}.md" "${CLAUDE_COMMANDS_DIR}/${SKILL_NAME}.md"
  link_cmd "${SCRIPT_DIR}/commands/${SKILL_NAME}"    "${CLAUDE_COMMANDS_DIR}/${SKILL_NAME}"

  echo
  echo "Done."
  echo "Claude Code CLI: '/vibehack', '/vibehack:recon', :deploy, :audit, :fpcheck,"
  echo "  :verify <ids>, :report, :source"
  echo "  (Claude also auto-loads the skill from ${CLAUDE_SKILL_DIR}/ based on its"
  echo "   description triggers, e.g. 'audit this app'.)"
}

if [[ "${UNINSTALL}" == "1" ]]; then
  uninstall
else
  install
fi
