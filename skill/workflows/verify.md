# vibehack - verify: Per-Finding Live PoC (Runs in a FORK)

**Purpose**: Reproduce true-positive findings against the deployed live instance, then **adversarially review each one with fresh, unbiased subagents** before returning. **This workflow runs in a forked conversation** (or, under the Workflow-accelerated path, a fresh subagent), not the main orchestrator. **One fork/agent verifies exactly one finding** - write its `verify-<id>.md` verdict artifact, re-test it (Step 2) so bias and intentionally-vulnerable/test code are caught, and then **STOP**. Verify does not write the vulnerability report: that is a separate phase run afterward, here in this same fork (see [report.md](report.md)), so the captured PoC evidence is still in context.

**Entry**: You are a forked conversation launched by the app for the **verify** phase with a comma-separated finding-ID list (IDs are mandatory; see SKILL.md → *How phases are invoked (Claude Code CLI)*).
**Exit**: One `verify-<finding-id>.md` verdict artifact per finding, plus a summary table. To produce vulnerability reports for the confirmed findings, the **report** phase is run in this same fork afterward (see [report.md](report.md)). There is no orchestrator consolidation: the per-finding reports are the deliverables.

---

## Guard - refuse to run without IDs

If the **verify** phase was invoked with **no finding IDs**, stop immediately and respond:

> The **verify** phase runs in a forked conversation and requires a finding-ID list. Re-invoke it with the IDs: `/vibehack:verify G1-F1,G1-F2`. Each fork verifies one finding and writes its `verify-<id>.md` verdict; reports are written by running the **report** phase afterward in the fork (see [report.md](report.md)).

Do not attempt to guess intent. Do not run any PoC. Do not scan artifacts. The verify phase must be invoked with explicit finding IDs.

---

## Step 0 - Orient yourself

You are a fork. The audit dir is the absolute path `<AUDIT_DIR>` - write artifacts there by absolute path.

