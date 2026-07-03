# vibehack - deploy: Live Instance Setup

**Purpose**: Make sure a live instance of the audit target is reachable so that later phases (deep audit live-PoC, fpcheck spot-checks, verify forks) have a reproduction target. The instance may be **locally managed** (we bring it up via Docker / make / ad-hoc command) or **externally provided** (already running - e.g. on a staging server, remote VM, customer-hosted environment). Either way, produce a single live-instance note so subagents and forks can find it.

**Entry**: Recon complete (or invoked independently to set up a target).
**Exit**: Live instance reachable, endpoints documented in `/vibe/hack/audits/<project>/<project>-live-instance.md`, user gate before audit.

---

## Step 0 - Pick the deployment mode

Before touching anything, decide which mode applies. Ask the user explicitly if it isn't obvious:

| Mode | When to use | What we control | Capabilities for verify forks |
|---|---|---|---|
| **`local-managed`** | No instance exists yet; user wants us to bring one up from the repo | Lifecycle, config files, restart, bind mounts | Full - can back up / edit / restart |
| **`external-provided`** | Instance is already running somewhere we don't own (staging, customer VM, remote host) | Only HTTP-reachable surface | Read-only at the HTTP layer; **no config edits, no restart** |

If a `/vibe/hack/audits/<project>/<project>-live-instance.md` already exists, read it first - it tells you the mode and target. If the documented instance is still reachable (probe per Step 3), skip directly to Step 5.

For **`external-provided`**, collect from the user (do not assume defaults). The richer this picture is, the wider the attack surface verify forks can legitimately probe - do NOT settle for just a URL:

- **Base URL(s)** (e.g. `https://audit.example.com`, `http://10.0.5.12:8080`) - one per logical endpoint (proxy, admin/API, metrics, etc.)
- **Credentials** - one row per usable identity. Ask the user to provide as many privilege tiers as they're willing to grant; if they only give a low-priv account, mention that admin-only flaws will be untestable. Capture for each:
  - role / privilege tier (e.g. `anonymous`, `tenant-user`, `tenant-admin`, `superadmin`, `service-account`)
  - how to authenticate (basic auth, bearer token, OAuth flow, API key header, session cookie - include the exact header/param name)
  - the secret value itself **goes in an env var the agent can read**, not in the live-instance note (the note records only the env var name + role + how to use it)
  - whether the agent is allowed to **create new accounts** with this identity (e.g. "the admin token may provision sub-tenant users for permission-boundary testing") - this is often the difference between testing 3 flaws and 30
  - whether the agent is allowed to **rotate / reset** the credential
- **Tenant / org / project scope** - if the system is multi-tenant, which tenant(s) the agent owns. Verify forks must NOT cross into other tenants even if the bug allows it; that becomes an INCONCLUSIVE "cross-tenant impact suspected, operator coordination required".
- **Off-limits resources (not just paths)** - specific resources the agent must not touch with **any** verb, beyond what URL patterns alone capture (e.g. specific account IDs, tenants, records, buckets, queues - whatever applies to this system). Capture as a concrete deny-list, not vague guidance. **If the user has no such restrictions, record `none - agent has full latitude within scope`** - do NOT seed the note with illustrative examples; the agent will read them as real deny entries.
- **Off-limits paths / methods** - method+path patterns the operator forbids broadly. If none, record `none - all reachable surface is fair game`.
- **Rate limits / blast-radius caps** - max requests/sec the agent may sustain; whether bulk-create probes (e.g. "create 200 throwaway users to test enumeration") are OK and up to what cap.
- **Sample / seed test data** - known-good IDs, tokens, file uploads, etc. the operator has pre-staged for the audit (saves the agent from creating new state that may persist).
- **Liveness check command** the operator considers authoritative (might be just `curl -f <base-url>/health`, might be something else - do not assume `/health` or `127.0.0.1`)
- **Restart/redeploy contact** - who to ping if the instance goes down (so we never assume `docker compose restart` works), and the SLA for getting it back up (affects whether forks should serialize destructive PoCs)
- **Disclosure of monitoring** - whether the operator has WAF/IDS in place that may rate-limit or ban the agent's IP; whether the operator wants prior notice before noisy probes

