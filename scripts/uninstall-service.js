#!/usr/bin/env node
/**
 * 卸载服务 — 支持 macOS 和 Windows
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const platform = await import('./platform/index.js');

console.log(`卸载 AI Model Switcher 服务 (${platform.getPlatformName()})...\n`);
platform.uninstallService();
console.log('\n卸载完成。');
