# Phase 2: Feature Mapping

## Purpose

Divide the application into logical feature groups, then map every feature to its implementing source code. This creates the structured attack surface inventory that Phase 4 auditors use.

**Maximize granularity and coverage.** Split into as many fine-grained groups and sub-features as it takes so that **every source file and every entry point is mapped** - Phase 4's coverage is bounded by what this phase captures, so an unmapped file is a file that never gets audited. Bias toward more, smaller groups and more sub-features; never coarsen to hit a tidy count.

## Feature Group Taxonomy

### Grouping Heuristics (in priority order)

1. **Authentication boundary**: Group auth-related code together (login, sessions, tokens, MFA, SSO, password reset)
2. **Core data processing**: The application's primary function - what it does to data (scan, transform, validate, render)
3. **File/data handling**: Upload, download, storage, archive, quarantine operations
4. **Configuration & admin**: Settings management, user management, role management
5. **Network/external**: Outbound connections, webhooks, integrations, federation
6. **Internal infrastructure**: IPC, messaging, database layer, caching
7. **External API surface**: Public endpoints, SDK/client-facing APIs
8. **Unauthenticated surface**: Anything accessible without credentials

### Naming Convention

| ID | Name Pattern | Examples |
|----|-------------|----------|
| G1 | Auth & Session | Login, MFA, token management |
| G2 | Core Processing | File scanning, data transformation |
| G3 | Config & Admin | Settings, user CRUD, policies |
| G4 | Storage & Data | Quarantine, archive, backup |
| G5 | Network & External | Webhooks, proxy, federation |
| G6 | Infrastructure | IPC, database, messaging |
| G7 | API Surface | REST endpoints, gRPC, GraphQL |
| G8 | Unauthenticated | Public pages, health checks, registration |

Adapt names to the target application. Not all groups will exist for every target.

### Size Guidelines (bias to granularity - coverage first)

These are **not** caps to stay under; they tune how finely to slice. The group **count has no upper bound** - scale it to whatever fully covers the codebase.

| Metric | Floor | Sweet spot (per group) | Hard cap (split above this) |
|--------|-------|------------------------|-----------------------------|
| Groups | 3 | as many as needed for full coverage | none |
| Files per group | 1 | 5-20 | ~30 files / ~1500 LoC |
| Sub-features per group | 1 | as many as exist | none |

- **Split aggressively**: any group above the per-group file/LoC cap (too big for one subagent to read every file) gets split into more groups.
- **Merge only the trivial**: combine groups only when each is a tiny handful of files with no real surface of its own. Never merge to reduce the count at the expense of coverage.
- **Cover everything**: every source file must land in exactly one group, including utility/config/build files (a catch-all "G-misc" group is acceptable, but it must still be mapped - not skipped).

## Subagent Prompt Template

Replace `{placeholders}` with actual values. The entire prompt is passed to the subagent-spawning tool (see SKILL.md → *Tools & subagents*).

