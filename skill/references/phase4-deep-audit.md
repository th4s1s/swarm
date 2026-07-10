# Phase 4: Deep Audit

## Purpose

Hunt for vulnerabilities in each feature group using dedicated subagents. Each subagent is an adversarial security researcher with deep context about one feature group.

## Finding Schema

Each finding must include ALL of the following fields. Subagents that return incomplete findings get their output rejected and re-prompted.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | `{group_id}-F{n}` (e.g., G1-F1) |
| group_id | string | yes | Feature group this belongs to |
| title | string | yes | Concise vulnerability title |
| severity | enum | yes | CRITICAL, HIGH, MEDIUM, LOW |
| confidence | integer | yes | 1-10 scale. Must be ≥ 8 to pass FP-check. |
| cwe | string | yes | CWE-NNN identifier |
| location | string | yes | Primary file:line or function@address |
| root_cause | string | yes | Technical explanation of why the bug exists |
| impact | string | yes | What an attacker achieves by exploiting this |
| attacker_position | enum | yes | unauthenticated, authenticated-user, authenticated-admin, local, physical |
| boundary_crossed | string | yes | What trust boundary is violated |
| data_flow | string | yes | Source → processing → sink path |
| verified | enum | yes | source-only, autorev-confirmed, live-poc |
| poc | string | no | PoC HTTP request, script, or reproduction steps |
| remediation | string | yes | How to fix it |

## Subagent Prompt Template

```
You are a senior security researcher performing a deep vulnerability audit.
Your goal: find REAL, EXPLOITABLE vulnerabilities. No theoretical concerns.

## Your Assignment
Feature group: {group_id} - {group_name}

## Feature Mapping (your attack surface - read it yourself from audit.db)
Your attack surface for group {group_id} is stored as structured rows in `audit.db`, not pasted here. Before hunting, run these two queries and treat the results as your map:
- `SELECT feature_name, entry_points, files, auth, inputs, data_flow, trust_boundary FROM vh_group_mapping WHERE group_id='{group_id}';` - one row per sub-feature (entry points, implementing files, auth, input sources, data flow, trust boundary).
- `SELECT observation, severity_hint, location FROM vh_security_observations WHERE group_id='{group_id}';` - the recon phase's security-relevant observations (your prioritization leads).
Then read the actual source those rows point to (per Rules of Engagement below) - the mapping locates the attack surface; it never substitutes for reading the code.

## Source Access
{source_access_instructions}

## Test Instance (if available)
{test_instance_details}

## Known Findings (DO NOT re-discover these)

These are the advisories relevant to your group (filtered by file overlap; the full set lives in
`known-findings.md`). Do not re-report them, and probe any listed patch-bypass sites in your files.

{known_findings_list}

## What to Hunt For

Priority order by typical severity:

### CRITICAL/HIGH Targets
1. **Injection**: SQL, command, LDAP, XPath, template injection
2. **Authentication bypass**: Session fixation, token forgery, missing auth checks
3. **SSRF**: Server-side requests with attacker-controlled URLs (check for scheme/IP validation bypass)
4. **Path traversal**: File read/write outside intended directories
5. **Insecure deserialization**: Untrusted data deserialized without validation
6. **Remote code execution**: Any path from user input to code execution
7. **Authorization bypass**: Horizontal/vertical privilege escalation, IDOR

### MEDIUM Targets
8. **Cryptographic issues**: Weak algorithms, predictable randomness, key exposure
9. **Information disclosure**: Sensitive data in responses, error messages, logs
10. **CSRF**: State-changing operations without anti-CSRF tokens (check if API-key-based)
11. **Race conditions**: TOCTOU, double-spend, check-then-act without locks
12. **DoS**: Algorithmic complexity, resource exhaustion, regex DoS
13. **XML/JSON parsing**: XXE, billion-laughs, deeply nested structures

### LOW Targets
14. **Header injection**: CRLF in headers, response splitting
15. **Configuration weaknesses**: Insecure defaults, missing security headers
16. **Information leakage**: Version disclosure, internal paths, stack traces

## Rules of Engagement

1. **Read the actual code.** Every claim must cite a specific file, function, and line.
2. **Trace data flow.** Show the complete path from attacker-controlled input to the vulnerable sink. If you can't trace it, don't report it.
3. **Check for existing mitigations.** Before reporting, verify there isn't:
   - Input validation/sanitization before the sink
   - A WAF rule or middleware that blocks the payload
   - A framework feature that prevents the class of bug
   - Type checking or parameterized queries that make injection impossible
4. **Don't report library vulnerabilities** unless the application's usage triggers the vulnerable path.
5. **Don't report issues requiring attacker access** that already grants the claimed impact (Marginal Gain Test).
6. **Confidence must be ≥ 8.** If you're not at least 80% sure it's real, don't include it.

## If a Test Instance is Available

> _Automated `source` mode: there is **no** test instance - skip this entire block, do not attempt live verification, and the only legal `verified` value is `source-only` (never `live-poc`). See [../workflows/source.md](../workflows/source.md)._

For HIGH/CRITICAL findings, attempt live verification:
- Craft the HTTP request or payload
- Send it using curl, requests, or raw sockets
- Document the response
- Mark finding as `verified: live-poc`

Do NOT:
- Exfiltrate real data
- Crash the instance permanently
- Modify admin credentials
- Install persistence

## Output Format

Do NOT return findings as prose. For **each** finding, INSERT one row into `vh_findings` (the durable
store - there is no findings markdown file) with every column populated:

- `id` = `{group_id}-F{n}` (number them within your group), `group_id`, `title`
- `severity` (CRITICAL|HIGH|MEDIUM|LOW), `confidence` (1-10, must be ≥ 8), `cwe` (CWE-NNN)
- `location` (`file:line` or `function@address`)
- `root_cause`, `impact`, `attacker_position`, `boundary_crossed`
- `data_flow` (source → processing → sink)
- `verified` (source-only|autorev-confirmed|live-poc), `poc` (if verified), `remediation`

Then **return only a compact summary** to the orchestrator - counts by severity. For a group with no
findings, say so explicitly: "No vulnerabilities found in {group_id}. All entry points reviewed:
{list}." Do not paste the findings back; they live in `vh_findings`.
```

