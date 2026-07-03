---
name: vibehack
description: >-
  Runs a structured multi-phase security audit of an application using parallel
  subagents for recon, live-instance deployment, deep vulnerability hunting,
  false-positive verification, live PoC verification, and final reporting.
  Supports source code, autorev MCP binary reverse engineering, or both. Use for
  full app/repo audits, bug bounty audits, patch-bypass research, and automated
  source-only scans. Triggers on 'audit this app', 'security audit this
  codebase', 'find vulnerabilities in this project', 'run the vibehack audit',
  '/vibehack', phase requests like recon/deploy/audit/
  fpcheck/verify/report/source, and 'automated source-only audit'. NOT for
  single-file review, quick pattern scans, PR diff review, threat modeling only,
  or post-audit cleanup.
---

# vibehack - Parallel Feature-Mapped Vulnerability Hunting

A battle-tested methodology for auditing applications at scale. The workflow divides the target into feature groups, deploys a live instance, hunts vulnerabilities in parallel, eliminates false positives via static review, and verifies each survivor against the live instance via forked conversations.

## Essential Principles

1. **Source-agnostic**: Works with source directories, autorev MCP, or both. Detection happens automatically in recon; user confirms.

2. **Parallel-first, except verify**: Feature mapping, deep audit, and FP-check each spawn subagents per group/batch (independent work - parallelize it). On the inline path a mapping subagent may itself **recurse** - spawning helper sub-subagents when its group is too large to map exhaustively (see `workflows/recon.md` Step 5). **Per-finding verification is the exception: one fork/agent per finding, run *serially* (one at a time)** - they share a single live instance, so parallel PoCs race on config backup/restart.

3. **Memory-persistent across compactions**: Every major phase ends by **rewriting the audit resume note** (see `references/resume-note-template.md`). This single file lets the orchestrator survive arbitrary context compactions without losing state. SQLite (`audit.db`) holds the structured data; the resume note holds the working strategy. The resume note and live-instance note live **on disk** under `/vibe/hack/audits/<project>/` (not in your memory), so each phase also saves a tiny **pointer in your own memory** that references those note paths - you auto-recall it, so a fresh or compacted orchestrator is reminded to **read the notes and resume** instead of starting the audit over. (**App mode:** when `VIBEHACK_AUDIT_DIR` is set, do not resume-detect or recall a pointer at phase start - that dir is your workspace, the app picked the phase; just run it. See [references/app-integration.md](references/app-integration.md).)

4. **Manually compact between phases, never mid-phase**: Auto-compaction is unpredictable and frequently drops the exact reasoning/state the next phase needs (subagent outputs, dedup decisions, partial findings not yet flushed to SQL). At every user gate, **before saying "go" to the next phase**, run a manual compact (`/compact`). The phase you just finished has already written its artifacts to disk + a fresh resume note, so compacting at that boundary is lossless; compacting mid-phase is not.

5. **Subagent capability matters**: any subagent that must write artifacts, run SQL inserts, or hit the live instance needs a **writable** subagent - a `general-purpose` `Task`, **never** a read-only `Explore` agent (which silently produces no files/SQL). (Lesson learned the hard way - see `references/lessons-learned.md`.)

6. **Live verification is forked, not in-line**: After FP-check produces N true positives, each finding is verified in its **own forked conversation** (one fork/agent **per finding**), run **one at a time** so parallel PoCs don't race on the shared live instance. Each fork writes `verify-<finding-id>.md`, **adversarially reviews** its finding with fresh, read-only subagents (verify Step 2), and then **stops**. **Report is a distinct, user-invoked phase**: after verify completes, the user runs the **report** phase in that same fork (`/vibehack:report <ids>`) to write each confirmed finding's own lean `<finding-id>-vuln-report.md`, while the captured PoC evidence is still in context (there is **no** orchestrator consolidation). On Claude Code with the Workflow tool (ultracode), this runs as a serial loop of fresh agents - see [references/workflow-orchestration.md](references/workflow-orchestration.md).

7. **User gates control pacing**: User explicitly approves transitions between phases. Never auto-advance past a gate.

