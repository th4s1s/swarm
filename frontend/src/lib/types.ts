// Mirrors the backend contract (/vibe/hack/app/backend). Keep in sync with the
// route response shapes.

export type Phase = 'recon' | 'deploy' | 'audit' | 'fpcheck' | 'verify' | 'report';
export type Mode = 'full' | 'source';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Project {
  id: string;
  title: string;
  name: string;
  description: string | null;
  source_type: 'git' | 'zip';
  git_url: string | null;
  git_default_branch: string | null;
  current_ref: string | null;
  current_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  is_git: boolean;
  sessions: { id: string; title: string; session_name: string; status: string }[];
  live_instance_note: string | null;
}

export interface RefList {
  branches: string[];
  tags: string[];
}

export interface UpdateStatus {
  hasUpdates: boolean;
  ahead: number;
  behind: number;
  currentRef: string | null;
  localCommit: string | null;
  remoteCommit: string | null;
  newTags: string[];
}

export interface SessionConfig {
  mode: string;
  permissionMode: string;
  model: string | null;
  effort: Effort | null;
  workflows: boolean | null;
  thinking: boolean | null;
  thinkingTokens: number | null;
  [k: string]: unknown;
}

export interface SessionRow {
  id: string;
  project_id: string;
  title: string;
  session_name: string;
  claude_session_id: string | null;
  description: string | null;
  parent_session_id: string | null;
  is_fork: number;
  fork_finding_id: string | null;
  config_json: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AuditGroup {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
}

export interface AuditFinding {
  id: string;
  final_id: string | null;
  group_id: string | null;
  title: string;
  severity: string | null;
  confidence: number | null;
  cwe: string | null;
  location: string | null;
  verdict: string | null;
  verified: string | null;
}

export interface AuditSnapshot {
  available: boolean;
  groups: AuditGroup[];
  findings: AuditFinding[];
  counts: { groups: number; findings: number; true_positives: number };
}

export interface ActiveRun {
  id: string;
  phase: string | null;
  mode: string | null;
  status: string;
  queue_pos: number;
  started_at: string | null;
}

export interface ChildSession {
  id: string;
  title: string;
  session_name: string;
  claude_session_id: string | null;
  status: string;
  fork_finding_id: string | null;
}

export interface SessionDetail {
  id: string;
  project: { id: string; name: string; title: string };
  title: string;
  session_name: string;
  claude_session_id: string | null;
  description: string | null;
  parent_session_id: string | null;
  is_fork: boolean;
  fork_finding_id: string | null;
  config: SessionConfig;
  status: string;
  created_at: string;
  updated_at: string;
  audit_dir: string;
  resume_note: string | null;
  app_state: unknown;
  audit: AuditSnapshot;
  active_runs: ActiveRun[];
  child_sessions: ChildSession[];
}

export interface FamilyMember {
  id: string;
  title: string;
  parent_session_id: string | null;
  is_fork: boolean;
  fork_finding_id: string | null;
  status: string;
  claude_session_id: string | null;
}

export interface SessionFamily {
  root_id: string | null;
  members: FamilyMember[];
}

export interface VulnReportFile {
  finding_id: string;
  file: string;
  markdown: string;
}

export interface SessionReport {
  consolidated: string | null;
  reports: VulnReportFile[];
  focused: VulnReportFile | null;
}

export type RunStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

export interface RunRow {
  id: string;
  session_id: string;
  phase: string | null;
  mode: string | null;
  custom_prompt: string | null;
  composed_prompt: string | null;
  status: RunStatus;
  queue_pos: number;
  pid: number | null;
  claude_session_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  exit_code: number | null;
  is_error: number | null;
  total_cost_usd: number | null;
  usage_json: string | null;
  event_log_path: string | null;
  created_at: string;
}

// --- Claude stream-json event (loosely typed; we read what we need) ---
export interface StreamEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: unknown[];
  message?: {
    role?: string;
    model?: string;
    content?: ContentBlock[];
    usage?: Record<string, number>;
    stop_reason?: string | null;
  };
  total_cost_usd?: number;
  usage?: Record<string, number>;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  text?: string; // _stderr/_error/_nonjson
  [k: string]: unknown;
}

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

// --- WebSocket envelopes ---
export type WsMessage =
  | { kind: 'hello'; sessionId: string }
  | { kind: 'run'; runId: string; status: RunStatus; phase?: string; mode?: string; exit_code?: number; error?: string }
  | { kind: 'session'; status?: 'running' | 'idle'; claude_session_id?: string }
  | { kind: 'event'; runId: string; event: StreamEvent };

// --- Ops ---
export interface QuotaWindow {
  used: number;
  remaining: number;
  resetsAt: string | null;
}
export interface QuotaResult {
  account: {
    email: string | null;
    organizationUuid: string | null;
    billingType: string | null;
    subscriptionType: string | null;
  };
  plan: string;
  quotas: Record<string, QuotaWindow>;
  extraUsage: unknown;
  error?: string;
}

export interface TokenAgg {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  costUsd: number;
  messages: number;
}

export interface McpServer {
  name: string;
  scope: 'user' | 'project';
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  hasEnv: boolean;
  hasHeaders: boolean;
}

export interface McpServerConfig {
  name: string;
  scope: 'user' | 'project';
  transport: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  created: number;
  size: number;
  inUse: boolean;
}
export interface LiveStat {
  cpuPerc: number;
  memUsage: number;
  memLimit: number;
  memPerc: number;
  netIn: number;
  netOut: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
  created: number;
  stats: LiveStat | null;
}

export interface IoSample {
  ts: string;
  cpu: number;
  mem: number;
  net_in: number;
  net_out: number;
  disk_read: number;
  disk_write: number;
}

export interface AppConfig {
  settings: Record<string, string>;
  admin_pass_set: boolean;
  paths: Record<string, string>;
  claude_bin: string;
}
