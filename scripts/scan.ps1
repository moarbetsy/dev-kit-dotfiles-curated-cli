<#
.SYNOPSIS
  Emit JSON diagnostics for CI (lockfile, CI entrypoint, structure, doctor result, rules, governance).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Get-Location
$report = @{
  timestamp = (Get-Date -Format "o")
  root      = $root.Path
  checks    = @()
  ok        = $true
  doctor_ok = $null
  has_rules = $null
  has_governance = $null
  version   = $null
}

# Doctor result (run doctor and capture exit code)
$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$doctorPath = Join-Path $scriptDir "doctor.ps1"
if (Test-Path $doctorPath) {
  Push-Location $root
  try {
    & $doctorPath 2>$null
    $report.doctor_ok = ($LASTEXITCODE -eq 0)
  } catch {
    $report.doctor_ok = $false
  } finally {
    Pop-Location
  }
  if (-not $report.doctor_ok) { $report.ok = $false }
  $report.checks += @{ name = "doctor"; ok = $report.doctor_ok }
}

# Rules: .cursor/rules has .mdc and cursor/ai-rules.txt exists
$cursorRules = Join-Path $root ".cursor\rules"
$aiRules = Join-Path $root "cursor\ai-rules.txt"
$hasRulesDir = (Test-Path $cursorRules) -and (@(Get-ChildItem $cursorRules -Filter "*.mdc" -ErrorAction SilentlyContinue).Count -gt 0)
$hasAiRules = Test-Path $aiRules
$report.has_rules = $hasRulesDir -and $hasAiRules
$report.checks += @{ name = "rules"; ok = $report.has_rules }
if (-not $report.has_rules) { $report.ok = $false }

# Governance template (for dev-kit repo)
$govPath = Join-Path $root "templates\governance"
$report.has_governance = (Test-Path $govPath) -and (Test-Path (Join-Path $govPath "README.md"))
$report.checks += @{ name = "governance_template"; ok = $report.has_governance }

# Version/tag (git describe if available)
if (Get-Command git -ErrorAction SilentlyContinue) {
  Push-Location $root
  try {
    $ver = git describe --tags --always 2>$null
    if ($ver) { $report.version = $ver.Trim() }
  } catch {}
  Pop-Location
}

# Lockfile (node: bun, npm, yarn, pnpm)
if (Test-Path (Join-Path $root "package.json")) {
  $hasLock = (Test-Path (Join-Path $root "bun.lockb")) -or
             (Test-Path (Join-Path $root "package-lock.json")) -or
             (Test-Path (Join-Path $root "yarn.lock")) -or
             (Test-Path (Join-Path $root "pnpm-lock.yaml"))
  $report.checks += @{ name = "node_lockfile"; ok = $hasLock }
  if (-not $hasLock) { $report.ok = $false }
}

# CI
$workflows = Join-Path $root ".github\workflows"
$hasWorkflows = $false
if (Test-Path $workflows) {
  $count = @(Get-ChildItem $workflows -Filter "*.yml" -ErrorAction SilentlyContinue).Count + @(Get-ChildItem $workflows -Filter "*.yaml" -ErrorAction SilentlyContinue).Count
  $hasWorkflows = $count -gt 0
}
$report.checks += @{ name = "ci_workflows"; ok = $hasWorkflows }

# README
$hasReadme = Test-Path (Join-Path $root "README.md")
$report.checks += @{ name = "readme"; ok = $hasReadme }
if (-not $hasReadme) { $report.ok = $false }

# Git
$hasGit = Test-Path (Join-Path $root ".git")
$report.checks += @{ name = "git_repo"; ok = $hasGit }

$report | ConvertTo-Json -Depth 5
if (-not $report.ok) { exit 1 }
exit 0
