# Dev stack starter: API server & web client.
# Uses the same client/server launch flow as start-server-and-client.ps1.

param(
  [switch]$Install,
  [ValidateSet('dev', 'preview')]
  [string]$ClientMode = 'preview',
  [ValidateSet('dev', 'start')]
  [string]$ServerMode = 'dev',
  [switch]$Build
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'
$serverScript = Join-Path $serverDir 'run-server.ps1'
$clientScript = Join-Path $clientDir 'run-client.ps1'
$stateDir = Join-Path $root '.script-state'
$serverPidFile = Join-Path $stateDir 'server.pid'
$clientPidFile = Join-Path $stateDir 'client.pid'

function Stop-ProcessTree {
  param(
    [int]$RootPid,
    [string]$Label,
    [string]$Reason
  )

  if (-not $RootPid -or $RootPid -le 0 -or $RootPid -eq $PID) { return }

  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $RootPid" -ErrorAction SilentlyContinue)
  foreach ($child in $children) {
    Stop-ProcessTree -RootPid ([int]$child.ProcessId) -Label $Label -Reason $Reason
  }

  $proc = Get-Process -Id $RootPid -ErrorAction SilentlyContinue
  if ($proc) {
    Write-Host "Stopping $Label process (PID: $RootPid) - $Reason"
    Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 120
    $stillAlive = Get-Process -Id $RootPid -ErrorAction SilentlyContinue
    if ($stillAlive) {
      cmd /c "taskkill /PID $RootPid /T /F >nul 2>&1" | Out-Null
    }
  }
}

function Stop-ManagedProcess {
  param(
    [string]$PidFile,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $PidFile)) { return }

  $raw = (Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
  $pidValue = 0
  if (-not [int]::TryParse($raw, [ref]$pidValue)) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    return
  }

  $existing = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Stopping previous $Label window (PID: $pidValue)..."
    Stop-ProcessTree -RootPid $pidValue -Label $Label -Reason 'previous script PID'
  }

  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ManagedWindowsByScriptPath {
  param(
    [string]$ScriptPath,
    [string]$Label
  )

  $escapedPath = [Regex]::Escape($ScriptPath)
  $rows = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" -ErrorAction SilentlyContinue)
  foreach ($row in $rows) {
    $cmd = [string]$row.CommandLine
    $pidValue = [int]$row.ProcessId
    if (-not $cmd -or $pidValue -eq $PID) { continue }
    if ($cmd -match $escapedPath) {
      Stop-ProcessTree -RootPid $pidValue -Label $Label -Reason 'previous script window'
    }
  }
}

function Stop-ProcessOnPort {
  param(
    [int]$Port,
    [string]$Label
  )

  if ($Port -le 0) { return }

  for ($attempt = 1; $attempt -le 3; $attempt++) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) { return }

    $owners = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
      if (-not $ownerPid -or $ownerPid -eq $PID) { continue }
      $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
      if (-not $proc) { continue }
      Write-Host "Port $Port is busy by PID $ownerPid ($($proc.ProcessName)) - stopping for $Label..."
      Stop-ProcessTree -RootPid ([int]$ownerPid) -Label $Label -Reason "freeing port $Port"
    }

    Start-Sleep -Milliseconds 250
  }
}

function Get-LanIPv4 {
  @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Select-Object -ExpandProperty IPAddress -Unique)
}

$hasServerDeps = Test-Path (Join-Path $serverDir 'node_modules')
$hasClientDeps = Test-Path (Join-Path $clientDir 'node_modules')

if ((-not $hasServerDeps -or -not $hasClientDeps) -and -not $Install) {
  Write-Host 'Missing dependencies!' -ForegroundColor Red
  if (-not $hasServerDeps) { Write-Host '  - server/node_modules not found' }
  if (-not $hasClientDeps) { Write-Host '  - client/node_modules not found' }
  Write-Host ''
  Write-Host 'Run: .\start-dev.ps1 -Install' -ForegroundColor Yellow
  Write-Host ''
  pause
  exit 1
}

if ($Install) {
  Write-Host '=== Installing Server ===' -ForegroundColor Cyan
  Set-Location $serverDir
  npm install
  Write-Host '=== Installing Client ===' -ForegroundColor Cyan
  Set-Location $clientDir
  npm install
  Set-Location $root
}

$installFlag = if ($Install) { '-Install' } else { '' }
$buildFlag = if ($Build) { '-Build' } else { '' }
$clientPort = if ($ClientMode -eq 'dev') { 5173 } else { 4173 }
$clientUrl = "http://localhost:$clientPort"

if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
}

Stop-ManagedProcess -PidFile $serverPidFile -Label 'server'
Stop-ManagedProcess -PidFile $clientPidFile -Label 'client'
Stop-ManagedWindowsByScriptPath -ScriptPath $serverScript -Label 'server'
Stop-ManagedWindowsByScriptPath -ScriptPath $clientScript -Label 'client'

Stop-ProcessOnPort -Port 3001 -Label 'server'
Stop-ProcessOnPort -Port $clientPort -Label 'client'
Stop-ProcessOnPort -Port 5173 -Label 'client-dev'
Stop-ProcessOnPort -Port 4173 -Label 'client-preview'

Write-Host '=== Starting Dev Stack ===' -ForegroundColor Green
Write-Host "- ServerMode: $ServerMode"
Write-Host "- ClientMode: $ClientMode (port $clientPort)"
Write-Host "Server: http://localhost:3001"
Write-Host "Client: $clientUrl"
foreach ($ip in Get-LanIPv4) {
  Write-Host "LAN client: http://${ip}:$clientPort" -ForegroundColor Cyan
}
Write-Host 'Press any key to stop all services...' -ForegroundColor Yellow
Write-Host ''

$serverArgs = "-NoExit -ExecutionPolicy Bypass -File `"$serverScript`" -Mode $ServerMode $installFlag"
$clientArgs = "-NoExit -ExecutionPolicy Bypass -File `"$clientScript`" -Mode $ClientMode $installFlag $buildFlag"

$serverProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $serverArgs -WorkingDirectory $serverDir -PassThru
Start-Sleep -Seconds 2
$clientProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $clientArgs -WorkingDirectory $clientDir -PassThru

Set-Content -LiteralPath $serverPidFile -Value $serverProc.Id
Set-Content -LiteralPath $clientPidFile -Value $clientProc.Id

Write-Host "Server PID: $($serverProc.Id)"
Write-Host "Client PID: $($clientProc.Id)"
Write-Host ''

pause

Write-Host "`nStopping services..." -ForegroundColor Yellow
Stop-ProcessTree -RootPid $serverProc.Id -Label 'server' -Reason 'script exit'
Stop-ProcessTree -RootPid $clientProc.Id -Label 'client' -Reason 'script exit'

Remove-Item -LiteralPath $serverPidFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $clientPidFile -Force -ErrorAction SilentlyContinue

Write-Host 'Done!' -ForegroundColor Green