8. **FP-check is static-only**: FP-check subagents re-read source and apply 18 Hard Exclusions + 10 Precedent rules. They do NOT use the live instance - that is what verify forks are for. This separation prevents an "I couldn't reproduce it" handwave from killing a real source-level bug.

9. **Honest impact over inflated severity; PoC on the real build**: A finding is a vulnerability only when impact is demonstrated on the **real, unmodified** target via the **genuine attacker path with attacker-controlled inputs** - not a self-written harness, a sanitizer abort, or a debugger-injected condition (those prove a *defect*, not impact). Apply the attacker-advantage test first; if the stock-build outcome is unobservable or self-healing, it is Informational. Lead with the honest verdict and never defend an overstated severity under pushback. (See `references/lessons-learned.md` items 11–16.)

10. **Stay at the project root - never `cd` into the audit dir**: The audit dir lives **outside the project tree** at the absolute path `/vibe/hack/audits/<project>/audit-<ts>/` (`<project>` is the project-root basename). Keep the orchestrator's working directory at the **project root** (the audited repo, e.g. `/vibe/hack/projects/<project>/`) for the entire audit; reference the audit dir and `audit.db` by their absolute path - never `cd` into them. Because the dir is absolute, artifact writes resolve regardless of cwd; the reason to hold cwd at the project root is that **verify forks/branches inherit the orchestrator's current working directory** and Claude's resume picker groups sessions by that directory - so if the cwd drifts, the forks are filed under a *different* project and disappear from the picker (resumable by id, but hard to find). **Open every fork from the project root.** (See `references/lessons-learned.md` item 17.)

11. **Tool errors are fixed and retried, never an excuse to go inline**: If spawning a subagent (or any tool call) fails - wrong tool (e.g. `TaskCreate`/`TodoWrite` instead of the `Task`/`Agent` tool), a validation error, a read-only `Explore` used where a writable one was needed, a stall - **diagnose it, correct the call, and retry the spawn**. The orchestrator delegates the parallel/forked work (mapping, audit, fpcheck, verify); a failed tool call does not transfer that work to the orchestrator. Only after the **correct** spawn genuinely fails twice for a given unit may you materialize that one unit's output yourself (write its expected artifact + SQL) and record it in the resume note's *Quirks*. "I'll skip the subagents and do the work directly" is never acceptable - the orchestrator stays the orchestrator. (See `references/lessons-learned.md`.)

## Sub-Command Router

The skill supports six phases (invoke them individually after the prior phase completes, or run the full pipeline), plus an automated **`source`** run that chains recon → audit → fpcheck → report unattended for source-only scans.

### Phase → workflow mapping

| Phase | Workflow file | Purpose | Entry condition | Output |
|---|---|---|---|---|
| `recon` | [workflows/recon.md](workflows/recon.md) | Source detection, deep reconnaissance, **parallel feature mapping** into as many fine-grained groups/sub-features as needed for **full code coverage**, write resume note | Fresh start (or new target) | `vh_feature_groups`, `vh_attack_surface`, `vh_security_observations` populated; `files/G<n>-mapping.md` per group (every source file covered); resume note ready for compact |
| `deploy` | [workflows/deploy.md](workflows/deploy.md) | Deploy live instance from source (Docker, build artifact, or local run); document in `/vibe/hack/audits/<project>/<project>-live-instance.md` | Recon done OR independent setup task | Live instance running; endpoints documented; live-instance note saved at the per-project audit home |
| `audit` | [workflows/audit.md](workflows/audit.md) | Load prior CVEs/advisories (find patch-bypass surfaces), **parallel deep-audit subagents** per group, write resume note | Recon + deploy done | `vh_known_findings`, `vh_findings` populated; per-group `artifacts/G<n>-findings.md`; resume note updated |
| `fpcheck` | [workflows/fpcheck.md](workflows/fpcheck.md) | **Parallel FP-check subagents** apply Hard Exclusions / Precedent rules / Marginal Gain Test - **static review only**, no live testing; write resume note | Audit done | `vh_fp_verdicts` populated; per-batch `artifacts/phase5-batch<X>.md`; resume note updated |
| `verify` | [workflows/verify.md](workflows/verify.md) | **Runs in a forked conversation**, requires finding-ID list. Per-finding live PoC, **adversarial review** (Step 2), then writes `artifacts/verify-<finding-id>.md` and **stops** - it does NOT write the report (the user runs the **report** phase in the same fork afterward). Refuses to run without IDs. | FP-check produced TPs; user opened a fork and passed `<ids>`. | `verify-<id>.md` per finding (CONFIRMED / REFUTED / INCONCLUSIVE). |
| `report` | [workflows/report.md](workflows/report.md) | Write the vulnerability report(s) in the lean maintainer format (Summary / Root Cause / Steps + PoC / Impact). **Live: a distinct, user-invoked phase, run IN THE FORK** after verify has completed (`/vibehack:report <confirmed ids>`) → `artifacts/<id>-vuln-report.md` per finding with real PoC + captured output. **Source: consolidated, run in the orchestrator** → one `report.md`, Steps = reproduction guide (no run/output). No consolidation, no `disclosure-summary.md`. | Live: verify completed; user invokes report in the fork with the confirmed `<ids>`. Source: end of the `source` run. | Live: `artifacts/<id>-vuln-report.md` per confirmed finding + scripts in project-root `poc/`. Source: one consolidated `report.md`. |
| `source` | [workflows/source.md](workflows/source.md) | **Automated source-only run** (composite): chains recon → audit → fpcheck → report **unattended** - no deploy, no live instance, no verify, **no user gates**. For product teams scanning a codebase before release. CVE ingest best-effort. | Fresh start; source tree present; no human supervision wanted | one consolidated `report.md` + `audit.db`; all findings `verified='source-only'` (not live-verified) |

