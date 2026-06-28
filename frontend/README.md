# SWARM - frontend

The web UI for **SWARM**, a parallel-agent source-code security-audit app. A single-page app that
talks to the [backend](../backend/README.md) over REST + a per-session WebSocket and renders the whole
audit experience: projects, audit sessions, a live Claude-CLI-style monitor, findings, reports, and ops
dashboards.

Stack: **React + Vite + TypeScript**, **Tailwind CSS** + shadcn-style components, **TanStack Query**
(REST), a native **WebSocket** hook (live stream), **React Router**, **Recharts** (graphs),
`react-markdown` (reports). Theme: a dark, modern **neon-green** design system.

## Requirements

- Node.js >= 18.
- The SWARM backend running on `http://127.0.0.1:8787` (see `../backend`).

## Setup

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
# npm run build      # type-check + production build to dist/
# npm run typecheck  # tsc --noEmit
```

Open **http://localhost:5173** and log in (default `admin` / `vibhackiscool`).

### How it talks to the backend

`vite.config.ts` proxies `/api` and `/ws` to `http://127.0.0.1:8787` (override with
`BACKEND_ORIGIN`). This makes the SPA same-origin in dev, so the backend's httpOnly auth cookie and the
WebSocket handshake work without CORS friction. The REST client (`src/lib/api.ts`) always sends
`credentials: 'include'`; a global 401 handler redirects to `/login`.

## Structure

```
src/
  main.tsx  App.tsx            # entry + router (providers: QueryClient, BrowserRouter)
  styles/globals.css           # neon theme tokens (RGB-triple CSS vars) + base styles
  lib/                         # api client, ws hook, shared types, formatters, query keys
  components/                  # AppShell/Sidebar, SwarmMark, status/severity, ConfirmDialog, ui/*
  features/
    auth/                      # login, RequireAuth guard, useAuth
    projects/                  # list, create (git/zip), detail, branches/checkout/update, live note
    sessions/                  # create + config form, fork dialog, SessionView (the workspace)
    monitor/                   # TerminalView, JsonView, eventBlocks, RunControls, QueueList
    findings/                  # FindingsPanel, ReportView (copy-as-markdown)
    ops/                       # shared data hooks for the dashboards
    quota/ usage/ resources/ mcp/ config/   # ops dashboards
```

## Key screens

- **Projects** - create from a git URL (+ optional token) or a zip upload; per-project git ops
  (branches, checkout, check-for-updates, update), zip re-upload, live-instance note editor.
- **Session view** - the centerpiece. A **fork-tree tab bar**, a **Session Monitor** with a
  **Terminal** view (renders the Claude stream-json events into CLI-style blocks) and a raw **JSON**
  view, plus per-run replay. Below the monitor: **run controls** - phase/mode chips + a custom-prompt
  box, with **queue / steer / stop**. On the right: **Findings**, **Report** (markdown + copy), **Queue**.
- **Quota** - account + usage-window meters with reset countdowns.
- **Usage** - token/cost time-series, by-model and by-project breakdowns (drill into sessions).
- **Resources** - Docker images/containers (search, filter, bulk delete, start/stop/restart) and live
  CPU/mem/network/disk I/O graphs.
- **MCP** - list/add/remove MCP servers (user + per-project scope).
- **Config** - app settings and per-run Claude defaults.

## Theme note

Theme colors are defined as **RGB-triple CSS variables** (e.g. `--primary: 41 255 160`) and consumed
in Tailwind as `rgb(var(--x) / <alpha-value>)`, so opacity modifiers (`bg-surface-2/60`,
`border-primary/40`, …) produce valid CSS. Keep that pattern when adding colors.
