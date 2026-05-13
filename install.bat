@echo off
title AI Model Switcher - Install

echo ==========================================
echo   AI Model Switcher - Install (Windows)
echo ==========================================
echo.

:: 1. Check Node.js
echo [1/4] Checking environment...
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
echo [2/4] Installing dependencies...
call npm install
if %errorLevel% neq 0 (
    echo [FAIL] npm install failed
    goto :done
)
echo [OK] Dependencies installed

:: 3. Config
echo.
echo [3/4] Configuration...
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
echo.
echo Edit config.json, fill in your API Keys:
echo   DeepSeek: https://platform.deepseek.com/api_keys
echo   ZhiPu:    https://open.bigmodel.cn/usercenter/apikeys
echo.

:: 4. Auto start service
echo [4/4] Auto-start service...
choice /c yn /m "Install auto-start service? (y/n)"
if %errorLevel% equ 1 (
    node scripts\install-service.js
    if %errorLevel% neq 0 (
        echo [FAIL] Service install failed
    )
) else (
    echo [SKIP] You can run later: node scripts\install-service.js
)

:: Done
echo.
echo ==========================================
echo   Install complete!
echo ==========================================
echo.
echo   Start:     npm start
echo   Web UI:    http://127.0.0.1:11435/admin
echo   Proxy:     http://127.0.0.1:11435/v1/responses
echo.
echo   Codex config: edit %%USERPROFILE%%\.codex\config.toml
echo     base_url = "http://127.0.0.1:11435/v1"
echo.
echo ==========================================

choice /c yn /m "Start service now? (y/n)"
if %errorLevel% equ 1 (
    echo Starting...
    call npm start
)

:done
echo.
pause
