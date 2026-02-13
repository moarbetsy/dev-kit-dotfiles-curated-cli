param(
  [string]$DevRoot = "D:\cursor_projects",
  [string]$RepoDir = "",
  [string]$RepoUrl = "",
  [string]$Ref = "main",

  [string]$GitUserName = "MoarBetsy",
  [string]$GitUserEmail = "MoarBetsy@gmail.com",
  [string]$GitHubUser = "MoarBetsy",

  [switch]$IncludeDefenderExclusions,
  [string]$NewProjectName = ""
)

# RepoUrl: from param, else DEVKIT_OWNER/DEVKIT_REPO env vars, else default
if (-not $RepoUrl) {
  if ($env:DEVKIT_OWNER -and $env:DEVKIT_REPO) {
    $RepoUrl = "https://github.com/$($env:DEVKIT_OWNER)/$($env:DEVKIT_REPO).git"
  } else {
    $RepoUrl = "https://github.com/MoarBetsy/dev-kit.git"
  }
}

if (-not $RepoDir) {
  $RepoDir = Join-Path $env:USERPROFILE "dev-kit"
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  $m" -ForegroundColor Yellow }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $p  = New-Object Security.Principal.WindowsPrincipal($id)
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Relaunch-AsAdmin {
  $args = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-DevRoot", "`"$DevRoot`"",
    "-RepoDir", "`"$RepoDir`"",
    "-RepoUrl", "`"$RepoUrl`"",
    "-Ref", "`"$Ref`"",
    "-GitUserName", "`"$GitUserName`"",
    "-GitUserEmail", "`"$GitUserEmail`"",
    "-GitHubUser", "`"$GitHubUser`""
  )
  if ($IncludeDefenderExclusions) { $args += "-IncludeDefenderExclusions" }
  if ($NewProjectName) { $args += "-NewProjectName", "`"$NewProjectName`"" }

  Info "Requesting elevation (UAC prompt)…"
  Start-Process -Verb RunAs -FilePath "powershell.exe" -ArgumentList $args | Out-Null
  exit 0
}

function Ensure-Winget {
  if (Get-Command winget -ErrorAction SilentlyContinue) { return $true }
  Warn "winget not found. Install/update 'App Installer' from Microsoft Store, then re-run."
  return $false
}

function Winget-Install($id) {
  Info "Installing: $id"
  winget install -e --id $id --silent --disable-interactivity --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    Warn "Silent install failed for $id; retrying with interactive installer flags."
    winget install -e --id $id --accept-source-agreements --accept-package-agreements
  }
  Ok "Installed: $id"
}

function Enable-LongPaths {
  Info "Enabling Long Paths…"
  reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f | Out-Null
  Ok "Long Paths enabled (restart Windows recommended)."
}

function Enable-DeveloperModeFlags {
  Info "Enabling Developer Mode flags…"
  reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f | Out-Null
  reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowAllTrustedApps /t REG_DWORD /d 1 /f | Out-Null
  Ok "Developer Mode flags set."
}

function Add-DefenderExclusions {
  if (-not (Get-Command Add-MpPreference -ErrorAction SilentlyContinue)) {
    Warn "Defender cmdlets not available; skipping exclusions."
    return
  }
  Info "Adding Windows Defender exclusions (dev folders only)…"
  try {
    Add-MpPreference -ExclusionPath $DevRoot | Out-Null
    Add-MpPreference -ExclusionPath (Join-Path $env:USERPROFILE ".uv")  | Out-Null
    Add-MpPreference -ExclusionPath (Join-Path $env:USERPROFILE ".bun") | Out-Null
    Ok "Defender exclusions added."
  } catch {
    Warn "Could not add Defender exclusions (policy/admin restrictions)."
  }
}

function Ensure-Dir($path) {
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

function Ensure-GitAndCloneRepo {
  $currentScriptDir = Split-Path $PSCommandPath -Parent
  $currentRepoRoot = Split-Path $currentScriptDir -Parent
  $setupPathInCurrent = Join-Path $currentScriptDir "setup.ps1"

  if (Test-Path $setupPathInCurrent) {
    Ok "Detected running from repo directory: $currentRepoRoot"
    return $currentRepoRoot
  }

  if (-not (Ensure-Winget)) { throw "winget missing." }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Winget-Install "Git.Git"
  } else {
    Ok "Git already installed"
  }

  Ensure-Dir (Split-Path $RepoDir -Parent)
  if (-not (Test-Path $RepoDir)) {
    Info "Cloning dev-kit to: $RepoDir"
    try {
      git clone --branch $Ref $RepoUrl $RepoDir
      Ok "Repo cloned"
    } catch {
      Warn "Failed to clone. If repo doesn't exist yet, run setup.ps1 from the repo directory."
      throw $_
    }
  } else {
    Info "Repo exists; pulling latest…"
    Push-Location $RepoDir
    try {
      git pull origin $Ref
      Ok "Repo updated"
    } catch {
      Warn "Failed to pull. Continuing with existing files."
    }
    Pop-Location
  }
  return $RepoDir
}

function Run-Setup {
  $setupPath = Join-Path $RepoDir "scripts\setup.ps1"
  if (-not (Test-Path $setupPath)) { throw "setup.ps1 not found at $setupPath" }
  Info "Running setup.ps1 (All)…"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setupPath `
    -All -DevRoot $DevRoot -GitUserName $GitUserName -GitUserEmail $GitUserEmail -GitHubUser $GitHubUser
  Ok "setup.ps1 complete"
}

function Run-PostSetup {
  $curatedPath = Join-Path $RepoDir "curated.ps1"
  if (Test-Path $curatedPath) {
    Info "Running gen-rules and doctor..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $curatedPath gen-rules 2>$null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $curatedPath doctor 2>$null
  }
  if ($NewProjectName) {
    Info "Creating new project: $NewProjectName"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $curatedPath new -ProjectName $NewProjectName -NoOpen 2>$null
  }
}

# --- Main ---
Info "Bootstrap starting…"
Info "DevRoot: $DevRoot | RepoDir: $RepoDir"

if (-not (Test-Admin)) {
  Relaunch-AsAdmin
}

Enable-LongPaths
Enable-DeveloperModeFlags
if ($IncludeDefenderExclusions) { Add-DefenderExclusions }

$actualRepoDir = Ensure-GitAndCloneRepo
if ($actualRepoDir) { $RepoDir = $actualRepoDir }

Run-Setup
Run-PostSetup

Ok "Bootstrap done."
Ok "Next: restart terminal; set Windows Terminal font to Delugia Nerd Font (fallback: JetBrainsMono Nerd Font); Cursor global rules are in %USERPROFILE%\.cursor\rules\; run 'gh auth login' if needed."