**Full pipeline mode**: orchestrator runs recon → deploy → audit → fpcheck → user opens one fork per finding (each fork verifies + reviews, then stops) → user runs the **report** phase in that same fork to write each confirmed finding's `<id>-vuln-report.md`. Each transition is gated, including the verify → report step; there is no separate orchestrator consolidation step.

**Automated source-only mode**: the **`source`** run does recon → audit → fpcheck → report **unattended and without a live instance** - every gate auto-proceeds, deploy and verify are skipped, and the orchestrator ends by writing one consolidated source-only `report.md` (Steps to reproduce are reproduction guides, no live PoC) (see [workflows/source.md](workflows/source.md)).

### How phases are invoked (Claude Code CLI)

| Invocation | Full pipeline | Specific phase |
|---|---|---|
| **Slash command** | `/vibehack` | `/vibehack:recon`, `/vibehack:deploy`, `/vibehack:audit`, `/vibehack:fpcheck`, `/vibehack:verify <ids>`, `/vibehack:report` |
| **Free-text** | "audit this app" | "run the vibehack recon phase" |

**Automated source-only run:** invoke `/vibehack:source` (or free-text "run the automated source-only audit") to chain recon → audit → fpcheck → report **unattended** with no live instance - see [workflows/source.md](workflows/source.md).

### Tools & subagents (Claude Code)

The workflows name **capabilities**; on Claude Code use these tools:

| Capability | Tool |
|---|---|
| Ask the user to choose | `AskUserQuestion` |
| Spawn a **writable** subagent (writes files/SQL, hits the live instance) | the **`Task`** tool (a.k.a. the **`Agent`** tool in some Claude Code builds), `subagent_type: general-purpose`, called with a `prompt` |
| Spawn a **read-only** subagent (analysis only - never for write-needed work) | the same `Task`/`Agent` tool with `subagent_type: Explore` |
| Read / search files | `Read` / `Grep` / `Glob` |
| Binary reverse engineering (when the target is a binary) | autorev MCP (`mcp__autorev__*`): `load_database` → `get_binary_overview` / `list_functions` / `analyze_function` / `get_disassembly` / xrefs - one DB per session |
| Manual context compaction | `/compact` |

> **Spawning is the `Task`/`Agent` tool, NOT the todo tools.** You spawn a subagent with the `Task` (a.k.a. `Agent`) tool, passing `subagent_type` and a `prompt`. This is **not** `TaskCreate` or `TodoWrite` - those only manage your own todo list and **cannot** spawn an agent (calling them with `subagent_type`/`prompt` errors). Your optional task tracking is separate from, and never a substitute for, spawning the audit subagents.

