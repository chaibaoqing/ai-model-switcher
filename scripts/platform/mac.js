/**
 * macOS 平台实现 — LaunchAgent 服务管理
 */
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
const LAUNCH_AGENTS = resolve(HOME, 'Library/LaunchAgents');
const PLIST_NAME = 'com.ai-model-switcher.proxy.plist';

export function getServiceName() {
  return 'com.ai-model-switcher.proxy';
}

export function getPlatformName() {
  return 'macOS';
}

/**
 * 安装开机自启服务
 * @param {string} root - 项目根目录
 * @param {string} nodePath - node 可执行文件路径
 * @param {string} serverPath - server.js 路径
 */
export function installService(root, nodePath, serverPath) {
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ai-model-switcher.proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${serverPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${root}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${resolve(root, 'proxy.log')}</string>
    <key>StandardErrorPath</key>
    <string>${resolve(root, 'proxy.log')}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${HOME}</string>
    </dict>
</dict>
</plist>
`;

  const plistPath = resolve(LAUNCH_AGENTS, PLIST_NAME);
  writeFileSync(plistPath, plistContent);
  console.log('  ✓ LaunchAgent 已注册');

  // 先卸载旧实例（如果有）
  try {
    execSync(`launchctl bootout gui/$(id -u) ${plistPath} 2>/dev/null`);
  } catch {}

  // 启动服务
  execSync(`launchctl bootstrap gui/$(id -u) ${plistPath}`);
  console.log('  ✓ 服务已启动');
}

/**
 * 卸载服务
 */
export function uninstallService() {
  const plistPath = resolve(LAUNCH_AGENTS, PLIST_NAME);

  try {
    execSync(`launchctl bootout gui/$(id -u) ${plistPath} 2>/dev/null`);
    console.log('  ✓ 服务已停止');
  } catch {
    console.log('  (服务未运行)');
  }

  if (existsSync(plistPath)) {
    unlinkSync(plistPath);
    console.log('  ✓ LaunchAgent 已删除');
  }
}

/**
 * 打开 URL
 */
export function openUrl(url) {
  execSync(`open '${url}'`);
}

/**
 * 获取托盘实现
 */
export function getTrayInfo() {
  return {
    type: 'applescript',
    description: 'macOS 菜单栏 (AppleScript)',
    available: process.platform === 'darwin',
  };
}

export default { getServiceName, getPlatformName, installService, uninstallService, openUrl, getTrayInfo };
