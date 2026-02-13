# Reference

Copy-paste commands, one-liner bootstrap, agent protocol, runbook, and extending.

---

## The one script (from dev-kit root)

```powershell
.\curated.ps1
```

With no arguments, this shows the **three commands**. Then run one of them—or use the short form:

| Do this | Full form | Short form |
|---------|-----------|------------|
| Fresh machine | `.\curated.ps1 full-setup` | `.\curated.ps1 go 1` |
| New project (Bun/TS + Cursor) | `.\curated.ps1 new <Name> -Type node -RunPrecursor` | `.\curated.ps1 go 2 <Name>` |
| Existing project (Cursor doctor) | `.\curated.ps1 setup-cursor` | `.\curated.ps1 go 3` |

Entrypoint (strict execution policy): `pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 <command> [args]`

## All commands

| Command | Description |
|---------|-------------|
| `go` or (default) | Show three commands, or run `go 1`, `go 2 <Name>`, `go 3` |
| `help` | Full command list |
| `full-setup` | [1] Bootstrap + test (fresh machine) |
| `new` | [2] Create project; `-Type node -RunPrecursor` for Bun/TS + Cursor |
| `setup-cursor` | [3] Cursor project doctor (Precursor) in current dir or `-Path <dir>` |
| `setup` | Full setup: apps, tools, Git, Cursor rules |
| `bootstrap` | Admin bootstrap (Long Paths, Dev Mode, clone, setup) |
| `gen-rules` | Regenerate `.cursor/rules` from rules-src/ |
| `doctor` | Repo doctor (lockfile, CI, structure) |
| `scan` | JSON diagnostics (CI) |
| `test` | gen-rules + doctor + scan |
| `release -ReleaseVersion <ver>` | Build dist zip. Optional `-WhatIf`. |

---

## First time (clone then one command)

After cloning dev-kit (or after the one-liner bootstrap), run once:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 full-setup
```

Use `-SkipTest` to skip the test step. Restart your terminal afterward. Global rules: `%USERPROFILE%\.cursor\rules\`. Set Windows Terminal font to Delugia Nerd Font (or JetBrainsMono Nerd Font); run `gh auth login` if needed.

## New project

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 new MyApp -Type node -RunPrecursor
# With dev-kit doctor too:
pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 new MyApp -Type node -RunDoctor -RunPrecursor
```

## Existing project (Cursor doctor)

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 setup-cursor
# With path and scan:
pwsh -NoProfile -ExecutionPolicy Bypass -File .\curated.ps1 setup-cursor -Path C:\path\to\project -Scan
```

Or from the project folder: `precursor\precursor.ps1 -Setup` or `-Scan`.

---

## One-liner bootstrap (new machine)

**Option A — env vars:** set `DEVKIT_OWNER` and `DEVKIT_REPO`, then:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "& { $f = Join-Path $env:TEMP 'bootstrap.ps1'; Invoke-WebRequest -Uri \"https://raw.githubusercontent.com/$env:DEVKIT_OWNER/$env:DEVKIT_REPO/main/scripts/bootstrap.ps1\" -OutFile $f -UseBasicParsing; & pwsh -NoProfile -ExecutionPolicy Bypass -File $f -RepoUrl \"https://github.com/$env:DEVKIT_OWNER/$env:DEVKIT_REPO.git\" -Ref main }"
```

**Option B — replace `<OWNER>` and `<REPO>`:**

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "& { $f = Join-Path $env:TEMP 'bootstrap.ps1'; Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/<OWNER>/<REPO>/main/scripts/bootstrap.ps1' -OutFile $f -UseBasicParsing; & pwsh -NoProfile -ExecutionPolicy Bypass -File $f -RepoUrl 'https://github.com/<OWNER>/<REPO>' -Ref main }"
```

After one-liner (repo at `%USERPROFILE%\dev-kit`):

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\dev-kit\curated.ps1" test
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\dev-kit\curated.ps1" new -ProjectName MyApp -Type node -RunDoctor
```

---

## Agent protocol

Short contract for AI/agent use of this repo.

**Rules:** Single source of rules: edit in `rules-src/`; run `curated.ps1 gen-rules` to update `.cursor/rules/` and `cursor/ai-rules.txt`. One CI entrypoint: use `.github/workflows/ci.yml` (or single workflow). Lockfile law: Node projects must have `bun.lockb` or `package-lock.json` or `yarn.lock`; Python projects should have lockfiles where applicable.

**Commands agents can run:** `curated.ps1 gen-rules` (after editing `rules-src/`); `curated.ps1 doctor`; `curated.ps1 scan`; `curated.ps1 test`.

---

## Patch runbook

**Before editing rules:** Edit in `rules-src/`; run `curated.ps1 gen-rules`; commit both `rules-src/` and generated outputs.

**Before changing CI:** Prefer adding jobs to the single workflow; run `curated.ps1 doctor` and `curated.ps1 scan` locally.

**After setup script changes:** Run `curated.ps1 setup` (or bootstrap on a test path); run `curated.ps1 test`; run `scripts/run-tests.ps1` for unit tests.

**Releasing:** Bump version; run `curated.ps1 release -ReleaseVersion <ver>`. Zip: `dist/dev-kit-<ver>.zip`.

---

## Extending

- **Add a command:** Add to `ValidateSet` and `switch ($Command)` in `curated.ps1`; add `scripts/<name>.ps1`; update `Show-Help`; add to this doc’s command table.
- **Add a project type:** Add to `ValidateSet` for `$Type` in `new-project.ps1` and `curated.ps1`; add branch in type switch in `new-project.ps1` (e.g. `.gitignore`, optional tool init).
- **Add a doctor check:** In `scripts/doctor.ps1`, add logic in the repo block or dev-kit block; use `[void]$issues.Add("message")`. Optionally add a field in `scripts/scan.ps1` for CI.
- **Add governance template file:** Add under `templates/governance/` (e.g. README.md, .gitignore, .github/workflows/ci.yml). If adding a required file, add a check in `scripts/doctor.ps1` in the `$GovernanceOnly` block.

After changes: run `curated.ps1 test` and `scripts/run-tests.ps1`.