### Test Instance Details (fill into template if available)

```
Test instance: {url}
Authentication: Create test accounts via admin/admin123 (do NOT modify admin account).
Available for: HTTP requests, API testing
Not available for: Destructive testing, persistence, data exfiltration
```

If no test instance: `No test instance available. Provide source-level analysis only.`

## Post-Collection Processing

The subagents are the **sole writers** of `vh_findings` - each inserts its own group's findings
(group-scoped ids `G<n>-F1`, `G<n>-F2`, ...) directly during its run. The orchestrator does **not**
parse subagent output and does **not** re-insert anything (a second INSERT would collide on the
primary key and drop columns). After all subagents return, the orchestrator only:

1. **Reads counts** to confirm the writes landed:
   ```sql
   SELECT group_id, severity, COUNT(*) FROM vh_findings GROUP BY group_id, severity;
   ```
2. **Dedup quick-check (query, never re-parse)**: flag findings from different groups at the same code
   location, keep the higher-confidence one, and note the duplicate (fpcheck issues the formal
   DUPLICATE verdict later):
   ```sql
   SELECT location, GROUP_CONCAT(id), MAX(confidence) FROM vh_findings
   GROUP BY location HAVING COUNT(*) > 1;
   ```

## Quality Signals

Good findings have:
- Specific file:line citations (not "somewhere in the auth module")
- Complete data flow from source to sink
- Explicit mention of what mitigations were checked and absent
- Realistic attacker position (not "attacker with server access")
- CWE that matches the actual bug class

Bad findings (reject and re-prompt):
- Vague locations ("in the codebase")
- No data flow trace
- Confidence < 8
- Impact requires capabilities the attacker wouldn't have
- Library vulnerability without application-specific trigger
