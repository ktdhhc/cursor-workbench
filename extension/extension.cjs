const vscode = require('vscode');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');

function activate(context) {
  const base = process.env.CURSOR_WORKBENCH_URL || 'http://127.0.0.1:4317';
  const token = process.env.CURSOR_WORKBENCH_BRIDGE_TOKEN;
  if (!token) return;
  const output = vscode.window.createOutputChannel('Cursor Workbench');
  const badge = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  badge.text = '$(hubot) Agents';
  badge.tooltip = 'Open Cursor Workbench Agents Window';
  badge.command = 'cursorWorkbench.openAgents';
  badge.show();
  let disposed = false;
  let busy = false;
  let connected = false;

  function request(route, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? null : JSON.stringify(body);
      const req = http.request(new URL(route, base), {
        method: data ? 'POST' : 'GET',
        headers: { 'X-Bridge-Token': token, ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
        timeout: 5000,
      }, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`Bridge HTTP ${res.statusCode}`));
          try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('Bridge timeout')));
      req.on('error', reject);
      req.end(data);
    });
  }

  async function publishContext() {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const editor = vscode.window.activeTextEditor;
    const file = editor?.document.uri.scheme === 'file' && folder
      ? path.relative(folder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/') : null;
    await request('/api/bridge/context', { path: file, dirty: editor?.document.isDirty || false });
  }

  async function openFile(relative) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root || typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('Invalid workspace file');
    const target = path.resolve(root, relative);
    const realRoot = await fs.realpath(root);
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(realRoot + path.sep)) throw new Error('File is outside workspace');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
  }

  // Keep the embedded editor's chrome in step with the Agents window theme.
  const THEME_PALETTES = {
    'Dark Modern': {
      'editor.background': '#191a1b', 'sideBar.background': '#161718', 'activityBar.background': '#161718',
      'titleBar.activeBackground': '#161718', 'statusBar.background': '#161718', 'tab.activeBackground': '#191a1b',
      'tab.inactiveBackground': '#161718', 'editorGroupHeader.tabsBackground': '#161718',
    },
    'Light Modern': {
      'editor.background': '#f7f6f2', 'sideBar.background': '#edece7', 'activityBar.background': '#edece7',
      'titleBar.activeBackground': '#edece7', 'statusBar.background': '#edece7', 'tab.activeBackground': '#f7f6f2',
      'tab.inactiveBackground': '#edece7', 'editorGroupHeader.tabsBackground': '#edece7',
    },
  };

  async function setTheme(name) {
    const palette = THEME_PALETTES[name];
    if (!palette) throw new Error(`Unknown editor theme: ${name}`);
    const config = vscode.workspace.getConfiguration('workbench');
    if (config.get('colorTheme') === name) return;
    await config.update('colorTheme', name, vscode.ConfigurationTarget.Global);
    await config.update('colorCustomizations', palette, vscode.ConfigurationTarget.Global);
  }

  async function poll() {
    if (disposed || busy) return;
    busy = true;
    try {
      const { commands } = await request('/api/bridge/commands');
      connected = true;
      for (const command of commands) {
        try {
          if (command.type === 'open') await openFile(command.path);
          else if (command.type === 'setTheme') await setTheme(command.theme);
          await request('/api/bridge/ack', { id: command.id, ok: true });
        } catch (error) {
          await request('/api/bridge/ack', { id: command.id, ok: false, error: error.message });
        }
      }
      await publishContext();
    } catch {
      connected = false;
    } finally { busy = false; }
  }

  context.subscriptions.push(output, badge,
    vscode.commands.registerCommand('cursorWorkbench.openAgents', () => request('/api/bridge/mode', { mode: 'agents' }).catch(() => vscode.env.openExternal(vscode.Uri.parse(base + '/?mode=agents')))),
    vscode.commands.registerCommand('cursorWorkbench.showContext', () => vscode.window.showInformationMessage(connected ? 'Agent bridge connected to this workspace.' : 'Agent bridge is reconnecting. Start the Cursor Workbench server.')),
    vscode.window.onDidChangeActiveTextEditor(() => publishContext().catch(() => {})),
    vscode.workspace.onDidSaveTextDocument(() => publishContext().catch(() => {})),
  );
  const timer = setInterval(poll, 1000);
  context.subscriptions.push({ dispose() { disposed = true; clearInterval(timer); } });
  poll();
}

module.exports = { activate };
