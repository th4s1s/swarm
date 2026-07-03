---
description: "vibehack - report phase: write the per-finding vuln report in the verify fork (live), or one consolidated source-only report in the orchestrator."
argument-hint: "[live: confirmed finding IDs, comma-separated, e.g. G1-F1,G1-F2 | source: optional focus or notes]"
---

Run the **report** phase of the vibehack skill.

Argument: $ARGUMENTS

Read @~/.claude/skills/vibehack/SKILL.md, then execute @~/.claude/skills/vibehack/workflows/report.md, which is the single source of truth for report format and rules (template: references/phase6-report.md). It has two modes: **live per-finding** (in a verify fork; argument = confirmed finding IDs) and **source-only consolidated** (in the orchestrator). Never reference an audit-dir path inside a report, and never perform external disclosure - that is the user's call.
