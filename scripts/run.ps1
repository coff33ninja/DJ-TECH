$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

# Ensure a production build exists, then start it.
if (-not (Test-Path "dist\server.cjs")) {
    Write-Host "No build found, building first..." -ForegroundColor Yellow
    & "$PSScriptRoot\build.ps1"
    if (-not $?) { exit 1 }
}

Write-Host "Starting DJ-TECH on http://localhost:3000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
node dist/server.cjs
