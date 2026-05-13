#!/usr/bin/env node
/**
 * macOS 菜单栏工具 — 在系统菜单栏显示模型状态
 * 使用 AppleScript 实现轻量级菜单栏图标
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PORT = 11435;
const ADMIN_URL = `http://127.0.0.1:${PORT}/admin`;

function fetchStatus() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/admin/api/status`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

async function buildMenu() {
  const status = await fetchStatus();

  if (!status) {
    return {
      title: '⚡ 代理离线',
      items: [
        { title: '启动代理', action: 'start' },
        { title: '退出', action: 'quit' },
      ]
    };
  }

  const activeName = status.providers?.[status.activeProvider]?.name || status.activeProvider;
  const items = [];

  items.push({ title: `当前: ${activeName}`, enabled: false });
  items.push({ title: '—', enabled: false });

  for (const [id, prov] of Object.entries(status.providers || {})) {
    if (id !== status.activeProvider) {
      items.push({ title: `切换到 ${prov.name}`, action: `switch:${id}` });
    }
  }

  items.push({ title: '—', enabled: false });
  items.push({ title: '打开管理界面', action: 'open' });
  items.push({ title: '退出', action: 'quit' });

  return { title: `🤖 ${activeName}`, items };
}

// AppleScript 菜单栏脚本
function runMenuBar() {
  const script = `
use framework "AppKit"
use framework "Foundation"

set {NSStatusBar, NSStatusItem, NSMenu, NSMenuItem, NSImage, NSWorkspace} to ¬
  current application's NSStatusBar's systemStatusBar()

-- 创建状态栏项
set statusBarItem to NSStatusBar's statusItemWithLength:(current application's NSVariableStatusItemLength)
statusBarItem's button's setTitle:"🤖"
statusBarItem's button's setToolTip:"AI Model Switcher"

-- 创建菜单 (会在每次点击时刷新)
set theMenu to current application's NSMenu's alloc()'s init()
theMenu's setAutoenablesItems:false

-- 菜单项
set menuItem to (current application's NSMenuItem's alloc()'s initWithTitle:"加载中..." action:(missing value) keyEquivalent:"")
menuItem's setEnabled:false
theMenu's addItem:menuItem

theMenu's addItem:(current application's NSMenuItem's separatorItem())

set openItem to (current application's NSMenuItem's alloc()'s initWithTitle:"打开管理界面" action:"openAdmin:" keyEquivalent:"")
openItem's setTarget:me
theMenu's addItem:openItem

set quitItem to (current application's NSMenuItem's alloc()'s initWithTitle:"退出" action:"terminate:" keyEquivalent:"q")
theMenu's addItem:quitItem

statusBarItem's setMenu:theMenu

-- 打开管理界面
on openAdmin:sender
  do shell script "open '${ADMIN_URL}'"
end openAdmin:

-- 保持运行
current application's NSRunLoop's currentRunLoop()'s run()
`;

  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      stdio: 'ignore',
      timeout: 0,
    });
  } catch {
    // 如果 AppleScript 不可用，回退到简单通知
    console.log('菜单栏不可用，使用 CLI 模式');
  }
}

// 简单 CLI 模式
async function cliMode() {
  console.log('\n  AI Model Switcher 菜单栏工具\n');
  console.log('  命令:');
  console.log('    s - 查看状态');
  console.log('    o - 打开管理界面');
  console.log('    数字 - 切换到对应供应商');
  console.log('    q - 退出\n');

  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question('> ', async (cmd) => {
      cmd = cmd.trim().toLowerCase();

      if (cmd === 'q') { rl.close(); return; }
      if (cmd === 'o') {
          const platform = await import('./platform/index.js');
          platform.openUrl(ADMIN_URL);
        }
      if (cmd === 's' || cmd === '') {
        const status = await fetchStatus();
        if (status) {
          const active = status.providers?.[status.activeProvider]?.name || status.activeProvider;
          console.log(`\n  当前: ${active}`);
          for (const [id, prov] of Object.entries(status.providers || {})) {
            const mark = id === status.activeProvider ? ' ←' : '';
            console.log(`    ${prov.name} (${prov.model})${mark}`);
          }
        } else {
          console.log('  代理离线');
        }
      }

      // 数字切换
      const num = parseInt(cmd);
      if (!isNaN(num) && num > 0) {
        const status = await fetchStatus();
        if (status) {
          const ids = Object.keys(status.providers || {});
          if (num <= ids.length) {
            const target = ids[num - 1];
            execSync(`curl -s -X POST http://127.0.0.1:${PORT}/admin/api/switch -H 'Content-Type: application/json' -d '{"provider":"${target}'}'`);
            console.log(`  ✓ 已切换到 ${status.providers[target].name}`);
          }
        }
      }

      ask();
    });
  };

  ask();
}

// 主入口
const args = process.argv.slice(2);
if (args.includes('--cli')) {
  cliMode();
} else {
  // 先尝试 AppleScript 菜单栏
  try {
    runMenuBar();
  } catch {
    cliMode();
  }
}
