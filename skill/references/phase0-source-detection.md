# Phase 0: Source Detection

## Purpose

Automatically detect what code sources are available (source code, autorev MCP binary analysis, or both) and confirm with the user before proceeding.

> ### autorev MCP - how it works
>
> The binary path uses the **autorev MCP** (`mcp__autorev__*` tools; IDA-backed). It is **file + session
> scoped**, *not* instance/port based: you load **one IDA database (`.i64`) per MCP session**, then run
> analysis against it. Standard workflow:
> 1. `create_database(<binary>, overwrite_existing=true)` - build the `.i64` (skip if a good `.i64` already exists)
> 2. `load_database(<.i64>)` - load it into the session (auto-cleans stale holders, retries once)
> 3. `get_database_metadata` / `get_binary_overview` - confirm it loaded; read arch + summary
> 4. discover with `list_functions` / `search_functions` / `find_symbol` / `list_imports` / `list_strings` / `list_exports`
> 5. analyze with `analyze_function` / `get_disassembly` / `get_cfg` / `get_callees` / `get_callers`; xrefs with `find_xrefs_to` / `get_xrefs_from` / `find_import_usages`
>
> **Single-database-per-session**: the orchestrator loads the DB once and keeps it. On an autorev-only
> target, drive analysis from that one session (don't spin up parallel agents that each `load_database` the
> same `.i64` - they contend). Functions are addressed by **name**; xrefs by **address**.

## Detection Logic

### 1. autorev (binary) Probe

autorev has no "running instances" to discover - you detect a *target file* and load it:

```
1. Glob the workspace for a binary or an existing IDA database:
   - existing DB:  **/*.i64
   - binaries:     ELF/PE/Mach-O (e.g. **/*.exe, **/*.dll, **/*.so, **/*.dylib, or files with no extension under bin/)
2. If a .i64 exists:   load_database(<.i64>)
   else if a binary:   create_database(<binary>, overwrite_existing=true) then load_database(<.i64>)
3. get_database_metadata   -> confirms a DB is loaded + basic summary
   get_binary_overview     -> arch, format, high-level layout
Success: a DB is loaded and the overview returns.
Failure / no binary or .i64 found: the autorev (binary) path is unavailable - use the source path.
```

Record:
- Binary filename
- Loaded database path (`.i64`)
- Architecture (from `get_binary_overview` / `get_database_metadata`)

### 2. Source Code Detection

Scan current directory and immediate children for source code:

**Build files (highest confidence)**:
- `CMakeLists.txt`, `Makefile` → C/C++
- `package.json` → JavaScript/TypeScript
- `Cargo.toml` → Rust
- `go.mod` → Go
- `pom.xml`, `build.gradle` → Java
- `requirements.txt`, `setup.py`, `pyproject.toml` → Python
- `*.sln`, `*.csproj` → C#/.NET

**Source directories (medium confidence)**:
- `src/`, `lib/`, `app/`, `pkg/`
- Directories containing > 5 files with matching extensions

**Extension scan (lower confidence)**:
```
glob: **/*.cpp, **/*.c, **/*.h
glob: **/*.py
glob: **/*.js, **/*.ts
glob: **/*.java
glob: **/*.go
glob: **/*.rs
```

Count files per language. Report primary and secondary languages.

### 3. Target selection (automatic)

Auto-select the target from what was detected - do not prompt:
- **Both source and a binary**: default to **source** (richer context); add autorev only if the audit needs compiled-behavior confirmation.
- **Only source**: audit the source.
- **Only a binary**: use autorev (binary analysis).
- **Neither**: abort with a clear reason - there is nothing to audit.

### 4. Dual-Source Strategy

When BOTH sources are available, use this division of labor:

| Task | Primary Source | Verification Source |
|------|---------------|-------------------|
| Feature mapping | Source code (richer context) | autorev (confirm compiled behavior) |
| Entry point discovery | Source code (route definitions) | autorev (export table, xrefs) |
| Data flow tracing | Source code (variable names, types) | autorev (actual register/memory flow) |
| String analysis | autorev (compiled strings, including generated) | Source (contextual meaning) |
| Authentication checks | Source code (policy logic) | autorev (bypass verification) |
| Crypto analysis | Source code (algorithm choice) | autorev (actual implementation, constants) |

## SQL Schema

`vh_sources` is created at workspace init ([../schema.sql](../schema.sql)) - it already exists, do
**not** create it. Columns to populate: `id, type ('source'|'autorev'|'both'), source_path,
source_language, source_file_count, autorev_binary, autorev_db_path, autorev_arch` (`confirmed_at`
defaults).
