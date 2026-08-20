param(
  [int]$IntervalSeconds = 300,
  [int]$MaxAttempts = 0,
  [string]$StatusFile = ".resume-after-access-status.json",
  [string]$LogFile = ".resume-after-access-watch.log",
  [switch]$DeployWhenReady,
  [string]$BaseUrl = "https://www.buyna.ai/"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue

if (-not $PnpmCommand) {
  throw "pnpm was not found on PATH. Open a terminal with the project runtime available, then rerun this script."
}

function Quote-ForPowerShell([string]$Value) {
  return "'" + ($Value -replace "'", "''") + "'"
}

$WatchArgs = @(
  "run",
  "resume:watch",
  "--",
  "--interval-seconds",
  [string]$IntervalSeconds,
  "--status-file",
  $StatusFile
)

if ($MaxAttempts -gt 0) {
  $WatchArgs += @("--max-attempts", [string]$MaxAttempts)
}

if ($DeployWhenReady) {
  $WatchArgs += @("--deploy-when-ready", "--base-url", $BaseUrl)
}

$QuotedArgs = ($WatchArgs | ForEach-Object { Quote-ForPowerShell $_ }) -join " "
$Command = @(
  "Set-Location -LiteralPath $(Quote-ForPowerShell $ProjectRoot.Path)",
  "& $(Quote-ForPowerShell $PnpmCommand.Source) $QuotedArgs *> $(Quote-ForPowerShell $LogFile)"
) -join "; "

$Process = Start-Process `
  -FilePath "powershell" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Command) `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started Buyna.ai resume watcher in the background."
Write-Host "Process ID: $($Process.Id)"
Write-Host "Status file: $StatusFile"
Write-Host "Log file: $LogFile"
if ($DeployWhenReady) {
  Write-Host "Deploy when ready: enabled"
  Write-Host "Base URL: $BaseUrl"
} else {
  Write-Host "Deploy when ready: disabled"
}
