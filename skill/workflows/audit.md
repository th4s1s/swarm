# vibehack - audit: Known-Findings Ingest + Parallel Deep Audit

**Purpose**: Load prior CVEs/GHSAs and **mine them for patch-bypass surface**, then spawn one deep-audit subagent per feature group to hunt for vulnerabilities. End by writing the resume note.

**Entry**: Recon + deploy complete.
**Exit**: All groups audited, findings in SQL + per-group artifacts, resume note updated, user gate before fpcheck.

---

## Step 1 - Known findings ingest (Phase 3)

For each external source, populate `vh_known_findings`:

### 1a. GitHub Security Advisories (GHSA) for the repo
```bash
gh api repos/<owner>/<repo>/security-advisories --paginate | jq -r '.[] | "\(.ghsa_id)|\(.severity)|\(.summary)"'
```

### 1b. CVEs mentioning the project
```bash
gh api search/issues --raw-field q="CVE in:title repo:<owner>/<repo>" --paginate
```

### 1c. CHANGELOG / SECURITY.md scan
```bash
grep -nEi 'cve-|ghsa-|security|advisory|fix.*injection|fix.*bypass' CHANGELOG.md SECURITY.md
```

### 1d. Dependency advisories
```bash
gh api repos/<owner>/<repo>/dependabot/alerts --paginate 2>/dev/null
```

For each advisory, record:

```sql
INSERT INTO vh_known_findings(id, title, location, source, patched_in, severity, raw)
VALUES (?,?,?,?,?,?,?);
```

## Step 2 - Patch-bypass mining (HIGH-VALUE STEP)

For each meaningful advisory, **fetch the patch commit(s)** and identify:

1. **Files the patch touched** - were they the ONLY sites of the vulnerable pattern, or are there sibling files that have the same root cause untouched? (This is where the highest-severity findings come from in real audits.)
2. **Behavioral assumptions** - did the patch add a flag, a header check, a length cap? Can an attacker make the assumption false?
3. **Adjacent code paths** - same input, different code path that wasn't visited.

Examples of patch-bypass classes that recurred in real audits:
- `X-Forwarded-*` trust only fixed in proxy code but `/decisions` API still trusts blindly.
- URL-encoding decoded once in matcher path, raw in upstream forward path.
- `aud` validation only applied to one token type but not another.

Save the patch-bypass intel to **`<AUDIT_DIR>/files/known-findings.md`** organized per advisory:

```markdown
## GHSA-xxxx-yyyy-zzzz (CVE-YYYY-NNNNN) - <title>
Patched in: <commit>
Patched files: <list>
**Probe these sibling/adjacent sites for the same root cause:**
- `<file>:<lines>` - <why suspect>
```

## Step 3 - Create the findings table

```sql
CREATE TABLE IF NOT EXISTS vh_findings (
    id TEXT PRIMARY KEY,                -- e.g., 'G1-F1'
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,             -- CRITICAL, HIGH, MEDIUM, LOW
    confidence INTEGER NOT NULL,        -- 1-10
    cwe TEXT,
    location TEXT NOT NULL,
    root_cause TEXT NOT NULL,
    impact TEXT NOT NULL,
    attacker_position TEXT,
    boundary_crossed TEXT,
    data_flow TEXT,
    verified TEXT DEFAULT 'source-only', -- source-only, autorev-confirmed, live-poc
    poc TEXT,
    remediation TEXT,
    artifact_path TEXT,                  -- path to per-group artifact section
    created_at TEXT DEFAULT (datetime('now'))
);
```

## Step 4 - Parallel deep-audit subagents

**Agent type**: a **writable** subagent (must write artifacts + SQL - not a read-only one). Use the strongest model available. See SKILL.md → *Tools & subagents*.

Spawn ONE subagent per feature group, ALL in parallel.

Each subagent prompt (template from [../references/phase4-deep-audit.md](../references/phase4-deep-audit.md)) must include:

