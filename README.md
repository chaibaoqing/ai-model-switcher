# Codex Model Switcher

让 Codex CLI / Desktop 无缝使用 DeepSeek、智谱 GLM 等模型。

Codex 使用 OpenAI Responses API 协议，而 DeepSeek 只提供 Chat Completions API，智谱 GLM 提供 Anthropic Messages API。本项目在本地启动一个统一代理，自动翻译协议，支持一键切换模型。

## 架构

```
Codex 客户端 ──Responses API──▶ codex-model-switcher :11435 ─┬─ Chat API ──▶ api.deepseek.com
                                                              └─ Anthropic ──▶ open.bigmodel.cn
```

## 特性

- **协议翻译**：Responses API ↔ Chat Completions / Anthropic Messages 双向转换
- **多模型支持**：DeepSeek、智谱 GLM，可扩展更多
- **Web 管理界面**：浏览器中切换模型、配置 API Key
- **工具调用**：完整支持 function calling，连贯执行不中断
- **开机自启**：macOS LaunchAgent，关掉终端也不影响
- **流式输出**：SSE 实时翻译，体验与原生一致

## 前置条件

- Node.js >= 18
- 至少一个模型的 API Key

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/你的用户名/codex-model-switcher.git
cd codex-model-switcher
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
  Codex Model Switcher v1.0.0
==================================================
  主入口: http://127.0.0.1:11435/v1/responses
  管理界面: http://127.0.0.1:11435/admin

  [deepseek] DeepSeek (deepseek-v4-flash) ✓ ← 默认
  [zhipu] ZhiPu GLM (glm-5.1) ✓

==================================================
```

### 4. 配置 Codex

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

浏览器打开 `http://127.0.0.1:11435/admin`，可以：

- 查看当前活跃模型
- 一键切换模型供应商
- 配置 API Key

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

核心是 `SseTranslator` 类，将上游 SSE 事件翻译为 Codex 期望的 Responses API 事件格式。关键事件包括：

- `response.created` / `response.in_progress`
- `response.output_text.delta` / `response.output_text.done`
- `response.function_call_arguments.delta` / `response.function_call_arguments.done`
- `response.output_item.added` / `response.output_item.done`
- `response.completed`

## License

MIT
