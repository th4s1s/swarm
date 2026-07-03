# Report template (per-finding live + source consolidated)

The lean, maintainer-facing vulnerability-report format used by [../workflows/report.md](../workflows/report.md) in both modes:

- **Live, per-finding (in the fork)**: one file `<AUDIT_DIR>/artifacts/<FINDING-ID>-vuln-report.md`.
- **Source-only, consolidated (in the orchestrator)**: one `<AUDIT_DIR>/report.md` with one finding-section per true positive, using the same headings.

Model these on the Redis audit reports (e.g. `G2-F1-vuln-report.md`): same structure and depth, with the lean style below.

## Sections (exact, in order)

```markdown
# <one-line descriptive title of the bug; end with the CWE, e.g. (CWE-476)>

## Affected Version
- Service / product: `<name>` (`<repo or image>` if applicable)
- Version: `<x.y.z>`  (or `no version tag` if the target is unversioned)
- Commit / VCS: `<sha>` (tag/branch if known)  (or `no VCS` if not version-controlled)
- File(s): `<path>`, sha256 `<hash>`  - when there is no version or commit, the file sha256 is the version anchor; include it then
- Runtime / build (optional): image, runtime version, run context (e.g. runs as root)

Always render Affected Version as this bullet list, in this field order - never a free-form paragraph. Omit a bullet only if it is truly N/A; for unversioned targets keep the bullets and write `no version tag` / `no VCS` and anchor on the file sha256.

## Summary
1-2 short paragraphs. What the bug is, and the genuine attacker path (who controls
which input, reaching which sink). Live: state it was confirmed on the stock build
and that a control run with honest input behaves normally. Source-only: state plainly
that this is a source-level finding, NOT live-verified.

## Vulnerability Detail
- CWE: `CWE-NNN` (name) - most-specific first; one bullet per CWE if more than one applies.
- CVSS 3.1: `<base score>` (`Low`/`Medium`/`High`/`Critical`) - `CVSS:3.1/AV:.../AC:.../PR:.../UI:.../S:.../C:.../I:.../A:...`

Give the full 3.1 base vector and the base score it computes to (use the FIRST.org
calculator metrics). This is the mechanical classification; the honest one-line severity
verdict still goes in *Impact*. If the two diverge, lead with the honest verdict in
*Impact* and say why. Same section in both modes (CWE + CVSS are static classifications,
so source-only reports include it too).

## Root Cause
The code-level explanation. Cite `src/file.c:line`. Show the flaw and the flawed
caller in minimal code blocks (only the relevant lines, annotated). Trace the data
flow from attacker-controlled input to the sink. Note any guard that does NOT stop it.

## Steps to reproduce
Write it as a **terminal transcript, one step at a time** - not one self-contained script (in any language).
For each step: a short prose line (ending in `:`) saying what you do or expect, then a fenced
block with the `$ command`(s) and their REAL captured output right below, then the next prose
+ block. Group only the commands that belong to the same logical step.
- Live: run the **Control (honest-input)** step FIRST, then the attack step(s); give each its
  own `### Control` / `### Reproduction N ...` subsection when there is more than one. Paste
  output verbatim (curl -i / server log / exit status); never hand-write expected output.
- **Do NOT collapse the reproduction into one self-contained script - in ANY language** (no single
  `poc.sh` / `poc.py` / `run.rb` / Makefile target that does setup + control + attack + restart end
  to end). Writing the one-shot in Python or another language instead of bash is the same violation.
  That hides the step-by-step observable effect; the steps stay inline commands even when a step
  invokes a saved helper.
- Introduce a **saved file** ("Save this as `poc/<name>`:" then the full file) only for a genuine
  standalone **component** the PoC needs - a malicious server, a peer/client the victim connects to,
  or an attacker-side `.patch`. A saved file is a component, **never the reproduction itself**: it
  must not be a wrapper/driver that runs setup + control + attack + restart. Then drive it with
  inline commands. Stage such files under the project-root `poc/` and reference them as `poc/<name>`.
- Source-only: a reproduction GUIDE - concrete steps, inputs, and conditions to trigger it,
  derived from source - with NO execution and NO captured output. Write it the same step-wise
  way (prose + the example commands per step, not one script). Label it as a source-level guide.

