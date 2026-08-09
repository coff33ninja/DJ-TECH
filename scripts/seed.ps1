$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$bun = Get-Command "bun" -ErrorAction SilentlyContinue
$npm = Get-Command "npm" -ErrorAction SilentlyContinue
if (-not $bun -and -not $npm) {
    Write-Host "Neither bun nor npm found. Install Node.js first." -ForegroundColor Red
    exit 1
}

Write-Host "Seeding demo data..." -ForegroundColor Cyan
if ($bun) {
    bun run seed
} else {
    npm run seed
}
