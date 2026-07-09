# Lessons Learned - From Real Audits

This file records pitfalls observed in actual vibehack runs. Read it **before** starting any new audit. Each lesson includes the symptom, the root cause, and the prevention.

---

## 1. A read-only subagent silently produces no artifacts (read-only `Explore`)

**Observed in:** A prior Phase 4 run. Six of seven groups returned no findings to SQL.

**Symptom:** Subagent returns analytical text but never runs `INSERT` statements. The orchestrator sees output that looks like findings but `vh_findings` stays empty.

**Root cause:** a read-only agent type (`Explore`) has no terminal, no file-write, and no SQL tools - it silently does nothing when asked to write to disk.

**Prevention:**
- Use a **writable** `general-purpose` `Task` subagent for any subagent that must write artifacts, run SQL, or hit the live instance. See SKILL.md → *Tools & subagents*.
- Use a **read-only** `Explore` agent ONLY for pure read-only research and Q&A.
- If you encounter this mid-pipeline: re-spawn the failed subagent as a **writable** agent, OR manually materialize the findings from the agent's return blob into `vh_findings` via SQL inserts. Don't lose findings.

---

## 2. Live-instance config drift between phases

**Observed in:** A prior audit. The user hand-edited bind-mounted config files between fpcheck and verify forks. A fork that assumed the baseline state could have made wrong edits or failed to restore correctly.

**Symptom:** Verify forks see config that doesn't match the audit-phase snapshot. Restorations write back a state the user didn't want.

**Prevention:**
- Always **re-read** any config file immediately before editing it.
- Back up with a unique filename per fork+finding: `/tmp/<file>.bak.fork-<X>-<finding-id>`.
- After PoC, `diff` against the backup to confirm what you changed.
- Restore from backup, verify via a probe command (re-run the documented liveness command), and only THEN move to next finding.
- The live-instance note has a "Hand-edit log" section - update it after any temp modification.

---

## 3. Patch-bypass class findings are the highest-value output

**Observed in:** A prior audit - the two CRITICAL findings both came from a single GHSA being patched in one handler but the same root cause left untouched in a sibling handler.

**Symptom:** A vendor patches one file, files a CVE, and considers the issue closed. Sibling files with identical root cause aren't reviewed.

**Prevention:**
- In Phase 3 (known findings ingest), for **every** advisory: fetch the patch commit, list the files touched, then **grep the codebase for the same pattern in other files**. Document the "probe these sites" list in `files/known-findings.md`.
- Phase 4 subagents must receive the patch-bypass intel and probe those specific sites.
- The "Top patch-bypass discoveries" section of the resume note exists to highlight these for vendor disclosure prioritization.

---

## 4. Operator-config "vulnerabilities" usually fail Marginal Gain Test

**Observed in:** Several Phase 5 dismissals - e.g., a URL-traversal finding that turned out to be FP because the operator already controlled the same setting directly and the new path gave no marginal attacker gain.

**Symptom:** A finding describes an operator-only configuration path that grants an effect the operator could already produce via another documented setting. Listed as TP, but actual attacker has no marginal gain.

