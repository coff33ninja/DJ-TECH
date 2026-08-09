param(
    [string]$InstallDir = "$env:LOCALAPPDATA\DJ-TECH"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath "$InstallDir\.git")) {
    Write-Host "No install found at $InstallDir. Run .\scripts\install.ps1 first." -ForegroundColor Red
    exit 1
}

Write-Host "=== DJ-TECH update ===" -ForegroundColor Cyan
Write-Host "Current version: $((Get-Content "$InstallDir\package.json" -Raw | ConvertFrom-Json).version)" -ForegroundColor Gray
Write-Host "Pulling latest from origin..." -ForegroundColor Gray
git -C $InstallDir pull --ff-only
if (-not $?) { Write-Host "Update failed (check for local changes)." -ForegroundColor Red; exit 1 }

Set-Location $InstallDir
$bun = Get-Command "bun" -ErrorAction SilentlyContinue
if ($bun) {
    bun install --frozen-lockfile
    bun run build
} else {
    npm install
    npm run build
}
if (-not $?) { exit 1 }

Write-Host ""
Write-Host "Updated to v$((Get-Content "$InstallDir\package.json" -Raw | ConvertFrom-Json).version)" -ForegroundColor Green
Write-Host "Changelog: $InstallDir\CHANGELOG.md" -ForegroundColor Gray
Write-Host "Restart with: .\scripts\run.ps1" -ForegroundColor Cyan
