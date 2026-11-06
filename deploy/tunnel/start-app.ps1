# Starts the WKSL API + built client in production mode on 127.0.0.1:4000, and
# restarts it if it ever exits. Launched by deploy/tunnel/start-all.ps1 (which
# the Startup folder runs at logon) — see deploy/tunnel/README.md.
#
# ENV_FILE points at the repo-root .env: that is the production file (public
# URL, secrets, limits). DATABASE_URL is deliberately *not* in it —
# docker-compose injects it there — so it is lifted from server/.env, which
# describes the local Postgres this machine runs as a service.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

# Two copies would fight over the port; the one already listening wins.
if (Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host '[wksl] port 4000 is already served — nothing to do'
  exit 0
}

$line = (
  Select-String -Path (Join-Path $root 'server\.env') -Pattern '^DATABASE_URL=' |
    Select-Object -First 1
).Line
if (-not $line) { throw 'DATABASE_URL not found in server/.env' }
$env:DATABASE_URL = $line.Substring('DATABASE_URL='.Length).Trim().Trim('"')

$env:ENV_FILE = '.env'
$env:NODE_ENV = 'production'
$env:PORT     = '4000'

# Task Scheduler and the Startup folder both throw console output away, so keep
# a log next to the repo. One generation of history is plenty.
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log  = Join-Path $logs 'app.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 20MB) { Move-Item -Force $log "$log.1" }

Write-Host "[wksl] serving the app on 127.0.0.1:$env:PORT (log: $log)"
while ($true) {
  node server/dist/index.js *>> $log
  Write-Host "[wksl] server exited (code $LASTEXITCODE) — restarting in 5s"
  Start-Sleep -Seconds 5
}