- Group ID + the full content of `files/G<n>-mapping.md`
- The known-findings list (so they avoid duplicates AND probe the patch-bypass sites)
- Source access instructions
- Live instance details (proxy/API URLs, sample credentials, bind-mounted config locations)
- **Instructions to write a per-group artifact** at `<AUDIT_DIR>/artifacts/G<n>-findings.md` containing each finding in detail (so we can re-read after context compaction)
- **Instructions to INSERT each finding into `vh_findings`** with `artifact_path` set
- Live-PoC verification policy: attempt live PoC for HIGH/CRITICAL findings when feasible; mark `verified='live-poc'` if reproduced; otherwise `verified='source-only'`
- Live-instance hygiene: **back up any config file before editing** (e.g., `cp .docker_compose/rules.json /tmp/rules.json.bak.G<n>`); restore at end *(Automated `source` mode: omit this bullet - no config edits/backup/restore; read-only source analysis only, see [source.md](source.md))*
- Confidence floor: don't file anything below 8/10
- Return a compact summary (counts by severity)

## Step 5 - Subagent failure handling

If a spawn **errors**, returns "no response", or returns analysis without writing the SQL/artifact:

1. **Diagnose the call and retry the spawn first.** Common causes: the wrong tool (`TaskCreate`/`TodoWrite` instead of the `Task`/`Agent` tool - those cannot spawn an agent), invalid params, or a read-only `Explore` used where a **writable** `general-purpose` `Task` was needed. Fix it and **re-spawn** that group's subagent. A tool error does not move the audit work into the orchestrator (see SKILL.md Essential Principle 11).
2. Only if the **correct** spawn genuinely fails twice for that group: materialize that one group yourself by writing its `artifacts/G<n>-findings.md` file and running the SQL inserts directly. Do NOT lose findings - but inline is the fallback, not the first move.
3. Update the resume note's "Quirks to remember" section so future runs avoid the same trap.

## Step 6 - Update group status

```sql
UPDATE vh_feature_groups SET status='audited' WHERE id IN (...);
```

## Step 7 - Summary + resume note & memory pointer rewrite

Present a finding-count table by group × severity:

```sql
SELECT group_id, severity, COUNT(*) FROM vh_findings GROUP BY 1,2 ORDER BY 1,2;
```

Rewrite the resume note ([../references/resume-note-template.md](../references/resume-note-template.md)) - and the audit pointer in your memory (phase = audit) - to reflect:

- Phase status: recon DONE, deploy DONE, audit DONE, fpcheck NOT STARTED
- Phase-4 finding counts table
- **Top patch-bypass discoveries** (these are the highest-value items for vendor disclosure - call them out explicitly)
- Live-PoC status (how many `verified='live-poc'` vs `'source-only'`)
- Updated "Quirks to remember"

## Step 8 - USER GATE

> _Automated `source` mode supersedes this gate - proceed straight to fpcheck without pausing (see [source.md](source.md))._

Present:

> Deep audit complete. N findings across M groups: X CRITICAL, Y HIGH, Z MEDIUM, W LOW. K already live-verified.
>
> Next: the **fpcheck** phase for static false-positive elimination (see SKILL.md for the phase syntax).
>
> Say **go fpcheck** to proceed.
>
> **Before continuing, run a manual compact** (`/compact`). All findings have been written to `vh_findings` + per-group artifacts, the resume note is fresh - compacting now is lossless. fpcheck spawns more subagents and will benefit from a clean context.

## Quality Checks

- [ ] Every group has a `vh_findings` row count > 0 OR an explicit "no findings, all entry points reviewed" artifact
- [ ] Every finding has a `artifacts/G<n>-findings.md` section with full root cause + PoC
- [ ] No finding has confidence < 8
- [ ] Patch-bypass intel from Step 2 has been probed (look for "probe these sites" items reflected in findings)
- [ ] Resume note rewrites complete
