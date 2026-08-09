$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$bun = Get-Command "bun" -ErrorAction SilentlyContinue
$npm = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $bun -and -not $npm) {
    Write-Host "Neither bun nor npm found. Install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Running typecheck (tsc --noEmit)..." -ForegroundColor Cyan
if ($bun) {
    bun run lint
} else {
    npm run lint
}
if (-not $?) { exit 1 }
Write-Host "Lint OK." -ForegroundColor Green