**Three rules:** (1) any subagent that writes artifacts, runs SQL inserts, or hits the live instance MUST be a **writable** `general-purpose` subagent - a read-only `Explore` silently produces nothing; (2) use the **strongest model available** (e.g. the latest Claude Opus); (3) if a spawn call errors (wrong tool, bad params, read-only used by mistake), **fix the call and retry it** - a tool error is never a reason to do the delegated work inline (see Essential Principle 11).

### Workflow-accelerated mode (ultracode)

When the **Workflow tool is available to you** (ultracode is on), you may drive a whole run as one deterministic workflow instead of executing phases by hand - under ultracode **both** the full `/vibehack` pipeline and `source` run **gateless, end-to-end**. See **[references/workflow-orchestration.md](references/workflow-orchestration.md)** for the rules + script skeletons. Three things that are easy to get wrong: the **script** must do the fan-out (a workflow `agent()` is a leaf - it can't spawn further workflow agents; this differs from the inline path, where mapping subagents *can* recurse, so in a Workflow run get finer granularity by proposing more, smaller groups for the script to fan out); each `agent()` **executes the phase `.md`** for its unit (it can't run a `/vibehack:<phase>` slash command); and **verify runs strictly serially** (one finding at a time - shared live instance). Without the Workflow tool (ultracode off), ignore this and run inline as usual: full pipeline **human-gated**, `source` **unattended**.

### App integration (when `VIBEHACK_APP=1`)

