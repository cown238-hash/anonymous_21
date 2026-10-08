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

# ENV_FILE tells the server which env file to load, so there is no need to
# overwrite server/.env while the process boots.
if (Test-Path $logFile) { Remove-Item $logFile -Force -ErrorAction SilentlyContinue }
$env:ENV_FILE = '.env.production'
$proc = Start-Process cmd.exe `
  -ArgumentList '/c', "npm start > `"$logFile`" 2>&1" `
  -WorkingDirectory $root `
  -WindowStyle Minimized `
  -PassThru
Set-Content -Path $pidFile -Value $proc.Id -NoNewline

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  try {
    $health = Invoke-RestMethod 'http://localhost:4000/api/ready' -TimeoutSec 2
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
Write-Host '  web      http://localhost:4000'
Write-Host '  api      http://localhost:4000/api'
Write-Host "  database wksl_prod (server/.env.production)"
Write-Host "  pid file $pidFile"
Write-Host "  log      $logFile"
