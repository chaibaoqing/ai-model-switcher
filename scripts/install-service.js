#!/usr/bin/env node
/**
 * 一键安装脚本 — 安装服务 + 自动配置 Codex
 * 支持 macOS (LaunchAgent) 和 Windows (Task Scheduler)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HOME = homedir();

// 动态导入平台实现
const platform = await import('./platform/index.js');

const NODE_PATH = process.execPath;
const SERVER_PATH = resolve(ROOT, 'src/server.js');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

console.log('==========================================');
console.log(`  AI Model Switcher — 一键安装 (${platform.getPlatformName()})`);
console.log('==========================================\n');

// 1. 安装依赖
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  console.log('[1/3] 安装依赖...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
} else {
  console.log('[1/3] 依赖已安装 ✓');
}

// 2. 注册服务（使用平台抽象层）
console.log('\n[2/3] 注册开机自启服务...');
console.log(`  平台: ${platform.getPlatformName()}`);
console.log(`  Node 路径: ${NODE_PATH}`);
console.log(`  服务路径: ${SERVER_PATH}`);
platform.installService(ROOT, NODE_PATH, SERVER_PATH);

// 3. 自动配置 Codex
console.log('\n[3/3] 配置 Codex...');

const CODEX_CONFIG_PATH = resolve(HOME, '.codex/config.toml');

async function configureCodex() {
  const auto = await ask('  是否自动配置 Codex? (Y/n): ');
  if (auto.trim().toLowerCase() === 'n') {
    console.log('  跳过。你可以稍后手动编辑 ~/.codex/config.toml');
    return;
  }

  let configContent = '';
  if (existsSync(CODEX_CONFIG_PATH)) {
    configContent = readFileSync(CODEX_CONFIG_PATH, 'utf-8');
  }

  const PROXY_URL = 'http://127.0.0.1:11435/v1';

  // 检查是否已经配置
  if (configContent.includes(PROXY_URL)) {
    console.log('  ✓ Codex 已指向本代理，无需修改');
    return;
  }

  // 保留原有的非冲突配置
  const lines = configContent.split('\n');
  const preserved = [];
  let skipTopLevel = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('model_provider') || trimmed.startsWith('model =') || trimmed.startsWith('model_reasoning') || trimmed.startsWith('disable_response')) continue;
    if (trimmed.startsWith('[model_providers')) { skipTopLevel = true; continue; }
    if (skipTopLevel && trimmed.startsWith('[') && !trimmed.startsWith('[model_providers')) skipTopLevel = false;
    if (skipTopLevel) continue;
    preserved.push(line);
  }

  const newConfig = `model_provider = "custom"
model = "auto"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "Model Switcher"
wire_api = "responses"
requires_openai_auth = false
base_url = "${PROXY_URL}"
stream_idle_timeout_ms = 300000

${preserved.join('\n').trim()}
`;

  // 备份旧配置
  if (configContent) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(CODEX_CONFIG_PATH + '.bak', configContent);
    console.log('  ✓ 旧配置已备份到 ~/.codex/config.toml.bak');
  }

  const { writeFileSync } = await import('node:fs');
  writeFileSync(CODEX_CONFIG_PATH, newConfig);
  console.log('  ✓ Codex 配置已更新');
}

await configureCodex();

rl.close();

console.log('\n==========================================');
console.log('  安装完成！');
console.log('==========================================');
console.log(`  代理地址: http://127.0.0.1:11435/v1/responses`);
console.log(`  管理界面: http://127.0.0.1:11435/admin`);
console.log(`  日志查看: tail -f ${resolve(ROOT, 'proxy.log')}`);
console.log('');
console.log('  下一步：打开管理界面填入 API Key，然后重启');
console.log('==========================================');
