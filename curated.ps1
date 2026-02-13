<#
.SYNOPSIS
  One repo. One script. One command: curated.ps1 does everything (machine, new project, doctor).
.DESCRIPTION
  Single project and repo for: fresh-machine setup, new Bun/TS projects with Cursor, and Cursor project doctor.
  Run .\curated.ps1 (or .\curated.ps1 go) to see the three commands. Run .\curated.ps1 go 1|2|3 to run one.
.EXAMPLE
  .\curated.ps1
  .\curated.ps1 go 1
  .\curated.ps1 go 2 MyApp
  .\curated.ps1 go 3
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet("go", "help", "setup", "bootstrap", "full-setup", "new", "gen-rules", "doctor", "governance", "scan", "setup-cursor", "test", "release")]
  [string]$Command = "go",

  # Pass-through for: new (use -ProjectName to avoid common parameter -Name)
  [string]$ProjectName,
  [ValidateSet("generic", "node", "python")]
  [string]$Type = "generic",
  [string]$DevRoot = "D:\cursor_projects",
  [switch]$NoGitHub,
  [switch]$NoOpen,
  [switch]$RunDoctor,
  [switch]$RunPrecursor,
  [switch]$FromGovernance,
  # Pass-through for: setup-cursor
  [string]$Path,
  [switch]$Scan,
  # Pass-through for: full-setup
  [switch]$SkipTest,
  # Pass-through for: release
  [string]$ReleaseVersion,
  [switch]$WhatIf,
  # Pass-through for: bootstrap
  [string]$RepoUrl,
  [string]$Ref = "main",
  [switch]$IncludeDefenderExclusions,
  [string]$NewProjectName,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Remaining
)
$SubArgs = @($Remaining)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptsDir = Join-Path $ScriptDir "scripts"

function Show-OneRepoOneCommand {
  Write-Host ""
  Write-Host "  One repo. One script. Three commands." -ForegroundColor Cyan
  Write-Host "  ---------------------------------------"
  Write-Host ""
  Write-Host "  1. Fresh machine (setup this PC):     .\curated.ps1 full-setup"
  Write-Host "  2. New project (Bun/TS + Cursor):      .\curated.ps1 new <Name> -Type node -RunPrecursor"
  Write-Host "  3. Existing project (Cursor doctor):  .\curated.ps1 setup-cursor   (or -Path <dir>)"
  Write-Host ""
  Write-Host "  Run one of the above, or:" -ForegroundColor Gray
  Write-Host "    .\curated.ps1 go 1        → same as full-setup"
  Write-Host "    .\curated.ps1 go 2 MyApp → same as new MyApp -Type node -RunPrecursor"
  Write-Host "    .\curated.ps1 go 3       → same as setup-cursor"
  Write-Host ""
  Write-Host "  More: help | setup | bootstrap | gen-rules | doctor | scan | test | release" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-Help {
  Write-Host "dev-kit (curated.ps1) — one repo, one script" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  go                One command: show or run scenario 1|2|3 (default)"
  Write-Host "  full-setup        [1] Fresh machine: bootstrap + test"
  Write-Host "  new               [2] Create project; use -Type node -RunPrecursor for Bun/TS + Cursor"
  Write-Host "  setup-cursor      [3] Cursor project doctor in current dir or -Path <dir>"
  Write-Host "  ---"
  Write-Host "  setup             Full setup (apps, tools, Git, Cursor rules)"
  Write-Host "  bootstrap        Admin bootstrap (Long Paths, Dev Mode, clone, setup)"
  Write-Host "  gen-rules         Regenerate .cursor/rules from rules-src/"
  Write-Host "  doctor            Repo doctor (lockfile, CI, structure)"
  Write-Host "  scan              JSON diagnostics (CI)"
  Write-Host "  test              gen-rules + doctor + scan"
  Write-Host "  release           Build zip: -ReleaseVersion <ver>"
  Write-Host ""
  Write-Host "  Examples:"
  Write-Host "    .\curated.ps1                    → show three commands"
  Write-Host "    .\curated.ps1 go 1              → full-setup"
  Write-Host "    .\curated.ps1 go 2 MyApp        → new MyApp -Type node -RunPrecursor"
  Write-Host "    .\curated.ps1 go 3              → setup-cursor"
  Write-Host "  Docs: docs\REFERENCE.md"
  Write-Host ""
}

function Invoke-PwshFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [string[]]$Args = @()
  )
  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    & $pwsh.Source -NoProfile -ExecutionPolicy Bypass -File $Path @Args
  } else {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Args
  }
}

# Validate required args and show friendly usage
function Require-ReleaseVersion {
  if (-not $PSBoundParameters.ContainsKey("ReleaseVersion") -or [string]::IsNullOrWhiteSpace($ReleaseVersion)) {
    Write-Host "Usage: curated.ps1 release -ReleaseVersion <version>" -ForegroundColor Yellow
    Write-Host "Example: curated.ps1 release -ReleaseVersion 1.0.0" -ForegroundColor Gray
    exit 1
  }
}

