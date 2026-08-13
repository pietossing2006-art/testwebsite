param([switch]$Install)

# PowerShell script to start VxperS Manga OCR FastAPI Server on port 9444
Set-Location -Path $PSScriptRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Starting VxperS Manga OCR & AI Translation Server (9444)  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    if ($Install) {
        Write-Host "Installing MangaOCR dependencies..." -ForegroundColor Yellow
        python -m pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    Write-Host "Using Python executable..." -ForegroundColor Yellow
    python -m uvicorn main:app --host 127.0.0.1 --port 9444 --reload
    exit $LASTEXITCODE
}

$launcher = Get-Command py -ErrorAction SilentlyContinue
if ($launcher) {
    py -3 --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        if ($Install) {
            Write-Host "Installing MangaOCR dependencies..." -ForegroundColor Yellow
            py -3 -m pip install -r requirements.txt
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }
        Write-Host "Using Python launcher..." -ForegroundColor Yellow
        py -3 -m uvicorn main:app --host 127.0.0.1 --port 9444 --reload
        exit $LASTEXITCODE
    }
}

Write-Host "Python 3.11 or 3.12 is required. Install it, then run: py -3 -m pip install -r requirements.txt" -ForegroundColor Red
exit 1
