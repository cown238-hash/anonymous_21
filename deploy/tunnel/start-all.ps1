# Starts the app and the tunnel as two hidden background processes. This is
# what the Startup-folder entry runs at logon — see deploy/tunnel/README.md.
#
# Both children keep themselves alive, so this script returns immediately.
# Run it by hand any time the site is down: nothing here needs admin rights.

$here = $PSScriptRoot
foreach ($child in 'start-app.ps1', 'start-tunnel.ps1') {
  $path = Join-Path $here $child
  if (-not (Test-Path $path)) { throw "missing script: $path" }
  Write-Host "[wksl] launching $child"
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $path
  )
}
