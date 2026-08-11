$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$skillsRoot = Join-Path $repositoryRoot 'skills'
$packagesRoot = Join-Path $repositoryRoot 'packages'
$failed = @()

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

$requiredPackages = @(
    'buyna-merchant-dashboard-ui',
    'buyna-merchant-catalog-core',
    'buyna-cart-core',
    'buyna-order-core',
    'buyna-postgres-merchant-core',
    'buyna-merchant-file-core',
    'buyna-gmv-core'
)
foreach ($packageName in $requiredPackages) {
    $packageRoot = Join-Path $packagesRoot $packageName
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot 'package.json'))) {
        $failed += "$packageName`: missing fixed module package.json"
    }
}

if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All Skills passed repository validation."
