param(
    [ValidateSet('User', 'Project')]
    [string]$Scope = 'User',
    [string]$ProjectPath = (Get-Location).Path,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sourceRoot = Join-Path $repositoryRoot 'skills'

if ($Scope -eq 'User') {
    $destinationRoot = Join-Path $env:USERPROFILE '.codex\skills'
} else {
    $destinationRoot = Join-Path ([IO.Path]::GetFullPath($ProjectPath)) '.agents\skills'
}

New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null

Get-ChildItem -Directory -LiteralPath $sourceRoot | ForEach-Object {
    $skillName = $_.Name
    $source = $_.FullName
    $destination = Join-Path $destinationRoot $skillName

    if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) {
        throw "Invalid Skill: $skillName is missing SKILL.md"
    }
    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        throw "Skill already exists: $destination. Use -Force to update installed Skills."
    }

    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    Write-Host "Installed: $skillName"
}

Write-Host ""
Write-Host "Installation complete: $destinationRoot"
Write-Host 'Restart Codex or open a new task, then invoke $buyna-website-builder.'

