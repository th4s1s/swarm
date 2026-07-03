# vibehack - report: Vulnerability Report(s)

**Purpose**: Write the vulnerability report(s) in the lean, maintainer-facing format (template: [../references/phase6-report.md](../references/phase6-report.md)). There are **two modes**, decided by how the audit ran:

- **Live, per-finding, in the fork** (full pipeline). After verify completes and confirms findings, when the **user** invokes the report phase in the fork, the **fork itself** writes one report per confirmed finding at `<AUDIT_DIR>/artifacts/<FINDING-ID>-vuln-report.md`, with the real PoC and captured output. There is no orchestrator consolidation.
- **Source-only, consolidated, in the orchestrator** (the `source` run: no live instance, no forks). The **orchestrator** writes ONE `<AUDIT_DIR>/report.md` covering all true positives, where *Steps to reproduce* is a reproduction guide (no PoC executed, no captured output).

**Entry**:
- Live: inside the verify fork, when the user invokes the report phase after verify has completed, for each finding the fork confirmed as real. Only real / worth-reporting findings reach this phase; REFUTED or not-worth-reporting findings stop at verify and never get a report.
- Source-only: the orchestrator, at the end of the `source` run (see [source.md](source.md)).

**Exit**:
- Live: one `artifacts/<FINDING-ID>-vuln-report.md` per confirmed finding, plus its runnable scripts staged in the project-root `poc/`.
- Source-only: one consolidated `report.md`.

No `disclosure-summary.md`, no severity tables, no orchestrator stitch step. Never auto-disclose. (A single CVSS 3.1 vector line per finding lives in Vulnerability Detail; that is not a table.)

---

## Report format (both modes)

Follow the template in [../references/phase6-report.md](../references/phase6-report.md). Every report (each live per-finding file, and each finding-section of the source consolidated report) uses exactly these headings, in order:

```
# <one-line descriptive title (end with the CWE)>
## Affected Version
## Summary
## Vulnerability Detail
## Root Cause
## Steps to reproduce
## Impact
```

Style (enforced):
- **No em-dashes** (`—`). Use a spaced hyphen ` - ` or rewrite the sentence.
- Use emphasis sparingly. Prefer `code spans` for symbols, paths, commands, and values; reserve `**bold**` for the rare load-bearing word.
- Lean. Only the seven headings; the CVSS 3.1 score/vector belongs in Vulnerability Detail. No severity tables, no disclosure timeline, no coverage matrix, no methodology appendix, no executive summary, no advisory boilerplate.
- Cite source as `src/file.c:line`; reference PoC scripts as `poc/<name>`. **Never** reference an audit-dir path (e.g. `/vibe/hack/audits/<project>/audit-<ts>/...`) - the maintainer will not have it.
- Keep the internal finding/group id (`G2-F1`, `G2`) out of the report body entirely - title, PoC script / helper filenames, temp or working directory names, and log / echo markers all use a short descriptive slug (vuln class / component / CWE), never the id. Only the report file name stays `<finding-id>-vuln-report.md` (an internal handle the vendor never sees).
- For format examples you may consult `<AUDIT_DIR>/archived-poc/<finding-id>/` (it may be empty on a first run; you do not need to match it exactly).

## Mode A - Live, per-finding (run in the verify fork)

Verify has completed and confirmed one or more findings as real, worth-reporting vulnerabilities. For each such finding (the comma-separated id list the user passed), write `<AUDIT_DIR>/artifacts/<FINDING-ID>-vuln-report.md`:

