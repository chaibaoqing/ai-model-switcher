#!/usr/bin/env node
/**
 * AI Model Switcher — 多模型统一代理
 * 让 Codex CLI / Desktop 无缝使用 DeepSeek、智谱 GLM 等模型
 */

import http from 'node:http';
import https from 'node:https';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, getActiveProvider, setActiveProvider, save as saveConfig } from './config.js';
import { SseTranslator } from './translator.js';
import { recordUsage, getSummary } from './usage.js';
import {
  extractText, translateTools,
  toChatMessages, toAnthropicMessages, toAnthropicTools
} from './input-translator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VERSION = '1.2.0';
const providers = config.providers;

// ---------- 服务状态 ----------
let servicePaused = false;

// ---------- 工具函数 ----------

function log(provider, msg) {
  const time = new Date().toISOString().slice(11, 19);
  console.log(`[${time}] [${provider}] ${msg}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function httpsRequest(options, body) {
  return new Promise((ok, fail) => {
    const opts = { ...options, headers: { ...options.headers } };
    if (body !== undefined && body !== '') {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
      const req = https.request(opts, ok);
      req.on('error', fail);
      req.setTimeout(300000, () => { req.destroy(); fail(new Error('timeout')); });
      req.write(payload);
      req.end();
    } else {
      // GET 请求，不需要 body
      const req = https.request(opts, ok);
      req.on('error', fail);
      req.setTimeout(300000, () => { req.destroy(); fail(new Error('timeout')); });
      req.end();
    }
  });
}

// ---------- 路由分发 ----------

function routeRequest(body) {
  return getActiveProvider();
}

// 用量追踪装饰器 — 包装 SseTranslator.done() 自动记录 token
function trackUsage(translator, provider, model) {
  const origDone = translator.done.bind(translator);
  translator.done = function(usage) {
    const inputTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
    if (inputTokens || outputTokens) {
      recordUsage(provider, inputTokens, outputTokens, model);
    }
    origDone(usage);
  };
  return translator;
}

// ---------- DeepSeek (Chat Completions) 处理 ----------

async function handleDeepSeek(body, provider, res) {
  const prov = providers[provider];
  const messages = toChatMessages(body, prov.name);
  const tools = translateTools(body.tools);

  const chatBody = {
    model: prov.model,
    messages,
    stream: body.stream !== false,
    thinking: { type: 'disabled' },
  };
  if (tools.length > 0) {
    chatBody.tools = tools;
    chatBody.tool_choice = body.tool_choice ?? 'auto';
  }
  if (body.max_output_tokens) chatBody.max_tokens = body.max_output_tokens;

  const url = new URL(prov.baseUrl);
  const dsReq = await httpsRequest({
    hostname: url.hostname,
    path: (url.pathname === '/' ? '' : url.pathname) + '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${prov.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': body.stream !== false ? 'text/event-stream' : 'application/json',
    },
  }, chatBody);

  if (dsReq.statusCode !== 200) {
    let errBody = '';
    dsReq.on('data', c => errBody += c);
    dsReq.on('end', () => {
      log(provider, `上游错误 ${dsReq.statusCode}: ${errBody.slice(0, 200)}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `${prov.name} ${dsReq.statusCode}: ${errBody.slice(0, 200)}` } }));
    });
    return;
  }

  // 非流式
  if (body.stream === false) {
    let data = '';
    dsReq.on('data', c => data += c);
    dsReq.on('end', () => {
      try {
        const completion = JSON.parse(data);
        // 记录用量
        if (completion.usage) {
          recordUsage(provider, completion.usage.prompt_tokens || 0, completion.usage.completion_tokens || 0, prov.model);
        }
        const msg = completion.choices?.[0]?.message;
        const output = [];
        if (msg?.content) output.push({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: msg.content }], status: 'completed' });
        if (msg?.tool_calls) {
          for (const tc of msg.tool_calls) {
            output.push({ id: `fc_${tc.id}`, type: 'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments, status: 'completed' });
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'resp_1', object: 'response', status: 'completed', model: prov.model, output }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }

  // 流式
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const translator = trackUsage(new SseTranslator(res, prov.model), provider, prov.model);
  let buffer = '';
  let capturedUsage = null;

  dsReq.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') { translator.done(capturedUsage); return; }
      try {
        const parsed = JSON.parse(json);
        // DeepSeek 最后一个 chunk 包含 usage
        if (parsed.usage) {
          capturedUsage = {
            input_tokens: parsed.usage.prompt_tokens || 0,
            output_tokens: parsed.usage.completion_tokens || 0,
          };
        }
        translator.feedChatCompletion(parsed);
      } catch {}
    }
  });

  dsReq.on('end', () => {
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ') || line.slice(6).trim() === '[DONE]') continue;
        try {
          const parsed = JSON.parse(line.slice(6).trim());
          if (parsed.usage) {
            capturedUsage = {
              input_tokens: parsed.usage.prompt_tokens || 0,
              output_tokens: parsed.usage.completion_tokens || 0,
            };
          }
          translator.feedChatCompletion(parsed);
        } catch {}
      }
    }
    translator.done(capturedUsage);
  });

  dsReq.on('error', e => {
    log(provider, `流式错误: ${e.message}`);
    translator.error(e.message);
  });
}

