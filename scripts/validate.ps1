$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$skillsRoot = Join-Path $repositoryRoot 'skills'
$failed = @()

Get-ChildItem -Directory -LiteralPath $skillsRoot | ForEach-Object {
    $skillFile = Join-Path $_.FullName 'SKILL.md'
    if (-not (Test-Path -LiteralPath $skillFile)) {
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

if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host "All Skills passed repository validation."