**Prevention:**
- FP-check subagents must explicitly apply HE-17 (Marginal Gain Test): "Does this finding give an attacker a *new* capability they didn't already have, GIVEN the threat model?"
- Operator misconfiguration → typically not a CVE (it's a documentation/hardening issue).
- Distinguish "operator does something dangerous" (not a CVE) from "untrusted input reaches dangerous sink without operator opt-in" (likely a CVE).

---

## 5. Subagent scratch files accumulate

**Observed in:** Several subagents wrote scratch files outside the canonical `<AUDIT_DIR>/files/` and `<AUDIT_DIR>/artifacts/` during their run. After the findings landed in `vh_findings`, these intermediate files lingered.

**Symptom:** Stale duplicate scratch files accumulate; future sessions get confused about which file is the canonical truth.

**Prevention:**
- Subagent prompts should explicitly say: "Write findings to `vh_findings` (and any evidence to `<AUDIT_DIR>/artifacts/`), not to scratch files elsewhere."
- After consolidating, delete any intermediate scratch files left outside `<AUDIT_DIR>/`.
- Resume note should declare which file is canonical for each piece of state.

---

## 6. Subagent stalls / timeouts mid-run

**Observed in:** One Phase-5 batch subagent (G2 batch) stalled and never wrote SQL inserts.

**Symptom:** Batch returns no response, no error, no SQL rows. Other batches finished cleanly.

**Prevention:**
- After spawning N parallel subagents, after they "finish": query SQL to confirm row counts match expected (`SELECT COUNT(*) FROM vh_fp_verdicts`).
- If a batch is short: identify which findings are missing, re-spawn just that batch with the same prompt.
- The fpcheck/audit workflows include explicit count-check steps for this reason.

---

## 7. Resume note rot - partial updates leave stale sections

**Symptom:** Resume note has new phase status at top but stale "next-step plan" at bottom that refers to a phase already done.

**Prevention:**
- **Rewrite the resume note fully** at the end of each phase, don't just append.
- Use the template in `references/resume-note-template.md` as the canonical structure.
- The orchestrator's first read on resume should be the resume note - make it accurate.

---

## 8. Forgetting that FP-check is static and verify is live

**Symptom:** FP-check subagents try to spin up the live instance and produce flaky verdicts ("couldn't reproduce" rejects real bugs); OR verify forks re-do FP-check analysis instead of running the curl.

**Prevention:**
- FP-check phase: STATIC ONLY. Source re-reads, exclusion-rule application, no live testing.
- Verify phase: LIVE ONLY (per finding, in a fork). Run the PoC, capture HTTP, judge by reproduction not by theory.
- The two are separate phases for a reason - preserve the separation.

---

## 9. Verify forks write ONLY their own finding's rows (scoped + serial)

**Context:** each verify fork **must** record its finding's outcome in the DB - `verdict` + `final_severity` in `vh_fp_verdicts`, and `vh_findings.verified` for a live PoC (verify.md Step 3). This is required: the web UI reads the DB, not the artifacts, so a fork that only wrote a `verify-<id>.md` artifact would leave the UI stale.

**Rule:**
- A fork touches **only the rows for its own finding id** - never another finding's row, and never a bulk/unscoped `UPDATE`.
- That, plus verify running **serially** (one finding at a time - shared live instance), means there is no cross-fork race. (An earlier design that ran forks in parallel with broad SQL writes did race; the fix was **scoped, serial writes**, not "no writes".)
- Still write the `verify-<id>.md` artifact too - it is the evidence/reasoning record alongside the DB row.

---

## 10. Deploy phase glossed over → audit findings can't be validated

**Symptom:** Audit produces 47 findings but only 2 are live-verified because the live instance wasn't set up early enough.

**Prevention:**
- Make the **deploy** phase a mandatory step before the **audit** phase, not optional.
- Even if the deep audit subagents don't all use the live instance, having it ready means verify forks can do their job later.
- If the project has no clear deploy path, document that fact in the live-instance note as "infra-blocked, all findings will be source-only" - and the report sets expectations accordingly.

---

## 11. A PoC must reproduce impact on the REAL build via the genuine attacker path - not a harness / sanitizer / debugger stand-in

**Observed in:** A DoS audit claimed a MEDIUM wallet-crash from (a) an ASan abort in a hand-written harness that called the vulnerable function directly, then (b) a `gdb`-injected byte to force the crash. The honest end-to-end test on the stock release binary showed **0 crashes in 2400 unassisted attempts** - the crash gate was a heap byte the attacker can't control. Severity flip-flopped MEDIUM↔LOW and an overstated report was nearly shipped.

**Symptom:** The "PoC" is the auditor's own harness invoking the vulnerable function, a sanitizer (ASan/UBSan) abort, or a debugger-injected condition - none of which the real attacker controls. It proves a code *defect* exists, not *exploitable production impact*.

**Root cause:** Conflating "defect exists" with "attacker achieves impact." Sanitizer/debug/instrumented builds and direct-call harnesses bypass the reachability constraints, input validation, and heap/runtime state the production build imposes.

**Prevention:**
- Reproduce on the **real, production-flag build**. For an *impact* claim, no ASan/UBSan - a release build (`-DNDEBUG`) strips asserts and catches throws, so a sanitizer abort is a *different outcome* than the stock binary's. ASan proves the defect; it does not prove production impact.
- Reach the bug through the **genuine attacker-reachable path with attacker-controlled inputs only** - no private-member pokes, no re-implemented logic, no debugger-*injected* state. (A debugger that only *reads* state - e.g. a backtrace of an already-hung thread - is fine; one that *injects* state to force the bug is not.)
- **Quantify** the real outcome over many trials ("N attempts → M crashes"; "100% CPU for ≥X min, never returns"). Don't assume probabilities - measure them.
- If the real outcome on a stock build is unobservable, downrate to **Informational / hardening**; don't ship it as a vuln.

---

## 12. Trust-boundary bugs (client↔server, daemon→client): patch the ATTACKER component, keep the VICTIM stock

**Observed in:** Verifying a malicious-daemon → wallet hang. The bug lives in the client (victim); the trigger is the bytes the server (attacker) puts on the wire.

**Symptom:** Temptation to either (a) modify the victim to "make the bug fire," or (b) hand-roll the malicious wire bytes in a script and get the framing wrong, so the victim rejects them *before* reaching the bug - producing a false REFUTED.

**Root cause:** The vulnerable component is the one that must stay pristine to prove the claim; the attacker-controlled component is free to emit anything.

**Prevention:**
- Run the **victim 100% stock** and prove it (`readlink /proc/<pid>/exe` resolves to the released binary; no instrumentation, no recompile of the victim).
- Model the attacker by **patching/controlling the attacker's own component** to emit the crafted input - that only changes "what a hostile peer puts on the wire," which a real attacker fully controls. Let the attacker component's **real serializer** produce wire-correct bytes (this avoids hand-rolled-framing false negatives).
- State in the report that the patch is the *attacker* side and the victim binary is unmodified - a real attacker needs none of your code, only the ability to send those bytes.

---

## 13. Verifying non-HTTP, DoS, hang, and crash findings: quantify with OS-level signals + a control run

**Observed in:** The verify workflow's curl/HTTP-response pattern didn't fit a compiled daemon/wallet whose "impact" is a 100%-CPU spin with no response.

**Symptom:** Auditor asserts "it hangs / it's slow / it crashes" without a measured, reproducible signal - or can't tell a genuine spin from a process merely blocked on input.

**Root cause:** The HTTP-centric evidence model ("capture status + headers + body") has no analog for resource-exhaustion / non-HTTP / crash outcomes.

**Prevention:**
- Pick the signal that matches the impact: **CPU spin** → `top -bH -p <pid>` per-thread %CPU + `/proc/<pid>/task/<tid>/stat` field 14 (utime ticks ÷ clock-tick) sampled over time (rising linearly = real spin); **hang** → the request/command never returns over a meaningful window (≥ minutes); **crash** → exit code / signal / core dump; **memory blow-up** → RSS over time.
- **100% CPU distinguishes a spin from a blocked wait** (a process parked at a prompt or on I/O sits at ~0% CPU). Use it to rule out "it's just waiting."
- Always run a **control**: the same stock victim + setup with *honest* input. "Honest input → completes in ~1 s; malicious input → 100% CPU, never returns" isolates the bug as the cause and rules out a broken harness/environment.
- Capture the proof in the artifact (the sampled CPU/utime table, "no response after N s", a stack of the spinning thread). Show the measured outcome - never write "it would hang."

---

## 14. State observed outcomes precisely; adversarially verify the final report before it ships

**Observed in:** A report draft called an attacker-controlled loop "infinite / never exits." Independent re-derivation showed a tiny but non-zero per-iteration exit probability - *operationally* unbounded (expected > 10^5 years), not mathematically infinite. A second claim ("branch X runs because mitigation flag is off by default") was backwards - the flag defaults *on*; the branch runs for an unrelated reason.

**Symptom:** Plausible-sounding but technically wrong or overstated claims (severity, mechanism, "infinite", "always", "never") that a sharp vendor will catch - damaging credibility and risking a bug-bounty rejection for overstatement.

**Root cause:** Findings written from the model's narrative instead of re-checked against source + captured evidence.

**Prevention:**
- Prefer precise, defensible wording: "**effectively unbounded** (per-iteration exit prob ≈ p; expected ≈ N iterations)" over "infinite"; "**observed** X" over "it would X". Precise-and-quantified is *stronger* evidence than hand-waving, not weaker.
- Before finalizing `report.md`, run an **adversarial verification pass** (ideally independent reviewers/subagents) over each finding across three lenses: (1) every code citation / line number / quoted snippet matches source; (2) the root-cause mechanism re-derives from scratch; (3) no claim is unsupported by the captured evidence and the severity isn't inflated. Fix whatever they catch before sending.

---

## 15. Live-instance operational footguns (lifecycle, persistence, cross-process state)

**Observed in:** A regtest-based verify fork - several traps hit in one session.

**Symptom + Prevention (each is a distinct footgun):**
- **Hung/spinning processes ignore `SIGTERM`.** A process stuck in a tight loop never runs its shutdown handler, so `kill` leaves it alive holding its port → the next run fails to bind. **`kill -9` any process you've driven into a hang**, and confirm the port is free before relaunching.
- **Know the instance's persistence semantics before restarting between control and test runs.** Some test modes are ephemeral (state wiped on restart unless a "keep" flag is set). If you restart to flip config between control and malicious runs, **persist the funded/seeded state** (a keep flag, a snapshot) or you'll relaunch into an empty instance and waste a cycle.
- **Flush state to disk before handing it between processes.** If process A builds state (e.g. a funded wallet cache) and process B reads the same files, A must **explicitly save/close first** - a `kill -9` of A loses unflushed in-memory state and B then reads a stale/empty file.
- **Lifecycle ops may need privileges the sandbox withholds.** In a sandboxed / PID-namespaced shell, `kill`/`pgrep` may not reach host daemons; run start/stop/kill with the sandbox disabled (read-only probes like `curl` and `/proc` reads work either way). Record this in the live-instance note's *Common ops*.
- **Non-interactive CLI driving is finicky:** pass command + args as **separate tokens** (`--command transfer ADDR 1`, *not* `--command "transfer ADDR 1"`), and confirm the command actually executed - a wrong invocation can exit 0 with an "unknown command" error that masquerades as "didn't hang."

---

## 16. Apply the attacker-advantage test FIRST; lead with the honest verdict; never defend an inflated severity

**Observed in:** A DoS audit where six candidate MEDIUMs collapsed to two genuine ones - some "findings" were a node correctly dropping a misbehaving peer (self-healing, no attacker gain), others were operator misconfiguration.

**Symptom:** Effort spent writing up - and severity defended on - a bug that gives the attacker no durable advantage: a transient/self-healing condition, a self-only DoS, or something the operator could already do.

**Root cause:** Starting from "is this a bug?" instead of "what does the attacker concretely gain, given the threat model?"

**Prevention:**
- For every candidate, first answer: *what new, durable capability does the attacker gain that they didn't already have?* No marginal gain → not a vuln (Marginal Gain Test, HE-17).
- A node/app **dropping or banning a misbehaving peer is correct behavior**, not a DoS. Transient, self-healing, or requires-the-victim-to-attack-itself → LOW / Informational at most.
- **Lead with the honest verdict and hold it under pushback.** If pressed to inflate, re-run the attacker-advantage test and report what's true. An overstated bug-bounty submission is often disqualifying - a far worse outcome than an honest "Informational."

---

## 18. Verify shares one live instance - run it one finding at a time

**Observed in:** Designing automated end-to-end runs - the instinct to spawn many verify subagents/forks at once against a single deployed instance.

**Symptom:** Garbled, unreliable verification: concurrent forks back up / edit / restart the **same** config and instance, clobber each other's backups and state, and their PoCs interfere - producing "couldn't reproduce" outcomes that are really cross-fork interference.

**Root cause:** Verify mutates and probes a **shared** live instance (config backup → edit → restart → restore). That is **not** independent work, so it must not be parallelized like mapping / deep-audit / FP-check.

**Prevention:**
- **One fork/agent per finding, run strictly serially** - only one finding is ever live against the instance at a time. In the Workflow-accelerated path this is a `for`-await loop (concurrency 1); **never** `parallel()` (see `workflow-orchestration.md`).
- The per-finding **static** adversarial review (verify Step 2) is read-only - it re-derives from source + the captured evidence and never touches the instance - so its 2–3 reviewers MAY fan out in parallel.
- Verifying manually on shared infra: open forks one at a time; don't run several in parallel.

## 19. Orchestrator went inline after a spawn tool error

**Observed in:** A recon run. The orchestrator tried to fan out the mapping subagents but called `TaskCreate` (the todo-list tool, schema `{subject, description}`) with Agent-tool parameters (`prompt`, `subagent_type`), got a validation error, then said "I'll skip the task list and proceed directly with the recon work" and started doing the phase's work itself.

**Symptom:** A malformed or failed spawn call is treated as permission to abandon delegation; the orchestrator does the parallel/forked work (mapping, audit, fpcheck, verify) inline, collapsing the swarm into the main thread.

**Root cause:** (a) tool confusion - the subagent-spawning tool is `Task` (a.k.a. the `Agent` tool), which is **not** `TaskCreate`/`TodoWrite` (those only manage a todo list and cannot spawn an agent); (b) no rule treated a tool error as "fix and retry" rather than "fall back to inline".

**Prevention:**
- Spawn with the `Task`/`Agent` tool (`subagent_type: general-purpose`, with a `prompt`). Never use `TaskCreate`/`TodoWrite` to spawn; your own task tracking is separate from spawning subagents.
- On ANY spawn/tool error: diagnose, correct the call, and **retry the spawn**. The orchestrator stays the orchestrator (SKILL.md Essential Principle 11).
- Inline materialization of a unit's output is allowed only after the **correct** spawn fails twice for that one group/finding, and must be logged in the resume note's Quirks.

---

## How to add a new lesson

When you encounter a new failure mode:
1. Add a numbered section here with **Observed in / Symptom / Root cause / Prevention**.
2. If the lesson should be surfaced in SKILL.md's "Lessons Learned" summary, add a one-line entry there too.
3. If a sub-workflow can be hardened to prevent the failure mode automatically, edit that workflow file too.
