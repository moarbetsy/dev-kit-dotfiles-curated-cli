#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Clean up problematic PATH environment variable entries

.DESCRIPTION
    Removes dead paths, dangerous paths, and duplicates from User PATH.
    Requires user confirmation before making changes.
    System PATH requires administrator privileges and is not modified.

.PARAMETER WhatIf
    Show what would be removed without actually removing anything

.PARAMETER Force
    Skip confirmation prompts (use with caution)

.EXAMPLE
    .\scripts\cleanup-path.ps1
    Interactive cleanup with confirmation prompts

.EXAMPLE
    .\scripts\cleanup-path.ps1 -WhatIf
    Preview what would be removed without making changes
#>

param(
    [switch]$WhatIf,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

Write-Host "PATH Cleanup Tool" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host ""

# Get User PATH (we can modify this without admin)
$userPath = [Environment]::GetEnvironmentVariable("Path", "User") -split [System.IO.Path]::PathSeparator
$processPath = $env:PATH -split [System.IO.Path]::PathSeparator

Write-Host "Analyzing User PATH..." -ForegroundColor Yellow
Write-Host ""

# Identify problematic paths
$toRemove = @()
$deadPaths = @()
$dangerousPaths = @()
$duplicates = @()

$seenPaths = @{}

foreach ($path in $userPath) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        continue
    }

    $normalized = $path.TrimEnd('\', '/')
    
    # Check for duplicates
    if ($seenPaths.ContainsKey($normalized)) {
        $duplicates += $normalized
        $toRemove += $normalized
    } else {
        $seenPaths[$normalized] = $true
    }

    # Check if path exists
    if (-not (Test-Path $normalized -ErrorAction SilentlyContinue)) {
        $deadPaths += $normalized
        if ($normalized -notin $toRemove) {
            $toRemove += $normalized
        }
    }

    # Check for dangerous patterns
    $normalizedLower = $normalized.ToLower()
    if ($normalizedLower -match 'node_modules[\\/]\.bin$') {
        # Check if it's in a dangerous location
        $isRootLevel = $normalizedLower -match '^[a-z]:[\\/]node_modules' -or $normalizedLower -match '^[a-z]:[\\/]$'
        $isHomeRoot = $normalizedLower -match ('^' + [regex]::Escape($env:USERPROFILE.ToLower()) + '[\\/]node_modules')
        
        if ($isRootLevel -or $isHomeRoot) {
            $dangerousPaths += $normalized
            if ($normalized -notin $toRemove) {
                $toRemove += $normalized
            }
        }
    }
}

# Report findings
if ($toRemove.Count -eq 0) {
    Write-Host "✓ No problematic paths found in User PATH!" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($toRemove.Count) problematic PATH entries to remove:" -ForegroundColor Yellow
Write-Host ""

if ($deadPaths.Count -gt 0) {
    Write-Host "  Dead Paths ($($deadPaths.Count)):" -ForegroundColor Red
    foreach ($path in $deadPaths) {
        Write-Host "    - $path" -ForegroundColor Gray
    }
    Write-Host ""
}

if ($dangerousPaths.Count -gt 0) {
    Write-Host "  Dangerous Paths ($($dangerousPaths.Count)):" -ForegroundColor Red
    foreach ($path in $dangerousPaths) {
        Write-Host "    - $path" -ForegroundColor Gray
        Write-Host "      WARNING: Security risk - could allow execution from unexpected locations!" -ForegroundColor Red
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

# Preview mode
if ($WhatIf) {
    Write-Host "WhatIf: Would remove the above $($toRemove.Count) paths from User PATH" -ForegroundColor Cyan
    Write-Host "Run without -WhatIf to apply changes" -ForegroundColor Yellow
    exit 0
}

# Confirmation
if (-not $Force) {
    Write-Host "This will remove the above paths from your User PATH environment variable." -ForegroundColor Yellow
    Write-Host "These changes will take effect in new terminal sessions." -ForegroundColor Yellow
    Write-Host ""
    $confirmation = Read-Host "Continue? (y/N)"
    
    if ($confirmation -ne "y" -and $confirmation -ne "Y") {
        Write-Host "Cleanup cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Remove problematic paths
Write-Host ""
Write-Host "Removing problematic paths..." -ForegroundColor Cyan

$cleanedPaths = $userPath | Where-Object {
    $normalized = $_.TrimEnd('\', '/')
    $normalized -notin $toRemove
}

$newPathValue = ($cleanedPaths | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join [System.IO.Path]::PathSeparator

try {
    [Environment]::SetEnvironmentVariable("Path", $newPathValue, "User")
    Write-Host "✓ Successfully updated User PATH" -ForegroundColor Green
    Write-Host ""
    Write-Host "Removed $($toRemove.Count) problematic entries:" -ForegroundColor Green
    Write-Host "  - Dead paths: $($deadPaths.Count)" -ForegroundColor Gray
    Write-Host "  - Dangerous paths: $($dangerousPaths.Count)" -ForegroundColor Gray
    Write-Host "  - Duplicates: $($duplicates.Count)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Note: Changes will take effect in new terminal sessions." -ForegroundColor Yellow
    Write-Host "Restart your terminal or run: `$env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')" -ForegroundColor Gray
    exit 0
} catch {
    Write-Host "✗ Failed to update User PATH: $_" -ForegroundColor Red
    Write-Host "You may need to run this script with appropriate permissions." -ForegroundColor Yellow
    exit 1
}
