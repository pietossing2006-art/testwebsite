<#
.SYNOPSIS
  VxperS Store - Modern Interactive Launcher
#>

param(
  [switch]$Dev,
  [switch]$Stop,
  [switch]$Build
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "⚡ VxperS Store - Control Center"

$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'
$adminplusDir = Join-Path $root 'adminplus'
$stateDir = Join-Path $root '.script-state'
$serverPidFile = Join-Path $stateDir 'server.pid'
$clientPidFile = Join-Path $stateDir 'client.pid'
$adminplusPidFile = Join-Path $stateDir 'adminplus.pid'
$adminplusPort = 3010

if (-not (Test-Path $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}

function Show-Banner {
  Clear-Host
  Write-Host ""
  Write-Host "  ========================================================================" -ForegroundColor Cyan
  Write-Host "    __     __                          ____    _____ _                    " -ForegroundColor Cyan
  Write-Host "    \ \   / /                         / ____| / ____| |                   " -ForegroundColor Cyan
  Write-Host "     \ \_/ /__ _ __   ___ _ __ ___   | (___  | (___ | |_ ___  _ __ ___    " -ForegroundColor Cyan
  Write-Host "      \   / _ \ '_ \ / _ \ '__/ __|   \___ \  \___ \| __/ _ \| '__/ _ \   " -ForegroundColor Cyan
  Write-Host "       | |  __/ |_) |  __/ |  \__ \   ____) | ____) | || (_) | | |  __/   " -ForegroundColor Cyan
  Write-Host "       |_|\___| .__/ \___|_|  |___/  |_____/ |_____/ \__\___/|_|  \___|   " -ForegroundColor Cyan
  Write-Host "              | |                                                         " -ForegroundColor DarkCyan
  Write-Host "              |_|                                                         " -ForegroundColor DarkCyan
  Write-Host "  ========================================================================" -ForegroundColor Cyan
  Write-Host "                   ⚡ MODERN ALL-IN-ONE CONTROL CENTER                    " -ForegroundColor White
  Write-Host "  ========================================================================" -ForegroundColor Cyan
  Write-Host ""
}

function Get-ServiceStatus {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    return @{ Running = $true; Pid = $conn.OwningProcess }
  }
  return @{ Running = $false; Pid = $null }
}

function Show-StatusCards {
  $serverStatus = Get-ServiceStatus -Port 3001
  $clientStatus = Get-ServiceStatus -Port 5173
  if (-not $clientStatus.Running) {
    $clientStatus = Get-ServiceStatus -Port 5000
  }
  if (-not $clientStatus.Running) {
    $clientStatus = Get-ServiceStatus -Port 4173
  }

  $hasGemini = Test-Path (Join-Path $serverDir '.env')

  Write-Host "  ┌── [ SYSTEM STATUS & HEALTH ] ──────────────────────────────────────────┐" -ForegroundColor DarkGray
  
  # Server
  if ($serverStatus.Running) {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[● ONLINE ]" -ForegroundColor Green -NoNewline
    Write-Host "  Backend API Server   : " -NoNewline
    Write-Host "http://localhost:3001" -ForegroundColor Cyan -NoNewline
    Write-Host " (PID: $($serverStatus.Pid))   │" -ForegroundColor DarkGray
  } else {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[○ STOPPED]" -ForegroundColor Red -NoNewline
    Write-Host "  Backend API Server   : " -NoNewline
    Write-Host "Offline (Port 3001)                    │" -ForegroundColor DarkGray
  }

  # Client
  if ($clientStatus.Running) {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[● ONLINE ]" -ForegroundColor Green -NoNewline
    Write-Host "  Web Client (UI)      : " -NoNewline
    Write-Host "http://localhost:5173" -ForegroundColor Cyan -NoNewline
    Write-Host " (PID: $($clientStatus.Pid))   │" -ForegroundColor DarkGray
  } else {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[○ STOPPED]" -ForegroundColor Red -NoNewline
    Write-Host "  Web Client (UI)      : " -NoNewline
    Write-Host "Offline (Port 5173/5000)               │" -ForegroundColor DarkGray
  }

  # Admin+ panel
  $adminplusStatus = Get-ServiceStatus -Port $adminplusPort
  if ($adminplusStatus.Running) {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[● ONLINE ]" -ForegroundColor Green -NoNewline
    Write-Host "  Admin+ Panel         : " -NoNewline
    Write-Host "http://localhost:$adminplusPort" -ForegroundColor Cyan -NoNewline
    Write-Host " (PID: $($adminplusStatus.Pid))   │" -ForegroundColor DarkGray
  } elseif (Test-Path $adminplusDir) {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[○ STOPPED]" -ForegroundColor Red -NoNewline
    Write-Host "  Admin+ Panel         : " -NoNewline
    Write-Host "Offline (Port $adminplusPort)                    │" -ForegroundColor DarkGray
  } else {
    Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
    Write-Host "[○ ABSENT ]" -ForegroundColor DarkGray -NoNewline
    Write-Host "  Admin+ Panel         : " -NoNewline
    Write-Host "adminplus/ not found                   │" -ForegroundColor DarkGray
  }

  # AI Inpaint
  Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
  Write-Host "[● READY  ]" -ForegroundColor Green -NoNewline
  Write-Host "  OpenCV Inpainting    : " -NoNewline
  Write-Host "Dual Navier-Stokes & Telea Engine      │" -ForegroundColor DarkCyan

  # Vision
  Write-Host "  │ " -NoNewline -ForegroundColor DarkGray
  Write-Host "[● READY  ]" -ForegroundColor Green -NoNewline
  Write-Host "  AI Vision Engine     : " -NoNewline
  Write-Host "Google Gemini 2.0 / OpenRouter         │" -ForegroundColor DarkCyan

  Write-Host "  └────────────────────────────────────────────────────────────────────────┘" -ForegroundColor DarkGray
  Write-Host ""
}

function Get-ActiveClientPort {
  if ((Get-ServiceStatus -Port 4173).Running) { return 4173 }
  if ((Get-ServiceStatus -Port 5173).Running) { return 5173 }
  if ((Get-ServiceStatus -Port 5000).Running) { return 5000 }
  return 4173
}

function Stop-AllServices {
  Write-Host "  🛑 Stopping all project services..." -ForegroundColor Yellow
  
  # 1. Stop saved PIDs from state directory
  $pidFiles = @('server.pid', 'client.pid', 'adminplus.pid', 'tunnel.pid')
  foreach ($file in $pidFiles) {
    $full = Join-Path $stateDir $file
    if (Test-Path -LiteralPath $full) {
      $raw = (Get-Content -LiteralPath $full -Raw -ErrorAction SilentlyContinue).Trim()
      $pidVal = 0
      if ([int]::TryParse($raw, [ref]$pidVal)) {
        Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
      }
      Remove-Item -LiteralPath $full -Force -ErrorAction SilentlyContinue
    }
  }

  # 2. Stop processes on specific ports only
  $ports = @(3001, 5173, 5000, 4173, $adminplusPort, 9444)
  foreach ($port in $ports) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($item in $listeners) {
      if ($item.OwningProcess -and $item.OwningProcess -ne $PID) {
        Stop-Process -Id $item.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "     - Stopped process on port $port (PID: $($item.OwningProcess))" -ForegroundColor DarkGray
      }
    }
  }
  Write-Host "  ✅ Project services stopped successfully." -ForegroundColor Green
  Start-Sleep -Milliseconds 600
}

