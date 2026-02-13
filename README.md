# dev-kit

**One repo, one script: machine setup, new projects, and Cursor project doctor.**

Bootstrap a Windows dev machine, create Bun/TS projects with Cursor, or doctor an existing project — all from `curated.ps1`.

## Quick start

Run `.\curated.ps1` with no arguments to see the three commands.

| # | Scenario | Command |
|---|----------|---------|
| **1** | Fresh machine | `.\curated.ps1 full-setup` or `.\curated.ps1 go 1` |
| **2** | New project (Bun/TS + Cursor) | `.\curated.ps1 new <Name> -Type node -RunPrecursor` or `.\curated.ps1 go 2 <Name>` |
| **3** | Existing project (Cursor doctor) | `.\curated.ps1 setup-cursor` or `.\curated.ps1 go 3` (use `-Path <dir>` from anywhere) |

## Requirements

- **Windows** with [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/).
- **PowerShell 7** (recommended); scripts use `pwsh` when available.
- **Bun** for Precursor (`setup-cursor`) and `new -Type node`; install from [bun.sh](https://bun.sh) if you use those.
- Quoted paths if they contain spaces. Process-level execution: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 <command>`.

## Install

Clone this repo, then from the repo root:

```powershell
.\curated.ps1 full-setup
```

Use `-SkipTest` to skip the test step. Restart your terminal afterward. For a fresh machine without cloning first, see the one-liner in **docs/REFERENCE.md**.

## Commands

| Command | Description |
|---------|-------------|
| `go` (default) | Show three commands, or run `go 1`, `go 2 <Name>`, `go 3` |
| `help` | Full command list |
| `full-setup` | [1] Bootstrap + test (fresh machine) |
| `new` | [2] Create project; `-Type node -RunPrecursor` for Bun/TS + Cursor |
| `setup-cursor` | [3] Cursor project doctor in current dir or `-Path <dir>` |
| `setup` | Full setup: apps, tools, Git, Cursor rules |
| `bootstrap` | Admin bootstrap (Long Paths, Dev Mode, clone, setup) |
| `gen-rules` | Regenerate `.cursor/rules` from `rules-src/` |
| `doctor` | Repo doctor (lockfile, CI, structure) |
| `scan` | JSON diagnostics (CI) |
| `test` | gen-rules + doctor + scan |
| `release -ReleaseVersion <ver>` | Build `dist/dev-kit-<ver>.zip`; optional `-WhatIf` |

## More

Copy-paste commands, one-liner bootstrap, agent protocol, runbook, and extending: **docs/REFERENCE.md**.

Layout: scripts in `scripts/`, Cursor doctor in `precursor/`, rules source in `rules-src/`.
