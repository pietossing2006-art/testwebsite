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

# Setup logging
$root = $PSScriptRoot
$logFile = Join-Path $root '.script-state\start.log'
function Write-Log {
  param([string]$Message, [string]$Level = 'INFO')
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $logEntry = "[$timestamp] [$Level] $Message"
  Add-Content -Path $logFile -Value $logEntry -ErrorAction SilentlyContinue
  if ($Level -eq 'ERROR') { Write-Host $Message -ForegroundColor Red }
  elseif ($Level -eq 'SUCCESS') { Write-Host $Message -ForegroundColor Green }
  else { Write-Host $Message }
}

# Ensure log directory exists
$logDir = Split-Path $logFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
Write-Log "=== Starting script ==="
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

# Check if sub-scripts exist
if (-not (Test-Path -LiteralPath $serverScript)) {
  Write-Error "Server script not found: $serverScript"
  exit 1
}
if (-not (Test-Path -LiteralPath $clientScript)) {
  Write-Error "Client script not found: $clientScript"
  exit 1
}

if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
}

Stop-ManagedProcess -PidFile $serverPidFile -Label 'server'
Stop-ManagedProcess -PidFile $clientPidFile -Label 'client'
Stop-ManagedWindowsByScriptPath -ScriptPath $serverScript -Label 'server'
Stop-ManagedWindowsByScriptPath -ScriptPath $clientScript -Label 'client'

Stop-ProcessOnPort -Port $ServerPort -Label 'server'
Stop-ProcessOnPort -Port $clientPort -Label 'client'

Write-Log 'Starting server and client in separate PowerShell windows...' 'SUCCESS'
Write-Log "ServerMode: $ServerMode"
Write-Log "ClientMode: $ClientMode"
Write-Log "Server Port: $ServerPort"
Write-Log "Client Port: $clientPort"

# Determine PowerShell executable (prefer pwsh if available, fallback to powershell)
$pwshPath = Get-Command 'pwsh' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
$psPath = if ($pwshPath) { $pwshPath } else { 'powershell.exe' }
Write-Log "Using PowerShell: $psPath"

$serverArgs = "-ExecutionPolicy", "Bypass", "-File", $serverScript, "-Mode", $ServerMode
if ($Install) { $serverArgs += "-Install" }

$clientArgs = "-ExecutionPolicy", "Bypass", "-File", $clientScript, "-Mode", $ClientMode
if ($Install) { $clientArgs += "-Install" }
if ($Build) { $clientArgs += "-Build" }

# Check if node_modules exists (common cause of immediate exit)
$serverNodeModules = Join-Path $root 'server\node_modules'
$clientNodeModules = Join-Path $root 'client\node_modules'
$missingDeps = $false
if (-not (Test-Path $serverNodeModules)) {
  Write-Log 'ERROR: server/node_modules not found' 'ERROR'
  $missingDeps = $true
}
if (-not (Test-Path $clientNodeModules)) {
  Write-Log 'ERROR: client/node_modules not found' 'ERROR'
  $missingDeps = $true
}
if ($missingDeps) {
  Write-Log "`nDependencies missing! Run one of these:" 'ERROR'
  Write-Log "  1. .\start-server-and-client.ps1 -Install" 'INFO'
  Write-Log "  2. cd server; npm install; cd ..; cd client; npm install" 'INFO'
  Write-Log "`nPress any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

try {
  $serverProc = Start-Process -FilePath $psPath -ArgumentList $serverArgs -WorkingDirectory (Join-Path $root 'server') -PassThru -ErrorAction Stop
  Write-Log "Server started (PID: $($serverProc.Id))" 'SUCCESS'
} catch {
  Write-Log "Failed to start server: $_" 'ERROR'
  Write-Log "Press any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}
Start-Sleep -Seconds 2

try {
  $clientProc = Start-Process -FilePath $psPath -ArgumentList $clientArgs -WorkingDirectory (Join-Path $root 'client') -PassThru -ErrorAction Stop
  Write-Log "Client started (PID: $($clientProc.Id))" 'SUCCESS'
} catch {
  Write-Log "Failed to start client: $_" 'ERROR'
  Write-Log "Press any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

Set-Content -LiteralPath $serverPidFile -Value $serverProc.Id
Set-Content -LiteralPath $clientPidFile -Value $clientProc.Id

Write-Log "`nBoth processes started successfully!" 'SUCCESS'
Write-Log "Server PID saved to: $serverPidFile"
Write-Log "Client PID saved to: $clientPidFile"
Write-Log "Log file: $logFile"
Write-Log "`nTo stop: Close the PowerShell windows or run this script again"
Write-Log "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
