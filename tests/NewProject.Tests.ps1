<#
.SYNOPSIS
  Pester tests for scripts/new-project.ps1 (create in temp dir, existing dir fails).
#>
$KitRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NewProjectPath = Join-Path $KitRoot "scripts\new-project.ps1"

Describe "NewProject" {
  It "creates a generic project in temp DevRoot with README and .git" {
    $testRoot = Join-Path $env:TEMP "new-project-test-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
    try {
      Push-Location $KitRoot
      try {
        & $NewProjectPath -Name "TestProj" -Type generic -DevRoot $testRoot -NoGitHub -NoOpen 2>$null
        $LASTEXITCODE | Should Be 0
      } finally {
        Pop-Location
      }
      $projectDir = Join-Path $testRoot "TestProj"
      Test-Path $projectDir | Should Be $true
      Test-Path (Join-Path $projectDir "README.md") | Should Be $true
      Test-Path (Join-Path $projectDir ".git") | Should Be $true
    } finally {
      Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  It "creates a node project from Bun/TS template with package.json, tsconfig.json, index.ts, .cursor/rules, and lockfile when bun is available" {
    $testRoot = Join-Path $env:TEMP "new-project-test-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $testRoot | Out-Null
    try {
      Push-Location $KitRoot
      try {
        & $NewProjectPath -Name "NodeProj" -Type node -DevRoot $testRoot -NoGitHub -NoOpen 2>$null
        $LASTEXITCODE | Should Be 0
      } finally {
        Pop-Location
      }
      $projectDir = Join-Path $testRoot "NodeProj"
      Test-Path $projectDir | Should Be $true
      Test-Path (Join-Path $projectDir "package.json") | Should Be $true
      Test-Path (Join-Path $projectDir "tsconfig.json") | Should Be $true
      Test-Path (Join-Path $projectDir "index.ts") | Should Be $true
      $rulesDir = Join-Path $projectDir ".cursor\rules"
      Test-Path $rulesDir | Should Be $true
      $mdcCount = @(Get-ChildItem $rulesDir -Filter "*.mdc" -ErrorAction SilentlyContinue).Count
      $mdcCount | Should BeGreaterThan 0
      $hasLock = (Test-Path (Join-Path $projectDir "bun.lock")) -or (Test-Path (Join-Path $projectDir "bun.lockb"))
      if (Get-Command bun -ErrorAction SilentlyContinue) {
        $hasLock | Should Be $true
      }
    } finally {
      Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  It "fails when project directory already exists" {
    $testRoot = Join-Path $env:TEMP "new-project-test-$(Get-Random)"
    $existingProj = Join-Path $testRoot "ExistingProj"
    New-Item -ItemType Directory -Force -Path $existingProj | Out-Null
    try {
      $pwsh = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell.exe" }
      & $pwsh -NoProfile -ExecutionPolicy Bypass -File $NewProjectPath -Name "ExistingProj" -Type generic -DevRoot $testRoot -NoGitHub -NoOpen 2>$null
      $LASTEXITCODE | Should Not Be 0
    } finally {
      Remove-Item $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
