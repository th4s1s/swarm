---
description: "vibehack - automated source-only audit (recon → audit → fpcheck → report; no deploy/live-instance/verify; unattended, report-only)."
argument-hint: "[optional: focus area or notes]"
---

Run the **automated source-only audit** of the vibehack skill - the full pipeline on source code with **no live instance and no human in the loop**.

Optional user note: $ARGUMENTS

Read @~/.claude/skills/vibehack/SKILL.md, then execute @~/.claude/skills/vibehack/workflows/source.md end-to-end: **recon → audit → fpcheck → report**, auto-proceeding through every phase (no user gates), source-only (no deploy, no live PoC, no verify). Honor the precedence rules at the top of source.md. Produce one consolidated `report.md` (+ `audit.db`) whose Steps to reproduce are source-level reproduction guides, print a counts-by-severity summary, and stop. Do not perform any external disclosure.
