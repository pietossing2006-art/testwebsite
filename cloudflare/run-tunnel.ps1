param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.yml')
)

$ErrorActionPreference = 'Stop'

trap {
  Write-Host "`n[ERROR] $_" -ForegroundColor Red
  Write-Host "`nPress any key to close this window..." -ForegroundColor Yellow
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
  exit 1
}

$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflared) {
  Write-Host 'cloudflared not found. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  $token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_TUNNEL_TOKEN')
  if ($token) {
    Write-Host '=== Starting Cloudflare Tunnel (token) ===' -ForegroundColor Cyan
    & $cloudflared.Source tunnel run --token $token
    exit $LASTEXITCODE
  }

  $example = Join-Path $PSScriptRoot 'config.example.yml'
  Write-Host "Missing tunnel config: $ConfigPath" -ForegroundColor Red
  Write-Host "Copy $example to config.yml, set credentials-file, or set CLOUDFLARE_TUNNEL_TOKEN." -ForegroundColor Yellow
  exit 1
}

Write-Host '=== Starting Cloudflare Tunnel ===' -ForegroundColor Cyan
Write-Host "Config: $ConfigPath"
Write-Host 'Public URLs: https://www.vxpers.com · https://api.vxpers.com · https://key.vxpers.com'
Write-Host 'Press Ctrl+C to stop.'

& $cloudflared.Source tunnel --config $ConfigPath run
exit $LASTEXITCODE
