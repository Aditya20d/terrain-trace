param (
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "       Starting TerrainTrace Stack        " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Terminate existing processes on ports 5000, 5001, 5173
$targetPorts = @(5000, 5001, 5173)
foreach ($port in $targetPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            Write-Host "Freeing port $port (Killing PID $($conn.OwningProcess))..." -ForegroundColor Yellow
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

# 1. Setup / Check ML Service
$mlDir = Join-Path $rootDir "ml-service"
Write-Host "`n[1/3] Setting up and starting ML Service (Port 5001)..." -ForegroundColor Yellow

if (-not (Test-Path (Join-Path $mlDir "venv"))) {
    Write-Host "Creating Python virtual environment in ml-service..." -ForegroundColor Gray
    python -m venv (Join-Path $mlDir "venv")
    $Install = $true
}

if ($Install) {
    Write-Host "Installing ML Service Python dependencies..." -ForegroundColor Gray
    & (Join-Path $mlDir "venv\Scripts\pip.exe") install -r (Join-Path $mlDir "requirements.txt")
}

# 2. Setup / Check Backend
$backendDir = Join-Path $rootDir "backend"
Write-Host "`n[2/3] Checking Backend (Port 5000)..." -ForegroundColor Yellow
if ($Install -or -not (Test-Path (Join-Path $backendDir "node_modules"))) {
    Write-Host "Installing backend npm packages..." -ForegroundColor Gray
    Start-Process -Wait -NoNewWindow -FilePath "npm.cmd" -ArgumentList "install" -WorkingDirectory $backendDir
}

# 3. Setup / Check Frontend
$frontendDir = Join-Path $rootDir "frontend"
Write-Host "`n[3/3] Checking Frontend (Port 5173)..." -ForegroundColor Yellow
if ($Install -or -not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "Installing frontend npm packages..." -ForegroundColor Gray
    Start-Process -Wait -NoNewWindow -FilePath "npm.cmd" -ArgumentList "install" -WorkingDirectory $frontendDir
}

Write-Host "`nLaunching all 3 services in separate windows..." -ForegroundColor Green

# Launch ML Service
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$mlDir'; Write-Host '--- ML Service (Port 5001) ---' -ForegroundColor Magenta; .\venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 5001 --reload"

# Launch Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host '--- Backend API (Port 5000) ---' -ForegroundColor Cyan; npm run dev"

# Launch Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; Write-Host '--- Frontend Vite Server (Port 5173) ---' -ForegroundColor Green; npm run dev"

Write-Host "`nAll services started!" -ForegroundColor Green
Write-Host "- Frontend:   http://localhost:5173" -ForegroundColor Cyan
Write-Host "- Backend:    http://localhost:5000" -ForegroundColor Cyan
Write-Host "- ML Service: http://127.0.0.1:5001" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
