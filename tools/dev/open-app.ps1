$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$startScript = Join-Path $PSScriptRoot 'start-dev.ps1'
$statusScript = Join-Path $PSScriptRoot 'status-dev.ps1'
$frontendUrl = 'http://127.0.0.1:3000/resume%20analyzer.html'
$backendUrl = 'http://127.0.0.1:8001/resume%20analyzer.html'

if (-not (Test-Path $startScript)) {
  throw "Missing script: $startScript"
}

function Get-UrlStatusCode {
  param([string]$Url)

  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3).StatusCode
  } catch {
    return $null
  }
}

function Wait-UrlReady {
  param(
    [string]$Url,
    [int]$Attempts = 10,
    [int]$DelayMs = 500
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    $code = Get-UrlStatusCode -Url $Url
    if ($code -ge 200 -and $code -lt 500) {
      return $true
    }

    if ($i -lt $Attempts) {
      [System.Threading.Thread]::Sleep($DelayMs)
    }
  }

  return $false
}

& $startScript

$frontendReady = Wait-UrlReady -Url $frontendUrl -Attempts 16 -DelayMs 500
$backendReady = Wait-UrlReady -Url $backendUrl -Attempts 12 -DelayMs 500

if (-not ($frontendReady -or $backendReady)) {
  # One recovery retry in case another process briefly held ports during first start.
  & $startScript
  $frontendReady = Wait-UrlReady -Url $frontendUrl -Attempts 16 -DelayMs 500
  $backendReady = Wait-UrlReady -Url $backendUrl -Attempts 12 -DelayMs 500
}

& $statusScript

if ($frontendReady) {
  Start-Process $frontendUrl
  Write-Output "Opened: $frontendUrl"
  exit 0
}

if ($backendReady) {
  Start-Process $backendUrl
  Write-Output "Opened fallback: $backendUrl"
  exit 0
}

throw 'ResumePro services are still unreachable after automatic retries.'
