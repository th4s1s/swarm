# SWARM

**Parallel-agent source-code security auditing.**

SWARM is a self-hosted web app that drives the **Claude Code CLI** to run a structured, multi-phase
security audit of a codebase - *recon → deploy → audit → fpcheck → verify → report* - fanning out
parallel subagents at each phase (the "swarm"). You manage target projects, launch audit sessions,
watch each run stream live in a Claude-CLI-style terminal, fork sessions to verify individual findings
against a live instance, and keep an eye on Claude quota/usage and Docker resources - all from one UI.

The audit methodology itself lives in a separate Claude Code skill, **`vibehack`**
(repo: `th4s1s/vibehack`, installed at `/vibe/hack/skill`). SWARM orchestrates that skill; only
the Claude CLI can run locally-installed slash-command skills, so the backend drives the `claude` binary
directly.

> Status: **initial implementation.** Backend + frontend are functional and verified end-to-end.

## Architecture

```
Browser ──► frontend (React + Vite + Tailwind, neon-green UI)   :6767
                │  REST /api  +  WebSocket /ws   (Vite dev proxy → :8787)
                ▼
            backend (Fastify + TypeScript + SQLite)             :8787
                │  spawns `claude --print --output-format stream-json …`
                ▼
            Claude Code CLI  ──runs──►  vibehack skill  (/vibe/hack/skill)
                │
                ├─ projects  → /vibe/hack/projects/<name>      (cloned/extracted source)
                └─ audits    → /vibe/hack/audits/<name>/audit-<ts>/  (audit.db, artifacts, reports)
```

- **`backend/`** - Fastify API + per-session WebSocket. Manages projects (git clone / zip), audit
  sessions and forks, the run queue, MCP servers, quota, usage, and Docker resources. App state in
  SQLite (`backend/data/app.db`); each audit's findings are read read-only from the skill's `audit.db`.
  See [backend/README.md](backend/README.md).
- **`frontend/`** - the SPA: projects, the live session monitor (terminal + JSON), run controls,
  findings/reports, and the ops dashboards. See [frontend/README.md](frontend/README.md).
- **`PLAN.md`** - the product spec / feature vision.

## Requirements

- **Node.js ≥ 22** (backend uses global `fetch`/`WebSocket`).
- **Claude Code CLI** logged in (`~/.claude/.credentials.json`) - used for audit runs, quota, and MCP.
- The **`vibehack` skill** installed at `/vibe/hack/skill`.
- **git**, an `unzip`-capable environment, and **Docker** (for live deploys + the Resources panel).
- The audit roots exist: `/vibe/hack/projects`, `/vibe/hack/audits`.

## Quick start

```bash
# 1) backend  (terminal A)
cd backend
cp .env.example .env        # optional: admin creds, model/effort defaults, paths
npm install
npm start                   # http://127.0.0.1:8787

# 2) frontend (terminal B)
cd frontend
npm install
npm run dev                 # http://localhost:6767  (proxies /api + /ws to the backend)
```

Open **http://localhost:6767** and log in (default `admin` / `vibhackiscool`, configurable).
Create a project (git URL or zip), start a session, pick a phase (or `full`/`source` mode), and **Run**.

## Repository layout

```
backend/    Fastify + TS API, runner, ops modules, tests
frontend/   React + Vite + Tailwind SPA
PLAN.md     product spec
```

Heavy/transient dirs are gitignored: `*/node_modules`, `frontend/dist`, `backend/data` (app.db + JWT
secret). Audit phases spawn real `claude` runs and consume Claude quota.