If the user gives only a URL and nothing else, push back: confirm explicitly that you should proceed with anonymous-only testing (drastically reduced coverage) and record "no credentials supplied" in the live-instance note so the gap is visible in the final report.

**Default posture is "agent is free to test" - restrictions only exist where the user explicitly lists them.** For every limit/scope category above where the user supplied nothing, write the explicit `none - ...` marker in the corresponding live-instance-note section (see [../references/live-instance-template.md](../references/live-instance-template.md)). Never copy the template's illustrative bullets through verbatim - a verify fork will read them as real deny entries.

For **`local-managed`**, proceed to Step 1.

## Step 1 - (local-managed only) Detect existing deploy assets

Search the workspace in parallel for:

- `Dockerfile`, `docker-compose.yml`, `compose.yaml`, `.docker/` directory
- `Makefile` targets (`make run`, `make serve`, `make dev`)
- `install.sh`, `bootstrap.sh`, `quickstart.sh`
- `package.json` scripts (`npm start`, `pnpm dev`)
- Language-specific runners (`go run`, `cargo run`, `python -m`, `mvn spring-boot:run`)
- Sample config dirs (`.docker_compose/`, `examples/`, `quickstart/`, `dev/`)

Pick the **highest-fidelity** option that produces a network-reachable instance similar to a production deployment. Order of preference:

1. Project-provided docker-compose with sample config (production-like, hermetic)
2. Single Dockerfile + ad-hoc command (still hermetic)
3. `make run` / `npm start` / similar (less hermetic but standard)
4. Manual build + run (last resort)

## Step 2 - Attempt deploy and capture failures

Run the chosen deploy command via a command-running subagent (so output is filtered and the orchestrator context stays small - see SKILL.md → *Tools & subagents*). Common failure classes:

- **Missing Dockerfile referenced by compose** → check `.dockerignore` / `.docker/` dirs for the real file name; edit the compose file to point at it.
- **Schema validation failures on empty env vars** → identify the offending block, remove or fill it.
- **Port already bound** → check `docker compose ps` / `lsof -i`; choose a free port.
- **Missing build dependencies** → install via apt/brew/pip; pin versions if reproducibility matters.

For each non-trivial change to project files (e.g., editing `docker-compose.yml`), **record what you changed and why** - this goes into the live-instance note so the audit team can reproduce.

## Step 3 - Verify reachability

Probe every documented endpoint using the **base URL recorded for this instance** (do NOT hardcode `127.0.0.1` - it may be a remote host, a hostname, or HTTPS):

```bash
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" \
  <base-url>/<liveness-path> \
  <base-url>/<known-endpoint>
```

Use the **operator-supplied liveness command** for `external-provided` mode if one was given - do not invent a `/health` path that may not exist.

Confirm expected status codes for at least one auth-required and one anonymous endpoint. For `local-managed` mode you can additionally use container introspection (`docker compose ps`, `lsof -i`, etc.); for `external-provided` mode HTTP probes are the only signal available.

## Step 4 - Write the live-instance note

Use [../references/live-instance-template.md](../references/live-instance-template.md). Save to **`/vibe/hack/audits/<project>/<project>-live-instance.md`** (the per-project audit home, **not** inside a per-run `audit-<ts>/` dir - it must survive across re-audits of the same target).

