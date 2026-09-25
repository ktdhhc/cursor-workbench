import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wslDistros, toWslPath } from './wsl.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '4.138.0';
const sourceVersion = '1.138.0';
const exists = file => access(file).then(() => true, () => false);
const codeServerAsset = {
  'linux-x64': 'linux-amd64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-amd64',
  'darwin-arm64': 'darwin-arm64',
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
const npm = args => run('npm', args, { shell: process.platform === 'win32' });

async function setupEditorRuntime() {
  const asset = codeServerAsset[`${process.platform}-${process.arch}`];
  if (!asset) {
    throw new Error(`No official code-server build for ${process.platform}-${process.arch}. On Windows use WSL, or a native source build (see README: Enable the editor without WSL).`);
  }
  for (const dir of ['vendor', '.runtime', '.state/code/User', '.state/extensions', '.logs']) await mkdir(path.join(root, dir), { recursive: true });
  if (!await exists(path.join(root, 'vendor/vscode/.git'))) run('git', ['clone', '--depth', '1', '--branch', sourceVersion, 'https://github.com/microsoft/vscode.git', 'vendor/vscode']);
  const runtime = path.join(root, `.runtime/code-server-${version}-${asset}`, 'bin/code-server');
  if (!await exists(runtime)) {
    const archive = path.join(root, `vendor/code-server-${version}-${asset}.tar.gz`);
    if (!await exists(archive)) {
      console.log(`Downloading code-server ${version} (${asset}) from its official release…`);
      const response = await fetch(`https://github.com/coder/code-server/releases/download/v${version}/code-server-${version}-${asset}.tar.gz`);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
    }
    run('tar', ['-xzf', archive, '-C', '.runtime']);
  }
  const tokenFile = path.join(root, '.state/bridge-token');
  if (!await exists(tokenFile)) await writeFile(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const configFile = path.join(root, '.state/code-server.yaml');
  if (!await exists(configFile)) await writeFile(configFile, 'bind-addr: 127.0.0.1:4318\nauth: none\ncert: false\n');
  const settingsFile = path.join(root, '.state/code/User/settings.json');
  if (!await exists(settingsFile)) await cp(path.join(root, 'scripts/editor-settings.json'), settingsFile);
  await cp(path.join(root, 'extension'), path.join(root, '.state/extensions/local-workbench.cursor-workbench-bridge-0.1.0'), { recursive: true });
  await npm(['install', '--no-audit', '--no-fund']);
  run(runtime, ['--version']);
  console.log('Setup complete with the editor runtime. Configure .env, then npm run launch.');
}

async function setupAgentsOnly() {
  await mkdir(path.join(root, '.logs'), { recursive: true });
  if (!await exists(path.join(root, '.env'))) await cp(path.join(root, '.env.example'), path.join(root, '.env'));
  await npm(['install', '--no-audit', '--no-fund']);
  console.log('Agents-only setup complete (no editor runtime installed).');
  console.log('Next: set AI_API_KEY in .env, then `npm start`. Agent tasks, file tools and approved terminal commands work.');
  console.log('To also enable the real editor later, see README: “Enable the editor without WSL”, or install WSL and run `npm run setup` again.');
}

if (process.platform === 'win32') {
  const distros = wslDistros();
  if (distros.length) {
    const distro = process.env.CURSOR_WORKBENCH_WSL_DISTRO || distros[0];
    console.log(`Using WSL distro: ${distro}`);
    run('wsl.exe', ['-d', distro, '--cd', toWslPath(root), '--exec', '/bin/bash', '-c',
      'set -e; NB="$(bash scripts/wsl-node.sh)"; export PATH="$(dirname "$NB"):$PATH"; exec node scripts/setup.mjs']);
  } else {
    await setupAgentsOnly();
  }
} else if (process.platform === 'linux' || process.platform === 'darwin') {
  await setupEditorRuntime();
} else {
  throw new Error(`Unsupported platform: ${process.platform}. Windows uses WSL or a native source build (see README).`);
}
