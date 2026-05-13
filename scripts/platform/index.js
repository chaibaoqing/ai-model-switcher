/**
 * 平台抽象层 — 根据操作系统自动加载对应实现
 */
import { execSync } from 'node:child_process';
import mac from './mac.js';
import win from './win.js';

const PLATFORM_IMPLS = {
  darwin: mac,
  win32: win,
};

const impl = PLATFORM_IMPLS[process.platform] || {
  getServiceName: () => 'ai-model-switcher',
  getPlatformName: () => process.platform,
  installService: () => {
    console.log('  ⚠ 当前平台不支持自动安装服务');
    console.log('  请手动启动: npm start');
  },
  uninstallService: () => {
    console.log('  ⚠ 当前平台不支持服务管理');
  },
  openUrl: (url) => {
    try { execSync(`xdg-open '${url}'`); } catch {}
  },
  getTrayInfo: () => ({
    type: 'none',
    description: '当前平台不支持系统托盘',
    available: false,
  }),
};

export const {
  getServiceName,
  getPlatformName,
  installService,
  uninstallService,
  openUrl,
  getTrayInfo,
} = impl;

export default impl;
