#!/usr/bin/env node
/**
 * codex-model-switcher CLI 入口
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start':
    await import('./server.js');
    break;
  case 'install':
    await import('../scripts/install-service.js');
    break;
  case 'uninstall':
    await import('../scripts/uninstall-service.js');
    break;
  case 'setup':
    await import('../scripts/setup-wizard.js');
    break;
  case 'tray':
    await import('../scripts/tray.js');
    break;
  case 'version':
  case '-v':
  case '--version':
    console.log('codex-model-switcher v1.0.0');
    break;
  case 'help':
  case '-h':
  case '--help':
  default:
    console.log(`
codex-model-switcher — Codex 多模型统一代理

用法:
  codex-model-switcher start       启动代理服务
  codex-model-switcher setup       运行配置向导
  codex-model-switcher install     安装开机自启服务
  codex-model-switcher uninstall   卸载服务
  codex-model-switcher tray        菜单栏工具 (macOS)
  codex-model-switcher version     显示版本
  codex-model-switcher help        显示帮助
`);
    break;
}
