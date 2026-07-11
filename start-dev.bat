@echo off
cd /d "%~dp0"
title Jin Game World - Local Dev Server

echo ============================================
echo    Jin Game World - Local Dev Server
echo ============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js first: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] First run: installing dependencies...
  echo.
  call npm install
  echo.
)

echo Starting dev server...
echo   - This PC : a browser opens automatically.
echo   - iPad    : open the "Network" URL below in Safari (same Wi-Fi).
echo.
echo To stop: press Ctrl+C or just close this window.
echo ============================================
echo.

call npm run dev -- --host --open

echo.
echo Server stopped.
pause
