# App integration (vibehack web app)

This file documents how the **vibehack web app backend** drives this skill. Everything here is gated
on the env var `VIBEHACK_APP=1`; when it is unset (standalone Claude Code CLI use) none of this
applies and the skill behaves exactly as documented elsewhere.

## Environment variables the app sets

| Var | Meaning |
|---|---|
| `VIBEHACK_APP=1` | The skill is being driven by the app (not a human). Enables the behavior below. |
| `VIBEHACK_AUDIT_DIR` | Absolute path to the **already-created** audit workspace for this session, e.g. `/vibe/hack/audits/<project>/audit-<ts>`. The app created it (with `files/`, `artifacts/`, `archived-poc/` and an empty `audit.db`). **Use it as-is** - never mint a new `audit-<ts>` dir. (recon Step 1 already honors this.) |
| `VIBEHACK_PROJECT` | The project name (= the basename of the project root the app set as cwd). |

The app always launches `claude` with **cwd = the project root** (`/vibe/hack/projects/<project>`), so
`basename "$PWD"` equals `VIBEHACK_PROJECT` and the resume-picker / fork grouping behavior is correct.

## Workspace and orientation in app mode

`VIBEHACK_AUDIT_DIR` IS your workspace for this run - **use it directly**. Do not waste a turn
orienting: do **not** list `/vibe/hack/audits/`, do **not** `find`/`ls`/`sqlite3`-probe the dir to
inspect its state, do **not** read a memory pointer, and do **not** deliberate "resume vs fresh". The
app already created the workspace (it may be empty) and chose which phase to run - just run that phase
into `VIBEHACK_AUDIT_DIR`. An empty `audit.db`, missing resume note, or empty `files/`/`artifacts/` is
normal for a pre-created workspace; do not infer anything about prior progress from it - the app
controls sequencing. (Resume-detection, "locate the newest audit-<ts> dir", and memory-pointer recall
are standalone-CLI behaviors; skip them entirely when `VIBEHACK_AUDIT_DIR` is set.)

## Phase transitions and gates

The **app** controls phase pacing: each phase is a separate `claude` invocation that the app starts
(the user clicks a phase/mode button). So, in app mode:

- Treat per-phase **user gates** ("USER GATE", "ask the user to approve the next phase") as no-ops -
  finish the phase, write artifacts + resume note + `.app/state.json`, then stop. The app starts the
  next phase itself.
- **Auto-resolve detection prompts** (source-vs-autorev, feature-group split) with the best default
  and continue, exactly like the `source` precedence rules - do not block waiting for input.
- Verify/report **forks are created by the app** (`claude --resume <parent> --fork-session`), one per
  finding. You will be launched inside such a fork with a single finding id; run `verify` (and, if
  confirmed, `report`) for that one finding as usual.

## `<AUDIT_DIR>/.app/state.json` (write at each phase boundary)

Whenever you rewrite the audit resume note (i.e. at the end of every major phase), also write this
small JSON file so the app can show progress without parsing prose. It is **best-effort**: the app's
real source of truth is `audit.db` (groups/findings/verdicts) and the on-disk report files, so never
let a failure to write this file block the audit.

```json
{
  "schema": 1,
  "project": "<project>",
  "audit_dir": "/vibe/hack/audits/<project>/audit-<ts>",
  "db_path": "/vibe/hack/audits/<project>/audit-<ts>/audit.db",
  "mode": "full | source | phase",
  "phase": "recon | deploy | audit | fpcheck | verify | report",
  "phase_status": "in_progress | done | aborted",
  "counts": { "groups": 0, "findings": 0, "true_positives": 0 },
  "fork_inventory": [
    { "finding_id": "G1-F1", "final_id": "F-1", "severity": "HIGH", "title": "..." }
  ],
  "reports": [ "artifacts/F-1-vuln-report.md" ],
  "report_consolidated": "report.md or null",
  "updated_at": "<UTC ISO-8601>"
}
```

Notes:
- `fork_inventory` = the TRUE_POSITIVE findings that still need live verification (after fpcheck). It
  mirrors `SELECT finding_id, final_id, final_severity FROM vh_fp_verdicts WHERE verdict='TRUE_POSITIVE'`.
- `reports` lists per-finding report files (paths relative to `audit_dir`); `report_consolidated` is the
  single `report.md` for a `source` run (else null).
- In a **verify/report fork**: after writing `artifacts/<finding-id>-vuln-report.md`, add its path to
  `reports[]` and set `phase: "report"`, `phase_status: "done"`.

Create the `.app/` dir if needed: `mkdir -p "$VIBEHACK_AUDIT_DIR/.app"`.
