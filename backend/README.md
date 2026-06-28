# vibehack app — backend

Backend for the source-code-audit web app. It drives the **Claude Code CLI** to run the
`vibehack` audit skill (at `/vibe/hack/skill`), manages projects and audit sessions, streams
each run live over WebSocket, forks sessions for per-finding verification, and exposes ops
panels (MCP, Claude quota, token usage, Docker resources, app config).

Stack: **Fastify + TypeScript**, **SQLite** (`better-sqlite3`). Drives the `claude` binary
(only the CLI can run locally-installed slash-command skills). The implementation plan is at
`/home/lio/.claude/plans/i-need-you-to-iterative-newt.md`; the product spec is `../PLAN.md`.

> No frontend yet — this is the backend only. See the plan's "Frontend-deferred" section for the
> UI that consumes these APIs (terminal/JSON monitoring views, tables, graphs, etc.).

## Requirements

- Node.js >= 22 (uses the global `fetch`/`WebSocket`).
- `claude` CLI logged in (`~/.claude/.credentials.json` present) — used for runs, quota, MCP.
- `git`, `unzip`-capable env, and Docker (for the Resources panel).
- The skill roots exist: `/vibe/hack/projects`, `/vibe/hack/audits`, `/vibe/hack/skill`.

## Setup

```bash
cp .env.example .env      # adjust as needed (admin creds, paths, model, etc.)
npm install
npm run dev               # tsx watch on http://127.0.0.1:8787
# or: npm start (no watch) | npm run build (emit dist) | npm test (vitest)
```

Auth: single admin, default `admin` / `vibhackiscool` (override via `.env` or `PATCH /api/config`).
Login sets an httpOnly JWT cookie; all routes except `/api/health` and `/api/login` require it.

## API surface

- **Auth**: `POST /api/login`, `POST /api/logout`, `GET /api/me`
- **Projects**: `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/:id`,
  `GET /api/projects/:id/branches`, `POST /api/projects/:id/{checkout,check-updates,update,reupload}`
  (create = git JSON `{title,name,url,token?}` or zip multipart `file` part)
- **Sessions**: `POST /api/projects/:id/sessions`, `POST /api/sessions/:id/fork`,
  `GET/PATCH/DELETE /api/sessions/:id`, `GET /api/sessions/:id/{findings,report}`
- **Runner**: `POST /api/sessions/:id/runs` `{phase?,mode?,customPrompt?,findingId?}`,
  `GET /api/sessions/:id/runs`, `POST /api/sessions/:id/{steer,stop}`,
  `GET /api/runs/:id`, `GET /api/runs/:id/events`, `POST /api/runs/:id/cancel`, `DELETE /api/runs/:id`,
  `GET /api/runner/options`, and **WebSocket `GET /ws/sessions/:id`** (live stream-json events + run/session lifecycle)
- **MCP**: `GET /api/mcp` (`?scope=user|project&project=`), `GET /api/mcp/:name`,
  `POST /api/mcp`, `POST /api/mcp/json`, `DELETE /api/mcp/:name`
- **Quota**: `GET /api/quota` (account email, plan, 5h/weekly/per-model windows + resets)
- **Usage**: `GET /api/usage/{summary,by-model,by-project,timeseries}` (token + estimated cost)
- **Resources**: `GET /api/resources/{status,images,containers,io}`, container
  `start/stop/restart`, image/container delete + `bulk-delete`
- **Config**: `GET/PATCH /api/config`

## How a run works

Each run spawns `claude --print --output-format stream-json --verbose --resume <sid>` (root first run
uses `--session-id`; a fork's first run uses `--resume <parent> --fork-session`). The runner streams
events to the session's WebSocket and persists them to `<AUDIT_DIR>/.app/runs/<run>.jsonl`. The queue
runs serially per session, bounded globally by `MAX_CONCURRENT_RUNS`.

## Skill integration

When the backend launches the skill it sets `VIBEHACK_APP=1`, `VIBEHACK_AUDIT_DIR`, `VIBEHACK_PROJECT`
and cwd = the project root. The skill (see `/vibe/hack/skill/references/app-integration.md`) uses the
pre-created workspace and writes `<AUDIT_DIR>/.app/state.json` at each phase boundary. Findings/groups
are read directly from each audit's `audit.db` (read-only). With those env vars unset, the skill runs
exactly as it did standalone.

## Notes

- Per-session Claude config (`config` on create/PATCH, defaults via `PATCH /api/config`):
  `mode`, `permissionMode`, `model`, **`effort`** (`low|medium|high|xhigh|max` → `--effort`),
  **`thinking`** (`true|false|null` → extended thinking via `MAX_THINKING_TOKENS`), `thinkingTokens`.
- Usage cost is **estimated** from public list prices; subscription plans aren't billed per call.
- Runs use `--permission-mode bypassPermissions` (this host is a controlled audit sandbox); change via
  per-session config or `PATCH /api/config` (`default_permission_mode`).
- `data/` (app.db, jwt secret) and `.env` are gitignored.
