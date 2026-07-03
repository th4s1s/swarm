# vibehack — Token-Reduction Plan

*Status: analysis + plan only. No skill/app file has been modified. This document is the deliverable.*

This plan is grounded in a read of the actual local skill (`/vibe/hack/skill`, the `vibehack` fork —
**not** the upstream `codebase-audit` GitHub repo) and the SWARM app (`/vibe/hack/app`), plus a real
completed run (`/vibe/hack/audits/shopify-pitchfork/audit-20260629-034945`). It evaluates the five
suggestions a friend sent (items **3, 4, 5, 7, 8**), then adds improvements they missed, and ends with
one prioritized plan.

---

## 0. TL;DR

- **Root cause of the token bill:** the same source files are read **3–4 times** across phases, each
  time in a *separate* subagent context, so each read is billed in full. Recon reads everything to
  map it; deep-audit re-reads to hunt; fpcheck is *mandated* to re-read every cited file (rule CV-3);
  verify reads again. The workflow already controls *orchestrator* context well (SQLite + resume notes
  + gated compaction); the cost is **aggregate billed input tokens across subagents**, not orchestrator
  bloat. Almost every worthwhile fix attacks the re-read.
- **The friend's direction is correct.** The single highest-value idea is **#5 (evidence packs)**,
  followed by **#3 (deterministic pre-index)**. **#4** is solid and cheap. **#7** is *already partly
  done* and only needs to become deterministic. **#8 (JSONL layer) is largely redundant** with the
  existing `audit.db` and would add a second source of truth to keep in sync — recommend a much lighter
  version.
- **Caveat the friend's spec needs before use:** it targets the upstream repo. Tables are `cba_*` →
  must be **`vh_*`**; paths `reports/audit-<ts>/` → must be **`/vibe/hack/audits/<project>/audit-<ts>/`**.
- **Biggest lever the friend missed:** for the many *small* groups, **recon-mapping and deep-audit
  read the same ≤1500-LoC files twice in two separate agents.** Letting one agent map-then-hunt in a
  single pass (files already in context) roughly halves the two largest read phases. See §3.1.

---

## 1. Where the tokens actually go (measured)

From the `shopify-pitchfork` run (10 groups, 162 attack-surface rows, 102 observations, 26 candidate
findings → 13 TP / 10 FP / 3 DUP):

| Artifact set | Size | Notes |
|---|---|---|
| 10 × `G<n>-mapping.md` | ~234 KB (~58K tok) | 14–30 KB each, mostly prose |
| 10 × `G<n>-findings.md` | ~138 KB | 7.5–19 KB each |
| `known-findings.md` | 8 KB | passed into **all 10** audit prompts |
| 4 × `phase5-batch*.md` | ~33 KB | already named by feature affinity |

**The artifacts are not the bill — the reads behind them are.** A hot source file in a high-risk group
is opened by (1) its recon mapping agent, (2) its deep-audit agent, (3) one or more fpcheck agents
(CV-3 forces a re-read), and (4) a verify fork. Four independent contexts, four full billings. With
~1500 LoC/group × 10 groups that is roughly the **entire codebase read 3–4×**.

Two distinct cost problems, so each fix should say which it solves:

- **(A) Billed input tokens** — dominated by repeated source reads in subagents. *This is the user's
  complaint.* Targeted by #3, #4, #5, #7, and §3.1/§3.2 below.
- **(B) Orchestrator context growth** — subagent summaries accumulating, forcing compactions. Already
  well-handled by `audit.db` + resume notes + gated `/compact`. #8 nominally targets this but the DB
  already covers it; see §2.5 and §3.4.

---

## 2. Verdict on the friend's five items

Each is checked against the **actual** `vibehack` skill, with a value/effort/risk call.

### 2.1 Item 3 — deterministic pre-index before the LLM — **ADOPT (high value)**

**Claim checked:** "recon already enumerates routes/services/CLI/handlers/sinks, then writes group
mappings + SQL." ✅ True — `workflows/recon.md` Step 3 mandates exhaustive entry-point and
file-inventory enumeration via grep/glob/agentic exploration. That discovery is done by LLM agents
today.