```
You are a security researcher mapping features to source code for a security audit.

## Your Assignment
Feature group: {group_id} - {group_name}
Description: {group_description}
Key directories to focus on: {key_directories}

## Source Access
{source_access_instructions}

For source code: Use your file-search and file-read tools (grep/glob to locate files, then read their contents).
For binaries: Use the autorev MCP (`load_database(<.i64>)` first if you have your own session). Discover with `list_functions` / `search_functions` / `find_symbol` / `list_imports` / `find_import_usages` / `find_string` / `list_strings` / `list_exports`; analyze with `analyze_function` (decompiled pseudocode + summary) / `get_disassembly` / `get_cfg` / `get_callees` / `get_callers`; trace refs with `find_xrefs_to(address)` / `get_xrefs_from(address)`.

## Scale yourself - recursive decomposition (spawn helpers if your scope is too large)

Your job is to map your scope **exhaustively** - every file read, every sub-feature captured. If that is more than you can do well in one pass, **do not skim**: split your file scope into coherent sub-scopes and **spawn one writable `general-purpose` sub-subagent per sub-scope, in parallel**, handing each this same prompt for its slice. The **same rule applies recursively** - a helper whose slice is still too large splits and spawns again, as deep as needed, until every leaf reads its files in full. (In Claude Code a subagent can spawn subagents.)

**Owner vs. helper (avoid clobbering / SQLite races):**
- If you are the **group owner** (the orchestrator spawned you for this group): after merging everything your helpers return, **you** write the consolidated `<AUDIT_DIR>/files/{group_id}-mapping.md` and run the SQL inserts for the whole group.
- When you spawn a **helper**, tell it: *"map this sub-scope and **return** your mapping (the markdown sections + the attack-surface and observation rows) to me - do **not** write the group file or run SQL."* Helpers may recurse the same way for their own slice and merge their descendants' returns before returning to you.
- Your **Coverage** line is the **union** of your own and all descendants' coverage - every file in your scope mapped, none dropped.
- If spawning subagents is unavailable in your environment, map your entire scope yourself, sequentially. Never skip files for lack of helpers.

## What to Map

First **decompose this group into as many granular sub-features as exist** - one per route/handler/CLI command/parser/state-machine/scheduled task/helper that touches input. Do **not** lump related things into one feature; finer is better. Read **every file in your assigned scope** (none is "too boring") so nothing is left uncovered.

For each sub-feature, document:

1. **Feature name**: What does it do?
2. **Entry points**: API endpoints, CLI commands, event handlers, scheduled tasks
3. **Key source files**: The files that implement this feature
4. **Authentication requirements**: None, user-level, admin-level, internal-only
5. **Input sources**: HTTP headers, query params, body, file uploads, environment variables, database
6. **Data flow**: Where does user-controlled data go? Follow from input → processing → output/storage
7. **Trust boundaries crossed**: Does data cross privilege levels, network boundaries, or process boundaries?
8. **Security-relevant observations**: Anything that looks like it could be a vulnerability (but don't investigate deeply - just note it)

## Output Format

Return a structured markdown document with one section per feature:

### Feature: {name}
- **Entry point**: `METHOD /path` or `function_name()` at `file:line`
- **Files**: `file1.cpp`, `file2.cpp`, ...
- **Auth**: none / user / admin
- **Inputs**: list of input sources
- **Data flow**: source → processing → sink
- **Trust boundary**: yes/no, which boundary
- **Observations**: any security-relevant notes

## Thoroughness Level
Aim for **100% coverage of your assigned scope**. Read **every** file - never skip one as "boring" or "just config/util"; those hide the best bugs. Decompose to the **finest meaningful sub-features** (more is better - do not lump). Follow imports/includes to understand dependencies. Document internal helper functions that handle user data. End your mapping with a **Coverage** line: list the files you read vs. any in-scope file you did not map (target: none unmapped) so the orchestrator can spot gaps.

## Known Prior Art
{known_findings_summary}
```

### Source Access Instructions (fill into template)

**Source code only:**
```
Source code is at: {source_path}
Language: {language}
Use glob to find files, grep to search, and your file-read tool to read content.
```

**autorev only:**
```
Binary analysis via the autorev MCP. The binary is {binary_name}; database {i64_path}.
If you have your own MCP session, call load_database({i64_path}) before any analysis.
- list_functions / search_functions / find_symbol / list_exports / list_imports - find functions, entrypoints, imports
- find_string / list_strings(contains=...) - find strings
- analyze_function(function_name) - comprehensive analysis (decompiled pseudocode, callees/callers, strings)
- get_disassembly(function_name) / get_cfg(function_name) - assembly listing / control-flow graph
- get_callees(function_name) / get_callers(function_name) - call graph
- find_import_usages(import_name) - call sites of an imported API
- find_xrefs_to(address) / get_xrefs_from(address) - references to/from an address (use addresses from list_functions/find_symbol)
- search_bytes - byte/pattern search when names/strings aren't enough
```

**Both:**
```
You have TWO sources. Use source code as primary (better names, comments, types).
Use autorev to verify compiled behavior when source is ambiguous.

Source code: {source_path} ({language})
autorev: {binary_name} (database {i64_path}; load_database first if you have your own session)

Prioritize source code for understanding logic. Use autorev for:
- Confirming compiled code matches source (no #ifdef differences)
- Finding strings or constants not obvious from source
- Tracing actual call paths (template instantiation, virtual dispatch)
```

## Mapping Output Storage

After all subagents return:

1. **Session files**: Save each group's full output to `files/{group_id}-mapping.md`
2. **SQL attack surface**:
   ```sql
   INSERT INTO vh_attack_surface (group_id, endpoint, method, auth_required, description)
   VALUES (?, ?, ?, ?, ?);
   ```
3. **SQL observations**:
   ```sql
   INSERT INTO vh_security_observations (group_id, observation, severity_hint, location)
   VALUES (?, ?, ?, ?);
   ```

## Quality Checks

Before presenting mappings to the user, verify:

- [ ] **Every source file in the codebase is mapped** under some group (no unmapped files - cross-check against the full file inventory)
- [ ] Each group is decomposed into **as many granular sub-features as exist** (not lumped into one or two broad "features")
- [ ] Each group's mapping ends with a Coverage line and shows no in-scope files left unmapped
- [ ] Every mapped sub-feature has at least one source file reference
- [ ] No source files are mapped to multiple groups (or if they are, it's intentional and documented)
- [ ] Authentication requirements are specified for every entry point
- [ ] At least 1 security observation exists per group (if zero, the mapping was too shallow)
