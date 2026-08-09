# Release flow for DJ-TECH: promote the [Unreleased] changelog section, bump
# package.json, commit, tag, push, wait for the GitHub Release workflow, verify.
param(
    [string]$Repo = "coff33ninja/DJ-TECH",
    [ValidateSet("auto", "patch", "minor", "major")]
    [string]$Bump = "auto"
)

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot ".."

# ---- Step 1: Validate gh ----
$gh = Get-Command "gh" -ErrorAction SilentlyContinue
if (-not $gh) {
    Write-Error "GitHub CLI (gh) is required. Install from https://cli.github.com/"
    exit 1
}

# ---- Step 2: Read current version ----
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$current = $pkg.version
if (-not $current) {
    Write-Error "package.json has no version"
    exit 1
}

# ---- Step 3: Extract [Unreleased] section ----
$changelog = Get-Content (Join-Path $root "CHANGELOG.md") -Raw
$match = [regex]::Match($changelog, "(?ms)^## \[Unreleased\](?:\r?\n)?(.*?)(?=\r?\n## \[|\z)")
$unreleased = ""
if ($match.Success) {
    $unreleased = $match.Groups[1].Value.Trim()
}

# ---- Step 4: Determine bump type ----
$recut = $false
if (-not $unreleased) {
    # Nothing pending in [Unreleased]: re-cut the current version (e.g. after
    # deleting a release/tag) instead of bumping to a new one.
    $recut = $true
    $newVersion = $current
    Write-Host "[Unreleased] is empty - re-cutting $current as-is." -ForegroundColor Yellow
} elseif ($Bump -eq "auto") {
    if ($unreleased -match "(?im)^###\s+(Breaking|Removed)") {
        $Bump = "major"
    } else {
        # Hybrid rule: count changelog bullet entries. 1 entry -> patch,
        # 2+ entries -> minor. Breaking/Removed (handled above) -> major.
        $entryCount = ([regex]::Matches($unreleased, "(?m)^[ \t]*[-*][ \t]+")).Count
        if ($entryCount -le 1) { $Bump = "patch" } else { $Bump = "minor" }
    }
}

# ---- Step 5: Compute new version ----
if (-not $recut) {
    $v = $current -split "\."
    if ($v.Count -lt 3) { Write-Error "Unexpected version format: $current"; exit 1 }
    $major = [int]$v[0]; $minor = [int]$v[1]; $patch = [int]$v[2]
    switch ($Bump) {
        "major" { $major++; $minor = 0; $patch = 0 }
        "minor" { $minor++; $patch = 0 }
        "patch" { $patch++ }
    }
    $newVersion = "$major.$minor.$patch"
}
$tag = "v$newVersion"
$date = Get-Date -Format "yyyy-MM-dd"
$bumpLabel = if ($recut) { "recut" } else { $Bump }
Write-Host "=== Releasing $tag (bump: $bumpLabel, from $current) ===" -ForegroundColor Cyan

