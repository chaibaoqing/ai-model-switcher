#!/usr/bin/env node
/**
 * 重启辅助脚本 — 杀掉旧进程后启动新的
 */
import { spawn, execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER = resolve(ROOT, 'src/server.js');
const PORT = 11435;
const isWin = process.platform === 'win32';

// 1. 杀掉占用端口的进程
console.log('Stopping old process...');
try {
  if (isWin) {
    const out = execSync(`netstat -aon | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf-8' });
    const pid = out.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) execSync(`taskkill /pid ${pid} /f`, { windowsHide: true });
  } else {
    execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`);
  }
} catch {}

// 2. 等端口释放
await new Promise(r => setTimeout(r, 1000));

// 3. 启动新进程
console.log('Starting new process...');
const child = spawn(process.execPath, [SERVER], {
  cwd: ROOT,
  stdio: 'inherit',
});
child.on('error', (e) => { console.error('Start failed:', e.message); process.exit(1); });
child.on('exit', (code) => { process.exit(code || 0); });
