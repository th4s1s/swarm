# SWARM - Deterministic Tool Integration: Design & Roadmap

*Status: design + roadmap. No pipeline code implements this yet; each slice in §9 gets its own plan,
authored from this document. Sibling to [PROPOSAL.md](../PROPOSAL.md) (the token-reduction master plan).*

## 1. Context & goals

The vibehack pipeline is a strong *adversarial LLM* auditor, but it does all recall (finding candidate
issues) and coverage (touching every file) with LLM subagents - expensive, and non-deterministic on
completeness. Mature static-analysis tools (semgrep, CodeQL, Joern, osv-scanner, ...) are cheap,
deterministic, and exhaustive at *recall*. Integrating them lets us:

- **Raise quality** - tools surface candidates and prove/refute reachability the LLM might miss.
- **Cut cost** - a deterministic coverage backstop makes a *cheaper recon model* (sonnet) safe.

Bar: **quality-neutral or quality-positive**. Tools augment, never replace, the adversarial hunt.
Enabled by two things already in place: the per-audit **token meter** (measure every slice) and the
verified **per-spawn model override** (an opus orchestrator can spawn sonnet subagents).

## 2. Governing principles

1. **Deterministic tools own recall + coverage + mechanical verification. The LLM owns precision,
   judgment, exploitability, prioritization, and reporting.**
2. **Scanner hits are LEADS, never auto-findings.** They land in `vh_scanner_hits` (status=`new`); only
   the opus hunters promote a lead to a `vh_findings` row after tracing it. This protects the skill's
   entire FP-elimination identity - otherwise the report fills with scanner false positives.
3. **Deterministic work runs app-side (zero LLM tokens); judgment work stays in the skill.** (Extends
   the "static-to-app" principle already adopted for schema seeding.)
4. **SARIF is the interchange format; `audit.db` is the single store.** No parallel JSON/JSONL mirror.
5. **Source targets only.** The binary/autorev (IDA) path has no source to scan and is left untouched;
   every integration is gated on a source target.
6. **Incremental and measured.** One phase-slice at a time, each validated on the meter before the next.

## 3. Tooling (best-of-breed per job)

| Tool | Job | Phase | Weight | Notes |
|---|---|---|---|---|
| **semgrep** | community rulepacks (baseline) + agent-authored custom rules | recon + audit | light | Pro adds cross-file taint; SARIF out |
| **osv-scanner** | dependency CVE ingest from lockfiles | audit | light | better than `gh dependabot` (no repo-alerts/auth dependency) |
| **gitleaks** | hardcoded secrets | recon | light | SARIF out |
| **CodeQL** | deep interprocedural taint on select groups; reachability path queries | audit + fpcheck | heavy | per-language DB build; fixed language set |
| **Joern** | code-property-graph interprocedural source->sink dataflow semgrep can't express | audit | heavy | JVM; deep-pass on high-value groups only |
| **ffuf / nuclei / sqlmap** | live PoC confirmation (RoE-bounded) | verify | light | web targets |
| **CVSS 3.1 calc** | deterministic vector->score | report | trivial | removes model arithmetic error |
| **rg** | file/entry-point inventory | recon | trivial | already used |

**Reuse the Trail-of-Bits skills** rather than reinventing: `static-analysis:semgrep`,
`static-analysis:codeql`, `static-analysis:sarif-parsing` (dedup/merge/fingerprint helpers),
`semgrep-rule-creator` (test-first custom rules), `variant-analysis` (expand a confirmed finding).
Caveat in §7: these skills have interactive approval gates.

## 4. Data model

New **`vh_scanner_hits`** table (app-seeded in `skill/schema.sql`, like the rest):

`id (PK), tool, rule_id, severity, file, line, end_line, message, group_id (nullable - filled after
grouping), status (new|triaged|dismissed|promoted), promoted_finding_id (FK vh_findings.id),
fingerprint (dedupe across re-runs), raw (SARIF result blob), created_at`.

- **SARIF -> rows**: an app-side ingest parses each tool's SARIF into `vh_scanner_hits` (reuse the
  `sarif-parsing` skill's `sarif_helpers.py` fingerprint/dedupe logic).
- **Provenance**: `promoted_finding_id` links a lead to the finding it became - a queryable recall
  metric ("how many real findings originated from a scanner hit").
- osv-scanner output goes into the existing `vh_known_findings` (`source='osv'`), not `vh_scanner_hits`.

## 5. Pipeline integration (with insertion anchors)

- **recon** - App runs the baseline pass (semgrep community packs + gitleaks) at recon start via the
  `run()` wrapper (`backend/src/lib/exec.ts`), SARIF -> `vh_scanner_hits` (group_id NULL). New
  **Step 4.5** (between group approval at `recon.md:69` and the Step 5 spawn at `recon.md:77`): the
  orchestrator buckets hits to groups via the file->group map, then injects each group's hit list into
  its **mapping subagent** prompt (`recon.md:88-90`). Mapping subagents run on **sonnet** (per-spawn
  `model`) and *confirm/expand* hits into sub-features + observations. Recon orchestrator and all
  deep-audit hunters stay on **opus**.
