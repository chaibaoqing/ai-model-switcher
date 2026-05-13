# AI Model Switcher

让 Codex CLI / Desktop 无缝使用 DeepSeek、智谱 GLM 等模型。

Codex 使用 OpenAI Responses API 协议，而 DeepSeek 只提供 Chat Completions API，智谱 GLM 提供 Anthropic Messages API。本项目在本地启动一个统一代理，自动翻译协议，支持一键切换模型。

## 架构

```
客户端 ──Responses API──▶ AI Model Switcher :11435 ─┬─ Chat API ──▶ api.deepseek.com
                                                      └─ Anthropic ──▶ open.bigmodel.cn
```

## 特性

- **协议翻译**：Responses API ↔ Chat Completions / Anthropic Messages 双向转换
- **多模型支持**：DeepSeek、智谱 GLM，可扩展更多
- **Web 管理界面**：三栏布局，浏览器中切换模型、查看余额和用量统计
- **账户余额**：实时显示各供应商账户余额
- **用量统计**：Token 消耗追踪、每供应商统计、7 天趋势图、请求历史
- **工具调用**：完整支持 function calling，连贯执行不中断
- **开机自启**：macOS LaunchAgent / Windows Task Scheduler
- **跨平台**：支持 macOS 和 Windows
- **流式输出**：SSE 实时翻译，体验与原生一致

## 前置条件

- Node.js >= 18（一键安装脚本会自动检测）
- 至少一个模型的 API Key

## 快速安装

### Windows

**方式一：一键安装（推荐）**

1. 安装 [Node.js](https://nodejs.org) LTS 版本
2. 从 [GitHub Releases](https://github.com/chaibaoqing/ai-model-switcher/releases) 下载最新版，或克隆仓库：
   ```bash
   git clone https://github.com/chaibaoqing/ai-model-switcher.git
   cd ai-model-switcher
   ```
3. 双击 `install.bat`，按提示操作

**方式二：手动安装**

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
npm install
copy config.example.json config.json
# 编辑 config.json 填入 API Key
npm start
```

### macOS

**方式一：一键安装（推荐）**

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
chmod +x install.sh
./install.sh
```

**方式二：手动安装**

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
npm install
cp config.example.json config.json
# 编辑 config.json 填入 API Key
npm start
```

**方式三：配置向导**

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
npm install
node scripts/setup-wizard.js
```

### 没有 Git？

去 [GitHub 页面](https://github.com/chaibaoqing/ai-model-switcher) 点 **Code → Download ZIP**，解压后进入目录。

## 获取 API Key

| 供应商 | 申请地址 | 说明 |
|--------|----------|------|
| DeepSeek | https://platform.deepseek.com/api_keys | 注册后在 API Keys 页面创建 |
| 智谱 GLM | https://open.bigmodel.cn/usercenter/apikeys | 注册后在 API Keys 页面创建 |

## 配置

编辑 `config.json`：

```json
{
  "activeProvider": "deepseek",
  "mainPort": 11435,
  "providers": {
    "deepseek": {
      "name": "DeepSeek",
      "apiKey": "你的DeepSeek API Key",
      "baseUrl": "https://api.deepseek.com",
      "model": "deepseek-v4-flash",
      "wireApi": "chat",
      "port": 21435
    },
    "zhipu": {
      "name": "ZhiPu GLM",
      "apiKey": "你的智谱 API Key",
      "baseUrl": "https://open.bigmodel.cn/api/anthropic/v1/messages",
      "model": "glm-5.1",
      "wireApi": "anthropic",
      "port": 21436
    }
  }
}
```

也可以启动后打开 Web 管理界面在线配置。

## 配置 Codex

编辑 Codex 配置文件：

- **macOS**: `~/.codex/config.toml`
- **Windows**: `%USERPROFILE%\.codex\config.toml`

```toml
model_provider = "custom"
model = "auto"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "Model Switcher"
wire_api = "responses"
requires_openai_auth = false
base_url = "http://127.0.0.1:11435/v1"
stream_idle_timeout_ms = 300000
```

## Web 管理界面

浏览器打开 http://127.0.0.1:11435/admin

- **左栏**：模型供应商管理，切换模型、配置 API Key
- **中栏**：用量概览（总用量 / DeepSeek / 智谱）、7 天趋势图、最近请求记录
- **右栏**：账户余额、各供应商详细统计

## CLI 命令

```bash
# 启动代理
npm start

# 安装开机自启服务
node scripts/install-service.js

# 卸载服务
node scripts/uninstall-service.js

# 运行配置向导 (macOS)
node scripts/setup-wizard.js
```

## 支持的模型

| 供应商 | 模型 | API 协议 | 特点 |
|--------|------|----------|------|
| DeepSeek | deepseek-v4-flash | Chat Completions | 高性价比 |
| DeepSeek | deepseek-v4-pro | Chat Completions | 更强推理 |
| 智谱 | glm-5.1 | Anthropic Messages | 套餐量大 |

## 添加新供应商

编辑 `config.json`，在 `providers` 下添加新条目：

```json
{
  "name": "My Provider",
  "apiKey": "your-key",
  "baseUrl": "https://api.example.com",
  "model": "model-name",
  "wireApi": "chat",
  "port": 11437
}
```

支持的 `wireApi` 值：
- `chat` — OpenAI Chat Completions API
- `anthropic` — Anthropic Messages API

## 项目结构

```
ai-model-switcher/
├── src/
│   ├── server.js        # 核心代理服务
│   ├── config.js         # 配置管理
│   ├── translator.js     # SSE 协议翻译器
│   ├── usage.js          # 用量统计
│   └── cli.js            # CLI 入口
├── scripts/
│   ├── platform/
│   │   ├── index.js      # 平台抽象层
│   │   ├── mac.js         # macOS 实现
│   │   └── win.js         # Windows 实现
│   ├── install-service.js # 安装开机自启
│   ├── uninstall-service.js
│   ├── setup-wizard.js    # 配置向导
│   └── tray.js            # 菜单栏工具 (macOS)
├── public/
│   ├── index.html         # Web 管理界面
│   ├── deepseek.svg       # DeepSeek Logo
│   └── zhipu.svg          # 智谱 Logo
├── config.example.json    # 示例配置
├── install.bat            # Windows 一键安装
├── install.sh             # macOS 一键安装
└── package.json
```

## License

MIT
