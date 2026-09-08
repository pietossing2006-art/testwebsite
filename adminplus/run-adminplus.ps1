param(
  [ValidateSet('dev','start')]
  [string]$Mode = 'dev',
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
  $PID | Out-File -FilePath (Join-Path $stateDir 'adminplus.pid') -Encoding utf8 -Force
}

$port = 3010

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nextCli = Join-Path $PSScriptRoot 'node_modules\next\dist\bin\next'
if (-not $nodeCommand) {
  Write-Host "ERROR: Node.js is required to start Admin+." -ForegroundColor Red
  exit 1
}
$nodeExe = $nodeCommand.Source

if ($Install) {
  Write-Host '=== Installing Admin+ dependencies ==='
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "npm install failed" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path -LiteralPath $nextCli)) {
  Write-Host "ERROR: adminplus/node_modules not found. Run with -Install first." -ForegroundColor Red
  Write-Host "Press any key to exit..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

if ($Mode -eq 'dev') {
  Write-Host "=== Starting Admin+ dev server (Port $port) ===" -ForegroundColor Cyan
  Write-Host "Working Directory: $(Get-Location)" -ForegroundColor Gray
  Write-Host 'Press Ctrl+C to stop.'
  try {
    & $nodeExe $nextCli dev -H 0.0.0.0 -p $port
    $exitCode = $LASTEXITCODE
  } catch {
    Write-Host "Error running Admin+ dev server: $_" -ForegroundColor Red
    $exitCode = 1
  }
  if ($exitCode -ne 0) {
    Write-Host "`nAdmin+ dev server exited with code $exitCode" -ForegroundColor Red
    Write-Host "Press any key to close this window..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  }
  exit $exitCode
}

# start (production) mode — next build writes BUILD_ID last, so it marks a usable build
$buildExists = Test-Path (Join-Path $PSScriptRoot '.next\BUILD_ID')
if ($Build -or (-not $buildExists -and -not $SkipBuild)) {
  Write-Host '=== Building Admin+ (next build) ===' -ForegroundColor Cyan
  try {
    & $nodeExe $nextCli build
    $exitCode = $LASTEXITCODE
  } catch {
    Write-Host "Error building Admin+: $_" -ForegroundColor Red
    $exitCode = 1
  }
  if ($exitCode -ne 0) {
    Write-Host "Build failed" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit $exitCode
  }
} else {
  Write-Host '=== Using existing Admin+ build in .next/ ===' -ForegroundColor Cyan
}

Write-Host "=== Starting Admin+ server (Port $port) ===" -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop.'

try {
  & $nodeExe $nextCli start -H 0.0.0.0 -p $port
  $exitCode = $LASTEXITCODE
} catch {
  Write-Host "Error running Admin+: $_" -ForegroundColor Red
  $exitCode = 1
}

if ($exitCode -ne 0) {
  Write-Host "`nAdmin+ exited with code $exitCode" -ForegroundColor Red
  Write-Host "Press any key to close this window..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}

exit $exitCode
