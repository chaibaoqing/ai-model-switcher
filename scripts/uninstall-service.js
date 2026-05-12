#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const HOME = homedir();
const PLIST = resolve(HOME, 'Library/LaunchAgents/com.codex-model-switcher.proxy.plist');

console.log('卸载 Codex Model Switcher 服务...\n');

try {
  execSync(`launchctl bootout gui/$(id -u) ${PLIST} 2>/dev/null`);
  console.log('✓ 服务已停止');
} catch {
  console.log('  (服务未运行)');
}

if (existsSync(PLIST)) {
  unlinkSync(PLIST);
  console.log('✓ LaunchAgent 已删除');
}

console.log('\n卸载完成。');