# Normalize new: first positional arg (no leading -) = project name
# Script's $PSBoundParameters is not visible inside this function; pass ProjectName and SubArgs explicitly.
function Get-NewProjectArgs {
  param([string]$ProjectNameValue, [string[]]$SubArgsValue)
  if (-not [string]::IsNullOrWhiteSpace($ProjectNameValue)) {
    return @("-Name", $ProjectNameValue), $SubArgsValue
  }
  if ($SubArgsValue -and $SubArgsValue.Count -gt 0 -and $SubArgsValue[0] -notlike '-*') {
    $name = $SubArgsValue[0]
    $rest = if ($SubArgsValue.Count -gt 1) { $SubArgsValue[1..($SubArgsValue.Count - 1)] } else { @() }
    return @("-Name", $name), $rest
  }
  return $null, $SubArgsValue
}

switch ($Command) {
  "go" {
    $choice = if ($SubArgs -and $SubArgs.Count -gt 0) { $SubArgs[0] } else { $null }
    switch ($choice) {
      "1" {
        $bootArgs = @()
        if ($PSBoundParameters.ContainsKey("RepoUrl")) { $bootArgs += "-RepoUrl", $RepoUrl }
        if ($PSBoundParameters.ContainsKey("Ref")) { $bootArgs += "-Ref", $Ref }
        if ($PSBoundParameters.ContainsKey("DevRoot")) { $bootArgs += "-DevRoot", $DevRoot }
        if ($IncludeDefenderExclusions) { $bootArgs += "-IncludeDefenderExclusions" }
        if ($PSBoundParameters.ContainsKey("NewProjectName")) { $bootArgs += "-NewProjectName", $NewProjectName }
        Invoke-PwshFile (Join-Path $ScriptsDir "bootstrap.ps1") $bootArgs
        if (-not $SkipTest) { Invoke-PwshFile (Join-Path $ScriptDir "curated.ps1") @("test") }
        exit 0
      }
      "2" {
        $name = if ($SubArgs -and $SubArgs.Count -gt 1) { $SubArgs[1] } else { $null }
        if (-not $name) {
          Write-Host "Usage: curated.ps1 go 2 <ProjectName>" -ForegroundColor Yellow
          Write-Host "Example: curated.ps1 go 2 MyApp" -ForegroundColor Gray
          exit 1
        }
        Invoke-PwshFile (Join-Path $ScriptsDir "new-project.ps1") @("-Name", $name, "-Type", "node", "-NoGitHub", "-NoOpen", "-RunPrecursor")
        exit 0
      }
      "3" {
        $targetPath = if ($Path) { (Resolve-Path $Path).Path } else { (Get-Location).Path }
        $precursorDir = Join-Path $ScriptDir "precursor"
        $cliPath = Join-Path $precursorDir "src\cli.ts"
        if (-not (Test-Path $cliPath)) {
          Write-Host "Precursor not found. Run from dev-kit repo root." -ForegroundColor Yellow
          exit 1
        }
        $bun = Get-Command bun -ErrorAction SilentlyContinue
        if (-not $bun) {
          Write-Host "Bun not found. Install Bun: https://bun.sh" -ForegroundColor Yellow
          exit 1
        }
        $precursorNodeModules = Join-Path $precursorDir "node_modules"
        if (-not (Test-Path $precursorNodeModules)) {
          Push-Location $precursorDir
          try { & $bun.Source install 2>&1 | Out-Null } finally { Pop-Location }
        }
        Push-Location $targetPath
        try {
          & $bun.Source run $cliPath setup 2>&1 | Out-Host
          exit $LASTEXITCODE
        } finally { Pop-Location }
      }
      default {
        Show-OneRepoOneCommand
        exit 0
      }
    }
    exit 0
  }
  "help" {
    Show-Help
    exit 0
  }
  "setup" {
    $setupArgs = @("-All")
    if ($SubArgs -and $SubArgs.Count -gt 0) { $setupArgs += $SubArgs }
    Invoke-PwshFile (Join-Path $ScriptsDir "setup.ps1") $setupArgs
    exit 0
  }
  "bootstrap" {
    $bootArgs = @()
    if ($PSBoundParameters.ContainsKey("RepoUrl")) { $bootArgs += "-RepoUrl", $RepoUrl }
    if ($PSBoundParameters.ContainsKey("Ref")) { $bootArgs += "-Ref", $Ref }
    if ($PSBoundParameters.ContainsKey("DevRoot")) { $bootArgs += "-DevRoot", $DevRoot }
    if ($IncludeDefenderExclusions) { $bootArgs += "-IncludeDefenderExclusions" }
    if ($PSBoundParameters.ContainsKey("NewProjectName")) { $bootArgs += "-NewProjectName", $NewProjectName }
    if ($bootArgs.Count -eq 0) { $bootArgs = $SubArgs }
    Invoke-PwshFile (Join-Path $ScriptsDir "bootstrap.ps1") $bootArgs
    exit 0
  }
  "full-setup" {
    $bootArgs = @()
    if ($PSBoundParameters.ContainsKey("RepoUrl")) { $bootArgs += "-RepoUrl", $RepoUrl }
    if ($PSBoundParameters.ContainsKey("Ref")) { $bootArgs += "-Ref", $Ref }
    if ($PSBoundParameters.ContainsKey("DevRoot")) { $bootArgs += "-DevRoot", $DevRoot }
    if ($IncludeDefenderExclusions) { $bootArgs += "-IncludeDefenderExclusions" }
    if ($PSBoundParameters.ContainsKey("NewProjectName")) { $bootArgs += "-NewProjectName", $NewProjectName }
    Invoke-PwshFile (Join-Path $ScriptsDir "bootstrap.ps1") $bootArgs
    if (-not $SkipTest) {
      Invoke-PwshFile (Join-Path $ScriptDir "curated.ps1") @("test")
    }
    exit 0
  }
  "setup-cursor" {
    $targetPath = if ($Path) { (Resolve-Path $Path).Path } else { (Get-Location).Path }
    $precursorDir = Join-Path $ScriptDir "precursor"
    $cliPath = Join-Path $precursorDir "src\cli.ts"
    if (-not (Test-Path $cliPath)) {
      Write-Host "Precursor not found at $precursorDir. Run from dev-kit repo root." -ForegroundColor Yellow
      exit 1
    }
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bun) {
      Write-Host "Bun not found. Install Bun: https://bun.sh" -ForegroundColor Yellow
      exit 1
    }
    $precursorNodeModules = Join-Path $precursorDir "node_modules"
    if (-not (Test-Path $precursorNodeModules)) {
      Write-Host "Installing Precursor dependencies..." -ForegroundColor Cyan
      Push-Location $precursorDir
      try { & $bun.Source install 2>&1 | Out-Host } finally { Pop-Location }
    }
    Push-Location $targetPath
    try {
      & $bun.Source run $cliPath setup 2>&1 | Out-Host
      $exitCode = $LASTEXITCODE
      if ($Scan -and $exitCode -eq 0) {
        & $bun.Source run $cliPath scan 2>&1 | Out-Host
        $exitCode = $LASTEXITCODE
      }
      exit $exitCode
    } finally {
      Pop-Location
    }
  }
  "new" {
    $newArgs, $rest = Get-NewProjectArgs -ProjectNameValue $ProjectName -SubArgsValue $SubArgs
    if (-not $newArgs) {
      Write-Host "Usage: curated.ps1 new -ProjectName <Name> [-Type generic|node|python] [-RunDoctor] [-NoGitHub] [-NoOpen]" -ForegroundColor Yellow
      Write-Host "   or: curated.ps1 new <Name> -Type node" -ForegroundColor Yellow
      Write-Host "Example: curated.ps1 new MyApp -Type node -RunDoctor" -ForegroundColor Gray
      exit 1
    }
    if ($PSBoundParameters.ContainsKey("Type")) { $newArgs += "-Type", $Type }
    if ($PSBoundParameters.ContainsKey("DevRoot")) { $newArgs += "-DevRoot", $DevRoot }
    if ($NoGitHub) { $newArgs += "-NoGitHub" }
    if ($NoOpen) { $newArgs += "-NoOpen" }
    if ($RunDoctor) { $newArgs += "-RunDoctor" }
    if ($RunPrecursor) { $newArgs += "-RunPrecursor" }
    if ($FromGovernance) { $newArgs += "-FromGovernance" }
    $allArgs = @()
    $allArgs += $newArgs
    $allArgs += @($rest | Where-Object { $null -ne $_ -and $_ -ne '' })
    Invoke-PwshFile (Join-Path $ScriptsDir "new-project.ps1") $allArgs
    exit 0
  }
  "gen-rules" {
    Invoke-PwshFile (Join-Path $ScriptsDir "gen-rules.ps1")
    exit 0
  }
  "doctor" {
    Invoke-PwshFile (Join-Path $ScriptsDir "doctor.ps1") $SubArgs
    exit 0
  }
  "governance" {
    Invoke-PwshFile (Join-Path $ScriptsDir "doctor.ps1") @("-GovernanceOnly")
    exit 0
  }
  "scan" {
    Invoke-PwshFile (Join-Path $ScriptsDir "scan.ps1")
    exit 0
  }
  "test" {
    Invoke-PwshFile (Join-Path $ScriptsDir "self-test.ps1")
    exit 0
  }
  "release" {
    Require-ReleaseVersion
    $relArgs = @("-ReleaseVersion", $ReleaseVersion)
    if ($WhatIf) { $relArgs += "-WhatIf" }
    $allArgs = @()
    $allArgs += $relArgs
    $allArgs += $SubArgs
    Invoke-PwshFile (Join-Path $ScriptsDir "release.ps1") $allArgs
    exit 0
  }
  default {
    Show-Help
    exit 0
  }
}

# To add a new command: add to ValidateSet above, then add a branch here, e.g.:
#   "mycommand" { & (Join-Path $ScriptsDir "mycommand.ps1") @SubArgs; exit 0 }
