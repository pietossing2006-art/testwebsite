param(
  [ValidateSet('dev','start')]
  [string]$ServerMode = 'dev',
  [ValidateSet('dev','preview')]
  [string]$ClientMode = 'preview',
  [int]$ServerPort = 3001,
  [int]$ClientDevPort = 5173,
  [int]$ClientPreviewPort = 4173,
  [switch]$Install,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$serverScript = Join-Path $root 'server\run-server.ps1'
$clientScript = Join-Path $root 'client\run-client.ps1'
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

      $ownerInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
      $parentPid = if ($ownerInfo) { [int]$ownerInfo.ParentProcessId } else { 0 }
      if ($parentPid -gt 0 -and $parentPid -ne $PID) {
        Stop-ProcessTree -RootPid $parentPid -Label $Label -Reason "freeing port $Port (parent process)"
      }
    }

    Start-Sleep -Milliseconds 250
  }
}

$installFlag = if ($Install) { '-Install' } else { '' }
$buildFlag = if ($Build) { '-Build' } else { '' }
$clientPort = if ($ClientMode -eq 'dev') { $ClientDevPort } else { $ClientPreviewPort }

if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
}

Stop-ManagedProcess -PidFile $serverPidFile -Label 'server'
Stop-ManagedProcess -PidFile $clientPidFile -Label 'client'
Stop-ManagedWindowsByScriptPath -ScriptPath $serverScript -Label 'server'
Stop-ManagedWindowsByScriptPath -ScriptPath $clientScript -Label 'client'

Stop-ProcessOnPort -Port $ServerPort -Label 'server'
Stop-ProcessOnPort -Port $clientPort -Label 'client'

Write-Host 'Starting server and client in separate PowerShell windows...'
Write-Host "- ServerMode: $ServerMode"
Write-Host "- ClientMode: $ClientMode"

$serverArgs = "-NoExit -ExecutionPolicy Bypass -File `"$serverScript`" -Mode $ServerMode $installFlag"
$clientArgs = "-NoExit -ExecutionPolicy Bypass -File `"$clientScript`" -Mode $ClientMode $installFlag $buildFlag"

$serverProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $serverArgs -WorkingDirectory (Join-Path $root 'server') -PassThru
$clientProc = Start-Process -FilePath 'powershell.exe' -ArgumentList $clientArgs -WorkingDirectory (Join-Path $root 'client') -PassThru

Set-Content -LiteralPath $serverPidFile -Value $serverProc.Id
Set-Content -LiteralPath $clientPidFile -Value $clientProc.Id