**Scope - one finding per fork, serial:** a fork verifies **exactly one finding**. If you were handed several IDs, verify them **strictly one at a time** (finish one finding's PoC + review + artifact before starting the next) - never concurrently - because they share a single live instance and parallel PoCs race on config backup/restart. (Under the Workflow-accelerated path this is enforced by a serial `for`-loop - see [../references/workflow-orchestration.md](../references/workflow-orchestration.md).)

Then do these reads first (parallel):

1. `<AUDIT_DIR>/<project>-audit-resume.md` - current pipeline state, what's TP, fork inventory, live-instance pointer (the audit pointer in your memory references this path if you need to relocate it)
2. `/vibe/hack/audits/<project>/<project>-live-instance.md` - **deployment mode, capabilities, base URLs, liveness command**, bind-mounted config, hand-edit log, **credentials inventory, tenant/scope boundaries, off-limits resources, rate-limit caps, seed test data** (external-provided)
3. Each in-scope finding's row in `vh_findings` (`SELECT * FROM vh_findings WHERE id = '<finding-id>'`) - root cause, data flow, location, PoC, remediation
4. The corresponding FP-check verdict reason from `vh_fp_verdicts` (verifies the FP-check was satisfied this is a real bug, so any "can't reproduce" outcome is suspicious)

Confirm the live instance is reachable using the **liveness command from the live-instance note** (do not invent one - `/health` may 404 or be sensitive, and `127.0.0.1` may be the wrong host):

```bash
<liveness command from live-instance note>     # e.g. curl -fsS <base-url>/<liveness-path>
```

For `local-managed` mode you may additionally use container introspection (`docker compose ps`, etc.). For `external-provided` mode the HTTP probe is the only signal - **do not** swap in a local-loopback probe; that will silently test the wrong target.

### Mode-dependent constraints (read before planning ANY PoC)

The `Capabilities` table in the live-instance note is authoritative. For `external-provided` instances in particular:

- **No config backup / edit / restart.** Skip Steps 1b, 1c, 1f for those findings. If a finding **requires** a config change, mark it **INCONCLUSIVE** with status note `requires operator-coordinated change: <what>` - do NOT attempt a local-loopback substitute.
- **No filesystem access.** Treat the target purely as an HTTP black box.
- **Respect whatever the live-instance note explicitly forbids** - the "Off-limits surface", "Off-limits resources", "Tenant / scope boundaries", and "Rate limits / blast-radius caps" sections are authoritative. Anything NOT listed there is fair game; do not invent additional self-restrictions. If a PoC would cross a documented limit, mark INCONCLUSIVE with a one-line reason citing which limit (e.g. `would touch off-limits resource: <id>`, `cap exceeded: <what>`, `cross-tenant impact - operator coordination required`).
- **Use seed test data when available** rather than creating new state; tag any throwaway resources you do create with a recognizable prefix (e.g. `audit-fork-G1-F2-…`) so the operator can clean them up.
- **Pull credentials from the documented env vars** (`Credentials inventory` section). Never paste tokens into artifacts; reference the env var name instead. If `can-rotate=no`, treat the credential as scarce - avoid actions that could lock you out (password change, MFA enrollment, etc.).

If the live instance is **not reachable** and mode is `local-managed`, bring it up using the documented `Common ops` commands. If it is not reachable and mode is `external-provided`, stop - return to the user with the unreachable status; do NOT attempt to restart or redeploy. The user must coordinate with the operator.

### PoC rigor + evidence model (read before ANY PoC)

These rules are cross-cutting - they apply to every finding, web-app or not. The rest of this workflow defaults to HTTP/curl; use this section to adapt for compiled-binary, protocol, DoS, hang, and crash findings. (See [../references/lessons-learned.md](../references/lessons-learned.md) items 11–14.)

1. **Reproduce impact on the REAL, unmodified target via the genuine attacker path.** The component you are proving vulnerable must be the **stock production build**, reached through the real attacker-reachable path with **attacker-controlled inputs only**. A self-written harness that calls the function directly, a sanitizer (ASan/UBSan) abort, or a debugger-*injected* condition proves a *defect*, not exploitable impact - never present one as a confirmed vuln. (A debugger that only *reads* state - e.g. a backtrace of an already-hung thread - is fine.) If the real outcome on the stock build is unobservable, mark the finding **INCONCLUSIVE / source-only** and recommend downrating to Informational; do not assert impact you didn't observe.

2. **Trust-boundary bugs: patch the ATTACKER, keep the VICTIM stock.** When the bug is in component A (victim) but triggered by data from component B (attacker) - a malicious server→client response, a malicious peer, a compromised upstream - model the attacker by **controlling/patching B** (or a MITM proxy) to emit the crafted input, and run **A 100% stock**. Verify the victim is the released binary (`readlink /proc/<pid>/exe`). Prefer letting B's **real serializer** produce the wire bytes over hand-rolling the framing (a framing bug reads as a false REFUTED). State in the artifact that the patch is the *attacker* side and the victim is unmodified.

3. **Always run a CONTROL.** Run the same stock victim + setup once with **honest input** and once with the **malicious input**. The *difference* (e.g. "honest → completes in ~1 s; malicious → 100% CPU, never returns") is the proof and rules out a broken harness/environment as the cause.

4. **Capture the evidence that matches the impact type:**

| Impact type | What "CONFIRMED" looks like |
|---|---|
| HTTP request/response (injection, authz, SSRF, disclosure) | full `curl -i` request + status/headers/body (the Step 1d default) |
| **CPU spin / algorithmic DoS** | `top -bH -p <pid>` per-thread %CPU + `/proc/<pid>/task/<tid>/stat` field 14 (utime) sampled over time - rising linearly = real spin. **100% CPU ⇒ spinning; ~0% ⇒ merely blocked on input.** |
| **Hang** | the request/command never returns over a meaningful window (≥ minutes); show the elapsed-time samples |
| **Crash** | exit code / fatal signal / core dump / sanitizer summary (a sanitizer build is OK for a *crash-reachability* PoC, but still trigger it via the genuine input path, not a direct-call harness) |
| **Memory exhaustion** | RSS over time; OOM kill |

Show the measured outcome in the artifact - never write "it would hang/crash."

## Step 1 - Per-finding loop

For EACH finding in scope:

### 1a. Plan the PoC

From the artifact's "PoC" section, extract the curl/payload. Identify what live-instance changes are needed and cross-check against the `Capabilities` table:

- **No changes**: curl against an existing route → trivial, just run.
- **Temp rule needed**: edit `rules.json` / matching config → **BACK UP FIRST** (only if `edit-config: yes`; otherwise INCONCLUSIVE).
- **Temp config needed**: edit `config.yaml` → **BACK UP FIRST** (same constraint).
- **Restart required**: note it; restart adds latency (only if `restart-service: yes`; otherwise INCONCLUSIVE).

If any required capability is **no**, do not proceed with that finding - write the artifact with status **INCONCLUSIVE** and reason `requires <capability> which is unavailable in <mode> mode`. Skip the rest of Step 1 for that finding.

### 1b. Back up before any modification

Mandatory backup pattern:

```bash
cp <config-file> /tmp/<filename>.bak.fork-<X>-<finding-id>
```

Where `<X>` is your fork letter and `<finding-id>` is the current finding. This makes it easy to find and restore the right backup if multiple findings need config edits.

### 1c. Re-read the config before editing

**The user may have hand-edited the live-instance config between phases.** Always re-read the current file content before making edits - never assume it matches what was there yesterday.

### 1d. Apply the change, restart if needed, capture output

**Run the CONTROL first** (honest input) so you have a baseline to contrast against. For **non-HTTP / DoS / hang / crash** findings, capture the signal from the *evidence model* table above (CPU/`/proc` samples, elapsed-with-no-return, exit code, RSS) instead of an HTTP response - the rest of this step is the HTTP default.

Use `curl -i` to capture full headers + body. Build the URL from the **base URL recorded in the live-instance note** - never substitute `127.0.0.1` for a remote host. Pipe to a temp file if large:

```bash
curl -sSi <base-url>/<path> -H '<malicious-header>' -d '<payload>' | tee /tmp/poc-<id>.txt
```

Capture:
- Request line
- Full response (status, headers, body - truncate body to 2KB if huge)
- Any side-effect evidence (server logs, file changes, downstream service receipt)

### 1e. Determine status

- **CONFIRMED**: PoC reproduces the claimed impact. Capture severity adjustments (often unchanged; sometimes upgraded when impact is broader than expected).
- **REFUTED**: PoC does not reproduce. Re-read the source one more time to be sure - if still no repro, the finding should be dropped from the report. Document exactly why (e.g., "a default config guard at `file:line` blocks the payload").
- **INCONCLUSIVE**: Live instance lacks required infrastructure (e.g., needs a gRPC client, an SSE upstream, an external IdP) and you can't stand it up reliably. Document the missing piece. Keep finding as source-only in the report with this note.

### 1f. RESTORE the config

```bash
cp /tmp/<filename>.bak.fork-<X>-<finding-id> <config-file>
docker compose restart <service>  # if needed
```

Verify restore worked (e.g., re-probe the same endpoint the liveness command uses and confirm it still returns the expected baseline state).

### 1g. Write the verify artifact

Save to **`<AUDIT_DIR>/artifacts/verify-<finding-id>.md`** with this structure:

````markdown
# Verify <finding-id> - <short title>

**Audit:** `audit-<timestamp>`  · **Fork:** <letter>  · **Date:** <date>
**Finding:** `<finding-id>` in `vh_findings` (audit DB)
**FP-check verdict:** TRUE_POSITIVE - <reason>
**Upstream status:** <at latest commit `<sha>` | patched upstream at `<sha>`[ , CVE-…] | still present at latest commit `<sha>` | check skipped: offline/no remote>  (filled in Step 2c)

## Status: CONFIRMED | REFUTED | INCONCLUSIVE

## Live-instance setup
- Backup taken: `/tmp/...bak.fork-<X>-<finding-id>`
- Config change: <description, or "none">
- Restart required: yes/no
- Victim build: <stock release binary - confirm via `readlink /proc/<pid>/exe`; for trust-boundary bugs, name which *attacker* component was patched/controlled>
- Control (honest input) result: <e.g. "completes in ~1 s" - the baseline the malicious run is contrasted against>

## PoC invocation
```bash
<exact curl/script>
```

## Captured evidence
<For HTTP findings: status line + headers + body. For DoS/hang/crash/non-HTTP: the CPU + `/proc/<pid>/task/<tid>/stat` samples over time, the "no response after N s" measurement, the exit code/signal/core, or a stack of the spinning thread - alongside the CONTROL result for contrast. Show the measured outcome; never "it would X.">
```http
<status line + headers + body>     (HTTP findings; otherwise paste the matching evidence)
```

## Interpretation
<2-4 sentences: what the response shows, why it confirms/refutes/blocks the claim>

## Adversarial review (fresh subagents - filled in Step 2)
- Reviewers: <N> fresh subagents (angles: real-bug / valid-PoC / intentional-or-test-code)
- Verdicts: <e.g. "3 UPHELD"> | <"2 UPHELD, 1 DISPUTED - re-examined, reviewers wrong because …"> | <"1 INTENTIONAL-OR-TEST-CODE - confirmed example/test code → Status set to REFUTED">
- Outcome: <upheld unchanged | severity lowered X→Y | Status changed to REFUTED/INCONCLUSIVE> - <one-line>

## Severity adjustment
<original-severity> → <final-severity>  (reason if changed - including any change forced by the adversarial review)

## Draft remediation
<1-3 sentences of code-level fix guidance, suitable for vendor disclosure>

## Cleanup verified
- Config restored from backup: yes
- Live instance back to baseline: yes (verified via `<command>`)
````

## Step 2 - Adversarial review of each finding (fresh, unbiased subagents)

After you've written the `verify-<id>.md` PoC artifacts, **re-test your own conclusions with fresh reviewers before returning.** A reviewer subagent has none of this fork's context, so it cannot inherit your bias - the only bias risk is what you put in its prompt, so keep the prompt **neutral**: give it the code + the claim + the PoC, **never** your verdict, severity, or "confirmed".

Do this for every **CONFIRMED** finding (and any **INCONCLUSIVE** one you're tempted to argue up). REFUTED findings need no review.

### 2a. Spawn the reviewers

For the finding, spawn **2–3 fresh subagents in parallel** (see SKILL.md → *Tools & subagents*). These reviewers are **read-only** - they re-derive from source + the captured evidence and **must not touch the live instance** - so running them in parallel is safe (only one finding is ever live against the instance at a time). Give each a distinct skeptical lens (perspective-diverse beats N identical reviewers):

- **Reviewer 1 - "is the bug real?"** Re-derive the vulnerability from source independently; is the data flow genuine and reachable by the stated attacker, or does a guard / validation / type make it impossible?
- **Reviewer 2 - "is the PoC valid?"** Does the captured evidence actually demonstrate the claimed impact on the **real, unmodified** target via the **genuine attacker path** - or is it a self-harness, a sanitizer abort, a debugger-injected state, or a missing control run? Does the impact match what's shown (no "infinite" / "RCE" / "always" beyond the evidence)?
- **Reviewer 3 - "is this even a bug?"** Could the target be **intentionally-vulnerable or non-production** code - a CTF/wargame/training app, a test fixture, an example/demo, a deliberately-unsafe benchmark, or documented intended behavior? Does the attacker gain a *new, durable* capability, or is it self-healing / self-only / operator-misconfig / marginal (severity inflated)?

Neutral prompt skeleton (fill per finding - **omit your own verdict/severity**):

```
You are an independent reviewer with NO prior context on this code or claim. Judge only what is below, and default to skepticism.

Target: <repo @ commit>  ·  Component: <file(s)>
Alleged issue: <one-line NEUTRAL statement of the claimed bug - no severity, no "confirmed">
Code under review:
<the cited source: pasted, or path + line range the reviewer can open>
PoC and its captured output:
<exact PoC script/commands + the captured evidence>

From your assigned angle (<angle>), decide with evidence:
1) Is the alleged issue a real defect reachable by the stated attacker?
2) Does the PoC validly demonstrate the claimed IMPACT on the real, unmodified target via the genuine attacker path (not a harness / sanitizer / instrumented / debugger-forced artifact)?
3) Could this be intentionally-vulnerable / test / example / benchmark code, or documented intended behavior?
Return: verdict ∈ {UPHELD, DISPUTED, INTENTIONAL-OR-TEST-CODE, OVERSTATED}, confidence 1-10, and 2-4 sentences citing the code/evidence.
```

### 2b. Aggregate and reconcile (you adjudicate)

- **All UPHELD** → keep the finding; record the consensus.
- **A convincing INTENTIONAL-OR-TEST-CODE flag** → re-check; if correct, set Status **REFUTED** (reason: intentionally-vulnerable / non-production code). This is a real and common false positive - take it seriously.
- **Majority DISPUTED, or a valid invalid-PoC argument** → re-examine the source/PoC once more. If the reviewers are right, downgrade Status (REFUTED / INCONCLUSIVE) or lower severity and say so. If you're confident they're wrong, you may keep it - but **document why you override them**.
- **OVERSTATED** → tighten the impact/severity wording to exactly what the evidence supports.

Record the result in each `verify-<id>.md` under the **Adversarial review** section (reviewer count, each verdict + one-line reason, the consensus, and any change you made). If the review overturns the result, update that artifact's `Status:` and `Severity adjustment:` lines too.

> **Optional: agent-team escalation.** When you want genuine back-and-forth rather than one-shot verdicts, create a small agent team and let the reviewers debate / hold counter-opinions, reconciling interactively before you record the outcome. Otherwise use the parallel one-shot subagents above (the default). Either way the reviewers must be fresh and the prompt neutral.

### 2c. Upstream patch-gap check (findings still CONFIRMED)

Audits usually run against a stable release tag, not upstream HEAD. Before a CONFIRMED finding is carried to a report, check whether upstream has already fixed it **anywhere** - any branch (`unstable`/`main`/next), a later commit, or a newer tag, **with or without a CVE**. **If upstream has already fixed the sink, the finding is Informational at best and is NOT reported as a vuln** - the maintainers already know and handled it. A missing backport or CVE does not turn it into a fresh, reportable n-day, even though the shipping release still carries it. Do this for each finding still CONFIRMED after 2b.

1. See how far the audited tree is behind upstream. Skip the check gracefully if there is no remote or the fetch fails (note `upstream check skipped: offline/no remote` and move on):
```bash
cd <repo>
git describe --tags --always                        # the audited revision
git fetch --quiet --tags origin || echo OFFLINE
BR=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
git rev-list --count "HEAD..origin/$BR"              # 0 = already at latest commit
```
If it is `0`, the finding already affects HEAD - note `at latest commit <sha>` and stop.

2. If behind, check whether the finding's sink was changed / fixed upstream since the audited commit. Look at the vulnerable file's history and its current code at HEAD (also check any newer release tag):
```bash
git log --oneline "HEAD..origin/$BR" -- <vulnerable-file>          # commits touching it since the audit
git log "HEAD..origin/$BR" -- <vulnerable-file> | grep -iE 'fix|cve|ghsa|overflow|inject|bypass|sanitiz|bound|auth'
git diff "HEAD..origin/$BR" -- <vulnerable-file>                   # did the sink or a guard change?
git show "origin/$BR:<vulnerable-file>" | sed -n '<sink-line-range>p'   # is the flaw still there at HEAD?
```

3. Record the outcome in the artifact's *Upstream status* line and the DB note:
- **Fixed upstream (any branch/commit/tag, CVE or not)** - the sink is now guarded / rewritten anywhere upstream. This is **Informational at best - do NOT report it as a vuln.** Do not argue it up into a reportable n-day because the fix is dev-branch-only, unbackported, or has no CVE (the shipping release still carrying it does not change this). Capture the fixing commit (`git blame "origin/$BR" -L <lines> -- <vulnerable-file>`) for the record, then drop it from the reportable set: `verdict=FALSE_POSITIVE`, `final_severity=INFORMATIONAL`, reason `already fixed upstream at <sha>` (Step 3). Do NOT spend report effort re-discovering a known fix. (Flagging it to the user as "worth a backport nudge" is their call, not a vulnerability report.)
- **Still present at latest** - the sink is unchanged (or changed but still exploitable at HEAD). This is higher value (affects even the latest commit): note `still present at latest commit <sha>` and carry it to the report.

## Step 3 - Record the verdict to the DB (so the web UI reflects it live)

Once a finding's status and final severity are settled (Step 1e + the adversarial review in Step 2), write the outcome into `audit.db` so the app's web UI updates in real time. The UI computes a finding's **severity** as `COALESCE(vh_fp_verdicts.final_severity, vh_findings.severity)` and reads its **verdict** from `vh_fp_verdicts.verdict`; it does **not** read `vh_verify`. So the fields that change what the UI shows live are in **`vh_fp_verdicts`** (plus `vh_findings.verified`) - writing only `vh_verify` will not surface anywhere.

Map the verify Status to the DB (one finding at a time; touch only the row you verified):

| Verify Status | `vh_fp_verdicts.verdict` | `vh_fp_verdicts.final_severity` | `vh_findings.verified` |
|---|---|---|---|
| CONFIRMED - real vuln | `TRUE_POSITIVE` (unchanged) | the confirmed severity, even if lowered (e.g. `LOW`) | `live-poc` |
| CONFIRMED but Informational / not worth reporting (marginal, self-healing, intended) | `FALSE_POSITIVE` | `INFORMATIONAL` | `live-poc` |
| REFUTED | `FALSE_POSITIVE` | leave as-is | leave as-is |
| INCONCLUSIVE | leave unchanged (stays a source-only TP) | optional downrate | leave as-is |

Setting `verdict` away from `TRUE_POSITIVE` drops the finding from the UI's true-positive count and from the report phase's TP list; a lowered `final_severity` restyles it. (If an informational item is still worth surfacing as a low finding rather than dropped, use `TRUE_POSITIVE` with `final_severity='LOW'`/`'INFORMATIONAL'` instead.)

```bash
DB="<AUDIT_DIR>/audit.db"

# 1) The UI-visible fields. UPSERT so it works whether or not fpcheck left a verdict row.
sqlite3 "$DB" "INSERT INTO vh_fp_verdicts (finding_id, verdict, reason, final_severity, reviewed_at)
  VALUES ('<ID>', '<VERDICT>', '<one-line verify reason>', '<FINAL_SEVERITY>', datetime('now'))
  ON CONFLICT(finding_id) DO UPDATE SET
    verdict=excluded.verdict, reason=excluded.reason,
    final_severity=excluded.final_severity, reviewed_at=datetime('now');"

# 2) How it was verified (drives the UI 'verified' column) - only for a live PoC.
sqlite3 "$DB" "UPDATE vh_findings SET verified='live-poc' WHERE id='<ID>';"

# 3) The full verify record. vh_verify is verify's own table (the UI ignores it) - keep it for provenance.
sqlite3 "$DB" "INSERT INTO vh_verify (finding_id, status, orig_severity, final_severity, verified_via, reviewers, artifact_path, note)
  VALUES ('<ID>', '<CONFIRMED|REFUTED|INCONCLUSIVE>', '<orig>', '<final>', '<how tested>', '<review outcome>', 'artifacts/verify-<ID>.md', '<one-line>')
  ON CONFLICT(finding_id) DO UPDATE SET
    status=excluded.status, final_severity=excluded.final_severity, verified_via=excluded.verified_via,
    reviewers=excluded.reviewers, note=excluded.note, verified_at=datetime('now');"
```

Only touch the row(s) for the finding(s) you verified; do not delete or rewrite unrelated rows, and never `DROP`/`ALTER` a table. Verify runs one finding at a time (Step 0 scope), so these writes never race. The `<id>-vuln-report.md` reports are still written later by the **report** phase, not here.

## Step 4 - Final restoration check

Before returning to the user, verify the live instance is back to baseline.

For `local-managed` mode:

```bash
diff /tmp/<config-original-backup> <config-file>  # should be empty
curl -s <admin-base-url>/rules | jq  # should match pre-fork state
docker compose ps                                    # services still up
```

For `external-provided` mode (no filesystem / no lifecycle access), just re-run the documented liveness command and any read-only sanity probe:

```bash
<liveness command from live-instance note>           # exit 0 + expected status
curl -sSI <base-url>/<known-stable-route>            # status unchanged vs Step 0
```

## Step 5 - Return summary

Return a compact markdown table (surfaced in the app for situational awareness - **the orchestrator does NOT need it pasted back**):

| Finding | Status | Severity (orig → final) | Review | Upstream | One-line note |
|---|---|---|---|---|---|
| G<n>-F<m> | CONFIRMED | HIGH → HIGH | 3 UPHELD | still present @`<sha>` | Live PoC: <one-line> |
| G<n>-F<j> | CONFIRMED | HIGH → INFO | 3 UPHELD | patched upstream @`<sha>` | dropped: fixed upstream (Informational) |
| G<n>-F<k> | REFUTED | MED → - | overturned: test-code | - | reviewers flagged intentionally-vulnerable example |
| … | … | … | … | … | … |

Plus a one-paragraph high-level summary. To write the vulnerability report(s) for the CONFIRMED finding(s), run the **report** phase here in this fork: `/vibehack:report <comma-separated CONFIRMED ids>`. There is no orchestrator consolidation step - the per-finding reports are the deliverables.

## Common Pitfalls (see also [../references/lessons-learned.md](../references/lessons-learned.md))

- **Forgetting to restore** the live-instance config (`local-managed`). Always verify restoration before returning.
- **Editing the wrong config file** because the user edited it between phases. Re-read first.
- **Probing `127.0.0.1` when mode is `external-provided`.** The loopback probe will appear to succeed against an unrelated service on your fork's host and silently invalidate every verdict. Always build URLs from the documented base URL.
- **Attempting `docker compose ...` against an external instance.** You don't manage it. Mark INCONCLUSIVE and request operator coordination.
- **Capturing only stdout, not headers** - use `curl -i` or `curl -D-`.
- **Concluding REFUTED too quickly** when a default config guard could be relaxed. If the finding is "X works when Y is enabled" and Y is off by default, that's still TP - document the config requirement, don't refute.
- **Spending excessive time on infra-blocked findings.** If you've spent more than a few attempts standing up infrastructure (e.g., gRPC test client) for one finding, mark INCONCLUSIVE and move on.
- **Presenting a harness / sanitizer / debugger-injected trigger as the PoC.** Those prove a *defect*, not impact. Reproduce on the stock build via the genuine attacker path; if the stock outcome is unobservable, mark source-only / INCONCLUSIVE.
- **Modifying the victim to make the bug fire.** For trust-boundary bugs, patch the *attacker* component and keep the victim binary stock (verify `readlink /proc/<pid>/exe`).
- **Asserting "it hangs / crashes" without measuring.** Quantify (CPU% + `/proc`, exit code, N trials); 100% CPU ≠ a blocked wait; always include a control run.
- **`kill` (SIGTERM) on a process you drove into a hang.** A spinning process ignores SIGTERM and keeps its port bound → the next run can't start. Use `kill -9` and confirm the port is free.
- **Restarting an ephemeral instance between control and malicious runs without persisting state**, or handing a database / cache / state file to another process without the first process flushing it to disk - you relaunch into empty/stale state.
- **Biasing the adversarial reviewers.** Don't paste your verdict, severity, or "I confirmed this" into a reviewer prompt - give them only the code + a neutral claim + the PoC, or you just get your own conclusion echoed back.
- **Dismissing a reviewer who flags intentionally-vulnerable / test / example code.** That's a legitimate REFUTED - re-check the target's nature rather than waving it away; "vulnerable-by-design" repos are a common false-positive source.
- **Reporting a bug upstream already fixed.** The audit runs on a stable tag; a fix may already exist in any upstream branch/commit/tag (CVE or not). Run the patch-gap check (Step 2c): if upstream fixed the sink, it is **Informational at best and is not reported** - do not inflate a dev-branch-only or CVE-less fix into a reportable n-day just because the shipping release still carries it.

## Quality Checks (before returning)

- [ ] Every in-scope finding has a `verify-<id>.md` artifact
- [ ] Every CONFIRMED finding includes full captured HTTP response
- [ ] Every REFUTED finding cites the specific code/config that blocks the PoC
- [ ] All config backups have been restored
- [ ] Live instance is operational (health check passes)
- [ ] Each verified finding's outcome is written to `vh_fp_verdicts` (`verdict` + `final_severity`) and, for live PoCs, `vh_findings.verified='live-poc'` - so the web UI reflects it (Step 3)
- [ ] The victim ran as the **stock production build** (not a harness / sanitizer / instrumented build) and was reached via the genuine attacker path; for trust-boundary bugs the *attacker* component was the one patched/controlled
- [ ] A **control run** (honest input) is captured alongside each CONFIRMED DoS / hang / crash finding
- [ ] DoS / hang / crash outcomes are **quantified** with the matching OS-level signal (CPU + `/proc`, exit/signal, RSS) - not merely asserted
- [ ] Every CONFIRMED finding was **adversarially reviewed by ≥2 fresh subagents** given a neutral (verdict-free) prompt, with the outcome recorded in its `verify-<id>.md`
- [ ] Any finding a reviewer flagged as intentionally-vulnerable / test code or invalid-PoC was **re-examined and reconciled** (Status / severity updated, or the override justified)
- [ ] Every CONFIRMED finding has an **upstream patch-gap check** recorded (at-latest / patched-upstream / still-present); any fixed-upstream finding is marked Informational and dropped from the report, never argued up into an n-day (Step 2c)

> **Verify stops here.** To write the reports, run the **report** phase in this same fork (`/vibehack:report <ids>`) - see [report.md](report.md) Mode A. The per-finding reports remain the deliverables; there is still no orchestrator-side consolidation.
