# Simple dev server starter that works with right-click Run with PowerShell
# This script stays open and waits for both processes

param([switch]$Install)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$stateDir = Join-Path $root '.script-state'
if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir | Out-Null }

# Check dependencies
$hasServerDeps = Test-Path (Join-Path $root 'server\node_modules')
$hasClientDeps = Test-Path (Join-Path $root 'client\node_modules')

if (-not $hasServerDeps -or -not $hasClientDeps) {
    Write-Host "Missing dependencies!" -ForegroundColor Red
    if (-not $hasServerDeps) { Write-Host "  - server/node_modules not found" }
    if (-not $hasClientDeps) { Write-Host "  - client/node_modules not found" }
    Write-Host ""
    Write-Host "Run: .\start-dev.ps1 -Install" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

# Kill any existing processes on ports
function Stop-PortProcess($Port) {
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}
Stop-PortProcess 3001
Stop-PortProcess 5173
Stop-PortProcess 4173

$serverDir = Join-Path $root 'server'
$clientDir = Join-Path $root 'client'

# Install if requested
if ($Install) {
    Write-Host "=== Installing Server ===" -ForegroundColor Cyan
    Set-Location $serverDir
    npm install
    Write-Host "=== Installing Client ===" -ForegroundColor Cyan
    Set-Location $clientDir
    npm install
    Set-Location $root
}

Write-Host "=== Starting Servers ===" -ForegroundColor Green
Write-Host "Server: http://localhost:3001"
Write-Host "Client: http://localhost:5173"
Write-Host "Press Ctrl+C to stop both servers`n"

# Start both processes with visible windows
$serverProc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', "cd '$serverDir'; npm run dev" -PassThru
Start-Sleep -Seconds 3
$clientProc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', "cd '$clientDir'; npm run dev" -PassThru

# Save PIDs
$serverProc.Id | Out-File (Join-Path $stateDir 'server.pid')
$clientProc.Id | Out-File (Join-Path $stateDir 'client.pid')

Write-Host "Server PID: $($serverProc.Id)"
Write-Host "Client PID: $($clientProc.Id)"
Write-Host ""
Write-Host "Both servers are running in separate windows."
Write-Host "Press any key to stop both servers..." -ForegroundColor Yellow

# Wait for key press
pause

# Cleanup
Write-Host "`nStopping servers..." -ForegroundColor Yellow
Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $clientProc.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done!" -ForegroundColor Green