When this env var is set, the skill is being driven by the **vibehack web app**, not a human at a
terminal. See **[references/app-integration.md](references/app-integration.md)** for the contract.
In short: (1) the app pre-creates the audit workspace and passes it via `VIBEHACK_AUDIT_DIR` /
`VIBEHACK_PROJECT` - use it as-is (recon Step 1 already honors this); (2) at every phase boundary
(whenever you rewrite the resume note), also write `<AUDIT_DIR>/.app/state.json` (best-effort; the
app's source of truth is still `audit.db`); (3) the **app** controls phase transitions and opens
verify/report forks, so per-phase user gates are no-ops - resolve detection prompts with sensible
defaults and continue (the `source` precedence rules are a good model). All of this is inert when
`VIBEHACK_APP` is unset, so standalone CLI behavior is unchanged.

## When to Use

- Full security audit of an application targeting CVE/GHSA disclosure
- Bug bounty hunting with systematic coverage
- Auditing a compiled application via autorev MCP
- Patch-bypass research on a project with existing CVEs
- Re-auditing after major changes (reuse mappings as starting point)

## When NOT to Use

- Single-file or single-function code review → `code-reviewer`
- Quick pattern-based scan → `semgrep`
- Reviewing a specific PR diff → `differential-review`
- Threat modeling without code verification → `security-threat-model`
- Post-audit FP verification only → `fp-check-pivot` directly

## Architecture

```
                                  ┌─ resume note ←─ rewritten each phase
                                  │
recon ──► deploy ──► audit ──► fpcheck ──► [1 fork PER FINDING, serial]
  │         │         │           │                    │
  │         │         │           │                    ▼
  │         │         │           │     verify-<id>.md  ──(user runs report)──►  <id>-vuln-report.md
  │         │         │           │     (verify + review, then STOP; report is a separate user-invoked phase in the same fork)
  └─────────┴─────────┴───────────┴────────────────────┘
                       SQLite audit.db (single source of truth)
                       /vibe/hack/audits/<project>/audit-<timestamp>/artifacts/*.md
                       (source-only run: one consolidated report.md, no forks)
```

The automated **`source`** run uses the same diagram **minus deploy and the verify forks**: recon → audit → fpcheck → report, unattended (see [workflows/source.md](workflows/source.md)).

## Quick Reference

### SQL Tables (in `/vibe/hack/audits/<project>/audit-<timestamp>/audit.db`)

| Table | Purpose | Created In |
|---|---|---|
| `vh_sources` | Source configuration (path, autorev, both) | recon |
| `vh_feature_groups` | Group definitions + status | recon |
| `vh_attack_surface` | Endpoints/entry points per group | recon |
| `vh_security_observations` | Pre-audit observations from mapping | recon |
| `vh_known_findings` | Prior CVEs/advisories + patch-bypass intel | audit |
| `vh_findings` | Candidate findings from deep audit (col `artifact_path`) | audit |
| `vh_fp_verdicts` | FP-check verdicts | fpcheck |

### Artifact Layout

```
/vibe/hack/audits/<project>/audit-<YYYYMMDD-HHMMSS>/   # OUTSIDE the project tree
├── audit.db                        # SQLite source of truth
├── files/
│   ├── G<n>-mapping.md             # per-group feature mapping (recon)
│   └── known-findings.md           # advisories + patch-bypass surface (audit)
├── artifacts/
│   ├── G<n>-findings.md            # per-group deep-audit output (audit)
│   ├── phase5-batch<X>-*.md        # per-batch FP-check verdicts (fpcheck)
│   ├── verify-<finding-id>.md      # per-finding verification record (verify)
│   └── <finding-id>-vuln-report.md # per-finding vuln report - LIVE (report, in the fork)
├── archived-poc/<finding-id>/      # (user-managed) finalized report + poc, after sending
└── report.md                       # ONE consolidated report - SOURCE-only run only (report)
```

Plus `poc/` at the **project root** (inside the audited repo, not under the audit dir): runnable PoC scripts referenced by live reports as `poc/<name>`. Reports never reference an audit-dir path like `/vibe/hack/audits/<project>/audit-<ts>/...` (the maintainer won't have it).

### Resume Note + Live-Instance Note

| File | Scope | Template | Purpose |
|---|---|---|---|
| `/vibe/hack/audits/<project>/audit-<timestamp>/<project>-audit-resume.md` | Per audit run | [references/resume-note-template.md](references/resume-note-template.md) | Survive context compactions; rewritten after every phase |
| `/vibe/hack/audits/<project>/<project>-live-instance.md` | Per project (parent of the run dirs) | [references/live-instance-template.md](references/live-instance-template.md) | Persistent deployment info; survives across re-audits |
| A tiny pointer in your own memory | Your memory (auto-recalled) | [references/resume-note-template.md](references/resume-note-template.md) → *Memory pointer* | **Pointer**, not content: references the two note paths above + current phase, so you don't forget the audit and re-read the notes |

Both notes live with the audit output under `/vibe/hack/audits/<project>/`, **not** in your memory - only the small **pointer** lives in your memory. So normally you auto-recall the pointer and follow it to the resume note. If the pointer is missing (memory unavailable), locate the current run by listing `/vibe/hack/audits/<project>/` and picking the **newest `audit-<timestamp>/`** dir (its `<project>-audit-resume.md` is the resume point); the live-instance note sits one level up at the per-project home (fixed path, no timestamp). **Whenever you (re)write the resume note, also rewrite the pointer** so it tracks the current phase. (**App mode exception:** when `VIBEHACK_AUDIT_DIR` is set, skip all of this resume-detection - that dir is your workspace; use it directly and do not list/inspect audit dirs or deliberate resume-vs-fresh. See [references/app-integration.md](references/app-integration.md).)

### Subagent Configuration

| Phase | Agent type | Model | Count | Task |
|---|---|---|---|---|
| recon (mapping) | **writable** subagent (writes SQL/artifacts - `general-purpose` `Task`, not read-only `Explore`) | strongest available (e.g. Claude Opus 4.5+) | 1 per group; **each may recurse** - spawn helper sub-subagents for oversized scopes | Map features → code (helpers return mappings; group owner consolidates + writes) |
| audit | **writable** subagent | strongest available | 1 per group | Deep adversarial audit |
| fpcheck | **writable** subagent | strongest available | 1 per batch of 8-12 findings | Static FP review |
| verify | n/a - forked **root** conversation (or a fresh workflow agent) | - | 1 fork/agent **per finding**, **serial** | Live PoC against deployed instance |
| verify (review) | **writable** subagent, **fresh** (no fork/audit context) | strongest available | 2-3 per CONFIRMED finding | Adversarial review of each finding/PoC - neutral prompt; real-bug / valid-PoC / intentionally-vulnerable-code lenses (optionally an interactive agent-team debate) |

## Rationalizations to Reject

| Rationalization | Required Action |
|---|---|
| "The code looks clean, skip deep analysis" | Analyze every entry point. Surface appearance is not security. |
| "I found enough bugs, stop early" | Complete all groups. Coverage gaps hide the worst bugs. |
| "This group is just config, skip it" | Config bugs (SSRF, injection, supply chain) are often the most critical findings. |
| "Admin-only feature isn't interesting" | Apply Marginal Gain Test - admin → cross-tenant, supply chain, persistence are all valid. |
| "Static analysis is enough, skip live verify" | Live PoC is mandatory for vendor credibility. Use a fork. |
| "Use a read-only / Explore agent for the subagents" | Use a **writable** `general-purpose` `Task` subagent, NOT a read-only `Explore` - a read-only agent cannot write SQL/artifacts. |
| "A subagent/tool call errored, so I'll just do this phase's work inline" | No. Fix the call (right tool - `Task`/`Agent`, not `TaskCreate`/`TodoWrite`; writable `general-purpose`; valid params) and **retry the spawn**. Inline is a last resort, only after 2 failed *correct* spawns for that one group/finding, and must be logged in the resume note's Quirks. |
| "Verify in the main conversation to save tokens" | Forks isolate failure and noise. Always fork for verification. |
| "Let the orchestrator consolidate one big report" | No. In the live pipeline the user runs the **report** phase in each verify fork to write that finding's own lean `<id>-vuln-report.md`; only the `source` run writes a single consolidated `report.md`. No `disclosure-summary.md`. |
| "Reference the PoC at the audit-dir path `/vibe/hack/audits/<project>/audit-<ts>/...` / paste lots of bold + em-dashes + a CVSS scoring table" | The maintainer won't have that path - reference `poc/<name>`. Keep reports lean: seven headings only, no em-dashes, minimal `**`/`*`, no severity tables/boilerplate. The CWE(s) + a single CVSS 3.1 vector go in Vulnerability Detail. |
| "Skip the resume note this phase, it's fine" | Compaction is unpredictable. Always rewrite the resume note at phase end. |
| "Context is still big enough, don't bother compacting yet" | Manual compact at every gate. Letting auto-compaction fire mid-phase frequently drops the exact state the next phase needs. The cost of compacting too early is zero; the cost of compacting too late is a corrupted audit. |
| "My harness / ASan triggers it - that's a PoC" | A self-written harness, sanitizer abort, or debugger-injected condition proves a *defect*, not impact. Reproduce on the **stock production build** via the genuine attacker path with attacker-controlled inputs only. If the stock outcome is unobservable → Informational. |
| "Just patch the target so the bug fires" | For trust-boundary bugs, patch the **attacker** component and keep the **victim** binary 100% stock (verify via `/proc/<pid>/exe`). Modifying the victim proves nothing. |
| "It obviously hangs / crashes - no need to measure" | Quantify on the real binary: `top -bH` + `/proc/.../stat` for a spin, exit/signal for a crash, N-trial counts. 100% CPU ≠ a blocked wait. Pair with an honest-input control run. |
| "Call it an infinite loop / say it always crashes" | Use precise, measured wording ("effectively unbounded, expected N iters"; "observed M/N"). Overstatement gets bug-bounty submissions rejected - adversarially verify every claim before shipping. |

## Lessons Learned (FROM REAL AUDITS - READ BEFORE STARTING)

See [references/lessons-learned.md](references/lessons-learned.md) for the full list. Key items:

1. **Never use a read-only agent for write-needed work** (read-only `Explore`) - it silently produces no artifacts; use a writable `general-purpose` `Task` subagent.
2. **Always back up live-instance config before PoC** (e.g., `cp .docker_compose/rules.json /tmp/rules.json.bak.fork-<X>`) and verify restore at end.
3. **User may hand-edit live-instance config between phases** - always re-read configs before edits.
4. **Patch-bypass class is gold** - when ingesting CVEs, look at the patch diff and check sibling files for the same root cause untouched. (Highest-severity findings in real audits come from this.)
5. **Operator-config "vulns" usually fail the Marginal Gain Test** - if the operator could already do X via documented config, finding a second way is not a CVE.
6. **Subagent scratch files accumulate** - clean them up after consolidating into `artifacts/`.
7. **PoC rigor** - reproduce impact on the real production-flag build via the genuine attacker path; a self-harness / sanitizer abort / debugger-injected condition proves a *defect*, not impact (downrate to Informational if the stock-build outcome is unobservable).
8. **Trust-boundary PoCs: patch the attacker, keep the victim stock** - for client↔server / server→client bugs, control the attacker's component (let its real serializer emit wire-correct bytes) and verify the victim is the unmodified binary (`readlink /proc/<pid>/exe`).
9. **DoS / hang / non-HTTP findings need OS-level proof + a control** - quantify with `top -bH` + `/proc/<pid>/task/<tid>/stat` (spin), exit code (crash), or RSS (memory); 100% CPU distinguishes a spin from a blocked wait; always pair with an honest-input control run.
10. **State outcomes precisely + adversarially verify the report** - "effectively unbounded (expected N iters)" not "infinite", "observed X" not "would X"; run an independent pass over citations / mechanism / severity before shipping.
11. **Live-instance footguns** - `kill -9` hung processes (they ignore SIGTERM and squat ports); persist ephemeral state before restarting between runs; flush state to disk before any cross-process handoff; lifecycle ops may need the sandbox disabled.
12. **Attacker-advantage test FIRST** - a node dropping a misbehaving peer, or a self-healing / operator-misconfig condition, is not a vuln; lead with the honest verdict.

## Workflow Entry

To begin, route to the appropriate workflow:

- "audit this app" or no specific sub-command → start with [workflows/recon.md](workflows/recon.md)
- A specific-phase invocation (`/vibehack:<phase>`) → load `workflows/<phase>.md` and execute
- The `source` run / "automated source-only audit" → load [workflows/source.md](workflows/source.md) and run recon → audit → fpcheck → report unattended (no deploy, no live instance, no verify, no user gates)

## Phase Reference Index (technical details for sub-workflows)

| File | Content |
|---|---|
| [references/phase0-source-detection.md](references/phase0-source-detection.md) | Source detection logic, autorev MCP load + analysis workflow, user prompts |
| [references/phase2-feature-mapping.md](references/phase2-feature-mapping.md) | Feature group taxonomy, subagent prompt, mapping format |
| [references/phase4-deep-audit.md](references/phase4-deep-audit.md) | Deep audit subagent prompt, finding schema, dedup |
| [references/phase5-fp-check.md](references/phase5-fp-check.md) | Batching strategy, FP rules, verdict schema |
| [references/phase6-report.md](references/phase6-report.md) | Lean per-finding + consolidated report template (Redis-style) + annotated example |
| [references/resume-note-template.md](references/resume-note-template.md) | Standard resume-note format for compact survival |
| [references/live-instance-template.md](references/live-instance-template.md) | Standard live-instance doc format |
| [references/lessons-learned.md](references/lessons-learned.md) | Pitfalls observed in real audits |
| [references/workflow-orchestration.md](references/workflow-orchestration.md) | ultracode: drive the pipeline / `source` as a Workflow-tool workflow - rules + script skeletons |

## Success Criteria

- [ ] All feature groups have mappings in SQL + `files/G<n>-mapping.md`
- [ ] **Full code coverage**: every source file is assigned to a group and mapped (groups are fine-grained, each decomposed into many sub-features - no file or entry point left unmapped)
- [ ] Live instance is running and documented in the live-instance note
- [ ] Every group was deep-audited; findings in `vh_findings` + `artifacts/G<n>-findings.md`
- [ ] Every finding has a FP-check verdict in `vh_fp_verdicts`
- [ ] Every TRUE_POSITIVE has a `verify-<id>.md` artifact OR a documented "infra-blocked, source-only" reason
- [ ] Live: every confirmed vuln has its own lean `<id>-vuln-report.md` (real PoC + captured output; scripts in `poc/`). Source-only: one consolidated `report.md` with source-level reproduction guides
- [ ] Resume note exists and reflects current state (would let a fresh orchestrator resume cleanly)

**For the automated `source` run:** the *live instance* and *verify artifact* criteria do **not** apply - deploy and verify are skipped. Instead: every TRUE_POSITIVE is `verified='source-only'`; the single consolidated `report.md` carries the not-live-verified caveat and its Steps are reproduction guides; and the final severity-counts summary was printed.
