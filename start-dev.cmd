@echo off
REM Quant Flow Viz - start local dev server (ASCII only to avoid codepage issues)
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found in PATH. Install Node.js 20+ first.
  pause
  exit /b 1
)

if not exist "node_modules\vite\bin\vite.js" (
  echo [1/2] Installing dependencies with npm ci ...
  call npm ci
  if errorlevel 1 (
    echo [ERROR] npm ci failed.
    pause
    exit /b 1
  )
) else (
  echo [1/2] Dependencies already present, skip install.
)

echo [2/2] Starting dev server at http://127.0.0.1:5178/
echo       Press Ctrl+C to stop.
echo.
call npm run dev

echo.
echo Server stopped.
pause
