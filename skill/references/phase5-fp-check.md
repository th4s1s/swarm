# Phase 5: FP-Check Verification

## Purpose

Verify every finding from Phase 4 using the false-positive-check methodology defined in this reference (bundled in this skill - no external skill required). This phase ensures zero false positives reach the final report.

## Batching Strategy

### Batch Size
- **Target**: 8-10 findings per batch
- **Maximum**: 12 findings per batch (beyond this, verification quality degrades)
- **Minimum**: 3 findings per batch (below this, launch overhead isn't worth it)

### Batch Formation Rules
1. **Group affinity**: Prefer batching findings from the same or related feature groups (shared code context reduces re-reading)
2. **Severity mixing**: Mix severities within batches (don't put all CRITICALs in one batch - spread them for independent verification)
3. **No cross-dependencies**: If Finding A's truth value depends on Finding B, put them in the same batch

### Batch Count Calculation
```
total_findings = SELECT COUNT(*) FROM vh_findings
batch_count = CEILING(total_findings / 10)
```

## Subagent Prompt Template

Each FP-check subagent gets the full false-positive methodology (bundled in this skill - the rules in this reference; no external skill required). The prompt structure:

```
You are a False Positive Verifier. Your job is to verify or reject vulnerability findings
using rigorous code-level analysis. You are adversarial - you WANT to find false positives.

## Methodology
Follow the false-positive-check methodology (defined in this reference) exactly:
1. Restate each finding's claim precisely
2. Apply ALL 18 Hard Exclusions (see the *Canonical FP Rules Summary* in this reference)
3. Apply ALL 10 Precedent rules
4. Apply Capability Validity checks (1-3)
5. Check confidence threshold (must be ≥ 8)
6. Trace the actual data flow in source code - RE-READ every cited file
7. Check for mitigations the original analyst may have missed
8. Apply the devil's advocate review
9. Issue verdict: TRUE_POSITIVE, FALSE_POSITIVE, or DUPLICATE

## Source Access
{source_access_instructions}

## Canonical FP Rules Summary

### Hard Exclusions (any one = FALSE POSITIVE)
HE-1: No source-to-sink data flow demonstrated
HE-2: Standard library function used correctly per documentation
HE-3: Input is validated/sanitized before reaching the sink
HE-4: Bug requires prerequisites the attacker cannot achieve
HE-5: Framework mitigates this class of bug by default
HE-6: The "vulnerability" is documented intended behavior
HE-7: Static analysis false positive (tool limitation)
HE-8: Code is dead/unreachable
HE-9: The exact same bug was already reported (duplicate)
HE-10: Test/example code only, not production
HE-11: Requires physical access not in threat model
HE-12: Denial of service against self only
HE-13: Race condition with astronomically unlikely timing window
HE-14: Information disclosure of non-sensitive data
HE-15: Bug is in a dependency and app doesn't trigger the vulnerable path
HE-16: Claimed severity doesn't match actual impact
HE-17: Marginal Gain Test - attacker's starting position already grants the claimed impact
HE-18: Finding relies on deprecated/removed code path

### Precedent Rules (any one = likely FALSE POSITIVE)
PR-1: "Looks unsafe" without traced data flow
PR-2: Theoretical attack with no practical exploitation path
PR-3: Requires specific configuration not in default install
PR-4: Bug class is mitigated by deployment environment
PR-5: CI/CD finding without all four required elements
PR-6: Missing CSRF token when authentication is API-key-based
PR-7: Hardcoded credential that is a default placeholder
PR-8: Weak crypto when stronger crypto is available but this path isn't sensitive
PR-9: DoS requiring sustained attack with no amplification
PR-10: IDOR when authorization model is intentionally flat

### Capability Validity
CV-1: Attacker must actually be able to reach the entry point
CV-2: Attacker must control the data that reaches the sink
CV-3: The cited code must exist and match the claim (RE-READ the file)

## Findings to Verify

{findings_list_with_full_details}

## Known True/False Patterns from This Codebase
{prior_verdicts_if_any}

## Output Format

For EACH finding, return:

### {finding_id}: {title}
**Verdict**: TRUE_POSITIVE / FALSE_POSITIVE / DUPLICATE
**Confidence**: {N}/10
**Severity** (may be adjusted): {CRITICAL/HIGH/MEDIUM/LOW}
**Reason**: {specific explanation citing code evidence}
**Rule Applied**: {HE-N, PR-N, CV-N, or "None - confirmed exploitable"}
**Evidence**: {file:line references, data flow trace, or PoC output}

If DUPLICATE: **Merged Into**: {primary_finding_id}
```

## Verdict Processing

After all FP-check subagents return:

### 1. Parse Verdicts
Extract structured verdicts from each subagent's output.

### 2. Insert into SQL
```sql
INSERT INTO vh_fp_verdicts (finding_id, verdict, reason, final_severity, final_id, merged_into)
VALUES (?, ?, ?, ?, ?, ?);
```

### 3. Assign Final IDs
For TRUE_POSITIVE findings, assign sequential `F-N` identifiers ordered by severity:
```
CRITICAL first → HIGH → MEDIUM → LOW
Within each tier: ordered by group (G1 before G2)
```

### 4. Deduplication
For DUPLICATE findings:
- Identify the primary finding (highest confidence, most complete analysis)
- Set `merged_into` to the primary's final ID
- If the duplicate has additional context, append it to the primary's description

### 5. Escalation Check
If a finding was marked TRUE_POSITIVE with adjusted severity (higher or lower than original):
- Document why severity changed
- Use the FP-check subagent's severity, not the original

## Quality Gates

Before proceeding to Phase 6:

- [ ] Every finding in `vh_findings` has a corresponding row in `vh_fp_verdicts`
- [ ] No verdict is empty or "UNKNOWN"
- [ ] All TRUE_POSITIVE findings have `final_id` assigned
- [ ] All DUPLICATE findings have `merged_into` pointing to a valid `final_id`
- [ ] No two TRUE_POSITIVE findings have the same `final_id`

## Statistics to Report

After verification:
```
Total findings reviewed: N
TRUE POSITIVE:  N (X CRITICAL, Y HIGH, Z MEDIUM, W LOW)
FALSE POSITIVE: N
DUPLICATE:      N

FP rate: N/total = X%
```
