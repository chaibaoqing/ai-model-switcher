#!/bin/bash
# AI Model Switcher 一键安装脚本 (macOS / Linux)
set -e

echo "=========================================="
echo "  AI Model Switcher - 一键安装 (macOS)"
echo "=========================================="
echo ""

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 1. 检查 Node.js
echo "[1/4] 检查环境..."
if command -v node &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"
else
    echo -e "  ${RED}✗${NC} 未检测到 Node.js"
    echo ""
    echo "请先安装 Node.js:"
    echo "  方法一: 打开 https://nodejs.org 下载 LTS 版本安装"
    echo "  方法二 (Homebrew): brew install node"
    echo ""
    read -p "是否尝试用 Homebrew 自动安装? (y/n): " auto_install
    if [[ "$auto_install" =~ ^[Yy]$ ]]; then
        if ! command -v brew &> /dev/null; then
            echo "未检测到 Homebrew，正在安装..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node
        echo -e "  ${GREEN}✓${NC} Node.js 安装成功"
    else
        echo "请安装 Node.js 后重新运行此脚本"
        exit 1
    fi
fi

# 2. 安装依赖
echo ""
echo "[2/4] 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "  ${GREEN}✓${NC} 依赖安装成功"
else
    echo -e "  ${GREEN}✓${NC} 依赖已安装"
fi

# 3. 配置 API Key
echo ""
echo "[3/4] 配置 API Key..."
if [ ! -f "config.json" ]; then
    if [ -f "config.example.json" ]; then
        cp config.example.json config.json
        echo -e "  ${GREEN}✓${NC} 已创建 config.json"
    fi
else
    echo -e "  ${GREEN}✓${NC} config.json 已存在"
fi

echo ""
echo "请编辑 config.json 填入你的 API Key:"
echo "  DeepSeek: https://platform.deepseek.com/api_keys"
echo "  智谱:     https://open.bigmodel.cn/usercenter/apikeys"

# 4. 开机自启
echo ""
echo "[4/4] 开机自启服务..."
read -p "是否安装开机自启服务? (Y/n): " auto_service
if [[ "$auto_service" =~ ^[Nn]$ ]]; then
    echo "  - 跳过，稍后可运行: node scripts/install-service.js"
else
    node scripts/install-service.js
fi

# 完成
echo ""
echo "=========================================="
echo "  安装完成!"
echo "=========================================="
echo ""
echo "  启动服务:  npm start"
echo "  管理界面:  http://127.0.0.1:11435/admin"
echo "  代理地址:  http://127.0.0.1:11435/v1/responses"
echo ""
echo "  配置 Codex: 编辑 ~/.codex/config.toml"
echo "    base_url = \"http://127.0.0.1:11435/v1\""
echo ""
echo "=========================================="

read -p "是否立即启动服务? (Y/n): " auto_start
if [[ ! "$auto_start" =~ ^[Nn]$ ]]; then
    npm start
fi
