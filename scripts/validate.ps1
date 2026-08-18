$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$skillsRoot = Join-Path $repositoryRoot 'skills'
$packagesRoot = Join-Path $repositoryRoot 'packages'
$manifestPath = Join-Path $repositoryRoot 'repository-manifest.json'
$failed = @()
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

Get-ChildItem -Directory -LiteralPath $skillsRoot | ForEach-Object {
    $skillFile = Join-Path $_.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skillFile)) {
        if ((Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force).Count -eq 0) {
            return
        }
        $failed += "$($_.Name): missing SKILL.md"
        return
    }

    $content = [IO.File]::ReadAllText($skillFile, [Text.Encoding]::UTF8)
    if (-not $content.StartsWith("---")) {
        $failed += "$($_.Name): missing YAML frontmatter"
    }
    if ($content -notmatch '(?m)^name:\s*.+$') {
        $failed += "$($_.Name): missing name"
    }
    if ($content -notmatch '(?m)^description:\s*.+$') {
        $failed += "$($_.Name): missing description"
    }
}

$actualSkills = @(Get-ChildItem -Directory -LiteralPath $skillsRoot | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } | ForEach-Object Name | Sort-Object)
$manifestSkills = @($manifest.skills | Sort-Object)
if (Compare-Object $actualSkills $manifestSkills) { $failed += 'repository-manifest skill inventory mismatch' }

$requiredPackages = @($manifest.packages)
foreach ($packageName in $requiredPackages) {
    $packageRoot = Join-Path $packagesRoot $packageName
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'package.json'))) {
        $failed += "$packageName`: missing fixed module package.json"
    }
}
$actualPackages = @(Get-ChildItem -Directory -LiteralPath $packagesRoot | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') } | ForEach-Object Name | Sort-Object)
$manifestPackages = @($manifest.packages | Sort-Object)
if (Compare-Object $actualPackages $manifestPackages) { $failed += 'repository-manifest package inventory mismatch' }

if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All Skills passed repository validation."