**Verdict:** Strong. A non-LLM scanner (`rg`/`grep` + later AST) that emits compact JSONL indexes
(`routes`, `sinks`, `sources`, `auth_guards`, `validators`, `files`) lets recon agents *start from
facts* and read only suspicious files/line-ranges instead of rediscovering structure. Solves problem
(A). It also seeds the file→group map that recon Step 4 builds by hand today.

**Adjustments:**
- Tables/paths must be `vh_*` and `/vibe/hack/audits/<project>/audit-<ts>/index/`.
- **Best home is the ultracode Workflow script and/or the SWARM app**, not a prose instruction. The
  app already pre-creates the workspace (`VIBEHACK_AUDIT_DIR`) — run the indexer there, once, before
  recon. In an ultracode run the script can run the scanner as a plain `Bash` step before the first
  `agent()`. Pure scripting = zero LLM tokens.
- The index is **deterministic and cacheable by file sha** → free win for the "re-audit after changes"
  use case (skip unchanged files). The friend didn't note this.
- Keep it advisory: recon must still treat a missing/younger index as "enumerate yourself" so the
  skill never *depends* on a scanner that may not understand a given framework.

### 2.2 Item 4 — compact mapping bundle instead of full mapping markdown — **ADOPT (cheap)**

**Claim checked:** "each deep-audit subagent receives the full content of `G<n>-mapping.md` + the
known-findings list + source access + live instance + writing instructions." ✅ True —
`workflows/audit.md` Step 4 literally says "Group ID + **the full content** of `files/G<n>-mapping.md`."

**One correction to the framing:** the mapping is **not** "copied into every group audit prompt." Each
group's prompt carries *its own* mapping once. The genuine cross-prompt duplication is the
**`known-findings.md` list (~8 KB) pasted into all 10 audit prompts**, plus the live-instance block and
methodology. So:
- Pass the audit agent a **path** to its mapping + a small `G<n>-mapping.compact.json` (entrypoints,
  critical files, sinks, validators, top questions) rather than the 14–30 KB markdown. ✅
- Additionally, **trim the repeated payload**: give agents the known-findings *filtered to their group*
  (not the whole list), and pass live-instance details by reference. This duplication across 10 agents
  is the part the friend under-weighted.

### 2.3 Item 5 — evidence packs per candidate finding — **ADOPT (highest value)** ⭐

**Claim checked:** "fpcheck tells each reviewer to restate each claim, apply all FP rules, trace
source, and **re-read every cited file**, and the prompt includes full finding details for the batch."
✅ True — `workflows/fpcheck.md` Step 4.3 ("Re-read every cited source file … CV-3") and
`phase5-fp-check.md` template `{findings_list_with_full_details}`.

