#!/usr/bin/env node
/**
 * 停止后台服务
 */
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PID_FILE = resolve(ROOT, '.pid');

const isWin = process.platform === 'win32';

if (isWin) {
  // Windows: 通过端口找进程杀掉
  try {
    const out = execSync('netstat -aon | findstr :11435 | findstr LISTENING', { encoding: 'utf-8' });
    const pid = out.trim().split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid)) {
      execSync(`taskkill /pid ${pid} /f`, { windowsHide: true });
      console.log('Service stopped (PID: ' + pid + ').');
    } else {
      console.log('No service running on port 11435.');
    }
  } catch {
    console.log('No service running on port 11435.');
  }
} else {
  // macOS / Linux: 读 PID 文件
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim());
    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log('Service stopped (PID: ' + pid + ').');
      } catch {
        console.log('Process already stopped.');
      }
    }
    unlinkSync(PID_FILE);
  } else {
    // 尝试通过端口找进程
    try {
      const out = execSync(`lsof -ti:11435`, { encoding: 'utf-8' }).trim();
      if (out) {
        execSync(`kill ${out}`);
        console.log('Service stopped.');
      }
    } catch {
      console.log('No service running on port 11435.');
    }
  }
}
