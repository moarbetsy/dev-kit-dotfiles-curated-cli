<#
.SYNOPSIS
  Build release zip (dev-kit bundle for setup-cursor). -WhatIf lists what would be zipped.
#>
param(
  [string]$ReleaseVersion,
  [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

# Semver: digits.digits.digits (optional -pre or +build)
$SemverPattern = '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$'
function Test-Semver($v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return $false }
  return $v.Trim() -match $SemverPattern
}

if (-not $WhatIf) {
  if (-not (Test-Semver $ReleaseVersion)) {
    Warn "ReleaseVersion must be semver (e.g. 1.0.0). Got: '$ReleaseVersion'"
    Write-Host "Usage: curated.ps1 release -ReleaseVersion <version>" -ForegroundColor Yellow
    Write-Host "Example: curated.ps1 release -ReleaseVersion 1.0.0" -ForegroundColor Gray
    exit 1
  }
  $ReleaseVersion = $ReleaseVersion.Trim()
} else {
  $ReleaseVersion = if (Test-Semver $ReleaseVersion) { $ReleaseVersion.Trim() } else { "0.0.0-whatif" }
}

$KitRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $KitRoot "dist"
$ZipName = "dev-kit-$ReleaseVersion.zip"
$ZipPath = Join-Path $OutDir $ZipName

$toInclude = @(
  "curated.ps1",
  "scripts",
  "powershell",
  "starship",
  "git",
  "cursor",
  "rules-src",
  "templates",
  "docs",
  "README.md"
)

if ($WhatIf) {
  Write-Host "WhatIf: would create $ZipName with:" -ForegroundColor Cyan
  foreach ($item in $toInclude) {
    $src = Join-Path $KitRoot $item
    if (Test-Path $src) { Write-Host "  - $item" } else { Write-Host "  - $item (missing)" -ForegroundColor Gray }
  }
  Write-Host "  - .cursor/rules (from gen-rules or existing)"
  Write-Host "Destination: $ZipPath"
  exit 0
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$tempDir = Join-Path $env:TEMP "dev-kit-release-$ReleaseVersion"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

foreach ($item in $toInclude) {
  $src = Join-Path $KitRoot $item
  if (Test-Path $src) {
    $dest = Join-Path $tempDir $item
    if (Test-Path $src -PathType Container) {
      Copy-Item $src $dest -Recurse -Force
    } else {
      Copy-Item $src $dest -Force
    }
    Info "Included: $item"
  }
}

# Generate .cursor/rules for the bundle
$genRules = Join-Path $KitRoot "scripts\gen-rules.ps1"
if (Test-Path $genRules) {
  $cursorRulesDest = Join-Path $tempDir ".cursor\rules"
  New-Item -ItemType Directory -Force -Path $cursorRulesDest | Out-Null
  if (Test-Path (Join-Path $KitRoot ".cursor\rules")) {
    Copy-Item (Join-Path $KitRoot ".cursor\rules\*") $cursorRulesDest -Recurse -Force
  }
}

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$tempDir\*" -DestinationPath $ZipPath -Force
Remove-Item $tempDir -Recurse -Force

Ok "Release: $ZipPath"
exit 0
