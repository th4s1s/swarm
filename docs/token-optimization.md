# SWARM - Token Optimization: Design & Roadmap

*Status: supersedes the old `PROPOSAL.md`. Sibling to [tool-integration.md](tool-integration.md). Goal
is cost reduction that is **quality-neutral or quality-positive** - the bar is "consumes too many tokens
**but works well**," so no change may trade away coverage or adversarial independence.*

## 1. Context

The token bill is dominated by the **same source being read 3-4x** across phases, each read billed in a
separate subagent context (recon maps it, deep-audit re-reads to hunt, fpcheck re-reads every cited file,
verify reads again). The workflow already controls *orchestrator* context well (SQLite + resume notes +
gated compaction); the cost is aggregate billed input tokens across subagents. Almost every worthwhile
fix attacks a repeated read - without removing the *independent* and *adversarial* reads that make the
audit work.

## 2. Principles

1. **Quality-neutral or quality-positive.** Never trade coverage or the independent/adversarial reads for
   cost. Reduce *repeated* and *redundant* reads only.
2. **Intermediate artifacts are load-bearing handoffs**, especially under the app (each phase is a
   separate `claude` invocation, so state crosses phase boundaries via `audit.db` + artifacts + the
   resume note). Shrink them by **de-duplicating against the DB or compacting**, never by blind deletion.
3. **`audit.db` is the single source of truth.** No parallel JSON/JSONL mirror.
4. **Deterministic setup moves to the app** (zero LLM tokens).
5. **Measure before/after on the per-audit meter.** Trust the meter, not the model.

## 3. Done (this roadmap's completed work)

- **Slice 1 (`c1c90e9`)**: `vh_findings` is the sole findings store (dropped the redundant
  `G<n>-findings.md`); fixed the orchestrator SQL re-ingest bug (§3.4); app-seeded schema
  (`skill/schema.sql`); group-filtered the known-findings payload (#4b); dropped turnkey standalone.
- **Slice 2 (`946c756`)**: the per-audit token meter (`GET /api/sessions/:id/usage` + SessionView card).
  This is the measurement backbone for everything below.
- **Recon model tiering (`8565542`, shared with tool-integration Slice A)**: recon mapping subagents run
  on `sonnet` (orchestrator + hunters stay opus), backed by the app-side deterministic scanner baseline.
- **Already-satisfied / no-ops**: prompt-cache ordering (FP methodology already precedes the volatile
  findings list) and the resume/`--resume` cache guard.

## 4. Remaining work

Four items. **1, 2, 3** are committed; **8 is last and gated** (see its section). Everything not listed
here is intentionally skipped (§6).

### Item 1 - Mapping to DB (compact handoff)  [biggest cut]

**Problem.** `G<n>-mapping.md` (~234 KB/run) is the deep-audit subagent's **sole** group-context input
(pasted in as `{mapping_content}`, `workflows/audit.md` Step 4). Its richest fields - input sources,
data-flow, trust boundaries, key files, coverage - live **only in the prose** (`references/phase2-feature-mapping.md`);
SQL currently holds just endpoint/method/auth + a one-line observation. So the prose is written once by
each recon mapping subagent and re-ingested in full by each audit subagent.

**Change.** Move the mapping into `audit.db`: enrich the schema so the mapping's analytical fields become
structured rows (extend `vh_attack_surface` / `vh_security_observations` or add a `vh_group_mapping`
table + a per-group coverage record); recon mapping subagents write those rows; the audit subagent reads
them (`SELECT ... WHERE group_id=?`) instead of pasting the prose file. Render human-readable prose
lazily, only if a report needs it. (This is #4 "compact bundle" applied to the *persistent* recon->audit
handoff - recon and audit stay separate phases, per the cancelled §3.1.)

**Quality guardrails.** It is the hunter's only structured input, so **preserve every analytical field**
(sinks, data-flow, trust-boundary, key files, and the coverage line); the audit agent still reads the
real source (RoE). Prove coverage/recall are unchanged on a target before/after via the meter + a
findings diff.

**Files.** `references/phase2-feature-mapping.md`, `workflows/recon.md` (Step 5 outputs),
`workflows/audit.md` (Step 4 input), `skill/schema.sql`. App: none unless the seeded schema changes.

**Metric.** recon->audit ingest tokens down materially; findings recall unchanged.

### Item 2 - Evidence packs

**Problem.** fpcheck's CV-3 rule mandates **re-reading every cited source file** (`workflows/fpcheck.md`
Step 4) - the most duplicative read in the pipeline, across all candidate findings.

**Change.** Each audit subagent emits a per-finding **evidence pack** as a byproduct of the read it
already did: <=4 snippets / <=120 lines, each with `file:line` + a content sha, plus the mitigations it
checked and any open FP questions. Store on the finding (new `vh_findings` columns
`evidence_pack` / `source_lines_count` / `pack_status`, or an `evidence/<id>.pack.md`). fpcheck reads the
pack first and spot-verifies, instead of blindly re-opening every file.

