# Runs the Cloudflare Tunnel that publishes 127.0.0.1:4000 as
# https://app.wksl.site, restarting it if it exits. Launched by
# deploy/tunnel/start-all.ps1 — see deploy/tunnel/README.md.
#
# The tunnel's config and credentials live outside the repo, in
# %USERPROFILE%\.cloudflared\, because they are machine-specific and secret.

$ErrorActionPreference = 'Stop'

$config = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if (-not (Test-Path $config)) { throw "tunnel config not found: $config" }

if (Get-Process cloudflared -ErrorAction SilentlyContinue) {
  Write-Host '[wksl] cloudflared is already running — nothing to do'
  exit 0
}

# A process started at logon can inherit a stale PATH, so fall back to where
# the installer puts the binary.
$bin = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $bin) {
  $candidate = Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'
  if (Test-Path $candidate) { $bin = $candidate }
}
if (-not $bin) { throw 'cloudflared.exe not found on PATH' }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$log  = Join-Path $logs 'tunnel.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 20MB) { Move-Item -Force $log "$log.1" }

Write-Host "[wksl] publishing app.wksl.site through the tunnel (log: $log)"
while ($true) {
  & $bin tunnel --config $config --logfile $log run wksl
  Write-Host "[wksl] cloudflared exited (code $LASTEXITCODE) — restarting in 5s"
  Start-Sleep -Seconds 5
}