// ---------- ZhiPu (Anthropic Messages) 处理 ----------

async function handleZhiPu(body, provider, res) {
  const prov = providers[provider];
  const messages = toAnthropicMessages(body, prov.name);

  const payload = {
    model: prov.model || body.model || 'glm-5.1',
    messages,
    max_tokens: body.max_output_tokens || 16384,
    stream: body.stream !== false,
  };
  if (body.tools?.length) {
    payload.tools = toAnthropicTools(body.tools);
    payload.tool_choice = { type: 'auto' };
  }
  if (body.temperature !== undefined) payload.temperature = body.temperature;

  const url = new URL(prov.baseUrl);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': prov.apiKey,
    'anthropic-version': prov.apiVersion || '2023-06-01',
    'User-Agent': prov.userAgent || 'ClaudeCode/2.1.138',
  };

  const zRes = await httpsRequest({
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers,
  }, payload);

  if (zRes.statusCode !== 200) {
    let errBody = '';
    zRes.on('data', c => errBody += c);
    zRes.on('end', () => {
      log(provider, `上游错误 ${zRes.statusCode}: ${errBody.slice(0, 200)}`);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `${prov.name} ${zRes.statusCode}: ${errBody.slice(0, 200)}` } }));
    });
    return;
  }

  // 非流式
  if (body.stream === false) {
    let data = '';
    zRes.on('data', c => data += c);
    zRes.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        // 记录用量
        if (parsed.usage) {
          recordUsage(provider, parsed.usage.input_tokens || 0, parsed.usage.output_tokens || 0, prov.model);
        }
        const out = [];
        const txt = (parsed.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
        if (txt) out.push({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: txt }], status: 'completed' });
        for (const tc of (parsed.content || []).filter(c => c.type === 'tool_use')) {
          out.push({ id: `fc_${tc.id}`, type: 'function_call', call_id: tc.id, name: tc.name, arguments: JSON.stringify(tc.input || {}), status: 'completed' });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'resp_1', object: 'response', status: 'completed', model: prov.model, output: out }));
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    });
    return;
  }

  // 流式
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const translator = trackUsage(new SseTranslator(res, prov.model), provider, prov.model);
  let buf = '';
  let capturedUsage = { input_tokens: 0, output_tokens: 0 };

  zRes.setEncoding('utf-8');
  zRes.on('data', chunk => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const ds = t.slice(5).trim();
      if (!ds) continue;
      try {
        const ev = JSON.parse(ds);
        // Anthropic message_start 包含 input tokens
        if (ev.type === 'message_start' && ev.message?.usage) {
          capturedUsage.input_tokens = ev.message.usage.input_tokens || 0;
          capturedUsage.output_tokens = ev.message.usage.output_tokens || 0;
        }
        // message_delta 包含累计 output tokens
        if (ev.type === 'message_delta' && ev.usage) {
          capturedUsage.output_tokens = ev.usage.output_tokens || capturedUsage.output_tokens;
        }
        if (ev.type === 'message_stop') {
          translator.done(capturedUsage);
          return;
        }
        translator.feedAnthropicEvent(ev);
      } catch {}
    }
  });

  zRes.on('end', () => {
    if (buf.trim()) {
      for (const line of buf.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const ds = t.slice(5).trim();
        if (!ds) continue;
        try {
          const ev = JSON.parse(ds);
          if (ev.type === 'message_start' && ev.message?.usage) {
            capturedUsage.input_tokens = ev.message.usage.input_tokens || 0;
          }
          if (ev.type === 'message_delta' && ev.usage) {
            capturedUsage.output_tokens = ev.usage.output_tokens || capturedUsage.output_tokens;
          }
          if (ev.type === 'message_stop') { translator.done(capturedUsage); return; }
          translator.feedAnthropicEvent(ev);
        } catch {}
      }
    }
    translator.done(capturedUsage);
  });

  zRes.on('error', e => {
    log(provider, `流式错误: ${e.message}`);
    translator.error(e.message);
  });
}

