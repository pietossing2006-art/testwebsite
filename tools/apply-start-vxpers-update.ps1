param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'

for ($attempt = 0; $attempt -lt 120; $attempt++) {
  try {
    Move-Item -LiteralPath $Source -Destination $Destination -Force
    exit 0
  } catch [System.IO.IOException] {
    Start-Sleep -Seconds 1
  }
}

exit 1
