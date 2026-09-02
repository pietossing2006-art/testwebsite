param(
  [ValidateSet('dev','preview')]
  [string]$Mode = 'preview',
  [switch]$Install,
  [switch]$Build,
  [switch]$SkipBuild
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

$stateDir = Join-Path (Split-Path $PSScriptRoot -Parent) '.script-state'
if (Test-Path $stateDir) {
  $PID | Out-File -FilePath (Join-Path $stateDir 'client.pid') -Encoding utf8 -Force
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$viteCli = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
if (-not $nodeCommand -or -not (Test-Path -LiteralPath $viteCli)) {
  Write-Host "ERROR: Node.js or the local Vite dependency is missing. Restore client dependencies first." -ForegroundColor Red
  exit 1
}
$nodeExe = $nodeCommand.Source

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
  Write-Host '=== Starting client dev server (Port 5173) ===' -ForegroundColor Cyan
  Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
  Write-Host 'Press Ctrl+C to stop.'
  try {
    & $nodeExe $viteCli --host 0.0.0.0 --port 5173
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
$distExists = Test-Path (Join-Path $PSScriptRoot 'dist\index.html')
if ($Build -or (-not $distExists -and -not $SkipBuild)) {
  Write-Host '=== Building client (vite build) ===' -ForegroundColor Cyan
  try {
    & $nodeExe $viteCli build
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
} else {
  Write-Host '=== Using existing client build in dist/ ===' -ForegroundColor Cyan
}

Write-Host '=== Starting client preview server (Port 4173) ===' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop.'

try {
  & $nodeExe $viteCli preview --host 0.0.0.0 --port 4173
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
