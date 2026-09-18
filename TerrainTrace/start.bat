@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================================
echo               TerrainTrace Startup
echo ========================================================

REM Free ports 5000, 5001, 5173 if currently occupied
for %%p in (5000 5001 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":%%p .*LISTENING"') do (
        echo Freeing port %%p (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM Setup ML Service venv
if not exist "ml-service\venv\Scripts\python.exe" (
    echo [ML Service] Creating virtual environment...
    python -m venv ml-service\venv
    echo [ML Service] Installing dependencies...
    ml-service\venv\Scripts\pip install -r ml-service\requirements.txt
)

REM Setup Backend dependencies
if not exist "backend\node_modules" (
    echo [Backend] Installing dependencies...
    cd backend && call npm install && cd ..
)

REM Setup Frontend dependencies
if not exist "frontend\node_modules" (
    echo [Frontend] Installing dependencies...
    cd frontend && call npm install && cd ..
)

echo.
echo Launching ML Service (Port 5001)...
start "TerrainTrace - ML Service (5001)" cmd /k "cd ml-service && venv\Scripts\uvicorn main:app --host 127.0.0.1 --port 5001 --reload"

echo Launching Backend API (Port 5000)...
start "TerrainTrace - Backend (5000)" cmd /k "cd backend && npm run dev"

echo Launching Frontend UI (Port 5173)...
start "TerrainTrace - Frontend (5173)" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================================
echo All services launched!
echo - Frontend:   http://localhost:5173
echo - Backend:    http://localhost:5000
echo - ML Service: http://127.0.0.1:5001
echo ========================================================
timeout /t 5 >nul