**Verdict:** This is the keystone. FP-check's mandated re-read is the most duplicative read in the
pipeline. An evidence pack (claim, attacker position, source/sink, ≤120 source lines, mitigations
checked, open questions) produced **as a byproduct of the audit work already done** lets the FP
reviewer read the pack instead of re-opening 3–5 full files per finding. With 26 findings this is the
largest single saving. It also closes the redundancy between audit RoE rule 3 ("check for existing
mitigations") and fpcheck — audit already did that analysis; the pack carries it forward instead of
throwing it away.

**Risk to manage (the friend half-acknowledges it):** CV-3 exists *precisely because you must not trust
quoted code*. An evidence pack is quoted code. Mitigation, which must be explicit in the prompt:
- Pack rows carry `file:line` **and the file sha**; the reviewer **spot-verifies** a sample and **must**
  re-open the real file whenever the pack is thin, suspicious, or the verdict is going to be
  TRUE_POSITIVE on a CRITICAL/HIGH. The pack *accelerates* refutation; it does not *replace* the
  adversarial read for the findings that matter most.
- Record `extra_files_read` in the verdict so we can see when packs were insufficient and tune them.

### 2.4 Item 7 — context-coherent FP batching — **ADOPT-LITE (already partly done)**

**Claim checked:** "current strategy targets 8–10/batch, max 12, prefers same/related groups, mixes
severities." ✅ True in `phase5-fp-check.md`. **But the real run already batched by feature affinity**
— the four batches are named `parser-body-framing`, `response-header-trailer-injection`,
`ipc-worker-cext`, `sockets-config-server-misc`, at ~6–7 findings each (under the "8–12" target). So
the principle is in practice already applied.

**Verdict:** Real but incremental. The friend's contribution is to make **shared-file** the *primary,
deterministic* batch key (computed from the finding's `primary_file`+`sink_file`) instead of a
secondary preference, and to size by shared context rather than a fixed count. Combine this with #5:
once a reviewer has loaded the shared files for finding 1, the remaining findings in the batch reuse
that context. Low effort if we add the batch-key columns; do it **together with #5**, not alone.

### 2.5 Item 8 — JSONL-first, markdown-second — **PARTIAL / DESCOPE**

**Claim checked:** "the repo already uses `audit.db` as the single source of truth." ✅ True — and that
is exactly why the proposed parallel `jsonl/` layer plus `cba_jsonl_to_sql.py` / `cba_sql_to_jsonl.py`
import/export scripts is **mostly redundant**. We already have a queryable structured interface
(`vh_findings`, `vh_fp_verdicts`, …); adding JSONL creates a *second* source of truth to keep in sync
and a sync bug surface, for little gain.

**Keep the valid kernel, drop the duplication:**
- **Valid:** "agents read structured rows; render verbose markdown only at the end." Largely true
  already. The concrete fix is to stop generating heavy human-prose artifacts that nothing downstream
  reads — see §3.3 (skip full mapping markdown in `source`/app mode) and §3.5 (orchestrator must not
  re-ingest findings markdown to build SQL).
- **Valid & cheap:** the small `compact.json` from #4 and the evidence-pack JSONL index from #5 — those
  are *new* compact artifacts that replace big reads, not a re-serialization of the DB. Keep them.
- **Drop:** the standalone `jsonl/` mirror of the DB and the SQL↔JSONL converters. If structured export
  is ever wanted, generate it from `audit.db` on demand; do not maintain it in parallel.

---

## 3. Improvements the friend missed

### 3.1 Fuse map-and-hunt for small groups — **biggest unaddressed lever** ⭐

The skill deliberately makes groups small ("≤ ~30 files / ~1500 LoC, split anything larger"). For such
a group, the **recon mapping agent reads every file, then a separate deep-audit agent reads the same
files again** — two full billings of the same small, already-in-context code. That is the cleanest
structural redundancy in the whole pipeline and no friend item touches it.

**Proposal:** for groups under the size cap, run a single agent that maps **and** hunts in one pass
(files read once), emitting the mapping artifact, the findings, *and* the evidence packs together. Keep
the split only for oversized groups that recurse. Trade-offs to decide:
- The known-findings/patch-bypass ingest (audit Step 1–2) currently sits *between* recon and audit. A
  fused agent needs the known-findings intel up front — feed it the filtered known-findings for its
  group (cheap; it is small).
- We lose the clean recon→user-gate boundary for those groups. In **`source`/app (gateless) mode this
  is pure upside**; in the human-gated full pipeline, keep the two-phase split if the operator wants to
  review mappings before audit. So: **fuse by default in `source`/app mode; keep split available for
  interactive runs.**

### 3.2 The same logic applies recon↔index and audit↔fpcheck

- With #3 in place, recon agents read line-ranges around indexed rows rather than whole files — the
  index makes §3.1's single read even smaller.
- With #5 in place, fpcheck rarely re-opens files. §3.1 + #5 together mean a hot file is read ~once in
  audit, spot-checked in fpcheck, and read once more only in a verify fork — down from 3–4× to ~1.5×.

### 3.3 In `source`/app mode, don't render the human mapping markdown at all

The 14–30 KB `G<n>-mapping.md` files exist for a human to read at the recon gate. In `source` and app
mode **there is no human mid-run** (gates are no-ops). Generating ~234 KB of prose nobody reads is
waste both to write and, when re-read, to ingest. In those modes, have mapping agents emit only the
`compact.json` (+ SQL rows) and render full markdown lazily *only if* a report needs it. Solves (A).

### 3.4 Close the orchestrator's SQL re-ingest leak

`references/phase4-deep-audit.md` "Post-Collection Processing" tells the **orchestrator** to "parse
findings … extract structured data … INSERT into SQL," while `workflows/audit.md` Step 4 tells the
**subagent** to "INSERT each finding into `vh_findings`." These contradict. If the orchestrator really
parses the full `G<n>-findings.md` markdown to build SQL, it pulls ~138 KB of findings prose into its
own context (problem B) for data the subagents already wrote. **Fix:** make subagents the sole SQL
writers (as `audit.md` says); the orchestrator reads only counts (`SELECT … GROUP BY severity`) and
reconciles. Remove the parse-and-insert instruction from the reference. Pure win, no new machinery.

### 3.5 Prompt-cache the stable instruction prefixes

Anthropic prompt caching matches unchanged request prefixes. Two concrete levers:
- The **FP methodology block** (18 Hard Exclusions + 10 Precedent + CV, ~60 lines) is pasted verbatim
  into every FP batch prompt. Put it **first**, identical across batches, with per-batch findings
  *after* it → the prefix caches across the parallel FP agents.
- Ultracode agents each "Read `SKILL.md` + `workflows/<phase>.md` + `references/…`." Keep that read
  preamble byte-identical across agents of the same phase so the cache hits. #4's stable-prefix /
  volatile-suffix ordering applies here too.

### 3.6 Cache and reuse the deterministic index across re-audits

Re-auditing after changes is a listed use case. The §3.1 index keyed by file sha lets a re-audit reuse
unchanged groups' indexes and only re-map/re-audit changed files. Compounds with #3.

---

## 4. Consolidated, prioritized plan

Ordered by (value ÷ effort). Each names the **actual** file(s) to change. *Nothing here is implemented
yet — this is the plan; the only file written is this PROPOSAL.md.*

### Tier 1 — do first (largest saving, modest effort)

1. **Evidence packs (#5).** Audit subagents emit one `evidence/<id>.pack.md` per finding (≤4 snippets /
   ≤120 lines, with `file:line` + sha). Add columns to `vh_findings`: `evidence_pack`,
   `source_lines_count`, `pack_status`. FP-check reads packs first, spot-verifies, and re-opens files
   only when thin/suspicious or for CRITICAL/HIGH TPs; records `extra_files_read`.
   *Files:* `workflows/audit.md`, `references/phase4-deep-audit.md`, `workflows/fpcheck.md`,
   `references/phase5-fp-check.md`.
2. **Fuse map+hunt in `source`/app mode (§3.1) + skip mapping markdown there (§3.3).** One agent per
   small group maps, hunts, and writes packs in a single read pass; emits `compact.json` + SQL, no
   prose mapping. *Files:* `workflows/source.md`, `references/workflow-orchestration.md` (the `source`
   skeleton), `workflows/recon.md`/`audit.md` (note the fused option).
3. **Close the SQL re-ingest leak (§3.4).** Subagents are the sole writers of `vh_findings`;
   orchestrator reads counts only. *Files:* `references/phase4-deep-audit.md`, `workflows/audit.md`.

### Tier 2 — high value, a bit more plumbing

4. **Deterministic pre-index (#3).** `tools/vh-index.sh` + a scanner emitting `index/*.jsonl`
   (`files`, `routes`, `sinks`, `sources`, `auth_guards`, `validators`). Run it from the SWARM app at
   workspace creation and as a `Bash` step in the ultracode script; advisory fallback for unknown
   frameworks; sha-cached for re-audits. Optional `vh_index_*` tables. *Files:* new `tools/`, app
   `backend/src/runner/*`, `references/workflow-orchestration.md`, `workflows/recon.md`.
5. **Compact mapping bundle + trimmed shared payload (#4).** Mapping agents also emit
   `G<n>-mapping.compact.json`; audit agents get the path + compact JSON + **group-filtered**
   known-findings, not the whole list. *Files:* `references/phase2-feature-mapping.md`,
   `workflows/audit.md`.

### Tier 3 — incremental / opportunistic

6. **Deterministic shared-file FP batching (#7).** Add `primary_file`/`sink_file`/`batch_key` columns;
   batch by shared files first. Do it **with #5** (so loaded files are reused across a batch). *Files:*
   `workflows/fpcheck.md`, `references/phase5-fp-check.md`.
7. **Prompt-cache ordering (#3.5).** Stable methodology/preamble first, volatile content last. *Files:*
   `references/phase5-fp-check.md`, `references/workflow-orchestration.md`.

### Descoped

8. **JSONL mirror + SQL↔JSONL converters (#8).** Redundant with `audit.db`; reintroduces a sync burden.
   Keep only the *new* compact artifacts (#4 `compact.json`, #5 pack index) and the §3.3/§3.4 "render
   markdown last / don't re-ingest" discipline. If structured export is ever needed, generate it from
   the DB on demand.

---

## 5. Does each change serve the skill's purpose? (verification)

The skill's purpose is not "read code cheaply" — it is **adversarial, full-coverage vulnerability
hunting with honest impact and live PoC**, targeting CVE/GHSA-quality disclosure across source *and*
binary targets, in both human-gated and gateless (`source`/app) modes. The user's bar is explicit:
*"consumes too many tokens **but works well**."* So every change must be **quality-neutral or
quality-positive**. Verified against the skill's own stated principles (SKILL.md Essential Principles
1–11):

| Change | Coverage (every file audited) | Adversarial independence | Honest impact / live PoC | Source **and** binary | Verdict |
|---|---|---|---|---|---|
| #3 pre-index | Advisory only; recon still enumerates everything → no coverage loss | n/a (pre-LLM facts) | n/a | **Source only** — no-op for autorev/binary; must never gate a binary run | ✅ with binary carve-out |
| #4 compact mapping | Full mapping + SQL retained; compact is an *index* into it | Audit still reads real code (RoE rule 1) | unaffected | both (compact is just smaller) | ✅ |
| #5 evidence packs | unaffected | **Tension with CV-3** — see below | Confirmation read preserved for TPs | both | ✅ **only with the HIGH/CRITICAL re-read carve-out** |
| #7 batching | unaffected | Reviewers still independent per finding | unaffected | both | ✅ |
| §3.1 fuse map+hunt | Same files, same coverage, one read | map↔hunt are **not** mutual checks (unlike audit↔fpcheck) — safe to fuse | unaffected | both (fuse small groups only) | ✅ gateless mode only |
| §3.3 skip mapping markdown | Coverage data kept in SQL + compact.json | n/a | n/a | both | ✅ if Coverage line is preserved structurally |
| §3.4 no orchestrator re-ingest | unaffected | unaffected | unaffected | both | ✅ pure win |

**The one real quality risk — #5 vs the CV-3 fresh-eyes premise.** FP-check is deliberately a *second,
independent* read (Principle 8: the static/live separation "prevents an 'I couldn't reproduce it'
handwave from killing a real source-level bug"; CV-3: "never trust the artifact's quoted code"). An
evidence pack is the audit agent's framing — leaning on it inherits the audit agent's blind spots. So
the pack must be scoped to **what it's safe to short-circuit**:

- **Refutation path (the bulk of the win):** killing false positives and LOW/MEDIUM findings — a pack
  with claim + mitigations-checked + sha-anchored snippets is enough to refute fast, and the reviewer
  re-opens source the moment anything is thin or suspicious. In the sample run that's **10 FP + the
  MEDIUM/LOW slice of 13 TP** — most of the 26.
- **Confirmation path (must stay independent):** any finding heading to **TRUE_POSITIVE at
  HIGH/CRITICAL** keeps the mandatory independent re-read. That is exactly the credibility argument the
  whole methodology exists to protect, and it's a small minority of findings — so protecting it costs
  little and the pack still saves the majority.

This keeps #5's saving while honoring Principle 8. Every other change is quality-neutral by
construction (advisory facts, smaller indexes into unchanged source, or removing redundant work).
**Net: the suggestions match the skill's purpose** — they remove *repeated* and *redundant* reads, not
the *independent* and *adversarial* ones that make it work.

Two target-fit guardrails the verification surfaces:
- **#3 and §3.1/§3.3 are source-mode levers.** Binary/autorev targets have no source to index and use
  the orchestrator's single autorev DB session — keep those paths exactly as they are; the new machinery
  must be conditional on a source target.
- **Fusion and markdown-skipping are gateless-mode levers.** The human-gated full pipeline keeps the
  recon→gate→audit split so an operator can still review mappings before the hunt.

---

## 6. App optimization plan (SWARM)

The app is a real and underused token lever: it owns process spawning, model/effort selection, the
audit workspace, and usage metering — all *outside* the skill, so it can cut cost without touching
audit quality. Grounded in the code read (`runner/manager.ts`, `lib/claude.ts`, `runner/prompt.ts`,
`usage/routes.ts`):

### 6.1 Run the deterministic indexer at workspace creation — **do first**

The app already clones/extracts source to `/vibe/hack/projects/<name>` and pre-creates the audit
workspace (`VIBEHACK_AUDIT_DIR`, with an empty `audit.db`). Add the §3.1/#3 indexer there as a **plain
scripting step (zero LLM tokens)** before the first `claude` spawn, writing `index/*.jsonl` into the
workspace. Skip it when the target is binary-only. This is the cleanest home for #3 — the skill then
just *consumes* an index the app produced for free. *Files:* `runner/repo.ts`, `runner/manager.ts`
(pre-spawn hook), new `tools/`.

### 6.2 Per-phase model / effort tiering — **high value, must be careful**

Today `cfg.model` / `cfg.effort` are **run-level**, applied identically to every phase
(`manager.ts:159-160`), even though `composePrompt` already knows the phase. The orchestrator turn does
cheap *glue* (propose groups, build batches, reconcile verdicts, render reports); the *adversarial*
work is done by subagents. So:
- **Non-ultracode (inline) runs:** the app's `--model`/`--effort` set the **orchestrator** only —
  subagents pick their own model inside the skill ("strongest available"). Safe to run the orchestrator
  at a **cheaper model / lower effort** for glue-heavy phases (recon group proposal, fpcheck batch
  build, source-mode report render) and reserve the top tier for nothing extra. Quality-neutral because
  the hunting is in the subagents.
- **Ultracode (Workflow) runs — caution:** Workflow `agent()`s **inherit the main-loop model**, so
  cheapening the orchestrator here also cheapens the agents. Do **not** blanket-cheapen; instead the
  *script* should set per-`agent()` `model`/`effort` (low for mechanical fan-in stages, top tier for
  hunt/FP/verify). This is a skill-side change the app enables by passing the desired tiers through.
- Add per-phase defaults to app config (e.g. `recon: effort=medium`, `audit/fpcheck/verify:
  effort=high|xhigh`, `report(source): effort=low`). *Files:* `runner/prompt.ts` (expose phase),
  `runner/manager.ts` (resolve per-phase cfg), `config.ts`.

### 6.3 Token budgets + per-phase visibility — **directly answers the complaint**

The app already captures `total_cost_usd` and `usage_json` per run (`manager.ts:212-220`) and aggregates
by model/project/time. The user's pain is partly that the spend is *invisible and uncapped*. Extend:
- Parse `usage_json` into **input / output / cache-read / cache-creation** tokens per run and roll up
  **per phase and per audit** (not just per model). Surface a per-run budget bar in the UI.
- Optional **hard ceiling per audit**: when projected spend crosses a threshold, pause before launching
  the next fan-out phase and ask the operator (mirrors the Workflow `budget` concept). This makes "too
  many tokens" a visible, bounded number instead of a surprise. *Files:* `usage/routes.ts`, `db/schema.ts`
  (per-phase usage columns), frontend usage view.

### 6.4 Protect prompt-cache hits across phase invocations — **cheap**

The app resumes the **same** claude session across phases (`resume = session.claude_session_id`) and
appends a fixed ultracode system prompt (`manager.ts:163-166`). Two cache-friendliness checks:
- Keep `appendSystemPrompt` **byte-identical** across all runs of a session (it currently is — preserve
  that; don't make it phase-dependent) so the cached system prefix survives.
- The per-phase user turn is just the slash command (`composePrompt`) — good, it adds no volatile
  context. Keep relying on `--resume` + on-disk `audit.db`/resume note rather than ever re-injecting
  prior-phase output into the prompt (the app already does this correctly — note it as a constraint so
  a future change doesn't regress it).

### 6.5 Incremental re-audit reuse — **big win for a listed use case**

Re-auditing after changes is an advertised use case. The app manages projects and git, so it can
diff the source sha against the prior audit and offer an **incremental re-audit**: reuse the cached
index (6.1) and unchanged groups' mappings/findings, re-running only changed files' groups. Compounds
with #3's sha-keyed index. *Files:* `runner/repo.ts` (sha diff), `projects/service.ts`, `runner/manager.ts`.

### 6.6 Bound subagent fan-out for cost control — **note, mostly skill-side**

`max_concurrent_runs` caps concurrent app *runs*, but the in-skill subagent fan-out (10 parallel groups)
is governed by the CLI/Workflow concurrency cap, not the app. The app can't throttle Task fan-out inside
one `claude` process; under ultracode the Workflow cap applies. Expose this as a documented setting that
the ultracode script honors (smaller groups → more but cheaper agents), rather than an app-enforced
limit. Low priority.

**App plan ordering:** 6.1 (indexer at workspace creation) and 6.3 (budgets + per-phase visibility)
first — they give the operator control and feed every skill-side change. Then 6.2 (per-phase tiering)
and 6.5 (incremental re-audit). 6.4 is a cheap regression guard; 6.6 is a note.

---

## 7. Risks & guardrails

- **Do not weaken the adversarial premise.** #5 must keep CV-3 alive: packs accelerate refutation, they
  do not replace re-reading for CRITICAL/HIGH true-positives. Track `extra_files_read` to detect packs
  that hid a needed read.
- **The scanner must never become a dependency.** A regex/AST index will miss exotic frameworks. Recon
  keeps its "enumerate everything yourself" mandate; the index only *front-loads* the easy 80%.
- **Naming/paths.** Every SQL/path from the friend's spec is upstream-flavored: `cba_*` → `vh_*`,
  `reports/audit-<ts>/` → `/vibe/hack/audits/<project>/audit-<ts>/`. Mechanical but mandatory.
- **Keep the human-gated full pipeline intact.** The map+hunt fusion (§3.1) and markdown-skipping
  (§3.3) are for `source`/app (gateless) mode. Interactive runs may still want the recon→gate→audit
  split so an operator can review mappings first.
- **Measure before/after.** The app already tracks Claude usage (`backend/src/lib/anthropicUsage.ts`,
  `usage/routes.ts`). Capture billed input tokens per phase on one target before changes, re-run after
  Tier 1, and confirm the re-read multiplier actually dropped — don't trust the model, trust the meter.

---

## Appendix — friend's original artifact designs (still useful, names corrected)

The friend's detailed designs remain good *implementation* references for the items adopted above, with
two global substitutions: tables `cba_*` → `vh_*`, and paths `reports/audit-<ts>/` →
`/vibe/hack/audits/<project>/audit-<ts>/`.

- **Index JSONL row shapes** (`files`, `routes`, `sinks`, `sources`, `auth_guards`, `validators`) and
  the `rg`-based first-pass scanner → use for Tier-2 item 4.
- **`G<n>-mapping.compact.json`** shape (entrypoints / critical_files / sinks / validators /
  top_questions) → use for Tier-2 item 5.
- **Evidence-pack template** (claim / attacker position / source / sink / minimal snippets / mitigations
  checked / open FP questions / budget: ≤4 snippets, ≤120 lines, ≤700 words) → use for Tier-1 item 1.
- **Batch-key algorithm** (`ctx:primary_file+sink_file` → route → sink → validator → group → class) →
  use for Tier-3 item 6.

These designs are sound; the changes above re-scope them to the local fork, drop the redundant JSONL
mirror, and add the map+hunt fusion / re-ingest fix / cache ordering that the original five items did
not cover.