**Quality guardrail (load-bearing - the CV-3 tension).** A pack is the audit agent's framing, so leaning
on it inherits that agent's blind spots. The pack **accelerates refutation** but must **not replace** the
independent re-read for any finding heading to **TRUE_POSITIVE at HIGH/CRITICAL**, and the reviewer must
re-open real source whenever a pack is thin/suspicious **or is about to kill a plausible finding** (a
false negative is the cardinal sin). Record `extra_files_read` so we can detect packs that hid a needed
read and tune them.

**Overlap to resolve first.** tool-integration **Slice C** (fpcheck reachability verifier) attacks the
same fpcheck cost with a *deterministic* reachability proof. Decide the single primary mechanism, or make
them complementary (pack = cheap context to refute; reachability = the deterministic kill/keep signal),
**before** building Item 2.

**Files.** `workflows/audit.md`, `references/phase4-deep-audit.md`, `workflows/fpcheck.md`,
`references/phase5-fp-check.md`, `skill/schema.sql`.

### Item 3 - Standalone-scaffolding rip-out  [low-risk; good first]

**Problem.** Slice 1 dropped *turnkey* standalone but left the in-skill human scaffolding, which is read
every phase: "USER GATE" steps, "ask the user to confirm" prompts, fork-prompt paste templates, the
resume-picker prose, "type `/compact`" prompts, and leftover env-var branches. In the app-only world
these are dead weight in every prompt.

**Change.** Remove/trim that scaffolding across `SKILL.md`, `workflows/*.md`, and the affected
`references/*.md`. The app UI's phase-by-phase control replaces the human gates; `skill/dev-run.sh`
remains the by-hand path.

**Quality guardrail.** Keep what is load-bearing: the **resume note** (the compaction-recovery + phase
handoff) stays, as do all `audit.db`/artifact state handoffs. Only human-interaction scaffolding is
removed - behavior in app mode is unchanged.

**Files.** `SKILL.md`, `workflows/{recon,deploy,audit,fpcheck,verify,report,source}.md`,
`references/{resume-note-template,workflow-orchestration}.md` (and any other gate/memory-pointer prose).

**Metric.** per-phase prompt size down; app behavior unchanged.

### Item 8 - Deterministic structural pre-index  [LAST, and only after careful consideration]

**Idea.** Produce, deterministically and app-side (zero tokens), a structural index of the target - full
file/function inventory, entry points / routes / sinks / validators, git facts (commit/tag for the
upstream patch-gap check), and dependency manifests - so recon starts from facts instead of rediscovering
structure with LLM subagents.

**Why it is last and gated.** It **overlaps the user's own recon-phase optimization plans**, so it must be
designed *with* those plans, not in isolation, to avoid conflict and rework. It is also partly related to
the tool-integration scanner baseline (already app-side) and the learning loop. Constraints when it is
eventually designed: **advisory only** (recon still enumerates everything; the index front-loads the easy
80% and never gates coverage), **source targets only** (no-op for binary/autorev), and sha-cacheable for
re-audits. **Not designed in detail here** - it gets its own plan after the recon-plan alignment.

## 5. Sequencing

Recommended order (each measured on the meter, before/after on a comparable target):

1. **Item 3** - quick, safe, shrinks every prompt, finishes the app-only pivot.
2. **Item 1** - the biggest single cut; quality-sensitive, so measure carefully.
3. **Item 2** - after deciding evidence-packs vs the Slice C reachability verifier.
4. **Item 8** - last, only after aligning with the recon-phase plans.

(The user will pick which of 1-3 to implement first; 8 stays last.)

## 6. Skipped / cancelled / descoped

- **§3.1 fuse map+hunt** - CANCELLED (recon and audit stay separate; the user has separate recon plans).
- **#7 deterministic FP batching** - skipped (marginal).
- **Per-phase effort tiering** - skipped (minor; effort is run-level today).
- **Incremental re-audit reuse (6.5)** - skipped here; overlaps the tool-integration learning loop / re-audit.
- **Global "By phase" on the Usage page** - skipped (a meter *view*, not a reduction).
- **JSONL mirror (#8 in the old proposal) and the per-audit budget ceiling** - descoped / rejected.

## 7. Relationship to tool-integration

See [tool-integration.md](tool-integration.md). Two overlaps to manage: **Item 2 (evidence packs)** vs
its **Slice C (reachability verifier)** - same fpcheck cost, different mechanism, pick/combine
deliberately; and **Item 8 (structural index)** vs the shipped scanner baseline (Slice A) and the
learning loop. The per-audit meter (Slice 2) is the shared instrument for proving every change in both
roadmaps.
