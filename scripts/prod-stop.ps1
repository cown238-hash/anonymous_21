<#
.SYNOPSIS
  Stops only the WKSL production server started by prod-start.ps1.

.DESCRIPTION
  Mirrors dev-stop.ps1: targets the recorded process tree, never every node.exe
  on the machine.
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root '.prod-server.pid'

if (-not (Test-Path $pidFile)) {
  Write-Host 'no pid file — nothing started by prod-start.ps1 is running'
  exit 0
}

$rootPid = [int](Get-Content $pidFile -Raw)
if (-not (Get-Process -Id $rootPid -ErrorAction SilentlyContinue)) {
  Write-Host "pid $rootPid is not running; clearing pid file"
  Remove-Item $pidFile -Force
  exit 0
}

function Get-DescendantProcessIds([int]$ParentId) {
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentId" -ErrorAction SilentlyContinue
  $result = @()
  foreach ($child in $children) {
    $result += Get-DescendantProcessIds $child.ProcessId
    $result += $child.ProcessId
  }
  return $result
}

$targets = @(Get-DescendantProcessIds $rootPid) + $rootPid
Write-Host "stopping $($targets.Count) process(es) rooted at $rootPid"

foreach ($id in ($targets | Sort-Object -Descending)) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'production server stopped'
