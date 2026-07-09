---
description: "vibehack - Phase 5: per-finding live PoC (run inside a forked conversation)."
argument-hint: "<finding IDs, comma-separated, e.g. G1-F1,G1-F2>"
---

Run the **verify** phase of the vibehack skill.

Argument: $ARGUMENTS

Read @~/.claude/skills/vibehack/SKILL.md. `VIBEHACK_AUDIT_DIR` is your workspace: use it directly - do NOT list audit dirs, inspect the dir, or deliberate resume-vs-fresh. Then execute @~/.claude/skills/vibehack/workflows/verify.md, which is the single source of truth for this phase's rules - follow it end to end.

Runs in a fork, **one finding per fork**, and requires a comma-separated finding-ID list. Per verify.md that means: reproduce the PoC, adversarially review it, run the upstream patch-gap check, record each verdict to the DB (`vh_fp_verdicts` + `vh_findings.verified`), and write `artifacts/verify-<id>.md`. Do NOT write vulnerability reports here - run `/vibehack:report <ids>` afterward in the same fork.
