#!/usr/bin/env node
/**
 * 配置向导 — 交互式引导用户完成首次配置
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HOME = homedir();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function banner(text) {
  console.log('\n' + '─'.repeat(40));
  console.log(`  ${text}`);
  console.log('─'.repeat(40) + '\n');
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Codex Model Switcher 配置向导       ║');
  console.log('╚══════════════════════════════════════╝\n');

  // 1. 欢迎信息
  console.log('本向导将帮助你完成以下配置:');
  console.log('  1. 配置模型供应商 API Key');
  console.log('  2. 选择默认模型');
  console.log('  3. 配置 Codex 连接');
  console.log('  4. 安装开机自启服务\n');

  const proceed = await ask('开始配置? (Y/n): ');
  if (proceed.trim().toLowerCase() === 'n') {
    console.log('已取消。');
    rl.close();
    return;
  }

  // 2. 配置 API Key
  banner('步骤 1/4: 配置 API Key');

  // 加载现有配置
  let config = { activeProvider: 'deepseek', mainPort: 11435, providers: {} };
  const CFG_PATH = resolve(ROOT, 'config.json');
  if (existsSync(CFG_PATH)) {
    try { config = JSON.parse(readFileSync(CFG_PATH, 'utf-8')); } catch {}
  }

  // DeepSeek
  console.log('── DeepSeek ──');
  console.log('  注册地址: https://platform.deepseek.com');
  const dsKey = await ask('  输入 DeepSeek API Key (留空跳过): ');
  if (dsKey.trim()) {
    config.providers.deepseek = {
      name: 'DeepSeek',
      apiKey: dsKey.trim(),
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      wireApi: 'chat',
      port: 11435,
    };
    console.log('  ✓ DeepSeek 已配置');
  } else if (config.providers.deepseek) {
    console.log('  - 保留现有 DeepSeek 配置');
  } else {
    console.log('  - 跳过 DeepSeek');
  }

  // 智谱
  console.log('\n── 智谱 GLM ──');
  console.log('  注册地址: https://open.bigmodel.cn');
  const zpKey = await ask('  输入智谱 API Key (留空跳过): ');
  if (zpKey.trim()) {
    config.providers.zhipu = {
      name: 'ZhiPu GLM',
      apiKey: zpKey.trim(),
      baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
      model: 'glm-5.1',
      wireApi: 'anthropic',
      port: 11436,
      userAgent: 'ClaudeCode/2.1.138',
      apiVersion: '2023-06-01',
    };
    console.log('  ✓ 智谱已配置');
  } else if (config.providers.zhipu) {
    console.log('  - 保留现有智谱配置');
  } else {
    console.log('  - 跳过智谱');
  }

  if (!config.providers.deepseek && !config.providers.zhipu) {
    console.log('\n⚠ 至少需要配置一个模型供应商!');
    rl.close();
    return;
  }

  // 3. 选择默认模型
  banner('步骤 2/4: 选择默认模型');

  const provNames = Object.keys(config.providers);
  if (provNames.length === 1) {
    config.activeProvider = provNames[0];
    console.log(`  自动选择: ${config.providers[provNames[0]].name}`);
  } else {
    console.log('  可选模型:');
    provNames.forEach((name, i) => {
      console.log(`    ${i + 1}. ${config.providers[name].name} (${config.providers[name].model})`);
    });
    const choice = await ask(`  选择默认模型 (1-${provNames.length}): `);
    const idx = parseInt(choice.trim()) - 1;
    config.activeProvider = provNames[idx >= 0 && idx < provNames.length ? idx : 0];
    console.log(`  ✓ 默认: ${config.providers[config.activeProvider].name}`);
  }

  // 保存配置
  writeFileSync(CFG_PATH, JSON.stringify(config, null, 2));
  console.log('\n  ✓ 配置已保存');

  // 4. 配置 Codex
  banner('步骤 3/4: 配置 Codex');

  const CODEX_DIR = resolve(HOME, '.codex');
  const CODEX_CONFIG = resolve(CODEX_DIR, 'config.toml');

  const autoCodex = await ask('  自动配置 Codex? (Y/n): ');
  if (autoCodex.trim().toLowerCase() !== 'n') {
    // 确保 .codex 目录存在
    if (!existsSync(CODEX_DIR)) {
      mkdirSync(CODEX_DIR, { recursive: true });
    }

    const PROXY_URL = 'http://127.0.0.1:11435/v1';

    let existing = '';
    if (existsSync(CODEX_CONFIG)) {
      existing = readFileSync(CODEX_CONFIG, 'utf-8');
    }

    if (existing.includes(PROXY_URL)) {
      console.log('  ✓ Codex 已指向本代理');
    } else {
      // 备份
      if (existing) {
        writeFileSync(CODEX_CONFIG + '.bak', existing);
        console.log('  ✓ 旧配置已备份');
      }

      // 保留非冲突配置
      const lines = existing.split('\n');
      const preserved = [];
      let skipBlock = false;
      for (const line of lines) {
        const t = line.trim();
        if (t.startsWith('model_provider') || t.startsWith('model =') || t.startsWith('model_reasoning') || t.startsWith('disable_response')) continue;
        if (t.startsWith('[model_providers')) { skipBlock = true; continue; }
        if (skipBlock && t.startsWith('[') && !t.startsWith('[model_providers')) skipBlock = false;
        if (skipBlock) continue;
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
      writeFileSync(CODEX_CONFIG, newConfig);
      console.log('  ✓ Codex 配置已更新');
    }
  } else {
    console.log('  - 跳过 Codex 配置');
    console.log('  手动配置: 编辑 ~/.codex/config.toml');
    console.log('  设置 base_url = "http://127.0.0.1:11435/v1"');
  }

  // 5. 安装服务
  banner('步骤 4/4: 开机自启');

  const autoService = await ask('  安装开机自启服务? (Y/n): ');
  if (autoService.trim().toLowerCase() !== 'n') {
    try {
      const { execSync } = await import('node:child_process');

      // 安装依赖
      if (!existsSync(resolve(ROOT, 'node_modules'))) {
        console.log('  安装依赖...');
        execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
      }

      // 写启动脚本
      const SCRIPT_NAME = 'start-codex-model-switcher.sh';
      writeFileSync(resolve(ROOT, 'scripts', SCRIPT_NAME), `#!/bin/bash\ncd "${ROOT}"\nexec node src/server.js\n`);
      execSync(`chmod +x "${resolve(ROOT, 'scripts', SCRIPT_NAME)}"`);

      // 写 LaunchAgent
      const PLIST_NAME = 'com.codex-model-switcher.proxy.plist';
      const LAUNCH_AGENTS = resolve(HOME, 'Library/LaunchAgents');
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codex-model-switcher.proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${resolve(ROOT, 'scripts', SCRIPT_NAME)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${resolve(ROOT, 'proxy.log')}</string>
    <key>StandardErrorPath</key>
    <string>${resolve(ROOT, 'proxy.log')}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;
      writeFileSync(resolve(LAUNCH_AGENTS, PLIST_NAME), plist);

      // 启动
      try { execSync(`launchctl bootout gui/$(id -u) ${resolve(LAUNCH_AGENTS, PLIST_NAME)} 2>/dev/null`); } catch {}
      execSync(`launchctl bootstrap gui/$(id -u) ${resolve(LAUNCH_AGENTS, PLIST_NAME)}`);
      console.log('  ✓ 服务已启动');
    } catch (e) {
      console.log(`  ✗ 安装失败: ${e.message}`);
      console.log('  你可以稍后运行: node scripts/install-service.js');
    }
  } else {
    console.log('  - 跳过开机自启');
    console.log('  稍后运行: node scripts/install-service.js');
  }

  // 完成
  banner('配置完成!');
  console.log('  代理地址: http://127.0.0.1:11435/v1/responses');
  console.log('  管理界面: http://127.0.0.1:11435/admin');
  console.log('');
  console.log('  下一步:');
  console.log('    1. 打开管理界面确认模型状态');
  console.log('    2. 重启 Codex 开始使用');
  console.log('');

  rl.close();
}

main().catch(e => {
  console.error('配置出错:', e.message);
  rl.close();
});
