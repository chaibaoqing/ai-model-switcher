#!/usr/bin/env node
/**
 * 后台启动服务 — 关掉终端也不会停止
 * macOS: nohup 后台进程
 * Windows: VBS 静默启动
 */
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, openSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER = resolve(ROOT, 'src/server.js');
const LOG = resolve(ROOT, 'proxy.log');
const PID_FILE = resolve(ROOT, '.pid');

const isWin = process.platform === 'win32';

if (isWin) {
  const vbsPath = resolve(ROOT, 'scripts', '_run_bg.vbs');
  writeFileSync(vbsPath, `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${process.execPath}"" ""${SERVER}""", 0, False
`);
  spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref();
  console.log('Service started in background.');
  console.log('Web UI: http://127.0.0.1:11435/admin');
  console.log('Stop: npm run stop');
} else {
  const out = openSync(LOG, 'a');
  const child = spawn(process.execPath, [SERVER], {
    detached: true,
    stdio: ['ignore', out, out],
    cwd: ROOT,
    env: { ...process.env, NO_OPEN_BROWSER: '1' },
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  console.log('Service started in background (PID: ' + child.pid + ').');
  console.log('Web UI: http://127.0.0.1:11435/admin');
  console.log('Log: tail -f ' + LOG);
  console.log('Stop: npm run stop');
}
