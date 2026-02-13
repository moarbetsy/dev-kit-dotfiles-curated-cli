#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Diagnose and report PATH environment variable issues

.DESCRIPTION
    Scans the system PATH for:
    - Dead/invalid paths (directories that don't exist)
    - Duplicate entries
    - Potentially dangerous paths (like node_modules in wrong locations)
    - Missing common tool directories

.EXAMPLE
    .\scripts\diagnose-path.ps1
    Run PATH diagnostics and display report
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Write-Host "PATH Diagnostics" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host ""

# Get PATH from both User and System environment
$userPath = [Environment]::GetEnvironmentVariable("Path", "User") -split [System.IO.Path]::PathSeparator
$systemPath = [Environment]::GetEnvironmentVariable("Path", "Machine") -split [System.IO.Path]::PathSeparator
$processPath = $env:PATH -split [System.IO.Path]::PathSeparator

Write-Host "PATH Sources:" -ForegroundColor Yellow
Write-Host "  User PATH entries: $($userPath.Count)"
Write-Host "  System PATH entries: $($systemPath.Count)"
Write-Host "  Process PATH entries: $($processPath.Count)"
Write-Host ""

# Analyze process PATH (what's actually active)
$issues = @()
$warnings = @()
$deadPaths = @()
$duplicates = @()
$dangerousPaths = @()

$seenPaths = @{}

foreach ($path in $processPath) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        continue
    }

    $normalized = $path.TrimEnd('\', '/')
    
    # Check for duplicates
    if ($seenPaths.ContainsKey($normalized)) {
        $duplicates += $normalized
    } else {
        $seenPaths[$normalized] = $true
    }

    # Check if path exists
    if (-not (Test-Path $normalized -ErrorAction SilentlyContinue)) {
        $deadPaths += $normalized
        $issues += "Dead path: $normalized"
    }

    # Check for dangerous patterns
    if ($normalized -match 'node_modules\\\.bin$' -and $normalized -notmatch '\\[^\\]+\\node_modules\\\.bin$') {
        # node_modules\.bin in root or user home is dangerous
        if ($normalized -match '^[A-Z]:\\$' -or $normalized -match '^[A-Z]:\\Users\\[^\\]+$') {
            $dangerousPaths += $normalized
            $issues += "Dangerous path (node_modules in root/home): $normalized"
        }
    }

    # Check for common missing but expected paths
    if ($normalized -match 'npm$' -and -not (Test-Path $normalized)) {
        $warnings += "npm directory referenced but missing: $normalized"
    }
    if ($normalized -match '\.dotnet\\tools$' -and -not (Test-Path $normalized)) {
        $warnings += ".NET tools directory referenced but missing: $normalized"
    }
}

# Report findings
Write-Host "Findings:" -ForegroundColor Yellow
Write-Host ""

if ($deadPaths.Count -gt 0) {
    Write-Host "  Dead Paths ($($deadPaths.Count)):" -ForegroundColor Red
    foreach ($path in $deadPaths) {
        Write-Host "    - $path" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($duplicates.Count -gt 0) {
    Write-Host "  Duplicate Paths ($($duplicates.Count)):" -ForegroundColor Yellow
    foreach ($path in $duplicates) {
        Write-Host "    - $path" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($dangerousPaths.Count -gt 0) {
    Write-Host "  Dangerous Paths ($($dangerousPaths.Count)):" -ForegroundColor Red
    foreach ($path in $dangerousPaths) {
        Write-Host "    - $path" -ForegroundColor Gray
        Write-Host "      WARNING: This path could allow execution of binaries from unexpected locations!" -ForegroundColor Red
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "  Warnings ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "    - $warning" -ForegroundColor Gray
    }
    Write-Host ""
}

# Summary
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "  Total issues: $($issues.Count)" -ForegroundColor $(if ($issues.Count -eq 0) { "Green" } else { "Red" })
Write-Host "  Dead paths: $($deadPaths.Count)" -ForegroundColor $(if ($deadPaths.Count -eq 0) { "Green" } else { "Red" })
Write-Host "  Duplicates: $($duplicates.Count)" -ForegroundColor $(if ($duplicates.Count -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Dangerous paths: $($dangerousPaths.Count)" -ForegroundColor $(if ($dangerousPaths.Count -eq 0) { "Green" } else { "Red" })
Write-Host ""

# Recommendations
if ($issues.Count -gt 0) {
    Write-Host "Recommendations:" -ForegroundColor Yellow
    Write-Host "  1. Open 'Edit the system environment variables' in Windows" -ForegroundColor White
    Write-Host "  2. Review and remove dead paths from User and System PATH" -ForegroundColor White
    Write-Host "  3. Remove dangerous node_modules paths (especially in C:\ or C:\Users\)" -ForegroundColor White
    Write-Host "  4. Remove duplicate entries" -ForegroundColor White
    Write-Host ""
    Write-Host "  Common paths to check:" -ForegroundColor White
    Write-Host "    - C:\Users\$env:USERNAME\AppData\Roaming\npm (if npm not installed)" -ForegroundColor Gray
    Write-Host "    - C:\Users\$env:USERNAME\.dotnet\tools (if .NET tools not installed)" -ForegroundColor Gray
    Write-Host "    - C:\node_modules\.bin (should never exist)" -ForegroundColor Gray
    Write-Host "    - C:\Users\node_modules\.bin (should never exist)" -ForegroundColor Gray
    Write-Host ""
}

if ($issues.Count -eq 0) {
    Write-Host "✓ PATH looks healthy!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠ PATH has issues that should be addressed" -ForegroundColor Yellow
    exit 1
}
