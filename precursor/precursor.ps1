#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Precursor - Config-driven project doctor + scaffolder for Cursor

.DESCRIPTION
    Idempotent bootstrap and doctor tool for Cursor projects supporting
    HTML/CSS/JS/TS, Python, Rust, C, C++, Docker, and monorepos.

.PARAMETER Setup
    Run full bootstrap (idempotent)

.PARAMETER Scan
    Read-only doctor scan -> JSON

.PARAMETER Strict
    Fail on warnings (for CI)

.PARAMETER Offline
    No downloads/updates

.PARAMETER Rollback
    Restore latest backup snapshot

.PARAMETER ResetState
    Wipe state cache

.PARAMETER Update
    Self-update core/scripts with SHA256 verification

.PARAMETER Json
    Output JSON (for CI)

.PARAMETER NoColor
    Disable colored output

.EXAMPLE
    .\precursor.ps1 -Setup
    Bootstrap the project

.EXAMPLE
    .\precursor.ps1 -Scan --json > report.json
    Generate JSON report
#>

param(
    [switch]$Setup,
    [switch]$Scan,
    [switch]$Strict,
    [switch]$Offline,
    [switch]$Rollback,
    [switch]$ResetState,
    [switch]$Update,
    [switch]$Json,
    [switch]$NoColor
)

$ErrorActionPreference = "Stop"

# Find Bun
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    Write-Error "Bun not found. Please install Bun: https://bun.sh"
    exit 1
}

# Change to script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

try {
    # Ensure dependencies are installed
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing dependencies..." -ForegroundColor Yellow
        & bun install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install dependencies"
            exit 1
        }
    }

    # Build arguments for TypeScript core
    $args = @()

    if ($Setup) {
        $args += "setup"
    }
    elseif ($Scan) {
        $args += "scan"
    }
    elseif ($Rollback) {
        $args += "rollback"
    }
    elseif ($ResetState) {
        $args += "reset"
    }
    elseif ($Update) {
        $args += "update"
    }
    else {
        Write-Host "No action specified. Use -Setup, -Scan, -Rollback, -ResetState, or -Update" -ForegroundColor Yellow
        exit 1
    }

    if ($Strict) {
        $args += "--strict"
    }

    if ($Offline) {
        $args += "--offline"
    }

    if ($Json) {
        $args += "--json"
    }

    if ($NoColor) {
        $args += "--no-color"
    }

    # Run TypeScript core
    $coreScript = Join-Path $scriptDir "src" "cli.ts"
    if (-not (Test-Path $coreScript)) {
        Write-Error "Core CLI not found: $coreScript"
        exit 1
    }

    & bun run $coreScript @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