// ---------- HTTP Server ----------

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Web 管理界面
  if (req.method === 'GET' && (path === '/admin' || path === '/admin/')) {
    try {
      const html = readFileSync(resolve(ROOT, 'public/index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Admin UI error: ' + e.message);
    }
  }

  // 静态文件（SVG 等）
  if (req.method === 'GET' && path.match(/^\/[\w-]+\.(svg|png|ico|css|js)$/)) {
    try {
      const filePath = resolve(ROOT, 'public', path.slice(1));
      if (existsSync(filePath)) {
        const ext = path.split('.').pop();
        const mimeTypes = { svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', css: 'text/css', js: 'application/javascript' };
        const data = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return res.end(data);
      }
    } catch {}
  }

  // API: 状态
  if (req.method === 'GET' && path === '/admin/api/status') {
    const active = getActiveProvider();
    const provList = {};
    for (const [name, prov] of Object.entries(providers)) {
      provList[name] = { name: prov.name, model: prov.model, port: prov.port, configured: !!prov.apiKey, active: name === active };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ version: VERSION, activeProvider: active, providers: provList }));
  }

  // API: 切换模型
  if (req.method === 'POST' && path === '/admin/api/switch') {
    try {
      const raw = await readBody(req);
      const { provider } = JSON.parse(raw);
      if (!providers[provider]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Unknown provider: ${provider}` }));
      }
      setActiveProvider(provider);
      log('admin', `切换到 ${providers[provider].name}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, activeProvider: provider }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 保存配置
  if (req.method === 'POST' && path === '/admin/api/config') {
    try {
      const raw = await readBody(req);
      const updates = JSON.parse(raw);
      for (const [key, value] of Object.entries(updates)) {
        if (key.startsWith('providers.')) {
          const parts = key.split('.');
          const provName = parts[1];
          const field = parts[2];
          if (providers[provName]) providers[provName][field] = value;
        }
      }
      saveConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 用量统计
  if (req.method === 'GET' && path === '/admin/api/usage') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(getSummary()));
  }

  // API: 账户余额
  if (req.method === 'GET' && path === '/admin/api/balance') {
    try {
      const results = {};
      const tasks = [];
      for (const [name, prov] of Object.entries(providers)) {
        if (!prov.apiKey) continue;
        tasks.push(
          (async () => {
            try {
              if (prov.wireApi === 'anthropic') {
                // 智谱 Coding Plan 配额查询
                const qUrl = new URL('https://open.bigmodel.cn/api/monitor/usage/quota/limit');
                const qRes = await httpsRequest({
                  hostname: qUrl.hostname,
                  path: qUrl.pathname,
                  method: 'GET',
                  headers: { 'Authorization': prov.apiKey },
                }, undefined);
                let data = '';
                await new Promise(r => { qRes.on('data', c => data += c); qRes.on('end', r); });
                const parsed = JSON.parse(data);
                results[name] = { provider: prov.name, raw: parsed };
              } else {
                // DeepSeek 余额
                const url = new URL('https://api.deepseek.com/user/balance');
                const bRes = await httpsRequest({
                  hostname: url.hostname,
                  path: url.pathname,
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${prov.apiKey}` },
                }, '');
                let data = '';
                await new Promise(r => { bRes.on('data', c => data += c); bRes.on('end', r); });
                const parsed = JSON.parse(data);
                results[name] = { provider: prov.name, raw: parsed };
              }
            } catch (e) {
              results[name] = { provider: prov.name, error: e.message };
            }
          })()
        );
      }
      await Promise.all(tasks);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(results));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 获取供应商支持的模型列表
  if (req.method === 'GET' && path === '/admin/api/models') {
    try {
      const results = {};
      const tasks = [];
      for (const [name, prov] of Object.entries(providers)) {
        if (!prov.apiKey) { results[name] = { provider: prov.name, models: [] }; continue; }
        tasks.push(
          (async () => {
            try {
              if (prov.wireApi === 'anthropic') {
                const mUrl = new URL('https://open.bigmodel.cn/api/paas/v4/models');
                const mRes = await httpsRequest({
                  hostname: mUrl.hostname,
                  path: mUrl.pathname,
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${prov.apiKey}` },
                }, '');
                let data = '';
                await new Promise(r => { mRes.on('data', c => data += c); mRes.on('end', r); });
                const parsed = JSON.parse(data);
                const models = (parsed.data || []).map(m => m.id).filter(Boolean);
                results[name] = { provider: prov.name, models };
              } else {
                const mUrl = new URL('https://api.deepseek.com/v1/models');
                const mRes = await httpsRequest({
                  hostname: mUrl.hostname,
                  path: mUrl.pathname,
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${prov.apiKey}` },
                }, '');
                let data = '';
                await new Promise(r => { mRes.on('data', c => data += c); mRes.on('end', r); });
                const parsed = JSON.parse(data);
                const models = (parsed.data || []).map(m => m.id).filter(Boolean);
                results[name] = { provider: prov.name, models };
              }
            } catch (e) {
              results[name] = { provider: prov.name, models: [], error: e.message };
            }
          })()
        );
      }
      await Promise.all(tasks);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(results));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 一键配置 Codex
  if (req.method === 'POST' && path === '/admin/api/setup-codex') {
    try {
      const mainPort = config.data?.mainPort || 11435;
      const codexDir = resolve(homedir(), '.codex');
      const codexConfig = resolve(codexDir, 'config.toml');

      if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });

      const toml = `model_provider = "custom"
model = "auto"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "Model Switcher"
wire_api = "responses"
requires_openai_auth = false
base_url = "http://127.0.0.1:${mainPort}/v1"
stream_idle_timeout_ms = 300000
`;

      if (existsSync(codexConfig)) {
        const backup = codexConfig + '.bak';
        if (!existsSync(backup)) writeFileSync(backup, readFileSync(codexConfig, 'utf-8'));
      }

      writeFileSync(codexConfig, toml);
      log('admin', 'Codex config written');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, path: codexConfig }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 检查 Codex 配置状态
  if (req.method === 'GET' && path === '/admin/api/codex-status') {
    try {
      const mainPort = config.data?.mainPort || 11435;
      const codexConfig = resolve(homedir(), '.codex', 'config.toml');
      if (existsSync(codexConfig)) {
        const content = readFileSync(codexConfig, 'utf-8');
        const configured = content.includes(`127.0.0.1:${mainPort}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ installed: true, configured, path: codexConfig }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ installed: false, configured: false, path: codexConfig }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // API: 服务状态
  if (req.method === 'GET' && path === '/admin/api/service-status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ paused: servicePaused, version: VERSION }));
  }

  // API: 暂停服务
  if (req.method === 'POST' && path === '/admin/api/service-pause') {
    servicePaused = true;
    log('admin', '服务已暂停');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, paused: true }));
  }

  // API: 恢复服务
  if (req.method === 'POST' && path === '/admin/api/service-resume') {
    servicePaused = false;
    log('admin', '服务已恢复');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, paused: false }));
  }

  // API: 重启服务
  if (req.method === 'POST' && path === '/admin/api/service-restart') {
    log('admin', '服务重启中...');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    // 延迟退出，让响应先发送完
    setTimeout(() => {
      // 启动新进程
      const child = spawn(process.execPath, [resolve(__dirname, 'server.js')], {
        detached: true,
        stdio: 'inherit',
        cwd: ROOT,
      });
      child.unref();
      process.exit(0);
    }, 500);
    return;
  }

  // 暂停时拦截非 admin 请求
  if (servicePaused && !path.startsWith('/admin/')) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'Service paused' } }));
  }

  // 健康检查
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      service: 'ai-model-switcher',
      version: VERSION,
      activeProvider: getActiveProvider(),
      status: 'ok'
    }));
  }

  // 模型列表
  if (req.method === 'GET' && (url.pathname === '/v1/models' || url.pathname === '/models')) {
    const models = [];
    for (const [name, prov] of Object.entries(providers)) {
      if (prov.apiKey) models.push({ id: prov.model, object: 'model', owned_by: name });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ object: 'list', data: models }));
  }

  // Responses API — 核心路由
  if (req.method === 'POST' && (url.pathname === '/v1/responses' || url.pathname === '/responses')) {
    try {
      const body = JSON.parse(await readBody(req));
      const providerName = routeRequest(body);
      const prov = providers[providerName];

      if (!prov || !prov.apiKey) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: `Provider '${providerName}' not configured` } }));
      }

      log(providerName, `请求 tools=${body.tools?.length || 0} stream=${body.stream !== false}`);

      if (prov.wireApi === 'anthropic') {
        await handleZhiPu(body, providerName, res);
      } else {
        await handleDeepSeek(body, providerName, res);
      }
    } catch (e) {
      log('error', e.message);
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: e.message } }));
      }
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// ---------- 启动 ----------

// 找到第一个可用端口（统一入口）
const MAIN_PORT = config.mainPort || 11435;

server.listen(MAIN_PORT, '127.0.0.1', () => {
  console.log('='.repeat(50));
  console.log('  AI Model Switcher v' + VERSION);
  console.log('='.repeat(50));
  console.log(`  主入口: http://127.0.0.1:${MAIN_PORT}/v1/responses`);
  console.log(`  管理界面: http://127.0.0.1:${MAIN_PORT}/admin`);
  console.log('');
  for (const [name, prov] of Object.entries(providers)) {
    const status = prov.apiKey ? '✓' : '✗ (未配置 API Key)';
    const active = name === getActiveProvider() ? ' ← 默认' : '';
    console.log(`  [${name}] ${prov.name} (${prov.model}) ${status}${active}`);
  }
  console.log('');
  console.log('='.repeat(50));
});
