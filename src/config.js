import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 加载 .env
dotenv.config({ path: resolve(ROOT, '.env') });

// ---------- 默认配置 ----------
const DEFAULTS = {
  providers: {
    deepseek: {
      name: 'DeepSeek',
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      wireApi: 'chat',          // chat = Chat Completions API
      port: 11435,
    },
    zhipu: {
      name: 'ZhiPu GLM',
      apiKey: '',
      baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
      model: 'glm-5.1',
      wireApi: 'anthropic',     // anthropic = Anthropic Messages API
      port: 11436,
      userAgent: 'ClaudeCode/2.1.138',
      apiVersion: '2023-06-01',
    },
  },
  webPort: 9090,
  autoStart: true,
};

let config = { ...DEFAULTS };

// 加载用户配置
const CFG_PATH = resolve(ROOT, 'config.json');
if (existsSync(CFG_PATH)) {
  try {
    const user = JSON.parse(readFileSync(CFG_PATH, 'utf-8'));
    // 深度合并
    for (const key of Object.keys(DEFAULTS)) {
      if (user[key] !== undefined) {
        if (typeof DEFAULTS[key] === 'object' && !Array.isArray(DEFAULTS[key])) {
          if (key === 'providers') {
            for (const pk of Object.keys(user.providers)) {
              config.providers[pk] = { ...(DEFAULTS.providers[pk] || {}), ...user.providers[pk] };
            }
          } else {
            config[key] = { ...DEFAULTS[key], ...user[key] };
          }
        } else {
          config[key] = user[key];
        }
      }
    }
  } catch {}
}

// 环境变量覆盖
for (const [name, prov] of Object.entries(config.providers)) {
  const envKey = name.toUpperCase() + '_API_KEY';
  if (process.env[envKey]) prov.apiKey = process.env[envKey];
}

export function save() {
  // 不保存默认值，只保存用户修改
  writeFileSync(CFG_PATH, JSON.stringify(config, null, 2));
}

export function get() { return config; }
export function set(key, value) {
  if (key.includes('.')) {
    const parts = key.split('.');
    let obj = config;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
  } else {
    config[key] = value;
  }
  save();
}

export function getActiveProvider() {
  return config.activeProvider || 'deepseek';
}

export function setActiveProvider(name) {
  config.activeProvider = name;
  save();
}
