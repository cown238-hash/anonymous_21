# Keeps the WKSL deployment alive.
#
# start-app.ps1 and start-tunnel.ps1 each restart their own child forever, but
# each is a *single* PowerShell process: if Windows ends one (Modern Standby, a
# console-session cleanup, a crash) nothing brings it back and the site stays
# down until the next logon. This watchdog checks every two minutes and starts
# start-all.ps1 through WMI when either supervisor is missing. WMI is deliberate
# — the supervisors it creates are owned by WmiPrvSE, not by this process, so
# this watchdog restarting or dying does not take them with it.
#
# The guards inside start-app.ps1 / start-tunnel.ps1 make a redundant launch
# harmless (they exit when the port is already served / cloudflared is already
# running), so the watchdog can fire freely.
#
# Started at logon by the Startup folder shortcut — see README.md.

$ErrorActionPreference = 'SilentlyContinue'

# Two watchdog copies would race each other; the first one owns the name.
$mutex = New-Object System.Threading.Mutex($false, 'Global\WKSLWatchdog')
if (-not $mutex.WaitOne(0)) { exit 0 }

$root     = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logs     = Join-Path $root 'logs'
$log      = Join-Path $logs 'watchdog.log'
$startAll = Join-Path $root 'deploy\tunnel\start-all.ps1'

New-Item -ItemType Directory -Force -Path $logs | Out-Null
if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item -Force $log "$log.1" }

function Write-Log([string]$message) {
  Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $message)
}

Write-Log "watchdog started (pid $PID)"

# At logon the Startup entries launch start-all.ps1 at the same time as this
# script; give it a moment so the first check does not race it into a second
# supervisor on the same port.
Start-Sleep -Seconds 30

while ($true) {
  $shells   = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'"
  $appSup   = @($shells | Where-Object { $_.CommandLine -match 'start-app\.ps1' })
  $tunSup   = @($shells | Where-Object { $_.CommandLine -match 'start-tunnel\.ps1' })
  $appUp    = @(Get-NetTCPConnection -LocalPort 4000 -State Listen)
  $tunnelUp = @(Get-Process cloudflared)

  # Both halves matter. A live child with no supervisor (an orphan that Windows
  # left behind) is still serving traffic, so leave it alone — the guard inside
  # start-*.ps1 would refuse to adopt it anyway, and relaunching every cycle
  # would just churn. Start-all only once the child is *gone*: then a fresh
  # supervisor takes over. The supervisor check also covers the 5-second
  # restart window, when the port is briefly free but a supervisor exists.
  $needApp    = ($appUp.Count    -eq 0) -and ($appSup.Count   -eq 0)
  $needTunnel = ($tunnelUp.Count -eq 0) -and ($tunSup.Count   -eq 0)

  if ($needApp -or $needTunnel) {
    Write-Log ('nothing is serving (app missing={0}, tunnel missing={1}) — launching start-all.ps1' -f $needApp, $needTunnel)
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startAll`""
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
    Write-Log ("launch returned $($result.ReturnValue)")
  }
  else {
    # Heartbeat: its last line is the timestamp of the moment the watchdog was
    # killed, which is exactly what is needed after an unexplained outage.
    Write-Log ('ok (app {0}/{1}, tunnel {2}/{3})' -f $appUp.Count, $appSup.Count, $tunnelUp.Count, $tunSup.Count)
  }

  Start-Sleep -Seconds 120
}
