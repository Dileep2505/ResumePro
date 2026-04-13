$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $root '.runtime'
$pidFile = Join-Path $runtimeDir 'dev-pids.json'

if (Test-Path $pidFile) {
  try {
    $state = Get-Content $pidFile -Raw | ConvertFrom-Json
    Write-Output "Saved frontend PID: $($state.frontendPid)"
    Write-Output "Saved backend PID: $($state.backendPid)"
  } catch {
    Write-Output 'PID file exists but could not be parsed.'
  }
} else {
  Write-Output 'No PID file found.'
}

$frontendConn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
$backendConn = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue

if ($frontendConn) {
  $id = ($frontendConn | Select-Object -First 1 -ExpandProperty OwningProcess)
  Write-Output "Port 3000: LISTEN (PID $id)"
} else {
  Write-Output 'Port 3000: not listening'
}

if ($backendConn) {
  $id = ($backendConn | Select-Object -First 1 -ExpandProperty OwningProcess)
  Write-Output "Port 8001: LISTEN (PID $id)"
} else {
  Write-Output 'Port 8001: not listening'
}

try {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 3).StatusCode
  Write-Output "URL 3000: HTTP $code"
} catch {
  Write-Output 'URL 3000: unreachable'
}

try {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8001/docs' -TimeoutSec 3).StatusCode
  Write-Output "URL 8001 (/docs): HTTP $code"
} catch {
  Write-Output 'URL 8001 (/docs): unreachable'
}
