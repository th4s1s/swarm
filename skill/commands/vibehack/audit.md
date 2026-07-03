---
description: "vibehack - Phase 3: CVE ingest, patch-bypass mining, parallel deep audit."
argument-hint: "[optional: focus or notes]"
---

Run the **audit** phase of the vibehack skill.

Argument: $ARGUMENTS

Read @~/.claude/skills/vibehack/SKILL.md. **If `VIBEHACK_AUDIT_DIR` is set, that is your workspace: use it directly - do NOT list audit dirs, inspect the dir, or deliberate resume-vs-fresh.** Otherwise read the vibehack audit pointer in your memory and the resume note it points at (fallback: the newest `/vibe/hack/audits/<project>/audit-*/<project>-audit-resume.md`), if present. Then execute @~/.claude/skills/vibehack/workflows/audit.md.

Stop at the user gate before the next phase.
