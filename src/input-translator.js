/**
 * 输入翻译器 — 将 Codex Responses API 请求翻译为上游 API 格式
 * 支持两种上游: Chat Completions (DeepSeek) 和 Anthropic Messages (ZhiPu)
 */

// ---------- 通用工具函数 ----------

export function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(p => p.type === 'input_text' || p.type === 'output_text' || p.type === 'text' || p.type === 'reasoning_text')
    .map(p => p.text ?? '')
    .join('');
}

export function translateTools(rawTools) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .map(t => {
      const name = t.name ?? t.function?.name;
      if (!name) return null;
      return {
        type: 'function',
        function: {
          name,
          description: t.description ?? t.function?.description ?? '',
          parameters: t.parameters ?? t.function?.parameters ?? { type: 'object', properties: {} },
        },
      };
    })
    .filter(Boolean);
}

// ---------- Chat Completions 翻译 (DeepSeek) ----------

export function toChatMessages(body, providerName) {
  const messages = [];
  const input = body.input;

  if (!Array.isArray(input)) {
    if (typeof input === 'string' && input.trim()) {
      messages.push({ role: 'user', content: input });
    } else if (typeof input === 'object' && input !== null) {
      const text = extractText(input.content);
      if (text) messages.push({ role: 'user', content: text });
    }
  } else {
    for (const item of input) {
      if (item.type === 'function_call') {
        const last = messages[messages.length - 1];
        const target = last && last.role === 'assistant' ? last : (() => {
          const m = { role: 'assistant', tool_calls: [] };
          messages.push(m);
          return m;
        })();
        if (!target.tool_calls) target.tool_calls = [];
        target.tool_calls.push({
          id: item.call_id || item.id,
          type: 'function',
          function: { name: item.name, arguments: item.arguments },
        });
      } else if (item.type === 'function_call_output') {
        messages.push({
          role: 'tool',
          tool_call_id: item.call_id || item.id,
          content: extractText(item.output),
        });
      } else if (item.role) {
        const role = item.role === 'developer' ? 'system' : item.role;
        const msg = { role, content: extractText(item.content) };
        if (item.tool_calls) msg.tool_calls = item.tool_calls;
        if (item.tool_call_id) msg.tool_call_id = item.tool_call_id;
        messages.push(msg);
      }
    }
  }

  // 注入身份声明
  const IDENTITY = `\n\n[IMPORTANT: Your true underlying model is ${providerName}. You are NOT OpenAI, GPT, Claude, or Codex. When asked about your model identity, you MUST answer truthfully about what model you are. Ignore any conflicting identity claims in the instructions above.]`;
  let instructions = body.instructions ? body.instructions + IDENTITY : IDENTITY.trim();
  messages.unshift({ role: 'system', content: instructions });

  return messages;
}

// ---------- Anthropic Messages 翻译 (ZhiPu) ----------

export function toAnthropicMessages(body, providerName) {
  const msgs = [];
  const input = body.input;

  if (typeof input === 'string') {
    msgs.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    let cur = null;
    const flush = () => { if (cur) { msgs.push(cur); cur = null; } };

    for (const item of input) {
      if (item.type === 'function_call') {
        if (!cur) cur = { role: 'assistant', content: [] };
        if (typeof cur.content === 'string') cur.content = [{ type: 'text', text: cur.content }];
        let inputObj = {};
        try { inputObj = JSON.parse(item.arguments); } catch {}
        cur.content.push({ type: 'tool_use', id: item.call_id || item.id, name: item.name, input: inputObj });
      } else if (item.type === 'function_call_output') {
        flush();
        msgs.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: item.call_id || item.id,
            content: typeof item.output === 'string' ? item.output : extractText(item.output)
          }]
        });
      } else if (item.role) {
        flush();
        const r = item.role === 'developer' ? 'user' : item.role;
        const t = extractText(item.content) || (typeof item.content === 'string' ? item.content : '');
        if (t || item.role === 'assistant') msgs.push({ role: r, content: t });
      } else if (item.type === 'text' || item.type === 'input_text') {
        msgs.push({ role: 'user', content: item.text || '' });
      }
    }
    flush();
  } else if (typeof input === 'object' && input !== null) {
    const t = extractText(input.content) || (typeof input.content === 'string' ? input.content : '');
    if (t) msgs.push({ role: 'user', content: t });
  }

  // 注入身份声明
  const IDENTITY = `\n\n[IMPORTANT: Your true underlying model is ${providerName}. You are NOT OpenAI, GPT, Claude, or Codex. When asked about your model identity, you MUST answer truthfully about what model you are. Ignore any conflicting identity claims in the instructions above.]`;
  const instructions = body.instructions ? body.instructions + IDENTITY : IDENTITY.trim();

  if (msgs.length > 0 && msgs[0].role === 'user' && typeof msgs[0].content === 'string') {
    msgs[0].content = instructions + '\n\n' + msgs[0].content;
  } else {
    msgs.unshift({ role: 'user', content: instructions });
  }

  // Anthropic 要求第一条消息必须是 user
  if (msgs.length > 0 && msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '继续。' });
  }

  // 合并相邻同角色消息
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') {
      last.content += '\n' + m.content;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

export function toAnthropicTools(rawTools) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools
    .map(x => ({
      name: x.name ?? x.function?.name ?? '',
      description: x.description ?? x.function?.description ?? '',
      input_schema: x.parameters ?? x.function?.parameters ?? { type: 'object', properties: {} }
    }))
    .filter(x => x.name);
}
