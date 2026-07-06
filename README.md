# SWARM

**Parallel-agent source-code security auditing.**

SWARM is a self-hosted web app that drives the **Claude Code CLI** to run a structured, multi-phase
security audit of a codebase - *recon → deploy → audit → fpcheck → verify → report* - fanning out
parallel subagents at each phase (the "swarm"). You manage target projects, launch audit sessions,
watch each run stream live in a Claude-CLI-style terminal, fork sessions to verify individual findings
against a live instance, and keep an eye on Claude quota/usage and Docker resources - all from one UI.

The audit methodology itself is a Claude Code skill, **`vibehack`**, bundled in this repo under
[`skill/`](skill/). SWARM orchestrates it by driving the `claude` binary (only the Claude CLI can run
locally-installed slash-command skills). You install the skill once with `skill/install.sh` (it
symlinks the skill into `~/.claude/`), after which the app invokes it as `/vibehack:<phase>` commands.

## Architecture

```
Browser ──► frontend (React + Vite + Tailwind, neon-green UI)   :6767
                │  REST /api  +  WebSocket /ws   (Vite dev proxy → :8787)
                ▼
            backend (Fastify + TypeScript + SQLite)             :8787
                │  spawns `claude --print --output-format stream-json …`
                ▼
            Claude Code CLI  ──runs──►  vibehack skill  (skill/ → ~/.claude/skills/vibehack)
                │
                ├─ projects  → /vibe/hack/projects/<name>      (cloned/extracted source)
                └─ audits    → /vibe/hack/audits/<name>/audit-<ts>/  (audit.db, artifacts, reports)
```

- **`skill/`** - the `vibehack` audit skill: methodology, per-phase workflows, and report templates.
  Installed into Claude Code with `skill/install.sh`. See [skill/README.md](skill/README.md).
- **`backend/`** - Fastify API + per-session WebSocket. Manages projects (git clone / zip), audit
  sessions and forks, the run queue, MCP servers, quota, usage, and Docker resources. App state in
  SQLite (`backend/data/app.db`); each audit's findings are read read-only from the skill's `audit.db`.
  See [backend/README.md](backend/README.md).
- **`frontend/`** - the SPA: projects, the live session monitor (terminal + JSON), run controls,
  findings/reports, and the ops dashboards. See [frontend/README.md](frontend/README.md).
- **`PLAN.md`** - the product spec / feature vision.

## Requirements

- **Node.js ≥ 22** (backend uses global `fetch`/`WebSocket`).
- **Claude Code CLI** installed and logged in (`~/.claude/.credentials.json` present) - used for audit
  runs, quota, and MCP. Install it from https://claude.com/claude-code, then run `claude` once to log in.
- **git**, an `unzip`-capable environment, and **Docker** (for live deploys + the Resources panel).
- **Python 3** and network access (for the self-contained scanner toolchain: `scripts/install-tools.sh`
  builds a semgrep venv and downloads scanner binaries into `tools/`, which is gitignored and never put
  on your PATH).
- The audit roots exist (or point `PROJECTS_DIR` / `AUDITS_DIR` elsewhere): `/vibe/hack/projects`,
  `/vibe/hack/audits`.

## Quick start

From a fresh clone of this repo:

```bash
# 1) Install the bundled vibehack skill into Claude Code (one time).
bash skill/install.sh        # symlinks ~/.claude/skills/vibehack + the /vibehack:* commands -> skill/
#    Then reload Claude Code (start a new session, or run /skills) so it picks the skill up.

# 2) Install the self-contained scanner toolchain into ./tools (one time; ./start.sh also does this).
bash scripts/install-tools.sh   # semgrep venv + gitleaks binary under tools/ (gitignored, off-PATH)

# 3) Make sure the audit roots exist (or set PROJECTS_DIR / AUDITS_DIR).
mkdir -p /vibe/hack/projects /vibe/hack/audits

# 4) Start the app (installs npm deps on first run; Ctrl-C stops both servers).
./start.sh                   # backend :8787 + frontend :6767
```

Open **http://localhost:6767** and log in (default `admin` / `vibhackiscool` - change it in
`backend/.env` or on the Config page). Then:

1. **Create a project** - paste a git URL, or drag-and-drop / choose a `.zip` of the source.
2. **Open it and create an audit session.**
3. **Pick a phase** (or a `full` / `source` mode) and click **Run** - watch it stream live in the
   terminal. Between phases the app can run each phase separately (recon → deploy → audit → fpcheck →
   verify → report), or `source` mode runs an unattended source-only audit end to end.
4. **Read the results** - the session's **Findings** tab (from the audit's `audit.db`) and **Report**
   tab (the maintainer-facing vuln report). Findings status/severity and the report are both editable.

<details><summary>Prefer to run the two servers by hand instead of <code>./start.sh</code></summary>

```bash
# backend  (terminal A)
cd backend && cp .env.example .env && npm install && npm start   # http://127.0.0.1:8787
# frontend (terminal B)
cd frontend && npm install && npm run dev                        # http://localhost:6767
```
</details>

## Configuration

Backend settings come from `backend/.env` (created from `backend/.env.example` on first `./start.sh`)
and can also be edited live on the **Config** page. Common knobs: `ADMIN_USER` / `ADMIN_PASS`, `PORT`
(8787), `CORS_ORIGIN` (the frontend origin), `PROJECTS_DIR` / `AUDITS_DIR` / `SKILL_DIR`, `CLAUDE_BIN`,
and the per-run defaults (`DEFAULT_MODEL`, `DEFAULT_EFFORT`, `MAX_CONCURRENT_RUNS`, …).

## Repository layout

```
skill/      the vibehack audit skill + its own README (install via skill/install.sh)
backend/    Fastify + TS API, runner, ops modules, tests
frontend/   React + Vite + Tailwind SPA
start.sh    one-command dev launcher (backend + frontend)
PLAN.md     product spec
```

Heavy/transient dirs are gitignored: `*/node_modules`, `frontend/dist`, `backend/data` (app.db + JWT
secret). Audit phases spawn real `claude` runs and consume Claude quota.
