/**
 * SseTranslator — 将上游 SSE 事件翻译为 Codex Responses API 事件
 * 对齐 ccswitch-deepseek 的格式，确保 Codex 能正确处理
 */
export class SseTranslator {
  constructor(res, model) {
    this.res = res;
    this.model = model || 'unknown';
    this.responseId = 'resp_' + Math.random().toString(36).slice(2, 10);
    this.itemId = 'item_' + Math.random().toString(36).slice(2, 10);
    this.textStarted = false;
    this.contentSoFar = '';
    this.toolCalls = new Map();
    this.finished = new Set();
    this.started = false;
    this.textOutputIndex = -1;
  }

  emit(event, data) {
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  _ensureStarted() {
    if (this.started) return;
    this.started = true;
    this.emit('response.created', {
      type: 'response.created',
      response: {
        id: this.responseId,
        object: 'response',
        status: 'in_progress',
        model: this.model,
        output: [],
      },
    });
    this.emit('response.in_progress', {
      type: 'response.in_progress',
      response_id: this.responseId,
    });
  }

  // ---------- Chat Completions (DeepSeek) 事件 ----------

  feedChatCompletion(chunk) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;

    if (delta.content) {
      this._ensureStarted();
      this.contentSoFar += delta.content;
      if (!this.textStarted) {
        this.textStarted = true;
        this.emit('response.output_item.added', {
          type: 'response.output_item.added',
          response_id: this.responseId,
          output_index: 0,
          item: {
            id: this.itemId,
            type: 'message',
            role: 'assistant',
            status: 'in_progress',
            content: [],
          },
        });
      }
      this.emit('response.output_text.delta', {
        type: 'response.output_text.delta',
        response_id: this.responseId,
        item_id: this.itemId,
        output_index: 0,
        content_index: 0,
        delta: delta.content,
      });
    }

    if (delta.tool_calls) {
      this._ensureStarted();
      for (const tc of delta.tool_calls) {
        const idx = tc.index;
        if (!this.toolCalls.has(idx)) {
          const call = { id: tc.id || `call_${idx}`, call_id: tc.id || `call_${idx}`, name: tc.function?.name ?? '', arguments: '' };
          this.toolCalls.set(idx, call);
          const outputIdx = this.textStarted ? idx + 1 : idx;
          this.emit('response.output_item.added', {
            type: 'response.output_item.added',
            response_id: this.responseId,
            output_index: outputIdx,
            item: {
              id: `fc_${call.id}`,
              type: 'function_call',
              call_id: call.call_id,
              name: call.name,
              status: 'in_progress',
            },
          });
        }
        const call = this.toolCalls.get(idx);
        if (tc.function?.name) call.name = tc.function.name;
        const argDelta = tc.function?.arguments ?? '';
        call.arguments += argDelta;
        const outputIdx = this.textStarted ? idx + 1 : idx;
        this.emit('response.function_call_arguments.delta', {
          type: 'response.function_call_arguments.delta',
          response_id: this.responseId,
          item_id: `fc_${call.id}`,
          output_index: outputIdx,
          delta: argDelta,
        });
      }
    }
  }

  // ---------- Anthropic (ZhiPu) 事件 ----------

  feedAnthropicEvent(ev) {
    if (ev.type === 'content_block_start') {
      if (ev.content_block.type === 'text') {
        this._ensureStarted();
        this.textOutputIndex = 0;
        this.textStarted = true;
        this.emit('response.output_item.added', {
          type: 'response.output_item.added',
          response_id: this.responseId,
          output_index: 0,
          item: {
            id: this.itemId,
            type: 'message',
            role: 'assistant',
            status: 'in_progress',
            content: [],
          },
        });
      } else if (ev.content_block.type === 'tool_use') {
        this._ensureStarted();
        const idx = this.toolCalls.size;
        const callId = ev.content_block.id;
        const call = { id: callId, call_id: callId, name: ev.content_block.name, arguments: '' };
        this.toolCalls.set(idx, call);
        const outputIdx = this.textStarted ? idx + 1 : idx;
        this.emit('response.output_item.added', {
          type: 'response.output_item.added',
          response_id: this.responseId,
          output_index: outputIdx,
          item: {
            id: `fc_${callId}`,
            type: 'function_call',
            call_id: callId,
            name: call.name,
            status: 'in_progress',
          },
        });
      }
    } else if (ev.type === 'content_block_delta') {
      if (ev.delta?.type === 'text_delta' && this.textStarted) {
        this.contentSoFar += ev.delta.text;
        this.emit('response.output_text.delta', {
          type: 'response.output_text.delta',
          response_id: this.responseId,
          item_id: this.itemId,
          output_index: 0,
          content_index: 0,
          delta: ev.delta.text,
        });
      } else if (ev.delta?.type === 'input_json_delta') {
        for (const [idx, call] of this.toolCalls) {
          if (!this.finished.has(idx) && !call._complete) {
            const argDelta = ev.delta.partial_json || '';
            call.arguments += argDelta;
            const outputIdx = this.textStarted ? idx + 1 : idx;
            this.emit('response.function_call_arguments.delta', {
              type: 'response.function_call_arguments.delta',
              response_id: this.responseId,
              item_id: `fc_${call.id}`,
              output_index: outputIdx,
              delta: argDelta,
            });
            break;
          }
        }
      }
    } else if (ev.type === 'content_block_stop') {
      for (const [idx, call] of this.toolCalls) {
        if (!this.finished.has(idx) && !call._complete) {
          call._complete = true;
          break;
        }
      }
    }
  }

  // ---------- 完成输出 ----------

  done(usage) {
    this._ensureStarted();

    const output = [];

    if (this.textStarted) {
      this.emit('response.output_text.done', {
        type: 'response.output_text.done',
        response_id: this.responseId,
        item_id: this.itemId,
        output_index: 0,
        content_index: 0,
        text: this.contentSoFar,
      });
      this.emit('response.output_item.done', {
        type: 'response.output_item.done',
        response_id: this.responseId,
        output_index: 0,
        item: {
          id: this.itemId,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: this.contentSoFar }],
          status: 'completed',
        },
      });
      output.push({
        id: this.itemId,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: this.contentSoFar }],
        status: 'completed',
      });
    }

    for (const [idx, call] of this.toolCalls) {
      if (this.finished.has(idx)) continue;
      this.finished.add(idx);
      const outputIdx = this.textStarted ? idx + 1 : idx;
      this.emit('response.function_call_arguments.done', {
        type: 'response.function_call_arguments.done',
        response_id: this.responseId,
        item_id: `fc_${call.id}`,
        output_index: outputIdx,
        arguments: call.arguments,
        name: call.name,
        call_id: call.call_id,
      });
      this.emit('response.output_item.done', {
        type: 'response.output_item.done',
        response_id: this.responseId,
        output_index: outputIdx,
        item: {
          id: `fc_${call.id}`,
          type: 'function_call',
          call_id: call.call_id,
          name: call.name,
          arguments: call.arguments,
          status: 'completed',
        },
      });
      output.push({
        id: `fc_${call.id}`,
        type: 'function_call',
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
        status: 'completed',
      });
    }

    this.emit('response.completed', {
      type: 'response.completed',
      response: {
        id: this.responseId,
        object: 'response',
        status: 'completed',
        model: this.model,
        usage: usage ? {
          input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
          output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
          total_tokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        } : null,
        output,
      },
    });

    this.res.end();
  }

  error(msg) {
    this.emit('error', { type: 'error', code: 'proxy_error', message: msg });
    this.res.end();
  }
}
