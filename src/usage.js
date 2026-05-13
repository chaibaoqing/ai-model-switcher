/**
 * 用量统计模块 — 记录每次请求的 token 消耗
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATS_FILE = resolve(__dirname, '..', 'usage-stats.json');

// 内存中的统计数据
let stats = {
  providers: {},     // { deepseek: { totalInput, totalOutput, requestCount, lastUsed }, ... }
  daily: {},         // { "2026-05-13": { deepseek: { input, output, count }, ... } }
  history: [],       // 最近 100 条请求记录
};

// 启动时加载
if (existsSync(STATS_FILE)) {
  try {
    stats = JSON.parse(readFileSync(STATS_FILE, 'utf-8'));
  } catch {}
}

function save() {
  try {
    writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch {}
}

export function recordUsage(provider, inputTokens, outputTokens, model) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  // Provider 统计
  if (!stats.providers[provider]) {
    stats.providers[provider] = { totalInput: 0, totalOutput: 0, requestCount: 0, lastUsed: '', models: {} };
  }
  const p = stats.providers[provider];
  p.totalInput += inputTokens;
  p.totalOutput += outputTokens;
  p.requestCount++;
  p.lastUsed = now.toISOString();

  if (!p.models[model]) p.models[model] = { totalInput: 0, totalOutput: 0, count: 0 };
  p.models[model].totalInput += inputTokens;
  p.models[model].totalOutput += outputTokens;
  p.models[model].count++;

  // 每日统计
  if (!stats.daily[dateStr]) stats.daily[dateStr] = {};
  if (!stats.daily[dateStr][provider]) stats.daily[dateStr][provider] = { input: 0, output: 0, count: 0 };
  stats.daily[dateStr][provider].input += inputTokens;
  stats.daily[dateStr][provider].output += outputTokens;
  stats.daily[dateStr][provider].count++;

  // 历史记录（保留最近 200 条）
  stats.history.unshift({
    time: now.toISOString(),
    provider,
    model,
    input: inputTokens,
    output: outputTokens,
  });
  if (stats.history.length > 200) stats.history.length = 200;

  save();
}

export function getStats() {
  return stats;
}

export function getSummary() {
  const totalInput = Object.values(stats.providers).reduce((s, p) => s + p.totalInput, 0);
  const totalOutput = Object.values(stats.providers).reduce((s, p) => s + p.totalOutput, 0);
  const totalRequests = Object.values(stats.providers).reduce((s, p) => s + p.requestCount, 0);

  // 最近 7 天
  const daily = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily[key] = stats.daily[key] || {};
  }

  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    totalRequests,
    providers: stats.providers,
    last7days: daily,
    recentRequests: stats.history.slice(0, 20),
  };
}
