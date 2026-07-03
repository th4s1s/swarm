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

### 3. User Confirmation Prompts

Choose the appropriate prompt based on what was detected. Always ask the user to choose (see SKILL.md → *Tools & subagents*) - never assume. *(Automated `source` mode: do **not** show these prompts - auto-select the **source** target, even when autorev is also detected, and abort only if there is no source at all; see [../workflows/source.md](../workflows/source.md).)*

**Both detected:**
> I found source code at `{path}` ({language}, {count} files) and a binary for autorev: `{binary}` (loaded as `{i64_path}`).
>
> Which should I use for the audit?

Choices: `["Both source code + autorev (Recommended)", "Source code only", "autorev binary analysis only"]`

**Only source detected:**
> I found source code at `{path}` ({language}, {count} files). Is this the audit target?

Choices: `["Yes, audit this source code", "I also have a binary - let me load it into autorev"]`

**Only autorev detected:**
> I loaded `{binary}` into autorev (db `{i64_path}`). Do you also have source code available?

Choices: `["autorev only - proceed with binary analysis", "I have source code too - let me provide the path"]`

**Neither detected:**
> I couldn't find source code or a binary to load into autorev. Please provide one or both:
> - Source code: Tell me the directory path
> - Binary: Give me the path to the binary (or an existing `.i64`); I'll build/load the autorev database

(Freeform input - no choices)

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