function Start-AllServices {
  param([switch]$DevMode)
  Stop-AllServices

  Write-Host ""
  Write-Host "  🚀 Launching VxperS Store Services..." -ForegroundColor Cyan
  Write-Host "  --------------------------------------------------" -ForegroundColor DarkGray

  $hasAdminplus = Test-Path (Join-Path $adminplusDir 'package.json')
  $totalSteps = if ($hasAdminplus) { 3 } else { 2 }

  # 1. Start Server
  Write-Host "  [1/$totalSteps] Starting Backend Server (Port 3001)..." -ForegroundColor Yellow
  $sScript = Join-Path $serverDir 'run-server.ps1'
  $sMode = if ($DevMode) { 'dev' } else { 'start' }
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$sScript`"", "-Mode", $sMode -WindowStyle Minimized

  # 2. Start Client
  $cMode = if ($DevMode) { 'dev' } else { 'preview' }
  $cPort = if ($DevMode) { 5173 } else { 4173 }
  Write-Host "  [2/$totalSteps] Starting Web Client ($cMode on Port $cPort)..." -ForegroundColor Yellow
  $cScript = Join-Path $clientDir 'run-client.ps1'
  Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$cScript`"", "-Mode", $cMode -WindowStyle Minimized

  # 3. Start Admin+ panel (optional — only when adminplus/ is present)
  if ($hasAdminplus) {
    $aMode = if ($DevMode) { 'dev' } else { 'start' }
    Write-Host "  [3/$totalSteps] Starting Admin+ Panel ($aMode on Port $adminplusPort)..." -ForegroundColor Yellow
    $aScript = Join-Path $adminplusDir 'run-adminplus.ps1'
    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$aScript`"", "-Mode", $aMode -WindowStyle Minimized
  }

  # Wait for services to listen
  Write-Host "  ⏳ Waiting for services to initialize..." -ForegroundColor DarkGray
  $serverReady = $false
  $clientReady = $false
  $adminplusReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (-not $serverReady -and (Get-ServiceStatus -Port 3001).Running) { $serverReady = $true }
    if (-not $clientReady -and ((Get-ServiceStatus -Port 4173).Running -or (Get-ServiceStatus -Port 5173).Running)) { $clientReady = $true }
    if (-not $adminplusReady -and (Get-ServiceStatus -Port $adminplusPort).Running) { $adminplusReady = $true }
    if ($serverReady -and $clientReady -and ($adminplusReady -or -not $hasAdminplus)) { break }
  }

  if ($serverReady) {
    Write-Host "        ✅ Backend Server is ONLINE on http://localhost:3001" -ForegroundColor Green
  } else {
    Write-Host "        ⚠️ Backend Server is still starting up in background..." -ForegroundColor DarkYellow
  }

  $activePort = Get-ActiveClientPort
  if ($clientReady) {
    Write-Host "        ✅ Web Client is ONLINE on http://localhost:$activePort" -ForegroundColor Green
  } else {
    Write-Host "        ⚠️ Web Client is still starting up in background..." -ForegroundColor DarkYellow
  }

  if ($hasAdminplus) {
    if ($adminplusReady) {
      Write-Host "        ✅ Admin+ Panel is ONLINE on http://localhost:$adminplusPort" -ForegroundColor Green
    } else {
      Write-Host "        ⚠️ Admin+ Panel is still starting up in background..." -ForegroundColor DarkYellow
    }
  }

  Write-Host ""
  Write-Host "  ✨ All background services initiated!" -ForegroundColor Green
  Write-Host "  🌐 Opening Web Store in your browser..." -ForegroundColor Cyan
  Start-Sleep -Milliseconds 500
  Start-Process "http://localhost:$activePort"
}

function Open-BrowserPage {
  param([string]$Url)
  $activePort = Get-ActiveClientPort
  $actualUrl = $Url -replace ':5173', ":$activePort" -replace ':4173', ":$activePort"
  Write-Host "  🌐 Opening $actualUrl..." -ForegroundColor Cyan
  Start-Process $actualUrl
}

function Build-Client {
  Write-Host "  📦 Building Client production bundle (npm run build)..." -ForegroundColor Yellow
  Set-Location $clientDir
  npm run build
  Set-Location $root
  Write-Host "  ✅ Build completed successfully!" -ForegroundColor Green
  Write-Host "  Press any key to continue..." -ForegroundColor DarkGray
  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# ── Main Interactive Loop ──
while ($true) {
  Show-Banner
  Show-StatusCards

  Write-Host "  ┌── [ CONTROL MENU ] ──────────────────────────────────────────────────┐" -ForegroundColor DarkCyan
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[1]" -ForegroundColor Yellow -NoNewline; Write-Host " 🚀 Start All Services (Production Preview on Port 4173)       │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[2]" -ForegroundColor Yellow -NoNewline; Write-Host " 🛒 Open VxperS Store (in default browser)                    │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[3]" -ForegroundColor Yellow -NoNewline; Write-Host " ⚡ Start in Full Dev Mode (Live Dev on Port 5173)             │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[4]" -ForegroundColor Yellow -NoNewline; Write-Host " 📦 Rebuild Frontend Bundle (npm run build)                   │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[5]" -ForegroundColor Yellow -NoNewline; Write-Host " 🛑 Stop All Services (Free ports & stop background tasks)    │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[6]" -ForegroundColor Yellow -NoNewline; Write-Host " 🔄 Restart All Services (Clean Reboot)                       │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[7]" -ForegroundColor Yellow -NoNewline; Write-Host " 🛡️  Open Admin+ Panel (Port $adminplusPort)                          │"
  Write-Host "  │  " -NoNewline -ForegroundColor DarkCyan; Write-Host "[0]" -ForegroundColor Red -NoNewline;    Write-Host " 🚪 Exit Launcher                                             │"
  Write-Host "  └──────────────────────────────────────────────────────────────────────┘" -ForegroundColor DarkCyan
  Write-Host ""
  Write-Host "  👉 Select an option (0-7): " -NoNewline -ForegroundColor White

  $choice = Read-Host

  switch ($choice.Trim()) {
    "1" {
      Start-AllServices
      Start-Sleep -Seconds 1
    }
    "2" {
      Open-BrowserPage "http://localhost:4173"
    }
    "3" {
      Start-AllServices -DevMode
      Start-Sleep -Seconds 1
    }
    "4" {
      Build-Client
    }
    "5" {
      Stop-AllServices
      Start-Sleep -Seconds 1
    }
    "6" {
      Stop-AllServices
      Start-AllServices
      Start-Sleep -Seconds 1
    }
    "7" {
      if ((Get-ServiceStatus -Port $adminplusPort).Running) {
        Write-Host "  🛡️  Opening Admin+ Panel..." -ForegroundColor Cyan
        Start-Process "http://localhost:$adminplusPort"
      } else {
        Write-Host "  ⚠️ Admin+ Panel is not running yet — start the services first (option 1 or 3)." -ForegroundColor DarkYellow
        Start-Sleep -Seconds 2
      }
    }
    "0" {
      Write-Host "`n  👋 Goodbye!`n" -ForegroundColor Cyan
      exit 0
    }
    default {
      Write-Host "  ⚠️ Invalid choice, please choose 0-7." -ForegroundColor Red
      Start-Sleep -Seconds 1
    }
  }
}
