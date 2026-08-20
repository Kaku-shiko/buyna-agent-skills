param(
    [ValidateSet('User', 'Project')]
    [string]$Scope = 'User',
    [string]$ProjectPath = (Get-Location).Path,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sourceRoot = Join-Path $repositoryRoot 'skills'
$moduleSourceRoot = Join-Path $repositoryRoot 'packages'
$manifest = Get-Content -Raw -LiteralPath (Join-Path $repositoryRoot 'repository-manifest.json') | ConvertFrom-Json

if ($Scope -eq 'User') {
    $destinationRoot = Join-Path $env:USERPROFILE '.codex\skills'
    $moduleDestinationRoot = Join-Path $env:USERPROFILE '.codex\packages'
} else {
    $resolvedProjectPath = [IO.Path]::GetFullPath($ProjectPath)
    $destinationRoot = Join-Path $resolvedProjectPath '.agents\skills'
    $moduleDestinationRoot = Join-Path $resolvedProjectPath 'packages'
}

New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
New-Item -ItemType Directory -Path $moduleDestinationRoot -Force | Out-Null

$obsoleteSkills = @('buyna-project-framework')
foreach ($obsoleteSkill in $obsoleteSkills) {
    $obsoletePath = Join-Path $destinationRoot $obsoleteSkill
    if (Test-Path -LiteralPath $obsoletePath) {
        $resolvedRoot = [IO.Path]::GetFullPath($destinationRoot).TrimEnd('\') + '\'
        $resolvedObsolete = [IO.Path]::GetFullPath($obsoletePath)
        if (-not $resolvedObsolete.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove an obsolete Skill outside the installation root: $resolvedObsolete"
        }
        Remove-Item -LiteralPath $resolvedObsolete -Recurse -Force
        Write-Host "Removed obsolete Skill: $obsoleteSkill"
    }
}

@($manifest.skills) | ForEach-Object {
    $skillName = [string]$_
    $source = Join-Path $sourceRoot $skillName
    $destination = Join-Path $destinationRoot $skillName

    if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md'))) {
        if ((Get-ChildItem -LiteralPath $source -Recurse -File -Force).Count -eq 0) {
            return
        }
        throw "Invalid Skill: $skillName is missing SKILL.md"
    }
    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        throw "Skill already exists: $destination. Use -Force to update installed Skills."
    }

    if ((Test-Path -LiteralPath $destination) -and $Force) {
        $resolvedRoot = [IO.Path]::GetFullPath($destinationRoot).TrimEnd('\') + '\'
        $resolvedDestination = [IO.Path]::GetFullPath($destination)
        if (-not $resolvedDestination.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to replace a Skill outside the installation root: $resolvedDestination"
        }
        Remove-Item -LiteralPath $resolvedDestination -Recurse -Force
    }

    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    Write-Host "Installed: $skillName"
}

@($manifest.packages) | ForEach-Object {
    $moduleName = [string]$_
    $source = Join-Path $moduleSourceRoot $moduleName
    $destination = Join-Path $moduleDestinationRoot $moduleName

    if (-not (Test-Path -LiteralPath (Join-Path $source 'package.json'))) {
        throw "Invalid fixed module: $moduleName is missing package.json"
    }
    if ((Test-Path -LiteralPath $destination) -and -not $Force) {
        throw "Fixed module already exists: $destination. Use -Force to update installed modules."
    }
    if ((Test-Path -LiteralPath $destination) -and $Force) {
        $resolvedRoot = [IO.Path]::GetFullPath($moduleDestinationRoot).TrimEnd('\') + '\'
        $resolvedDestination = [IO.Path]::GetFullPath($destination)
        if (-not $resolvedDestination.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to replace a fixed module outside the module root: $resolvedDestination"
        }
        Remove-Item -LiteralPath $resolvedDestination -Recurse -Force
    }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    Write-Host "Installed fixed module: $moduleName"
}

Write-Host ""
Write-Host "Installation complete: $destinationRoot"
Write-Host "Fixed modules: $moduleDestinationRoot"
Write-Host 'Restart Codex or open a new task, then invoke $buyna-website-builder.'
