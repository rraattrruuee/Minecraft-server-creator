# PowerShell script to build Inno Setup installer on Windows runners
param()

$ErrorActionPreference = 'Stop'

Write-Host "Installing Inno Setup via Chocolatey (if missing)..."
choco install innosetup -y --no-progress

$issPath = Join-Path $PSScriptRoot '..\installer.iss' | Resolve-Path -Relative
$issFull = Join-Path (Get-Location) $issPath

$possible = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
)
$iscc = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  throw "ISCC.exe not found after installing Inno Setup"
}

Write-Host "Using ISCC: $iscc"
& $iscc $issFull

Write-Host "Installer build completed."