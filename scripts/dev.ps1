$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$bun = Get-Command "bun" -ErrorAction SilentlyContinue
$npm = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $bun -and -not $npm) {
    Write-Host "Neither bun nor npm found. Install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Starting dev server (Vite + Express, hot reload)..." -ForegroundColor Cyan
if ($bun) {
    bun run dev
} else {
    npm run dev
}
