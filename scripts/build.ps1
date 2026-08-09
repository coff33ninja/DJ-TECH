param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"
$ver = (Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json).version

Write-Host "=== DJ-TECH build ===" -ForegroundColor Cyan
Write-Host "Version: $ver" -ForegroundColor Gray

$bun = Get-Command "bun" -ErrorAction SilentlyContinue
$npm = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $bun -and -not $npm) {
    Write-Host "Neither bun nor npm found. Install Node.js first." -ForegroundColor Red
    exit 1
}

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Building..." -ForegroundColor Gray
if ($bun) {
    bun run build
} else {
    npm run build
}
if (-not $?) { exit 1 }

$size = (Get-Item "dist\server.cjs").Length
$kb = [math]::Round($size / 1024, 1)
Write-Host "OK: dist\server.cjs ($kb KB)" -ForegroundColor Green
