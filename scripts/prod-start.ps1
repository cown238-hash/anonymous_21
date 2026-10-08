<#
.SYNOPSIS
  Runs WKSL in production mode against the production database.

.DESCRIPTION
  Serves the built client and the API from one process on :4000, the same way
  `npm start` does in a container. It reads server/.env.production, so the dev
  database and the dev secrets are left alone.

  Kept detached for the same reason as dev-start.ps1: a foreground npm run gets
  killed when the shell it belongs to is recycled.
#>
param(
  [int]$TimeoutSeconds = 40
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.prod-server.pid'
$logFile = Join-Path $root '.prod-server.log'

if (Test-Path $pidFile) {
  $existing = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existing -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)) {
    Write-Host "production server already running (pid $existing)"
    exit 0
  }
  Remove-Item $pidFile -Force
}

$envFile = Join-Path $root 'server\.env.production'
if (-not (Test-Path $envFile)) {
  Write-Host "missing $envFile — copy server/.env.production.example and fill it in" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path (Join-Path $root 'client\dist\index.html'))) {
  Write-Host 'client build missing — run `npm run build` first' -ForegroundColor Yellow
  exit 1
}

# The dev server uses the same port, so this has to be checked before launch.
# Without it the readiness probe below is answered by the dev server and the
# script reports success for a process that actually died on EADDRINUSE.
$port = ([regex]::Match([System.IO.File]::ReadAllText($envFile), '(?m)^PORT\s*=\s*(\d+)')).Groups[1].Value
if (-not $port) { $port = '4000' }
$occupied = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
  Write-Host "port $port is already in use (pid $($occupied[0].OwningProcess))." -ForegroundColor Red
  Write-Host 'The dev server uses the same port. Stop it first:' -ForegroundColor Yellow
  Write-Host '  npm run dev:stop'
  exit 1
}

if (Test-Path $logFile) { Remove-Item $logFile -Force -ErrorAction SilentlyContinue }

# The process must outlive the shell that starts it. Start-Process allocates a
# new console but the child still belongs to the parent's process group, so when
# the shell is recycled the Ctrl+C reaches it and it dies with ^C^C^C in the log.
# Win32_Process.Create has no console and no process-group membership, so the
# server keeps running. `cmd /c start` was tried and does not work — the nested
# quoting means the inner command never runs.
# Win32_Process.Create does not inherit the caller's working directory, so the
# project root has to be set explicitly or npm looks for package.json in System32.
$commandLine = "cmd /c `"cd /d `"$root`" && set ENV_FILE=.env.production && npm start > `"$logFile`" 2>&1`""
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $commandLine }
if ($created.ReturnValue -ne 0) {
  Write-Host "could not start the production server (Win32_Process.Create returned $($created.ReturnValue))" -ForegroundColor Red
  exit 1
}
Set-Content -Path $pidFile -Value $created.ProcessId -NoNewline

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  try {
    $health = Invoke-RestMethod "http://localhost:$port/api/ready" -TimeoutSec 2
    # Confirm it is our process answering, not a leftover server on the port.
    $alive = Get-Process -Id $created.ProcessId -ErrorAction SilentlyContinue
    if (-not $alive) {
      Write-Host 'the production server exited during startup — last log lines:' -ForegroundColor Red
      if (Test-Path $logFile) { Get-Content $logFile -Tail 20 | ForEach-Object { "  $_" } }
      exit 1
    }
    if ($health.data.status -eq 'ready') { $ready = $true; break }
  } catch {
    # not up yet
  }
}

if (-not $ready) {
  Write-Host "production server did not come up within $TimeoutSeconds s — last log lines:" -ForegroundColor Yellow
  if (Test-Path $logFile) { Get-Content $logFile -Tail 20 | ForEach-Object { "  $_" } }
  exit 1
}

Write-Host 'production server ready'
Write-Host "  web      http://localhost:$port"
Write-Host "  api      http://localhost:$port/api"
Write-Host "  database wksl_prod (server/.env.production)"
Write-Host "  pid file $pidFile"
Write-Host "  log      $logFile"
