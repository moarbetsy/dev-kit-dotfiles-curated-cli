<#
.SYNOPSIS
  Creates a new project: git, README, .gitignore, optional Bun/uv; optionally from governance template and run doctor.
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Name,

  [ValidateSet("generic", "node", "python")]
  [string]$Type = "generic",

  [string]$DevRoot = "D:\cursor_projects",

  [switch]$NoGitHub,
  [switch]$NoOpen,
  [switch]$RunDoctor,
  [switch]$RunPrecursor,
  [switch]$FromGovernance
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

$KitRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$GovernanceTemplate = Join-Path $KitRoot "templates\governance"
$BunTsTemplate = Join-Path $KitRoot "templates\bun-ts-starter"
$projectPath = Join-Path $DevRoot $Name

if (Test-Path $projectPath) {
  Write-Error "Directory already exists: $projectPath"
}

Info "Creating project: $Name ($Type) at $projectPath"
New-Item -ItemType Directory -Force -Path $projectPath | Out-Null
Push-Location $projectPath
try {
  if ($FromGovernance -and (Test-Path $GovernanceTemplate)) {
    Info "Copying governance template..."
    Get-ChildItem $GovernanceTemplate -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($GovernanceTemplate.Length + 1)
      $dest = Join-Path $projectPath $rel
      $destDir = Split-Path $dest -Parent
      if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
      Copy-Item $_.FullName $dest -Force
    }
    Ok "Governance template applied."
  } else {
    git init
    Ok "Git initialized."

    if ($Type -eq "node" -and (Test-Path $BunTsTemplate)) {
      Info "Copying Bun/TS starter template..."
      Get-ChildItem $BunTsTemplate -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($BunTsTemplate.Length + 1)
        $dest = Join-Path $projectPath $rel
        $destDir = Split-Path $dest -Parent
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }
        Copy-Item $_.FullName $dest -Force
      }
      $pkgPath = Join-Path $projectPath "package.json"
      if (Test-Path $pkgPath) {
        $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        $pkg.name = ($Name -replace '[^a-z0-9\-]', '-').ToLowerInvariant()
        $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding utf8 -NoNewline
      }
      if (Get-Command bun -ErrorAction SilentlyContinue) {
        Info "Running bun install..."
        & bun install 2>&1 | Out-Null
        Ok "Bun project initialized (template + lockfile)."
      } else {
        Ok "Bun/TS template applied (run bun install when Bun is available)."
      }
    } else {
      $readme = @"
# $Name

Description of your project.

"@
      $readme | Out-File -Encoding utf8 README.md
      Ok "README.md created."

      $gitignore = switch ($Type) {
        "node" { @"
node_modules/
.env
.env.local
dist/
build/
*.log
"@ }
        "python" { @"
__pycache__/
*.py[cod]
*`$py.class
.venv/
venv/
.env
*.log
"@ }
        default { @"
.env
*.log
"@ }
      }
      $gitignore | Out-File -Encoding utf8 .gitignore
      Ok ".gitignore created."

      switch ($Type) {
        "node" {
          if (Get-Command bun -ErrorAction SilentlyContinue) {
            bun init -y 2>$null
            Ok "Bun project initialized."
          } else {
            @{ name = ($Name -replace '[^a-z0-9\-]', '-'); version = "1.0.0"; type = "module" } | ConvertTo-Json | Out-File -Encoding utf8 package.json
            Ok "package.json created."
          }
        }
        "python" {
          if (Get-Command uv -ErrorAction SilentlyContinue) { uv venv; Ok "venv created." }
          if (-not (Test-Path "requirements.txt")) { "# $Name" | Out-File -Encoding utf8 requirements.txt }
        }
      }
    }
  }

  if (-not (Test-Path ".git")) { git init; Ok "Git initialized." }
  git add .
  git commit -m "Initial commit" 2>$null
  Ok "Initial commit created."

  if (-not $NoGitHub -and (Get-Command gh -ErrorAction SilentlyContinue)) {
    try {
      gh repo create $Name --private --source=. --remote=origin --push
      Ok "GitHub repo created and pushed."
    } catch { Warn "GitHub create/push failed: $_" }
  }

  if ($RunDoctor) {
    $doctorPath = Join-Path $KitRoot "scripts\doctor.ps1"
    if (Test-Path $doctorPath) {
      Info "Running doctor..."
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $doctorPath
    }
  }

  if ($RunPrecursor) {
    $precursorDir = Join-Path $KitRoot "precursor"
    $cliPath = Join-Path $precursorDir "src\cli.ts"
    if ((Test-Path $cliPath) -and (Get-Command bun -ErrorAction SilentlyContinue)) {
      $precursorNodeModules = Join-Path $precursorDir "node_modules"
      if (-not (Test-Path $precursorNodeModules)) {
        Info "Installing Precursor dependencies..."
        Push-Location $precursorDir
        try { & bun install 2>&1 | Out-Null } finally { Pop-Location }
      }
      Info "Running Precursor Setup..."
      & bun run $cliPath setup 2>&1 | Out-Host
      if ($LASTEXITCODE -ne 0) { Warn "Precursor Setup exited with $LASTEXITCODE" } else { Ok "Precursor Setup done." }
    } elseif (-not (Test-Path $cliPath)) {
      Warn "Precursor not found at $precursorDir; skip -RunPrecursor."
    }
  }

  Ok "Project ready: $projectPath"
  if (-not $NoOpen -and (Get-Command cursor -ErrorAction SilentlyContinue)) {
    Info "Opening in Cursor..."
    cursor . 2>$null
  }
  exit 0
} finally {
  Pop-Location
}
