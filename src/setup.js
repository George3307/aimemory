/**
 * aimemory - MCP Server 自动配置
 * 一行命令配置 Claude Desktop、Cursor、Windsurf、Cline
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// MCP Server 的入口路径
const mcpServerPath = join(__dirname, 'mcp-server.js');

// 各客户端的配置文件路径
function getClientConfigs() {
  const home = homedir();
  const isMac = platform() === 'darwin';
  const isWin = platform() === 'win32';

  const clients = {
    'Claude Desktop': {
      path: isMac
        ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
        : isWin
          ? join(home, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
          : join(home, '.config', 'claude', 'claude_desktop_config.json'),
    },
    'Cursor': {
      path: join(home, '.cursor', 'mcp.json'),
    },
    'Windsurf': {
      path: isMac
        ? join(home, '.codeium', 'windsurf', 'mcp_config.json')
        : join(home, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    'Cline': {
      // Cline 用 VS Code 的 settings，但也支持独立 mcp 配置
      path: isMac
        ? join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
        : isWin
          ? join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json')
          : join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    },
  };

  return clients;
}

// 生成 aimemory 的 MCP 配置
function getAimemoryConfig() {
  return {
    command: 'node',
    args: [mcpServerPath],
    env: {}
  };
}

/**
 * 自动检测并配置所有支持的客户端
 * @param {object} options
 * @param {string[]} options.only - 只配置指定客户端
 * @param {boolean} options.force - 强制覆盖已有配置
 * @returns {Array<{client: string, status: string, path: string}>}
 */
export function setupAll(options = {}) {
  const clients = getClientConfigs();
  const results = [];

  for (const [name, config] of Object.entries(clients)) {
    if (options.only && !options.only.some(o => name.toLowerCase().includes(o.toLowerCase()))) {
      continue;
    }

    const result = setupClient(name, config.path, options.force);
    results.push(result);
  }

  return results;
}

/**
 * 配置单个客户端
 */
function setupClient(name, configPath, force = false) {
  try {
    // 检查配置文件目录是否存在（说明客户端可能安装了）
    const dir = dirname(configPath);
    const dirExists = existsSync(dir);

    if (!dirExists) {
      return { client: name, status: 'skipped', path: configPath, reason: '未检测到客户端' };
    }

    // 读取现有配置
    let config = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        config = {};
      }
    }

    // 检查是否已配置
    if (!config.mcpServers) config.mcpServers = {};
    
    if (config.mcpServers.aimemory && !force) {
      return { client: name, status: 'exists', path: configPath, reason: '已配置（用 --force 覆盖）' };
    }

    // 写入配置
    config.mcpServers.aimemory = getAimemoryConfig();

    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { client: name, status: 'configured', path: configPath };
  } catch (e) {
    return { client: name, status: 'error', path: configPath, reason: e.message };
  }
}

/**
 * 打印 setup 结果
 */
export function printSetupResults(results) {
  console.log('\n🔧 aimemory MCP 配置结果:\n');

  const icons = {
    configured: '✅',
    exists: '⚡',
    skipped: '⏭️',
    error: '❌',
  };

  for (const r of results) {
    const icon = icons[r.status] || '❓';
    const reason = r.reason ? ` — ${r.reason}` : '';
    console.log(`  ${icon} ${r.client}: ${r.status}${reason}`);
    if (r.status === 'configured') {
      console.log(`     → ${r.path}`);
    }
  }

  const configured = results.filter(r => r.status === 'configured');
  if (configured.length > 0) {
    console.log(`\n🎉 已配置 ${configured.length} 个客户端！请重启对应应用使配置生效。`);
  } else {
    console.log('\n💡 没有新配置。如需强制覆盖，使用: aimem setup --force');
  }
  console.log();
}