## Impact
The concrete attacker capability and what is lost; the trust boundary crossed. Honest
severity in prose (CRITICAL / HIGH / MEDIUM / LOW + a one-line justification). The formal
CVSS 3.1 score/vector lives in *Vulnerability Detail*, not here; no severity table.
```

## Annotated example (abridged, from a real report)

````markdown
# NULL-pointer dereference in `ACLLoadFromFile()` crashes the server via `ACL LOAD` or at startup (CWE-476)

## Affected Version
- Service / product: `redis` (`redis/redis`)
- Version: `8.8.0`
- Commit / VCS: `5a693aae` (tag `8.8.0`)
- File(s): `src/acl.c`

## Summary
`ACLLoadFromFile()` (`src/acl.c`) parses an ACL file line by line. When the selector
merge helper hits an unmatched `(` it frees its array and returns `NULL` but leaves
`*merged_argc >= 1`; the caller omits the `continue` and then indexes the NULL array,
so `ACL LOAD` (or a malformed `aclfile` at startup) crashes the process with SIGSEGV.
Confirmed on the stock 8.8.0 build; a control run with a valid ACL file stays healthy.

## Vulnerability Detail
- CWE: `CWE-476` (NULL Pointer Dereference)
- CVSS 3.1: `5.5` (Medium) - `CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H`

## Root Cause
`ACLMergeSelectorArguments()` returns `NULL` without resetting `*merged_argc`:
```c
/* src/acl.c:2097 - unmatched '(' */
if (open_bracket_start != -1) {
    ...
    return NULL;            /* *merged_argc still > 0 */
}
```
The caller does not skip the line and dereferences the NULL array:
```c
/* src/acl.c:2396 */
if (!acl_args) { errors = sdscatprintf(...); }   /* no continue */
for (int j = 0; j < merged_argc; j++)
    acl_args[j] = sdstrim(acl_args[j], ...);      /* acl_args == NULL -> SIGSEGV */
```
Reachable at runtime (`ACL LOAD` -> `ACLLoadFromFile`, `src/acl.c:3018`) and at
startup (`ACLLoadUsersAtStartup`, `src/acl.c:2585`).

## Steps to reproduce

### Control (valid ACL file)
Start a stock server with a valid ACL file; `ACL LOAD` reloads cleanly and the server stays up:
```text
$ printf 'user default on nopass ~* &* +@all\n' > /tmp/redis-acl-poc/users.acl
$ src/redis-server --port 6399 --daemonize yes --dir /tmp/redis-acl-poc --aclfile /tmp/redis-acl-poc/users.acl --logfile poc.log
$ src/redis-cli -p 6399 ACL LOAD
OK
$ src/redis-cli -p 6399 PING
PONG
```

### Reproduction (one malformed line)
Append a line with an unmatched `(`, then reload. `ACL LOAD` closes the connection and the
port stops answering:
```text
$ printf 'user bob on (+get\n' >> /tmp/redis-acl-poc/users.acl
$ src/redis-cli -p 6399 ACL LOAD
Error: Server closed the connection
$ src/redis-cli -p 6399 PING
Could not connect to Redis at 127.0.0.1:6399: Connection refused
```
The log confirms the SIGSEGV is in the `ACLLoadFromFile` frame:
```text
$ grep -m1 'signal:' poc.log
1234:M 20 Jun 2026 06:40:54.870 # Redis 8.8.0 crashed by signal: 11 (SIGSEGV) ... ACLLoadFromFile
```

## Impact
A principal able to write the `aclfile` plants one malformed line; a later `ACL LOAD`
by an admin, or the next restart, crashes the server (SIGSEGV) instead of the
documented "reject the file, keep previous ACLs". Denial of service across a trust
boundary (file-writer to admin/restart). Severity: MEDIUM (local file-write precondition,
availability-only; deterministic crash).
````

### Steps to reproduce with a helper module (when the PoC needs one)

When the PoC needs a standalone component, introduce it as its own file, then drive it with
inline commands. Example - a malicious peer the stock victim connects to.

Save this as `poc/peer.py` (a fake master that sends an oversized reply):
```python
#!/usr/bin/env python3
import socket
srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 7001)); srv.listen(1)
conn, _ = srv.accept()
conn.sendall(b"+FULLRESYNC " + b"A" * (1 << 30) + b"\r\n")   # crafted oversized frame
```

Start the helper, point a stock victim at it, and watch the port stop answering:
```text
$ python3 poc/peer.py &
$ src/redis-server --port 6399 --replicaof 127.0.0.1 7001 --dir /tmp/redis-repl-poc --logfile poc.log &
$ sleep 2; src/redis-cli -p 6399 PING
Could not connect to Redis at 127.0.0.1:6399: Connection refused
```
Keep the victim 100% stock; only the helper (the attacker side) is yours.

### Affected Version for an unversioned service (no version tag, no VCS)

When the target has no version tag and is not under version control, keep the same
bullet list and anchor on the file sha256 instead of a version/commit:

```markdown
## Affected Version
- Service: `livedemo` (tiny-vuln-service)
- Version: no version tag
- Commit / VCS: no VCS
- File: `server.js`, sha256 `76b64419bc6b5e8f3159c931182bf075181466c3d8039cf818fc8c3945b06888` (identical in the running container at `/app/server.js`)
- Runtime: `node:20-alpine`, node v20.20.2, container runs as root
```

## Severity and CVSS 3.1

Two things: the **honest prose verdict** (one line in *Impact*) and the **CVSS 3.1 base
score/vector** (in *Vulnerability Detail*). Judge the prose verdict from the attacker's
concrete gain:

- **CRITICAL** - unauthenticated RCE, full auth bypass, or breach of all users' data.
- **HIGH** - authenticated RCE, SSRF to the internal network, SQLi with data access, user-to-admin escalation, or a remotely reachable crash/DoS across a trust boundary.
- **MEDIUM** - sensitive info disclosure, CSRF or stored XSS on sensitive operations, amplified DoS.
- **LOW** - non-sensitive disclosure, interaction-heavy reflected XSS, configuration weakness.

Apply the Marginal Gain Test: a self-healing, self-only, operator-misconfiguration, or already-fixed-upstream (any branch/commit, CVE or not) condition is Informational, not a vuln. Lead with the honest verdict; never inflate or defend an overstated rating under pushback.

For the CVSS 3.1 metric, score the genuine attacker path against the stock target and give
the full base vector plus the score it computes to. The metrics that usually decide it:
- **AV** - `N` only if reachable over the network; `L` when the precondition is local (e.g. writing a file on the host), `A` adjacent, `P` physical.
- **PR** - `N` unauthenticated, `L` a normal/limited account, `H` admin-class.
- **UI** - `R` if a victim must click/act, else `N`. **S** - `C` only if impact escapes the vulnerable component's security scope.
- **C/I/A** - the actual loss (a pure crash is `C:N/I:N/A:H`).

CVSS is mechanical, so it can land a band below the prose verdict (or above); that is fine.
When they diverge, keep both honest and note the reason in *Impact* - do not tune the vector to match the prose.

## Writing style

- Technical precision: exact paths, function names, line numbers, values.
- Measured, not asserted: state what you observed and quantified ("observed M/N", "effectively unbounded, expected N iterations"); never "it would crash" or a bare "infinite" / "always" / "never".
- Actionable: the Root Cause and Impact should make the fix obvious; a one-line fix may be folded into Root Cause. Keep it lean - no separate Remediation or References section unless a patch-bypass needs the prior CVE/GHSA cited inline.
- **No em-dashes.** Minimal `**`/`*`. Use `code spans` for symbols and paths.
- Self-contained and reproducible: write the reproduction as an inline command transcript (prose + `$ command` + real output), not a wrapper script; stage only genuine helper modules and attacker-side `.patch` files under `poc/` and show each inline via "Save this as `poc/<name>`:". Embed the real output. No prebuilt binaries. Never reference an audit-dir path (e.g. `/vibe/hack/audits/<project>/audit-<ts>/...`).
- No internal audit ids in the report BODY. The vendor has no context for the finding id (`G2-F1`, `F-1`) or group id (`G2`), so it must never appear in the title, PoC script / helper filenames, temp or working directory names, or log / echo markers. Use a short descriptive slug from the vuln class / component / CWE instead (e.g. title `NULL-pointer dereference in ACLLoadFromFile()`, `poc/peer.py`, `/tmp/redis-acl-poc`, marker `POC-CONFIRMED`). The report FILE keeps its `<finding-id>-vuln-report.md` name for internal tracking; the id just never appears inside the report.
- Each finding readable in a couple of minutes.
