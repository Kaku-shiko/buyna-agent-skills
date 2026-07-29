param(
  [string]$Profile = "codex-deploy",
  [string]$Region = "ap-northeast-1"
)

$ErrorActionPreference = "Stop"
$aws = Get-Command aws -ErrorAction SilentlyContinue
if (-not $aws) {
  $fallback = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  if (-not (Test-Path -LiteralPath $fallback)) {
    throw "AWS CLI is not installed or not available on PATH."
  }
  $awsPath = $fallback
} else {
  $awsPath = $aws.Source
}

& $awsPath sts get-caller-identity `
  --profile $Profile `
  --region $Region `
  --output json

if ($LASTEXITCODE -ne 0) {
  throw "AWS identity verification failed for profile '$Profile'."
}