# ---- Step 6: Rewrite CHANGELOG ----
if (-not $recut) {
    # Promote [Unreleased] -> versioned section and leave a fresh empty [Unreleased].
    $promoted = "## [$newVersion] - $date`n`n$unreleased`n"
    $newChangelog = $changelog.Replace($match.Value, "## [Unreleased]`n`n$promoted")

    # Add the version link reference to the footer link list (newest first).
    $linkRef = "[$newVersion]: https://github.com/$Repo/releases/tag/$tag"
    $linkPattern = "(?m)^\[[0-9]+\.[0-9]+\.[0-9]+\]: https://github.com/"
    $linkMatch = [regex]::Match($newChangelog, $linkPattern)
    if ($linkMatch.Success) {
        $newChangelog = $newChangelog.Insert($linkMatch.Index, "$linkRef`n")
    } else {
        $newChangelog = $newChangelog.TrimEnd() + "`n`n$linkRef`n"
    }
    [System.IO.File]::WriteAllText((Join-Path $root "CHANGELOG.md"), $newChangelog, (New-Object System.Text.UTF8Encoding $false))

    # ---- Step 7: Bump package.json ----
    $pkgText = Get-Content (Join-Path $root "package.json") -Raw
    $pkgText = [regex]::Replace($pkgText, '"version"\s*:\s*"[^"]*"', "`"version`": `"$newVersion`"")
    [System.IO.File]::WriteAllText((Join-Path $root "package.json"), $pkgText, (New-Object System.Text.UTF8Encoding $false))
}

# ---- Step 8: Commit ----
if ($recut) {
    # Reuse the current version's changelog section as the commit/release body.
    $secMatch = [regex]::Match($changelog, "(?ms)^## \[$([regex]::Escape($newVersion))\][^\r\n]*\r?\n(.*?)(?=\r?\n## \[|\z)")
    $commitBody = if ($secMatch.Success) { $secMatch.Groups[1].Value.Trim() } else { "" }
} else {
    $commitBody = $promoted.Trim()
}
$commitMsg = "chore(release): $tag"
if ($commitBody) {
    $commitMsg += "`n`n$commitBody"
}
$msgFile = "$env:TEMP\djt-release-commit-msg.txt"
$commitMsg | Set-Content -Path $msgFile -Encoding UTF8

Set-Location $root
$dirty = git status --porcelain
if ($dirty) {
    Write-Host "Staging and committing working tree changes..." -ForegroundColor Yellow
    git add -A
    git commit -F $msgFile
    if ($LASTEXITCODE) { throw "git commit failed" }
} else {
    Write-Host "Working tree clean, nothing to commit." -ForegroundColor Gray
}

# ---- Step 9: Tag ----
$existing = git tag -l $tag
if ($existing) {
    Write-Host "Tag $tag already exists locally." -ForegroundColor Yellow
} else {
    git tag $tag
    if ($LASTEXITCODE) { throw "git tag failed" }
}

# ---- Step 10: Push (tolerate auto-tag having created it first) ----
Write-Host "Pushing commits..." -ForegroundColor Gray
git push
if ($LASTEXITCODE) { throw "git push failed" }

$remoteTag = git ls-remote --tags origin $tag
if ($remoteTag) {
    Write-Host "Tag $tag already on remote (auto-tag raced us), skipping tag push." -ForegroundColor Yellow
} else {
    Write-Host "Pushing tag $tag..." -ForegroundColor Gray
    git push origin $tag
    if ($LASTEXITCODE) { throw "git push tag failed" }
}

# ---- Step 11: Wait for release workflow ----
Write-Host "Waiting for Release workflow to finish..." -ForegroundColor Gray
$runId = $null
$maxWait = 900
$elapsed = 0
$since = (Get-Date).ToUniversalTime().AddSeconds(-30)
while ($elapsed -lt $maxWait) {
    $runsJson = gh run list --repo $Repo --workflow=Release --limit 5 --json databaseId,status,headBranch,conclusion,createdAt 2>$null
    $run = ($runsJson | ConvertFrom-Json) | Where-Object { $_.headBranch -eq $tag -and [DateTime]$_.createdAt -ge $since } | Sort-Object createdAt -Descending | Select-Object -First 1
    if ($run) {
        if ($run.status -eq "completed") {
            $runId = $run.databaseId
            if ($run.conclusion -ne "success") {
                throw "Release workflow failed: $($run.conclusion)"
            }
            break
        }
        Write-Host "  workflow running... ($($elapsed)s)"
    } else {
        Write-Host "  waiting for trigger... ($($elapsed)s)"
    }
    Start-Sleep -Seconds 15
    $elapsed += 15
}
if (-not $runId) {
    throw "Release workflow did not complete within ${maxWait}s"
}
Write-Host "Release workflow completed successfully." -ForegroundColor Green

# ---- Step 12: Verify release asset ----
Write-Host "Verifying release $tag..." -ForegroundColor Gray
$release = gh release view $tag --repo $Repo --json tagName,assets 2>$null | ConvertFrom-Json
if (-not $release) {
    throw "Release $tag not found - check https://github.com/$Repo/releases"
}
$assets = @($release.assets | ForEach-Object { $_.name })
Write-Host "Release $tag assets: $($assets -join ', ')" -ForegroundColor Green
Write-Host "=== Done: https://github.com/$Repo/releases/tag/$tag ===" -ForegroundColor Cyan
