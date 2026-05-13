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
- **配置向导**：交互式引导首次配置，一条命令搞定
- **流式输出**：SSE 实时翻译，体验与原生一致

## 前置条件

- Node.js >= 18
- 至少一个模型的 API Key

## 快速开始

### 方式一：配置向导（推荐）

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
npm install
node scripts/setup-wizard.js
```

向导会引导你完成 API Key 配置、默认模型选择、客户端连接和开机自启。

### 方式二：手动配置

### 1. 克隆并安装

```bash
git clone https://github.com/chaibaoqing/ai-model-switcher.git
cd ai-model-switcher
npm install
```

### 2. 配置

复制示例配置并填入 API Key：

```bash
cp config.example.json config.json
```

编辑 `config.json`，填入你的 API Key。也可以通过 Web 管理界面配置。

### 3. 启动

```bash
npm start
```

输出：

```
==================================================
  AI Model Switcher v1.1.0
==================================================
  主入口: http://127.0.0.1:11435/v1/responses
  管理界面: http://127.0.0.1:11435/admin

  [deepseek] DeepSeek (deepseek-v4-flash) ✓ ← 默认
  [zhipu] ZhiPu GLM (glm-5.1) ✓

==================================================
```

### 4. 配置客户端

编辑 `~/.codex/config.toml`：

```toml
model_provider = "custom"
model = "deepseek-v4-flash"

[model_providers.custom]
name = "Model Switcher"
wire_api = "responses"
requires_openai_auth = false
base_url = "http://127.0.0.1:11435/v1"
stream_idle_timeout_ms = 300000
```

## Web 管理界面

浏览器打开 `http://127.0.0.1:11435/admin`，三栏布局：

- **左栏**：模型供应商管理，切换模型、配置 API Key
- **中栏**：用量概览、7 天趋势图、最近请求记录
- **右栏**：账户余额、各供应商详细统计

## CLI 命令

```bash
# 启动代理
ai-model-switcher start
# 或 npm start

# 运行配置向导
ai-model-switcher setup

# 安装开机自启服务
ai-model-switcher install

# 卸载服务
ai-model-switcher uninstall
```

## 开机自启

```bash
node scripts/install-service.js
```

卸载：

```bash
node scripts/uninstall-service.js
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
  "providers": {
    "my-provider": {
      "name": "My Provider",
      "apiKey": "your-key",
      "baseUrl": "https://api.example.com",
      "model": "model-name",
      "wireApi": "chat",
      "port": 11437
    }
  }
}
```

支持的 `wireApi` 值：
- `chat` — OpenAI Chat Completions API
- `anthropic` — Anthropic Messages API

## 技术细节

核心是 `SseTranslator` 类，将上游 SSE 事件翻译为客户端期望的 Responses API 事件格式。关键事件包括：

- `response.created` / `response.in_progress`
- `response.output_text.delta` / `response.output_text.done`
- `response.function_call_arguments.delta` / `response.function_call_arguments.done`
- `response.output_item.added` / `response.output_item.done`
- `response.completed`

## License

MIT