- **audit** - **Step 1e**: osv-scanner -> `vh_known_findings` (alongside the dependabot sub-step at
  `audit.md:31`). **Step 3.5** (between patch-bypass mining `audit.md:41` and the deep-audit spawn
  `audit.md:71`): opus agents encode the patch-bypass "probe these sibling sites" intel
  (`audit.md:60`) as custom semgrep/CodeQL queries (via `semgrep-rule-creator`), run Joern/CodeQL
  dataflow on high-value groups, feed hits into the Step-4 prompt (`audit.md:79-80`). Confirmed
  findings expand via `variant-analysis`. Subagents remain the sole `vh_findings` writers (>=8
  confidence).
- **fpcheck** - new bullet after the CV-3 re-read (`fpcheck.md:44`): re-run the finding's originating
  rule / a CodeQL path query. A **negative** reachability result is strong evidence for HE-1
  ("no source-to-sink flow") / HE-8 ("unreachable") - an FP-killer. A positive hit alone must **never**
  resurrect a finding the review rejected (HE-7 exists because scanners FP). Static-only, fits the phase.
- **verify** - ffuf/nuclei/sqlmap assist live PoC confirmation, within existing RoE limits.
- **report** - deterministic CVSS 3.1 vector->score.

## 6. App vs skill responsibilities

- **App (backend)**: the `install-tools.sh` bootstrap; the deterministic baseline pre-pass in
  `manager.ts` `startRun` (between `ensureWorkspace` at :134 and `spawnClaude` at :176), guarded to run
  once per session and only for source targets; the SARIF -> `vh_scanner_hits` ingest; expose the scan
  dir to the agent via a new env var alongside `VIBEHACK_AUDIT_DIR` (:165-172).
- **Skill (workflows)**: consume `vh_scanner_hits` (recon seeds mapping, audit hunts, fpcheck verifies);
  author custom rules (audit); apply per-spawn model tiering (sonnet mapping subagents).

## 7. Risks & mitigations

- **Leads promoted to findings (precision loss)** -> Principle 2 + the `status` lifecycle; only hunters
  promote, and only after tracing.
- **ToB skills' interactive gates** (semgrep approval, codeql DB-selection) fight vibehack's gateless
  app/source runs. App-side baseline sidesteps this (direct CLI, no skill). The audit-slice custom-rule
  work must pre-supply output dir / ruleset / DB path and auto-satisfy the approval `AskUserQuestion`,
  or replicate the few core steps inline. Decided when the audit slice is planned.
- **Heavy tools (CodeQL/Joern) latency** -> deep-pass on select high-value groups only, never in the
  recon baseline; background them (the runner already tolerates backgrounded tasks).
- **Sonnet recon coverage risk** -> the deterministic baseline is the backstop; orchestrator + hunters
  stay opus; seed observations from scanner hits so the weaker model is not the sole smell-detector.
- **False sense of coverage** -> log unsupported languages/files the scanner skipped; recon keeps its
  "enumerate everything yourself" mandate. Tools front-load the easy 80%, they do not replace recon.
- **Tool sprawl / drift** -> `install-tools.sh` pins versions; every tool earns its place per §3;
  measure each slice on the meter before adding the next.

## 8. Install / bootstrap

New `scripts/install-tools.sh` (repo has no `scripts/` yet) in the house style (`#!/usr/bin/env bash`,
`set -euo pipefail`), installing the full toolset (semgrep, codeql, joern, osv-scanner, gitleaks, ffuf,
nuclei, sqlmap) with pinned versions and idempotent checks. Wired in: a new bullet in the README
"Requirements" + a "step 0" in "Quick start" (root `README.md`), and optionally an idempotent guard in
`start.sh`'s first-run block (mirroring its `npm install`).

## 9. Roadmap (sequenced; each measured on the meter)

- **Slice A - foundation + recon**: `install-tools.sh`, `vh_scanner_hits`, app-side semgrep+gitleaks
  baseline + SARIF ingest, recon Step 4.5 (bucket + seed), sonnet mapping subagents. *Metric: recon
  cost down, coverage/leads up.*
- **Slice B - audit hunt**: osv ingest; agent-authored custom rules + Joern/CodeQL dataflow +
  variant-analysis; resolve the ToB-gate handling. *Metric: new true-positives (recall up), precision held.*
- **Slice C - fpcheck reachability verifier**. *Metric: FP-kill rate up, zero true-positive loss.*
- **Slice D - verify live tools + report CVSS**. *Metric: PoC-confirm rate; CVSS accuracy.*

## 10. Open questions (resolve per-slice)

- osv-scanner vs keep `gh dependabot` (likely both, dedupe by advisory id).
- Exactly which recon subagents go sonnet (mapping owners only, or their recursive helpers too?).
- ToB-gate handling: auto-satisfy vs inline replication.
- Per-phase **effort** tiering (recon at medium effort) - a small app change (effort is run-level today).
- Where the baseline runs: at project-create (cached, sha-keyed for re-audits) vs first-recon-run.
