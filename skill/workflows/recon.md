# vibehack - recon: Source Detection + Reconnaissance + Feature Mapping

**Purpose**: Detect the audit target, identify feature groups, and produce a complete code-to-feature mapping via parallel subagents. End by writing the resume note.

**Entry**: User invokes the **recon** phase (see SKILL.md → *How phases are invoked (Claude Code CLI)*) or "audit this app" (full pipeline).
**Exit**: All feature groups mapped, resume note saved, user gate before deploy phase.

---

## Step 1 - Create audit workspace

```bash
PROJECT="$VIBEHACK_PROJECT"                                 # provided by the app (or skill/dev-run.sh)
AUDIT_HOME="/vibe/hack/audits/${PROJECT}"                   # per-project audit home (holds the live-instance note; persists across re-audits)
AUDIT_DIR="$VIBEHACK_AUDIT_DIR"                             # THIS run's dir: audit.db (schema already seeded), artifacts, AND the resume note - all OUTSIDE the project tree
```

> **Workspace + schema are app-provided.** The wrapping app (or `skill/dev-run.sh`) already created
> this workspace - the `files/`/`artifacts/`/`archived-poc/` dirs and an `audit.db` **with the full
> schema already seeded** ([../schema.sql](../schema.sql)). Use it **as-is**: do **not** mint a new
> `audit-<timestamp>` dir, do **not** create any tables yourself, and do **not** orient/inspect - don't
> list `/vibe/hack/audits/`, don't `find`/`ls`/`sqlite3`-probe the dir, and don't deliberate "resume
> vs fresh". An empty-but-schema'd `audit.db` is expected. Set the vars above and proceed straight to
> Step 2. Also follow [../references/app-integration.md](../references/app-integration.md) (write
> `<AUDIT_DIR>/.app/state.json` at each phase boundary).

Notes live alongside the artifacts on disk, not in your memory:
- **Resume note** (per run): `${AUDIT_DIR}/${PROJECT}-audit-resume.md`
- **Live-instance note** (per project, survives re-audits): `${AUDIT_HOME}/${PROJECT}-live-instance.md`

`archived-poc/` starts empty; verify forks may consult it for report-format examples, and the user archives each finalized report + its `poc/` into `archived-poc/<finding-id>/` after sending it to the maintainer.

Record `AUDIT_DIR` - every later step uses it. It is an **absolute path outside the project tree**, so artifact writes resolve no matter the cwd. **Still, keep the cwd at the project root for the whole audit and never `cd` into `${AUDIT_DIR}`:** verify forks inherit the orchestrator's current directory and Claude's resume picker groups sessions by it, so a drifted cwd files your forks under a *different* project and hides them from this project's picker (see SKILL.md Essential Principle #10 and lessons-learned #17).

## Step 2 - Phase 0 source detection

Follow [../references/phase0-source-detection.md](../references/phase0-source-detection.md) exactly:

1. Detect a binary target for autorev: Glob for an existing `**/*.i64` or a binary; if found, `create_database(<binary>, overwrite_existing=true)` (skip if a good `.i64` exists) → `load_database(<.i64>)` → `get_database_metadata` / `get_binary_overview` to confirm. (autorev is single-DB-per-session - load once here in the orchestrator.)
2. Scan workspace for source-code indicators (build files, common dirs).
3. Ask the user to choose the appropriate prompt variant (see SKILL.md → *Tools & subagents*). *(Automated `source` mode: auto-select the **source** target without asking; abort if the target is binary/autorev-only - see [source.md](source.md).)*
4. Insert into `vh_sources`.

## Step 3 - Reconnaissance (go deep - this is the coverage foundation)

Recon as **deeply and exhaustively** as possible: everything you miss here becomes an audit blind spot. For source, use `Grep` (keyword/regex), `Glob`, and agentic exploration. For a binary target, use autorev: `get_binary_overview` for the high-level survey, then `list_functions` / `list_exports` / `list_imports` / `list_strings` for the inventory. Gather:

