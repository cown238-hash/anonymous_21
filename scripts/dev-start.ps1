<#
.SYNOPSIS
  Starts the Nimbus dev server detached from this shell.

.DESCRIPTION
  Running `npm run dev` in the foreground is the wrong shape for this harness:
  the shell is recycled periodically, the kill signal reaches the process group,
  and both halves die with STATUS_CONTROL_C_EXIT (3221225786). The server is
  therefore launched through Win32_Process.Create, which gives it no console and
  no place in this shell's process group, so a Ctrl+C here cannot take it down.

  This script also writes .dev-server.pid so dev:stop can target exactly this
  project. Killing "all node.exe" is never correct — it takes unrelated work on
  the machine with it.
#>
param(
  [int]$TimeoutSeconds = 40
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.dev-server.pid'
$logFile = Join-Path $root '.dev-server.log'

if (Test-Path $pidFile) {
  $existing = Get-Content $pidFile -ErrorAction SilentlyContinue
  if ($existing -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)) {
    Write-Host "dev server already running (pid $existing)"
    exit 0
  }
  Remove-Item $pidFile -Force
}

if (Test-Path $logFile) { Remove-Item $logFile -Force }

Write-Host 'starting dev server (detached)…'
# Win32_Process.Create, not Start-Process: the child must have no console and no
# membership in this shell's process group. Start-Process allocates a window but
# the child stays in the parent's group, so the Ctrl+C that arrives when the
# shell is recycled kills the server too.
$created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create `
  -Arguments @{ CommandLine = "cmd /c `"cd /d `"$root`" && npm run dev > `"$logFile`" 2>&1`"" }
if ($created.ReturnValue -ne 0) {
  Write-Host "could not start the dev server (Win32_Process.Create returned $($created.ReturnValue))" -ForegroundColor Red
  exit 1
}

Set-Content -Path $pidFile -Value $created.ProcessId -NoNewline

# Wait for the API to answer rather than sleeping a fixed amount.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$apiUp = $false
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  try {
    $health = Invoke-RestMethod 'http://localhost:4000/api/health' -TimeoutSec 2
    if ($health.data.status -eq 'ok') { $apiUp = $true; break }
  } catch {
    # not up yet
  }
}

if (-not $apiUp) {
  Write-Host "dev server did not come up within $TimeoutSeconds s — last log lines:" -ForegroundColor Yellow
  if (Test-Path $logFile) { Get-Content $logFile -Tail 20 | ForEach-Object { "  $_" } }
  exit 1
}

Write-Host "dev server ready"
Write-Host "  web      http://localhost:5173"
Write-Host "  api      http://localhost:4000/api"
Write-Host "  pid file $pidFile"
Write-Host "  log      $logFile"
