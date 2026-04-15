$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root '.runtime'
$pidFile = Join-Path $runtimeDir 'dev-pids.json'

function Stop-PortProcess {
  param([int]$Port)

  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) { return }

  $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($id in $pids) {
    if ($id -and $id -ne 0) {
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
    }
  }
}

if (Test-Path $pidFile) {
  try {
    $state = Get-Content $pidFile -Raw | ConvertFrom-Json
    foreach ($id in @($state.frontendPid, $state.backendPid)) {
      if ($id) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    Write-Output 'Could not parse PID file; falling back to port-based stop.'
  }
}

Stop-PortProcess -Port 3000
Stop-PortProcess -Port 8001

if (Test-Path $pidFile) {
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Output 'Stopped dev servers on ports 3000 and 8001.'
