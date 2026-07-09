# vibehack - source: Automated Source-Only Audit (unattended, no live instance)

**Purpose**: Run the entire audit pipeline on source code **end-to-end with no human in the loop and no live instance** - for product teams who want a security report on a codebase before a release. Runs **recon → audit → fpcheck → report**; skips **deploy** and **verify** entirely.

**Entry**: User invokes the **source** run (see SKILL.md → *How phases are invoked (Claude Code CLI)*) or asks for an "automated source-only audit". A source tree must be present.
**Exit**: One consolidated `<AUDIT_DIR>/report.md` (plus `audit.db`) and a printed counts-by-severity summary. No live verification.

> **Workflow-accelerated (Claude Code + ultracode):** if the **Workflow tool is available to you**, drive this run as a deterministic workflow instead of by hand - see [../references/workflow-orchestration.md](../references/workflow-orchestration.md) (the `source` skeleton). Same source-only, gateless behavior; the script just fans out the within-phase work. Without the Workflow tool, follow the steps below inline.

---

## Automated source-only mode - what makes it different (READ FIRST)

`source` runs fully unattended and read-only. These rules govern it and supersede any conflicting detail in the phase files below:

- **Source only - read-only, no runtime, no mutation.** There is **no live instance**. Do **not** run the deploy phase; do **not** attempt any live PoC, `curl`, or runtime reproduction; do **not** edit, back up, restore, or write to any project/config file; do **not** start a process or send network traffic to a target. The only things you write are the audit's own artifacts under `<AUDIT_DIR>/`, `audit.db`, and your memory note. Every finding is recorded `verified='source-only'` (never `live-poc`).
- **Best-effort network.** CVE / patch-bypass ingest is attempted but optional - if the network is unavailable, note it in the report and continue with pure source-level analysis. Never abort over a network failure.
- **Abort only on a hard blocker**, with a clear one-line reason: no source tree found, or the target is binary/autorev-only (source mode is source-only).

Optional free-text notes (focus area, scope hints) may arrive as `$ARGUMENTS`; honor them.

## Step 1 - recon (auto)

Execute [recon.md](recon.md), source-only:
- **Source detection (its Step 2):** the source target is auto-selected; if no source tree is detected (binary-only or empty), **abort** (no source tree to audit).
- **Mapping subagents (its Step 5):** run normally (writable `general-purpose` `Task` subagents on `sonnet` - one per group, in parallel).

## Step 2 - audit (auto, source-only)

Execute [audit.md](audit.md) with these overrides:
- **CVE / patch-bypass ingest:** best-effort - attempt it; run `gh` **non-interactively** (ensure `GH_TOKEN` is set, or skip if `gh auth status` fails) so it can never open an auth prompt; on any auth/network error, record "CVE ingest skipped: network/auth unavailable" in the resume note + report and continue. Never abort or pause.
- **Deep-audit subagents - source-only template:** when filling the [phase4-deep-audit.md](../references/phase4-deep-audit.md) prompt template, **omit all live-instance details** and set its *Test Instance* section to the documented fallback - **"No test instance available. Provide source-level analysis only."** **Delete the live-verification (curl / requests / raw-sockets) instructions.** The only legal `verified` value a subagent may write is **`source-only`** - never `live-poc`.
- **No mutation:** **drop audit.md Step 4's "Live-instance hygiene" bullet entirely** - subagents must NOT edit, back up, or restore any project/config file. Read-only source analysis only.

## Step 3 - fpcheck (auto)

Execute [fpcheck.md](fpcheck.md) as written (it is already **static-only**) with these overrides:
- Run the parallel FP-check subagents and populate `vh_fp_verdicts` exactly as normal.
- There is **no verify** in source mode - continue straight to Step 4 with the TRUE_POSITIVE list.

## Step 4 - report (auto, consolidated source-only)

Execute [report.md](report.md) **Mode B (source-only, consolidated)** in this orchestrator - there is no live instance and no forks:
- Write ONE `<AUDIT_DIR>/report.md` covering all **TRUE_POSITIVE** verdicts from `vh_fp_verdicts`, ordered by source-assessed severity, with one section per finding using the seven headings (title, Affected Version, Summary, Vulnerability Detail, Root Cause, Steps to reproduce, Impact). Vulnerability Detail carries the CWE(s) + CVSS 3.1 vector (a static classification, so it applies in source mode too).
- **Steps to reproduce is a reproduction GUIDE only:** the concrete steps, inputs, and conditions an attacker or maintainer would use to trigger each bug, derived from `vh_findings` (`poc`, `root_cause`, `data_flow`, `location`). There is no live instance: do **not** run a PoC and do **not** paste or fabricate any request/response output. Label it as a source-level guide.
- **Caveat (mandatory):** state prominently near the top of `report.md` that all findings are static (source-level) true-positives that survived false-positive review but were **NOT live-verified**; running the interactive `verify` phase against a live instance is recommended before any external disclosure.
- No `disclosure-summary.md`, no per-finding `<id>-vuln-report.md` files, no severity tables (the single CVSS 3.1 vector line in Vulnerability Detail is not a table). Do not pause; do not disclose; continue to Step 5.

## Step 5 - final summary (printed, no gate)

Print a concise summary for the operator:
- Path to `<AUDIT_DIR>/report.md`.
- Counts of TRUE_POSITIVE findings by source-assessed severity (CRITICAL / HIGH / MEDIUM / LOW / INFO).
- A one-line reminder that findings are source-only (not live-verified) and that `verify` against a live instance is recommended before disclosure.

Update your memory pointer to mark the run COMPLETE and note the `report.md` path, so a later session knows this audit completed. Rewrite the note in your memory's own format; do not assume a fixed line to find-and-replace.

Do **not** perform any external disclosure. Stop.

## Quality checks

- [ ] recon, audit, fpcheck, report all completed **without pausing for input**
- [ ] No deploy phase ran; no live-instance / `curl` / PoC was attempted; every finding is `verified='source-only'`
- [ ] One consolidated `report.md` + `audit.db` exist under `<AUDIT_DIR>/` (no `disclosure-summary.md`, no per-finding files)
- [ ] The report carries the source-only / not-live-verified caveat
- [ ] Final severity-counts summary was printed; no disclosure performed
