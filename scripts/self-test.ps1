<#
.SYNOPSIS
  Run gen-rules, doctor, scan, and rules check (test suite for the kit).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

$KitRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$failed = $false

$pwsh = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }

# gen-rules
Info "Running gen-rules..."
Push-Location $KitRoot
try {
  $r = & $pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $KitRoot "curated.ps1") gen-rules 2>&1
  if ($LASTEXITCODE -ne 0) { $failed = $true; Warn "gen-rules failed" } else { Ok "gen-rules ok" }
} finally { Pop-Location }

# doctor (kit repo)
Push-Location $KitRoot
try {
  Info "Running doctor..."
  $r = & $pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $KitRoot "scripts\doctor.ps1") 2>&1
  if ($LASTEXITCODE -ne 0) { $failed = $true; Warn "doctor failed" } else { Ok "doctor ok" }
} finally {
  Pop-Location
}

# scan (kit repo)
Push-Location $KitRoot
try {
  Info "Running scan..."
  $json = & $pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $KitRoot "scripts\scan.ps1") 2>&1
  if ($LASTEXITCODE -ne 0) { $failed = $true; Warn "scan failed" } else { Ok "scan ok"; $json | Out-String | Write-Host }
} finally {
  Pop-Location
}

# rules exist
$rulesDir = Join-Path $KitRoot ".cursor\rules"
if (Test-Path $rulesDir) {
  $count = @(Get-ChildItem $rulesDir -Filter "*.mdc").Count
  if ($count -gt 0) { Ok "Rules present: $count .mdc" } else { Warn "No .mdc in .cursor/rules"; $failed = $true }
} else {
  Warn ".cursor/rules missing (run gen-rules)"; $failed = $true
}

if ($failed) {
  Warn "One or more checks failed."
  exit 1
}
Ok "All tests passed."
exit 0
