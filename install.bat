@echo off
chcp 65001 >nul
title AI Model Switcher - 一键安装

echo ==========================================
echo   AI Model Switcher - 一键安装 (Windows)
echo ==========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 部分功能需要管理员权限，建议右键"以管理员身份运行"
    echo.
)

:: 1. 检查 Node.js
echo [1/4] 检查环境...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js:
    echo   方法一: 打开 https://nodejs.org 下载 LTS 版本安装
    echo   方法二: winget install OpenJS.NodeJS.LTS
    echo.
    choice /c yn /m "是否尝试用 winget 自动安装 Node.js"
    if %errorLevel% equ 1 (
        echo 正在安装 Node.js...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if %errorLevel% neq 0 (
            echo [x] 自动安装失败，请手动安装后重新运行此脚本
            pause
            exit /b 1
        )
        echo [v] Node.js 安装成功
        :: 刷新 PATH
        set "PATH=%PATH%;C:\Program Files\nodejs"
    ) else (
        echo 请安装 Node.js 后重新运行此脚本
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%i in ('node -v') do echo [v] Node.js %%i
)

:: 2. 安装依赖
echo.
echo [2/4] 安装依赖...
if not exist node_modules (
    call npm install
    if %errorLevel% neq 0 (
        echo [x] 依赖安装失败
        pause
        exit /b 1
    )
    echo [v] 依赖安装成功
) else (
    echo [v] 依赖已安装
)

:: 3. 配置 API Key
echo.
echo [3/4] 配置 API Key...
if not exist config.json (
    if exist config.example.json (
        copy config.example.json config.json >nul
        echo [v] 已创建 config.json
    ) else (
        echo [!] 未找到 config.example.json，请手动创建 config.json
    )
) else (
    echo [v] config.json 已存在
)

echo.
echo 请编辑 config.json 填入你的 API Key:
echo   DeepSeek: https://platform.deepseek.com/api_keys
echo   智谱:     https://open.bigmodel.cn/usercenter/apikeys
echo.

:: 4. 注册开机自启
echo [4/4] 开机自启服务...
choice /c yn /m "是否安装开机自启服务"
if %errorLevel% equ 1 (
    node scripts/install-service.js
) else (
    echo [-] 跳过开机自启，稍后可运行: node scripts/install-service.js
)

:: 完成
echo.
echo ==========================================
echo   安装完成!
echo ==========================================
echo.
echo   启动服务:  npm start
echo   管理界面:  http://127.0.0.1:11435/admin
echo   代理地址:  http://127.0.0.1:11435/v1/responses
echo.
echo   配置 Codex: 编辑 %%USERPROFILE%%\.codex\config.toml
echo     base_url = "http://127.0.0.1:11435/v1"
echo.
echo ==========================================

choice /c yn /m "是否立即启动服务"
if %errorLevel% equ 1 (
    echo 正在启动...
    npm start
)

pause
