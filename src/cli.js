#!/usr/bin/env node
/**
 * AI Model Switcher CLI 入口
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
    console.log('ai-model-switcher v1.3.0');
    break;
  case 'help':
  case '-h':
  case '--help':
  default:
    console.log(`
ai-model-switcher — AI 多模型统一代理

用法:
  ai-model-switcher start       启动代理服务
  ai-model-switcher setup       运行配置向导
  ai-model-switcher install     安装开机自启服务
  ai-model-switcher uninstall   卸载服务
  ai-model-switcher tray        菜单栏工具 (macOS)
  ai-model-switcher version     显示版本
  ai-model-switcher help        显示帮助
`);
    break;
}
