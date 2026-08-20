$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$skillsRoot = Join-Path $repositoryRoot 'skills'
$packagesRoot = Join-Path $repositoryRoot 'packages'
$manifestPath = Join-Path $repositoryRoot 'repository-manifest.json'
$projectBuilderRoot = Join-Path $repositoryRoot '.agents\skills\buyna-website-builder'
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

foreach ($profileProperty in $manifest.profiles.PSObject.Properties) {
    $profileName = $profileProperty.Name
    $profile = $profileProperty.Value
    foreach ($skillName in @($profile.skills)) {
        if ($manifestSkills -notcontains $skillName) {
            $failed += "profile $profileName references missing Skill: $skillName"
        }
    }
    foreach ($packageName in @($profile.packages)) {
        if ($manifestPackages -notcontains $packageName) {
            $failed += "profile $profileName references missing fixed module: $packageName"
        }
    }
}

$canonicalBuilderRoot = Join-Path $skillsRoot 'buyna-website-builder'
if (-not (Test-Path -LiteralPath $projectBuilderRoot)) {
    $failed += '.agents project Builder is missing'
} else {
    $canonicalBuilderFiles = @(Get-ChildItem -LiteralPath $canonicalBuilderRoot -Recurse -File | ForEach-Object {
        $_.FullName.Substring($canonicalBuilderRoot.Length).TrimStart('\')
    } | Sort-Object)
    $projectBuilderFiles = @(Get-ChildItem -LiteralPath $projectBuilderRoot -Recurse -File | ForEach-Object {
        $_.FullName.Substring($projectBuilderRoot.Length).TrimStart('\')
    } | Sort-Object)
    if (Compare-Object $canonicalBuilderFiles $projectBuilderFiles) {
        $failed += '.agents project Builder file inventory differs from canonical Builder'
    } else {
        foreach ($relativePath in $canonicalBuilderFiles) {
            $canonicalHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $canonicalBuilderRoot $relativePath)).Hash
            $projectHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $projectBuilderRoot $relativePath)).Hash
            if ($canonicalHash -ne $projectHash) {
                $failed += ".agents project Builder differs from canonical Builder: $relativePath"
            }
        }
    }
}

if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All Skills and fixed modules passed repository validation."
