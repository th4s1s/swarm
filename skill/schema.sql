-- vibehack audit.db schema - the single source of truth for the skill's data model.
--
-- This is executed OUTSIDE the orchestrator agent (zero LLM tokens), at workspace creation:
--   * app runtime : backend ensureWorkspace() runs this over the per-session audit.db
--   * by hand     : skill/dev-run.sh runs this when you invoke the skill for debugging
-- Every statement is idempotent (CREATE TABLE IF NOT EXISTS), so re-running is a no-op.
-- The workflows only INSERT/UPDATE/SELECT these tables; they never CREATE them.

-- Phase 0 - source/binary target detection (workflows/recon.md Step 2)
CREATE TABLE IF NOT EXISTS vh_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,          -- 'source', 'autorev', 'both'
    source_path TEXT,            -- absolute path to source root
    source_language TEXT,        -- primary language
    source_file_count INTEGER,
    autorev_binary TEXT,         -- binary input file path
    autorev_db_path TEXT,        -- loaded IDA database (.i64) in the autorev session
    autorev_arch TEXT,           -- x86, x64, ARM, etc. (from get_binary_overview)
    confirmed_at TEXT DEFAULT (datetime('now'))
);

-- Recon - feature groups (workflows/recon.md Step 4)
CREATE TABLE IF NOT EXISTS vh_feature_groups (
    id TEXT PRIMARY KEY,         -- G1, G2, ...
    name TEXT NOT NULL,
    description TEXT,
    status TEXT                  -- pending -> mapped -> audited
);

-- Recon - attack surface per group (references/phase2-feature-mapping.md)
CREATE TABLE IF NOT EXISTS vh_attack_surface (
    group_id TEXT NOT NULL,
    endpoint TEXT,               -- METHOD /path or function_name()
    method TEXT,
    auth_required TEXT,          -- none / user / admin
    description TEXT
);

-- Recon - security-relevant observations per group (references/phase2-feature-mapping.md)
CREATE TABLE IF NOT EXISTS vh_security_observations (
    group_id TEXT NOT NULL,
    observation TEXT NOT NULL,
    severity_hint TEXT,
    location TEXT
);

-- Audit - known CVE/advisory + patch-bypass intel (workflows/audit.md Step 1-2)
CREATE TABLE IF NOT EXISTS vh_known_findings (
    id TEXT PRIMARY KEY,
    title TEXT,
    location TEXT,
    source TEXT,                 -- advisory source (GHSA/CVE/dependabot/...)
    patched_in TEXT,             -- commit/tag the upstream fix landed in
    severity TEXT,
    raw TEXT                     -- full advisory text
);

-- Audit - findings (workflows/audit.md Step 4). The sole, complete record of each finding;
-- there is no per-group findings markdown - downstream phases read these rows directly.
CREATE TABLE IF NOT EXISTS vh_findings (
    id TEXT PRIMARY KEY,                 -- e.g., 'G1-F1'
    group_id TEXT NOT NULL,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,              -- CRITICAL, HIGH, MEDIUM, LOW
    confidence INTEGER NOT NULL,         -- 1-10
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
    artifact_path TEXT,                  -- legacy; no longer populated
    created_at TEXT DEFAULT (datetime('now'))
);

-- fpcheck - false-positive verdicts (workflows/fpcheck.md Step 1)
CREATE TABLE IF NOT EXISTS vh_fp_verdicts (
    finding_id TEXT PRIMARY KEY,
    verdict TEXT NOT NULL,        -- TRUE_POSITIVE, FALSE_POSITIVE, DUPLICATE
    reason TEXT,
    final_severity TEXT,
    final_id TEXT,                -- F-N for report (assigned after this phase)
    merged_into TEXT,             -- canonical finding_id when DUPLICATE
    reviewed_at TEXT DEFAULT (datetime('now'))
);

-- Deterministic scanner leads (written app-side by the baseline scan; read by recon).
-- These are LEADS, not findings: the skill triages/enriches them; only later phases may promote one
-- into vh_findings (via promoted_finding_id). fingerprint is UNIQUE so re-runs dedupe (INSERT OR IGNORE).
CREATE TABLE IF NOT EXISTS vh_scanner_hits (
    id TEXT PRIMARY KEY,
    tool TEXT NOT NULL,                  -- semgrep | gitleaks | codeql | joern | osv-scanner
    rule_id TEXT,
    severity TEXT,
    file TEXT,                           -- project-relative path
    line INTEGER,
    end_line INTEGER,
    message TEXT,
    group_id TEXT,                       -- NULL until recon Step 4.5 buckets it to a feature group
    status TEXT DEFAULT 'new',           -- new | triaged | dismissed | promoted
    promoted_finding_id TEXT,            -- vh_findings.id if this lead became a real finding
    fingerprint TEXT UNIQUE,             -- sha1(tool|rule|file|line|message) - dedupe across re-runs
    raw TEXT,                            -- the raw SARIF result object
    created_at TEXT DEFAULT (datetime('now'))
);
