#!/usr/bin/env node
/**
 * macOS LaunchAgent 安装脚本 — 实现开机自启
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HOME = homedir();
const LAUNCH_AGENTS = resolve(HOME, 'Library/LaunchAgents');

const PLIST_NAME = 'com.codex-model-switcher.proxy.plist';
const SCRIPT_NAME = 'start-codex-model-switcher.sh';

const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
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
</plist>
`;

const scriptContent = `#!/bin/bash
# Codex Model Switcher 启动脚本
cd "${ROOT}"
exec node src/server.js
`;

console.log('安装 Codex Model Switcher 服务...\n');

// 写启动脚本
writeFileSync(resolve(ROOT, 'scripts', SCRIPT_NAME), scriptContent);
execSync(`chmod +x "${resolve(ROOT, 'scripts', SCRIPT_NAME)}"`);
console.log(`✓ 启动脚本: ${resolve(ROOT, 'scripts', SCRIPT_NAME)}`);

// 写 plist
writeFileSync(resolve(LAUNCH_AGENTS, PLIST_NAME), plistContent);
console.log(`✓ LaunchAgent: ${resolve(LAUNCH_AGENTS, PLIST_NAME)}`);

// 安装依赖
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  console.log('\n安装依赖...');
  execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
}

// 加载服务
try {
  execSync(`launchctl bootout gui/$(id -u) ${resolve(LAUNCH_AGENTS, PLIST_NAME)} 2>/dev/null`);
} catch {}
execSync(`launchctl bootstrap gui/$(id -u) ${resolve(LAUNCH_AGENTS, PLIST_NAME)}`);
console.log('✓ 服务已启动');

console.log('\n安装完成！');
console.log(`  主入口: http://127.0.0.1:11435/v1/responses`);
console.log(`  管理界面: http://127.0.0.1:11435/admin`);
console.log(`  日志: tail -f ${resolve(ROOT, 'proxy.log')}`);