- Language(s) and framework(s)
- Build/deploy system (Dockerfile, docker-compose, Makefile, install scripts)
- **Complete file/function inventory** - source: enumerate *every* file/dir (`Glob **/*`), not just the obvious ones. Binary: enumerate *every* function via `list_functions`. This list is the denominator for the coverage check in Step 4 (every file/function must end up in a group).
- **Exhaustive entry-point enumeration** - source: *all* HTTP/RPC/GraphQL routes, CLI commands, event/message handlers, scheduled tasks, IPC endpoints, deserializers, parsers, callbacks, plugin hooks (don't stop at the first router file). Binary: `list_exports` (entrypoints) + imports that signal input handling (`list_imports`).
- Authentication/authorization patterns and every trust boundary (privilege, network, process, tenant)
- Configuration loading and all external inputs (env, files, network, args, DB)
- Existing test instances or compose files (helps deploy phase later)

## Step 4 - Define feature groups (maximize granularity + coverage)

Goal: **100% code coverage.** Divide the codebase into as **many fine-grained feature groups as it takes to cover every source file**, and decompose each group into **as many sub-features as possible**. Prefer many small, exhaustively-auditable groups over a few broad ones - a group whose every file one subagent can fully read beats a sprawling catch-all. There is **no upper limit** on group count; scale it to the codebase. The only hard rule is that **every file from the Step 3 inventory is assigned to exactly one group** (see [../references/phase2-feature-mapping.md](../references/phase2-feature-mapping.md) → Size Guidelines):

- Keep each group **small enough that one subagent can read every file in it** (rough target ≤ ~30 files / ≤ ~1500 LoC - split anything larger).
- **Split aggressively**; merge only groups that are genuinely trivial. Never drop or coarsen a group to keep the count down.
- Build an explicit **file → group map** from the Step 3 inventory; any unassigned file is a coverage gap to fix *before* mapping. (A catch-all "G-misc" for leftover utility/config files is fine - but it must still be mapped, not skipped.)
- Within each group, plan to enumerate granular sub-features (one per route/handler/command/parser/state-machine/etc.) - the more, the better.

Use the naming convention `G1…Gn` with stable IDs (so subagent outputs and SQL rows align).

Present the groups and ask the user to confirm (see SKILL.md → *Tools & subagents*): "I've identified N feature groups. [list]. Should I proceed?" with options `["Looks good - proceed", "Let me adjust the groups"]`. *(Automated `source` mode: auto-accept the proposed groups without asking - see [source.md](source.md).)*

Insert approved groups into `vh_feature_groups` (status='pending').

## Step 4.5 - Bucket scanner leads to groups

Before recon started, the app ran a deterministic baseline scan (semgrep + gitleaks) over the source and
recorded **leads** in `vh_scanner_hits` (`status='new'`, `group_id` NULL). Now that the file→group map
exists, assign each lead to its group so the mapping subagents can pick it up - one `UPDATE` per group,
listing that group's files:

```bash
sqlite3 "${AUDIT_DIR}/audit.db" "UPDATE vh_scanner_hits SET group_id='G<n>'
  WHERE group_id IS NULL AND file IN ('path/one.ext', 'path/two.ext', ...);"
```

Leads whose file maps to no group stay NULL (usually generated/out-of-scope files - a quick coverage
signal). **Leads are advisory hints, never findings**; they enrich the mapping in Step 5, they never
narrow it. (No leads is fine - the scan is best-effort and may be empty or skipped.)

## Step 5 - Parallel feature mapping subagents

**CRITICAL - use a writable subagent**: the mapping subagents must run with a **writable** `general-purpose` `Task` so their SQL inserts and artifact files persist; a read-only `Explore` agent silently produces no SQL inserts or artifact files. (See [../references/lessons-learned.md](../references/lessons-learned.md) item #1.)

**Spawn with the `Task`/`Agent` tool** (`subagent_type: general-purpose`, **`model: sonnet`**, with a `prompt`) - NOT `TaskCreate`/`TodoWrite` (those manage your own todo list and cannot spawn an agent). If a spawn call errors (wrong tool, bad params), **fix the call and retry it**; a spawn error is never a reason to map the groups yourself in the orchestrator (see SKILL.md Essential Principle 11).

Spawn ONE subagent per feature group, ALL in parallel (one `Task` call per group in the same response).

**Model - use `sonnet` for mapping subagents (and their recursive helpers).** Feature-mapping is
structural enumeration, not the adversarial hunt, so it does not need the strongest model - and the
deterministic baseline scan (Step 4.5) backstops coverage. Keep **yourself** (the recon orchestrator) on
the session's default model, and the later deep-audit hunters stay on the strongest model; only these
mapping subagents drop to `sonnet`.

**Recursive, self-scaling mapping (go as deep as the code demands):** a group may still be too large for one subagent to read every file. Instruct each mapping subagent that **if its assigned scope is too large to map exhaustively itself, it must split the scope and spawn its own writable `general-purpose` sub-subagents** (one per sub-scope, in parallel) - and the **same rule applies recursively** to those helpers, deepening until each leaf agent's slice is small enough to read in full. In Claude Code a subagent can spawn subagents, so this nests arbitrarily. Coordination so depth never clobbers files or races SQLite:
- A spawned **helper returns** its mapping (markdown sections + the attack-surface/observation rows) to its caller; it does **not** write the group file or SQL.
- Only the **group owner** (the subagent the orchestrator spawned for `G<n>`) writes `<AUDIT_DIR>/files/G<n>-mapping.md` and runs the group's SQL inserts, after merging everything its helpers returned.
- Each parent's **Coverage** line is the **union** of its own + all descendants' coverage (every file in the group mapped).
- Fallback: if spawning is unavailable, the agent maps its whole scope itself, sequentially - never skip files for lack of helpers.
- **autorev/binary targets**: the parallel + recursive fan-out above is for **source**. autorev holds one DB per session, so for a binary target either map groups **serially** through the orchestrator's loaded session, or have each binary-mapping agent `load_database(<.i64>)` in its own session before analyzing - never have many agents contend on the same `.i64` concurrently.

Each subagent prompt (template from [../references/phase2-feature-mapping.md](../references/phase2-feature-mapping.md)) must include:

- Group ID + name + scope (key directories **and the explicit list of files assigned to this group** from the Step 4 file→group map)
- Access instructions: **source** → file paths + grep/glob; **binary** → autorev tools (`load_database` first if the agent has its own session, then `analyze_function` / `get_disassembly` / `get_cfg` / `list_functions` / `search_functions` / `find_symbol` / `list_imports` / `find_import_usages` / `find_string` / `list_strings` / `find_xrefs_to` / `get_xrefs_from` / `get_callees` / `get_callers`)
- **Max-coverage mandate**: read **every file in scope** (none skipped as "boring") and decompose the group into **as many granular sub-features as exist** - one per route/handler/command/parser/state-machine/helper that touches input. Map every entry point and every function that handles external/cross-boundary data.
- **Scanner leads are supplementary hints, not your scope.** Do the full max-coverage mapping above **first** - read every file and enumerate all sub-features independent of any leads (leads never narrow or replace it). THEN also review your group's leads (`SELECT tool, rule_id, severity, file, line, message FROM vh_scanner_hits WHERE group_id='G<n>'`): for each that maps to real code, fold it into your sub-features + `vh_security_observations`, then `UPDATE vh_scanner_hits SET status='triaged' WHERE group_id='G<n>'`. A lead is never a confirmed finding and never a substitute for full coverage.
- **Recursive-decomposition instruction** (template's *Scale yourself* section): split oversized scope and spawn helper sub-subagents that **return** their mapping; only the group owner writes the file + SQL.
- Instruction to write **two outputs**:
  1. Detailed mapping → `<AUDIT_DIR>/files/G<n>-mapping.md` - including a **Coverage** line listing the in-scope files read vs. any not yet mapped (target: none unmapped)
  2. SQL inserts into `vh_attack_surface` and `vh_security_observations`
- Instruction to return a compact summary (counts: sub-features, files read / files in scope, endpoints, observations)

After all subagents return:
- Verify each `files/G<n>-mapping.md` exists and is non-trivial.
- **Coverage check**: confirm every file from the Step 3 inventory appears in some group's mapping. Any unmapped file → assign it to a group and re-run that group's subagent (don't proceed with gaps).
- `UPDATE vh_feature_groups SET status='mapped' WHERE id=?` for each.
- Query SQL to confirm counts.

## Step 6 - Write the resume note + memory pointer

Use [../references/resume-note-template.md](../references/resume-note-template.md). Save to `<AUDIT_DIR>/<project>-audit-resume.md`. Then save a tiny **audit pointer in your own memory** (the resume-note path + current phase; see the template's *Memory pointer* section) so you auto-recall this audit and re-read the notes after any compaction. Update it at every later phase too. The resume note must include:

- Audit dir + DB path
- Pipeline status (recon DONE; deploy/audit/fpcheck/verify/report NOT STARTED)
- Feature group table (id, name, mapping file)
- Phase-2 observation counts (severity hint × group)
- Top "must-investigate" leads (12-20 items from observations) - these become the prioritization input for the audit phase
- Quirks / environment notes
- Resumption commands

## Step 7 - USER GATE

> _Automated `source` mode supersedes this gate - write the resume note and proceed to the audit phase without pausing (see [source.md](source.md))._

Present:

> Reconnaissance + feature mapping complete. N groups mapped with M total security observations. Resume note saved.
>
> Next: the **deploy** phase to bring up a live instance for later PoC verification, or the **audit** phase if you'll skip live testing (see SKILL.md for the phase syntax).
>
> Say **go deploy**, **go audit**, or **adjust** to revise mappings.
>
> **Before continuing, run a manual compact** (`/compact`). The resume note + SQL state + per-group mapping artifacts are already on disk, so compacting now is lossless.

Do NOT auto-advance. *(Exception: automated `source` mode auto-advances through this gate - see [source.md](source.md).)*

## Quality Checks

- [ ] `vh_sources` has one confirmed row
- [ ] `vh_feature_groups` has all groups with status='mapped'
- [ ] **Full coverage**: every source file from the Step 3 inventory is assigned to a group and appears in that group's mapping (no unmapped files)
- [ ] Groups are **fine-grained** - each ≤ ~30 files / ~1500 LoC; anything larger was split (granularity favored over a low group count)
- [ ] Every group is decomposed into multiple granular sub-features (a group with a single broad "feature" was mapped too shallow → re-run)
- [ ] Every group has a `files/G<n>-mapping.md` ≥ 50 lines
- [ ] Every group has ≥ 1 row in `vh_security_observations` (zero means mapping was too shallow → re-run that group's subagent)
- [ ] Resume note exists and includes the must-investigate leads list
