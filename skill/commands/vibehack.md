---
description: Run the full vibehack pipeline (recon → deploy → audit → fpcheck → verify → report).
argument-hint: "[optional: focus area or notes]"
---

Run the **full vibehack pipeline** on the current workspace.

Optional user note: $ARGUMENTS

Read @~/.claude/skills/vibehack/SKILL.md.

**If the Workflow tool is available to you (ultracode):** you may run the full pipeline **gateless, end-to-end, as one deterministic workflow** - see @~/.claude/skills/vibehack/references/workflow-orchestration.md (the full-pipeline skeleton). Otherwise, execute the phases in order, gating on user approval between each:

1. @~/.claude/skills/vibehack/workflows/recon.md - source detection, feature mapping, resume note
2. @~/.claude/skills/vibehack/workflows/deploy.md - deploy live instance, write live-instance note
3. @~/.claude/skills/vibehack/workflows/audit.md - CVE ingest, patch-bypass mining, parallel deep audit
4. @~/.claude/skills/vibehack/workflows/fpcheck.md - static false-positive review
5. @~/.claude/skills/vibehack/workflows/verify.md - open one fork per finding (serial); each fork verifies, adversarially reviews, and then writes its own `<id>-vuln-report.md` per @~/.claude/skills/vibehack/workflows/report.md (Mode A). The report phase runs **in the fork** - there is no separate orchestrator report/consolidation step.

Follow every Essential Principle and Rationalization-to-Reject in SKILL.md. Honor user gates between phases.