1. **Title + Affected Version** - the target product, version, and the commit/tag you tested on the live instance. Render *Affected Version* as the **fixed bullet list** defined in [../references/phase6-report.md](../references/phase6-report.md) - never a free-form paragraph, even when the target is unversioned (write `no version tag` / `no VCS` and anchor on the file sha256).
2. **Summary** - what the bug is and the genuine attacker path; state it was confirmed on the stock, unmodified build, and that a control run with honest input behaves normally.
3. **Vulnerability Detail** - the CWE(s) (most-specific first) and the CVSS 3.1 base score + full vector for the genuine attacker path. The formal classification lives here; the honest one-line severity verdict still goes in Impact.
4. **Root Cause** - the code-level explanation with `src/file.c:line` citations and minimal code blocks (the flaw, the flawed caller, the data flow from attacker input to sink).
5. **Steps to reproduce** - a **terminal transcript, one step at a time**: a short prose line (ending in `:`), then a fenced block with the `$ command`(s) and their real output, then the next prose + block. Run the **Control (honest-input) step first**, then the attack step(s) (own `### Control` / `### Reproduction N` subsections when there is more than one). **Do not collapse it into one self-contained script in any language** (a `.py`/`.rb`/Makefile one-shot is the same violation as a `poc.sh`). Use a "Save this as `poc/<name>`:" file block only for a standalone component the PoC genuinely needs (a malicious server, a peer/client the victim connects to, an attacker-side `.patch`; see *PoC packaging* below), then drive it with inline commands - the saved file is a component, never a wrapper that runs the whole reproduction. Paste the **real captured output verbatim** (the `curl -i` / server log / exit status you captured in verify) - never hand-write expected output.
6. **Impact** - the concrete attacker capability and what is lost; the trust boundary crossed; honest severity in prose (the formal CVSS 3.1 is in Vulnerability Detail; no table here).

The captured evidence already lives in your `verify-<id>.md`; reuse it. `verify-<id>.md` remains the verify-phase artifact - this report is a separate deliverable.

### PoC packaging (live)

The reproduction itself is an inline command transcript in the report (see step 4). Stage under a `poc/` directory at the **project root** (not under the audit dir `<AUDIT_DIR>/`) only the **standalone helper modules** the PoC needs - a malicious server, a peer/client the victim connects to, or an attacker-side `.patch`. Each such file:
- runs from a clean checkout; build any attacker-side patch from an included `.patch` - do **not** ship prebuilt binaries (the maintainer rebuilds and shouldn't trust an opaque binary);
- keeps the victim stock - the patch, if any, is the **attacker** side (verify with `readlink /proc/<pid>/exe`; see verify.md "PoC rigor + evidence model").

The report shows each helper file inline via "Save this as `poc/<name>`:" and drives it with the inline command transcript (which embeds the real captured output). Per-finding / per-delivery: after a report is sent, the user archives that report + its `poc/` into `<AUDIT_DIR>/archived-poc/<finding-id>/`.

## Mode B - Source-only, consolidated (run in the orchestrator)

The `source` run has no live instance and no forks. Write ONE `<AUDIT_DIR>/report.md` covering all true positives.

1. Pull the TPs:
   ```sql
   SELECT finding_id, final_severity FROM vh_fp_verdicts WHERE verdict = 'TRUE_POSITIVE';
   ```
   Read each finding's detail from `artifacts/G<n>-findings.md` + `vh_findings`.
2. Write `report.md`: a short header (target, version/commit, audit date), then **one section per finding** ordered by severity, each using the seven headings above (`#`/`##` per finding, `##`/`###` for its sub-sections - keep it consistent and skimmable). Include the CWE(s) + CVSS 3.1 vector in each finding's Vulnerability Detail (a static classification; no live instance needed).
3. **Steps to reproduce is a reproduction GUIDE only** - the concrete steps, inputs, and conditions an attacker or maintainer would use to trigger the bug, derived from source, written step by step (prose + the example command(s) per step, not one script). There is **no live instance**: do NOT run a PoC and do NOT paste captured output. Label the section as a source-level guide (not live-verified).
4. State prominently near the top that all findings are **static (source-level) true-positives that survived false-positive review but were NOT live-verified**; running the interactive verify phase against a live instance is recommended before any external disclosure.

## Before you finalize (light self-check)

Re-read the report against source + (live mode) the captured evidence:
- every `src/file.c:line` and quoted snippet matches the source at the tested commit;
- the root cause re-derives from scratch and the data flow actually reaches the sink;
- every behavioral claim is backed by the captured output (live) or clearly framed as a source-level expectation (source-only); severity is honest, not inflated.

Tighten wording to what was measured: "effectively unbounded (expected N iterations)" not "infinite"; "observed M/N" not "it crashes". Fix everything this pass catches.

## Do not disclose

Produce the report file(s) and stop. Never file an advisory, open an issue, or email a vendor - disclosure is the user's call. In the live full pipeline the fork returns its summary and the user collects the per-finding reports; in source mode the orchestrator prints a severity-counts summary and the `report.md` path.
