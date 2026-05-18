param(
  [ValidateSet('dev','preview')]
  [string]$Mode = 'preview',
  [switch]$Install,
  [switch]$Build
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
  Write-Host '=== Installing client dependencies ==='
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

if ($Mode -eq 'dev') {
  Write-Host '=== Starting client dev server ===' -ForegroundColor Cyan
  Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
  Write-Host 'Press Ctrl+C to stop.'
  try {
    npm run dev
    $exitCode = $LASTEXITCODE
  } catch {
    Write-Host "Error running dev server: $_" -ForegroundColor Red
    $exitCode = 1
  }
  if ($exitCode -ne 0) {
    Write-Host "`nDev server exited with code $exitCode" -ForegroundColor Red
    Write-Host "Press any key to close this window..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  }
  exit $exitCode
}

# preview mode
Write-Host '=== Building client ===' -ForegroundColor Cyan
try {
  npm run build
  $exitCode = $LASTEXITCODE
} catch {
  Write-Host "Error building client: $_" -ForegroundColor Red
  $exitCode = 1
}
if ($exitCode -ne 0) { 
  Write-Host "Build failed" -ForegroundColor Red
  Write-Host "Press any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit $exitCode 
}

Write-Host '=== Starting client preview server ===' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop.'

try {
  npm run preview
  $exitCode = $LASTEXITCODE
} catch {
  Write-Host "Error running preview: $_" -ForegroundColor Red
  $exitCode = 1
}

if ($exitCode -ne 0) {
  Write-Host "`nPreview server exited with code $exitCode" -ForegroundColor Red
  Write-Host "Press any key to close this window..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}

exit $exitCode
