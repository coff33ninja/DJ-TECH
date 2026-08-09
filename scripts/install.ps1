param(
    [string]$InstallDir = "$env:LOCALAPPDATA\DJ-TECH",
    [switch]$Update
)

$ErrorActionPreference = "Stop"

$repo = "https://github.com/coff33ninja/DJ-TECH"

Write-Host "DJ-TECH installer" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
$node = Get-Command "node" -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is required to run DJ-TECH." -ForegroundColor Yellow
    Write-Host "Install from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check / install Bun
$bun = Get-Command "bun" -ErrorAction SilentlyContinue
if (-not $bun) {
    Write-Host "Bun not found. Installing Bun..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri "https://bun.sh/install" -UseBasicParsing -OutFile "$env:TEMP\bun-install.ps1"
        & "$env:TEMP\bun-install.ps1"
        Remove-Item "$env:TEMP\bun-install.ps1" -ErrorAction SilentlyContinue
        $env:Path += ";$env:USERPROFILE\.bun\bin"
        $bun = Get-Command "bun" -ErrorAction SilentlyContinue
        if (-not $bun) {
            Write-Host "Bun install finished but 'bun' is not on PATH yet." -ForegroundColor Yellow
            Write-Host "Open a new terminal and re-run this installer." -ForegroundColor Yellow
            exit 1
        }
        Write-Host "Bun installed: $($bun.Source)" -ForegroundColor Green
    } catch {
        Write-Host "Bun install failed: $_" -ForegroundColor Red
        Write-Host "Falling back to npm. Run 'npm install' instead." -ForegroundColor Yellow
        $bun = $null
    }
}

# Create install dir
if (-not (Test-Path -LiteralPath $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Check if already installed
if ((Test-Path -LiteralPath "$InstallDir\package.json") -and -not $Update) {
    Write-Host "Already installed at: $InstallDir" -ForegroundColor Green
    Write-Host "Run with -Update to pull latest and rebuild." -ForegroundColor Yellow
    exit 0
}

if ($Update -and (Test-Path -LiteralPath $InstallDir\.git)) {
    Write-Host "Pulling latest from $repo..." -ForegroundColor Gray
    git -C $InstallDir pull --ff-only
    if (-not $?) { exit 1 }
} elseif (-not (Test-Path -LiteralPath "$InstallDir\.git")) {
    Write-Host "Cloning $repo into $InstallDir..." -ForegroundColor Gray
    git clone $repo $InstallDir
    if (-not $?) { exit 1 }
}

Set-Location $InstallDir

if ($bun) {
    Write-Host "Installing dependencies with bun..." -ForegroundColor Gray
    bun install --frozen-lockfile
    if (-not $?) { exit 1 }
} else {
    Write-Host "Installing dependencies with npm..." -ForegroundColor Gray
    npm install
    if (-not $?) { exit 1 }
}

Write-Host ""
Write-Host "DJ-TECH installed to $InstallDir" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  cd $InstallDir"
Write-Host "  .\scripts\run.ps1        # production build + start"
Write-Host "  .\scripts\dev.ps1        # dev server with hot reload"
Write-Host "  .\scripts\seed.ps1       # optional demo data"
