$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$python = Join-Path $root 'venv\Scripts\python.exe'
$runtimeDir = Join-Path $root '.runtime'
$pidFile = Join-Path $runtimeDir 'dev-pids.json'

if (-not (Test-Path $python)) {
  throw "Python runtime not found at $python"
}

if (-not (Test-Path $runtimeDir)) {
  New-Item -ItemType Directory -Path $runtimeDir | Out-Null
}

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

Stop-PortProcess -Port 3000
Stop-PortProcess -Port 8001

$frontendOut = Join-Path $runtimeDir 'frontend.out.log'
$frontendErr = Join-Path $runtimeDir 'frontend.err.log'
$backendOut = Join-Path $runtimeDir 'backend.out.log'
$backendErr = Join-Path $runtimeDir 'backend.err.log'

function Start-CheckedProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string[]]$Arguments,
    [string]$StdOut,
    [string]$StdErr
  )

  $proc = Start-Process -FilePath $python `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -PassThru `
    -RedirectStandardOutput $StdOut `
    -RedirectStandardError $StdErr

  Wait-Process -Id $proc.Id -Timeout 2 -ErrorAction SilentlyContinue
  $stillRunning = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
  if (-not $stillRunning) {
    $errorText = ''
    if (Test-Path $StdErr) {
      $errorText = (Get-Content $StdErr -Raw -ErrorAction SilentlyContinue)
    }
    throw "$Name failed to stay running. Check $StdErr. $errorText"
  }

  return $proc
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$Attempts = 12,
    [int]$DelayMs = 500
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $status = (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3).StatusCode
      if ($status -ge 200 -and $status -lt 500) {
        return $status
      }
    } catch {
      # Service may still be starting; continue retry loop.
    }

    if ($i -lt $Attempts) {
      [System.Threading.Thread]::Sleep($DelayMs)
    }
  }

  return $null
}

$frontendProc = Start-CheckedProcess `
  -Name 'Frontend server' `
  -WorkingDirectory (Join-Path $root 'frontend\\webapp') `
  -Arguments @('-m', 'http.server', '3000') `
  -StdOut $frontendOut `
  -StdErr $frontendErr

$backendProc = Start-CheckedProcess `
  -Name 'Backend server' `
  -WorkingDirectory $root `
  -Arguments @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8001') `
  -StdOut $backendOut `
  -StdErr $backendErr

$state = [ordered]@{
  startedAt = (Get-Date).ToString('s')
  frontendPid = $frontendProc.Id
  backendPid = $backendProc.Id
  frontendUrl = 'http://127.0.0.1:3000/resume%20analyzer.html'
  backendUrl = 'http://127.0.0.1:8001/resume%20analyzer.html'
  logs = [ordered]@{
    frontendStdout = $frontendOut
    frontendStderr = $frontendErr
    backendStdout = $backendOut
    backendStderr = $backendErr
  }
}

$state | ConvertTo-Json | Set-Content -Encoding UTF8 $pidFile

Write-Output "Frontend started on port 3000 (PID $($frontendProc.Id))"
Write-Output "Backend started on port 8001 (PID $($backendProc.Id))"
Write-Output "Open: http://127.0.0.1:3000/resume%20analyzer.html"
Write-Output "If 3000 is unavailable, open: http://127.0.0.1:8001/resume%20analyzer.html"
Write-Output "PID file: $pidFile"

$frontendStatus = Wait-HttpReady -Url 'http://127.0.0.1:3000/'
if ($frontendStatus) {
  Write-Output "Frontend health: HTTP $frontendStatus"
} else {
  Write-Output "Frontend health: UNREACHABLE"
}

$backendStatus = Wait-HttpReady -Url 'http://127.0.0.1:8001/docs'
if ($backendStatus) {
  Write-Output "Backend health: HTTP $backendStatus"
} else {
  Write-Output "Backend health: UNREACHABLE"
}
