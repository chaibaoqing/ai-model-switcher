#!/usr/bin/env node
/**
 * Codex Model Switcher — 多模型统一代理
 * 让 Codex CLI / Desktop 无缝使用 DeepSeek、智谱 GLM 等模型
 */

import http from 'node:http';
import https from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, getActiveProvider } from './config.js';
import { SseTranslator } from './translator.js';
import {
  extractText, translateTools,
  toChatMessages, toAnthropicMessages, toAnthropicTools
} from './input-translator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const VERSION = '1.0.0';
const providers = config.providers;

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
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = { ...options, headers: { ...options.headers } };
    opts.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(opts, ok);
    req.on('error', fail);
    req.setTimeout(120000, () => { req.destroy(); fail(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ---------- 路由分发 ----------

function routeRequest(body) {
  // 如果请求指定了 model，根据模型名匹配 provider
  const model = (body.model || '').toLowerCase();
  for (const [name, prov] of Object.entries(providers)) {
    if (!prov.apiKey) continue;
    if (model.includes(name) || prov.model.toLowerCase() === model) {
      return name;
    }
  }
  // 默认使用 activeProvider
  return getActiveProvider();
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
  const translator = new SseTranslator(res, prov.model);
  let buffer = '';

  dsReq.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (json === '[DONE]') { translator.done(null); return; }
      try { translator.feedChatCompletion(JSON.parse(json)); } catch {}
    }
  });

  dsReq.on('end', () => {
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (!line.startsWith('data: ') || line.slice(6).trim() === '[DONE]') continue;
        try { translator.feedChatCompletion(JSON.parse(line.slice(6).trim())); } catch {}
      }
    }
    translator.done(null);
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
  const translator = new SseTranslator(res, prov.model);
  let buf = '';

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
        if (ev.type === 'message_stop') {
          translator.done(null);
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
          if (ev.type === 'message_stop') { translator.done(null); return; }
          translator.feedAnthropicEvent(ev);
        } catch {}
      }
    }
    translator.done(null);
  });

  zRes.on('error', e => {
    log(provider, `流式错误: ${e.message}`);
    translator.error(e.message);
  });
}

// ---------- Web 管理 API ----------

function handleWebAPI(req, res, url) {
  // GET /admin/api/status
  if (req.method === 'GET' && url.pathname === '/admin/api/status') {
    const active = getActiveProvider();
    const provList = {};
    for (const [name, prov] of Object.entries(providers)) {
      provList[name] = {
        name: prov.name,
        model: prov.model,
        port: prov.port,
        configured: !!prov.apiKey,
        active: name === active,
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ version: VERSION, activeProvider: active, providers: provList }));
  }

  // POST /admin/api/switch
  if (req.method === 'POST' && url.pathname === '/admin/api/switch') {
    readBody(req).then(raw => {
      const { provider } = JSON.parse(raw);
      if (!providers[provider]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: `Unknown provider: ${provider}` }));
      }
      const { setActiveProvider } = await import('./config.js');
      setActiveProvider(provider);
      log('admin', `切换到 ${providers[provider].name}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, activeProvider: provider }));
    }).catch(e => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // POST /admin/api/config
  if (req.method === 'POST' && url.pathname === '/admin/api/config') {
    readBody(req).then(raw => {
      const updates = JSON.parse(raw);
      for (const [key, value] of Object.entries(updates)) {
        if (key.startsWith('providers.')) {
          const [_, provName, field] = key.split('.');
          if (providers[provName]) providers[provName][field] = value;
        }
      }
      const { save } = await import('./config.js');
      save();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    }).catch(e => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });
    return;
  }

  // Web 管理界面
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    const html = readFileSync(resolve(ROOT, 'public/index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  return false;
}

// ---------- HTTP Server ----------

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // Web 管理
  if (url.pathname.startsWith('/admin')) {
    if (handleWebAPI(req, res, url) !== false) return;
  }

  // 健康检查
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      service: 'codex-model-switcher',
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
  console.log('  Codex Model Switcher v' + VERSION);
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
