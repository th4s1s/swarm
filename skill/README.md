# vibehack

A structured, multi-phase **security audit** skill for **Claude Code CLI**. It divides a target into
feature groups, optionally deploys a live instance, hunts vulnerabilities in parallel subagents,
eliminates false positives via static review, and verifies each survivor against the live instance in
forked conversations - then writes a lean, maintainer-facing report per confirmed finding.

vibehack is the Claude-Code-only descendant of the `codebase-audit` methodology. The usecase, phases,
and workflow are the same; this build supports **Claude Code CLI only**.

> vibehack can audit **source code, a binary via the autorev MCP, or both**. The binary path uses the
> autorev MCP (IDA-backed): it loads one IDA database (`.i64`) per session (`load_database`, or
> `create_database` from a binary first), then analyzes with `analyze_function` / `get_disassembly` /
> `list_functions` / xrefs, etc. - it is file/session-based, not instance/port-based.

## Install

```bash
./install.sh            # symlink ~/.claude/skills/vibehack + the command launchers -> this repo
./install.sh --uninstall
```

`install.sh` **symlinks** both halves to this repo, so all edits are picked up live (no reinstall
needed while iterating):
- `~/.claude/skills/vibehack` -> the repo (`SKILL.md`, `workflows/`, `references/`);
- `~/.claude/commands/vibehack.md` and `~/.claude/commands/vibehack/` -> the repo launchers. The
  launchers reference the skill via the fixed install path `~/.claude/skills/vibehack`, so they need
  no substitution and stay in sync automatically.

After installing, reload Claude Code (start a new session or run `/skills`).

## Usage

| Invocation | What it does |
|---|---|
| `/vibehack` | Run the full pipeline (recon → deploy → audit → fpcheck → verify → report), gated between phases |
| `/vibehack:recon` | Phase 1: source detection, reconnaissance, parallel feature mapping |
| `/vibehack:deploy` | Phase 2: bring up a live instance, write the live-instance note |
| `/vibehack:audit` | Phase 3: CVE/advisory ingest, patch-bypass mining, parallel deep audit |
| `/vibehack:fpcheck` | Phase 4: static-only false-positive elimination |
| `/vibehack:verify <ids>` | Phase 5: per-finding live PoC + adversarial review (run in a fork) |
| `/vibehack:report` | Write the vulnerability report(s) |
| `/vibehack:source` | Automated, unattended **source-only** run (recon → audit → fpcheck → report; no deploy/verify, no gates) |

Free-text also works: "audit this app", "run the vibehack recon phase", "run the automated
source-only audit".

The skill's methodology, principles, phase router, and SQL/artifact layout live in
[SKILL.md](SKILL.md). Phase logic is in [workflows/](workflows/); deeper reference material is in
[references/](references/).

## Layout

```
SKILL.md            # entrypoint: methodology, principles, phase router, quick reference
commands/           # Claude command launchers (/vibehack and /vibehack:<phase>)
workflows/          # the 7 phases: recon, deploy, audit, fpcheck, verify, report, source
references/         # detection, feature-mapping, deep-audit, fp-check, report templates,
                    #   resume/live-instance templates, lessons-learned, workflow-orchestration
install.sh          # Claude-only installer (symlink + launchers)
```

Audit output is written **outside the audited project tree**, under
`/vibe/hack/audits/<project>/audit-<timestamp>/` (SQLite `audit.db` + `vh_*` tables and markdown
artifacts), where `<project>` is the basename of the project root. The only audit artifact that lands
in the project itself is `poc/` at its root (the runnable PoC delivered with a vuln report).
