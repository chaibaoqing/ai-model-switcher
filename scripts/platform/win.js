/**
 * Windows 平台实现 — Task Scheduler 服务管理
 */
import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TASK_NAME = 'AIModelSwitcher';

export function getServiceName() {
  return TASK_NAME;
}

export function getPlatformName() {
  return 'Windows';
}

/**
 * 生成 VBS 静默启动脚本（避免弹黑窗口）
 */
function createVbsLauncher(root, nodePath, serverPath) {
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """${nodePath}"" ""${serverPath}""", 0, False
`;
  const vbsPath = resolve(root, 'scripts', 'start-ai-model-switcher.vbs');
  writeFileSync(vbsPath, vbsContent);
  return vbsPath;
}

/**
 * 安装开机自启服务 (Windows Task Scheduler)
 * @param {string} root - 项目根目录
 * @param {string} nodePath - node 可执行文件路径
 * @param {string} serverPath - server.js 路径
 */
export function installService(root, nodePath, serverPath) {
  // 创建 VBS 静默启动脚本
  const vbsPath = createVbsLauncher(root, nodePath, serverPath);
  console.log('  ✓ 启动脚本已创建');

  // 先删除已有任务（忽略错误）
  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe' });
  } catch {}

  // 创建计划任务：用户登录时运行
  const cmd = `schtasks /create /tn "${TASK_NAME}" /tr "wscript.exe \\"${vbsPath}\\"" /sc onlogon /rl highest /f`;
  execSync(cmd, { windowsHide: true });
  console.log('  ✓ Task Scheduler 任务已注册 (登录时自动启动)');

  // 立即启动
  try {
    execSync(`schtasks /run /tn "${TASK_NAME}"`, { windowsHide: true });
    console.log('  ✓ 服务已启动');
  } catch (e) {
    console.log('  ⚠ 自动启动失败，请手动运行: npm start');
  }
}

/**
 * 卸载服务
 */
export function uninstallService() {
  try {
    execSync(`schtasks /end /tn "${TASK_NAME}"`, { stdio: 'pipe', windowsHide: true });
    console.log('  ✓ 服务已停止');
  } catch {
    console.log('  (服务未运行)');
  }

  try {
    execSync(`schtasks /delete /tn "${TASK_NAME}" /f`, { stdio: 'pipe', windowsHide: true });
    console.log('  ✓ Task Scheduler 任务已删除');
  } catch {
    console.log('  (任务不存在)');
  }

  // 清理 VBS 脚本
  const vbsPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'start-ai-model-switcher.vbs');
  // 需要基于 root 来算
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const vbsInScripts = resolve(root, 'scripts', 'start-ai-model-switcher.vbs');
  if (existsSync(vbsInScripts)) {
    unlinkSync(vbsInScripts);
    console.log('  ✓ 启动脚本已删除');
  }
}

/**
 * 打开 URL (Windows)
 */
export function openUrl(url) {
  execSync(`start "" "${url}"`, { windowsHide: true });
}

/**
 * 获取托盘信息
 */
export function getTrayInfo() {
  return {
    type: 'none',
    description: 'Windows 系统托盘暂未实现，请使用 Web 管理界面',
    available: false,
  };
}

export default { getServiceName, getPlatformName, installService, uninstallService, openUrl, getTrayInfo };
