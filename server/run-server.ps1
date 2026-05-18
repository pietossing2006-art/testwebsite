param(
  [ValidateSet('dev','start')]
  [string]$Mode = 'start',
  [switch]$Install
)

$ErrorActionPreference = 'Stop'

# Error trap to keep window open
trap {
  Write-Host "`n[ERROR] $_" -ForegroundColor Red
  Write-Host "`nPress any key to close this window..." -ForegroundColor Yellow
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

Set-Location -Path $PSScriptRoot

if ($Install) {
  Write-Host '=== Installing server dependencies ==='
  npm install
  if ($LASTEXITCODE -ne 0) { 
    Write-Host "npm install failed" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit $LASTEXITCODE 
  }
}

# Check if node_modules exists
if (-not (Test-Path 'node_modules')) {
  Write-Host "ERROR: node_modules not found. Run with -Install first" -ForegroundColor Red
  Write-Host "Press any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

Write-Host "=== Starting server ($Mode) ===" -ForegroundColor Cyan
Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
Write-Host 'Press Ctrl+C to stop.'

try {
  if ($Mode -eq 'dev') {
    npm run dev
  } else {
    npm run start
  }
  $exitCode = $LASTEXITCODE
} catch {
  Write-Host "Error running server: $_" -ForegroundColor Red
  $exitCode = 1
}

if ($exitCode -ne 0) {
  Write-Host "`nServer exited with code $exitCode" -ForegroundColor Red
  Write-Host "Press any key to close this window..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}

exit $exitCode
