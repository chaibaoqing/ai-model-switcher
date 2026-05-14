@echo off
title AI Model Switcher - Install

echo ==========================================
echo   AI Model Switcher - Install (Windows)
echo ==========================================
echo.

:: 1. Check Node.js
echo [1/3] Checking environment...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js not found
    echo.
    echo Please install Node.js LTS: https://nodejs.org
    echo Then re-run this script.
    echo.
    goto :done
)
for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js %%i

:: 2. Install dependencies
echo.
echo [2/3] Installing dependencies...
call npm install
if %errorLevel% neq 0 (
    echo [FAIL] npm install failed
    goto :done
)
echo [OK] Dependencies installed

:: 3. Config
echo.
echo [3/3] Configuration...
if not exist config.json (
    if exist config.example.json (
        copy config.example.json config.json >nul
        echo [OK] config.json created
    ) else (
        echo [!] config.example.json not found
    )
) else (
    echo [OK] config.json already exists
)

:: Done
echo.
echo ==========================================
echo   Install complete!
echo ==========================================
echo.
echo   Web UI:    http://127.0.0.1:11435/admin
echo   Stop:      npm run stop
echo.
echo   Fill in API Keys in Web UI or config.json
echo ==========================================
echo.

:: Start service in background and open browser
choice /c yn /m "Start service now? (y/n)"
if %errorLevel% equ 1 (
    echo Starting service in background...
    call npm run start:bg
    timeout /t 3 /nobreak >nul
    start "" "http://127.0.0.1:11435/admin"
)

:done
echo.
pause