Required sections (mark sections N/A rather than deleting them if the mode doesn't apply):

- **Deployment mode**: `local-managed` or `external-provided` (most-read field - forks branch behavior on it)
- **Capabilities**: can-back-up-config / can-edit-config / can-restart-service / can-tail-logs (yes/no each)
- Workspace path (local-managed) OR operator contact (external-provided)
- Purpose (this is the audit target)
- Stack (compose file location, service names, restart policies) - N/A for external-provided
- **All endpoints as full base URLs and what they serve** - proxy, admin/API, metrics, tracing UI, etc. Do not assume `127.0.0.1`; use whatever scheme/host/port the instance actually exposes.
- **Liveness check command** (exact command verify forks should run to confirm the instance is up)
- **Credentials inventory** (external-provided) - one row per identity: role, auth scheme + header/param name, env-var-name holding the secret, can-create-accounts (yes/no), can-rotate (yes/no). Real secrets stay in env vars, not the note.
- **Tenant / scope boundaries** (external-provided) - which tenant/org/project IDs the agent owns; explicit "do not cross into" list.
- **Off-limits resources** (external-provided) - specific account IDs, tenants, records, buckets, queues, etc. the agent must not touch with any verb. Allow-list/deny-list form.
- **Rate limits / blast-radius caps** (external-provided) - max req/sec, bulk-create caps, monitoring/WAF disclosures.
- **Seed test data** (external-provided) - known-good IDs/tokens/uploads pre-staged by the operator.
- Bind-mounted config files (local-managed only - list what testers may edit / restore)
- **Changes made vs upstream** (local-managed only - for reproducibility)
- **Off-limits surface** (external-provided - paths/methods the operator forbids hitting)
- "Verified working YYYY-MM-DD" with a quick-check command result
- Common ops (start, stop, rebuild, restart, logs) - local-managed only
- Audit-specific notes (default credentials, sample tokens, anonymous-allowed test routes)

## Step 5 - Update the resume note + memory pointer

Add a "Live instance" reference line pointing at the live-instance note. Mark deploy DONE. Also update the audit pointer in your memory (phase = deploy) so you keep tracking this audit.

## Step 6 - USER GATE

Present:

> Live instance is reachable: <mode> at <base-url(s)>. Live-instance note saved at the per-project audit home.
>
> Capabilities for verify forks: backup=<y/n>, edit-config=<y/n>, restart=<y/n>, logs=<y/n>.
>
> Next: the **audit** phase to ingest prior CVEs and run parallel deep audits (see SKILL.md for the phase syntax).
>
> Say **go audit** to proceed.
>
> **Before continuing, run a manual compact** (`/compact`). The live-instance note and the refreshed resume note are on disk, so compacting now is lossless. The audit phase ingests CVEs + spawns one deep-audit subagent per group and will benefit from a clean context.

If mode is `external-provided`, explicitly call out in the gate message that any finding requiring config changes, service restart, or filesystem access will be marked INCONCLUSIVE by verify forks unless the operator coordinates the change out-of-band.

## Quality Checks

- [ ] All claimed endpoints actually respond (curl spot-check passes)
- [ ] Live-instance note exists at `/vibe/hack/audits/<project>/<project>-live-instance.md` (per-project, not inside a per-run audit dir)
- [ ] Note documents every file edit made (and why) so the deploy is reproducible
- [ ] Bind-mounted config files are listed (later verify forks need to know what to back up before PoC)
- [ ] Restart command is documented (verify forks will use it)

## Common Pitfalls

- **`local-managed`: don't deploy to a public host or shared port.** Default to `127.0.0.1`.
- **`external-provided`: never assume the instance is local.** Don't substitute `127.0.0.1` for a remote host in any probe, PoC, or backup command - the loopback probe will appear to succeed against an unrelated service on your own machine and silently invalidate the entire phase.
- **`external-provided`: never run lifecycle commands.** No `docker compose ...`, no `systemctl restart`, no kill/send-signal. If a finding needs a restart, mark INCONCLUSIVE and document the required operator action.
- **`external-provided`: only the explicitly-documented limits constrain the agent.** Whatever the live-instance note lists under off-limits-surface / off-limits-resources / tenant-boundaries / rate-caps is authoritative; anything not listed is fair game. Do not invent self-restrictions, and do not assume privilege equals permission - if the deny-list names a resource, having an admin token does not override it.
- **`external-provided`: don't burn a granted credential by treating it as disposable.** If the user gives a single admin token and `can-rotate=no`, do not log it in artifacts or commit it anywhere; treat it as scarce.
- **`external-provided`: don't proceed silently with only a URL.** If the user supplied no credentials, no scope, no off-limits list - stop, confirm explicitly that the audit is anonymous-only, and record the gap in the live-instance note so the final report flags the coverage limit.
- **Don't invent liveness paths.** `/health` may 404 or may be a sensitive admin path. Use the operator-supplied liveness command verbatim (`external-provided`) or the one documented by the project (`local-managed`).
- **Don't enable destructive admin features.** Keep test fixtures minimal.
- **Don't bake real secrets into the instance.** Use placeholder/sample credentials so PoCs can be shared.
- **Tracing/metrics ports often fail startup if the provider env var is empty** (`local-managed`) - explicitly remove or set the variable rather than leaving it blank.
