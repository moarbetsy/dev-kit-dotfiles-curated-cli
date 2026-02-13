<#
.SYNOPSIS
  Project/repo doctor: checks lockfile, CI entrypoint, structure. -GovernanceOnly runs governance template checks.
  In a dev-kit repo, also checks rules-src, .cursor/rules, templates/governance, docs.
#>
param(
  [switch]$GovernanceOnly,
  [switch]$SkipRulesCheck  # Use after fresh clone before first gen-rules
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

$root = Get-Location
$issues = [System.Collections.ArrayList]::new()

# Repo-level checks (unless governance-only)
if (-not $GovernanceOnly) {
  $isKitRepo = (Test-Path (Join-Path $root "curated.ps1")) -and (Test-Path (Join-Path $root "README.md")) -and (Test-Path (Join-Path $root ".github\workflows"))

  if (-not (Test-Path (Join-Path $root ".git")) -and -not $isKitRepo) {
    [void]$issues.Add("No .git directory (run git init)")
  }

  # Node: lockfile (bun, npm, yarn, pnpm)
  if (Test-Path (Join-Path $root "package.json")) {
    $hasLock = (Test-Path (Join-Path $root "bun.lockb")) -or
               (Test-Path (Join-Path $root "package-lock.json")) -or
               (Test-Path (Join-Path $root "yarn.lock")) -or
               (Test-Path (Join-Path $root "pnpm-lock.yaml"))
    if (-not $hasLock) {
      [void]$issues.Add("Node project has no lockfile (run bun install, npm install, or pnpm install)")
    }
  }

  # Python: uv.lock or requirements.txt
  if (Test-Path (Join-Path $root "pyproject.toml")) {
    $hasPyLock = (Test-Path (Join-Path $root "uv.lock")) -or (Test-Path (Join-Path $root "requirements.txt"))
    if (-not $hasPyLock) { [void]$issues.Add("Python project has no uv.lock or requirements.txt") }
  }

  # CI workflows
  $workflows = Join-Path $root ".github\workflows"
  if (Test-Path $workflows) {
    $count = @(Get-ChildItem $workflows -Filter "*.yml" -ErrorAction SilentlyContinue).Count + @(Get-ChildItem $workflows -Filter "*.yaml" -ErrorAction SilentlyContinue).Count
    if ($count -eq 0) { [void]$issues.Add(".github/workflows exists but has no YAML files") }
  }

  # README
  if (Test-Path (Join-Path $root "README.md")) {
    Ok "README.md present"
  } else {
    [void]$issues.Add("No README.md")
  }

  # Dev-kit repo: require rules-src, .cursor/rules (when rules-src exists), templates/governance, docs/REFERENCE.md
  if ($isKitRepo -and -not $SkipRulesCheck) {
    $rulesSrc = Join-Path $root "rules-src"
    $cursorRules = Join-Path $root ".cursor\rules"
    $govTemplate = Join-Path $root "templates\governance"
    $referenceMd = Join-Path $root "docs\REFERENCE.md"

    if (-not (Test-Path $rulesSrc)) {
      [void]$issues.Add("dev-kit repo missing rules-src/")
    } else {
      if (-not (Test-Path $cursorRules)) {
        [void]$issues.Add(".cursor/rules/ missing (run curated.ps1 gen-rules)")
      } else {
        $mdcCount = @(Get-ChildItem $cursorRules -Filter "*.mdc" -ErrorAction SilentlyContinue).Count
        if ($mdcCount -eq 0) { [void]$issues.Add(".cursor/rules/ has no .mdc files (run curated.ps1 gen-rules)") }
      }
      $aiRules = Join-Path $root "cursor\ai-rules.txt"
      if (-not (Test-Path $aiRules)) { [void]$issues.Add("cursor/ai-rules.txt missing (run curated.ps1 gen-rules)") }
    }
    if (-not (Test-Path $govTemplate)) { [void]$issues.Add("dev-kit repo missing templates/governance/") }
    if (-not (Test-Path $referenceMd)) { [void]$issues.Add("dev-kit repo missing docs/REFERENCE.md") }
  }
}

# Governance template checks
if ($GovernanceOnly) {
  $kitRoot = $null
  $scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
  if (Test-Path (Join-Path $scriptDir "..\templates\governance")) {
    $kitRoot = Resolve-Path (Join-Path $scriptDir "..")
    $gov = Join-Path $kitRoot "templates\governance"
    if (-not (Test-Path (Join-Path $gov "README.md"))) { [void]$issues.Add("Governance template missing README.md") }
    if (-not (Test-Path (Join-Path $gov ".gitignore"))) { [void]$issues.Add("Governance template missing .gitignore") }
    $govWorkflows = Join-Path $gov ".github\workflows"
    if (-not (Test-Path $govWorkflows)) { [void]$issues.Add("Governance template missing .github/workflows/") }
    Ok "Governance template path: $gov"
  } else {
    [void]$issues.Add("Governance template not found (templates/governance)")
  }
}

if ($issues.Count -gt 0) {
  foreach ($i in $issues) { Warn $i }
  exit 1
}
Ok "Doctor passed (no issues)."
exit 0
