import { mkdir, readFile, writeFile, cp, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '4.138.0';
const sourceVersion = '1.138.0';
const exists = file => access(file).then(() => true, () => false);
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
if (process.platform === 'win32') {
  const linuxRoot = '/mnt/' + root[0].toLowerCase() + root.slice(2).replaceAll('\\', '/');
  run('wsl.exe', ['-d', 'Ubuntu', '--cd', linuxRoot, '--exec', '/bin/bash', '-c', 'export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"; node scripts/setup.mjs']);
} else {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('This pinned runtime supports Linux x64; run in WSL Ubuntu on Windows.');
  for (const dir of ['vendor', '.runtime', '.state/code/User', '.state/extensions', '.logs']) await mkdir(path.join(root, dir), { recursive: true });
  if (!await exists(path.join(root, 'vendor/vscode/.git'))) run('git', ['clone', '--depth', '1', '--branch', sourceVersion, 'https://github.com/microsoft/vscode.git', 'vendor/vscode']);
  const runtime = path.join(root, `.runtime/code-server-${version}-linux-amd64/bin/code-server`);
  if (!await exists(runtime)) {
    const archive = path.join(root, `vendor/code-server-${version}-linux-amd64.tar.gz`);
    if (!await exists(archive)) {
      console.log(`Downloading code-server ${version} from its official release…`);
      const response = await fetch(`https://github.com/coder/code-server/releases/download/v${version}/code-server-${version}-linux-amd64.tar.gz`);
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
  if (!await exists(path.join(root, '.env'))) await cp(path.join(root, '.env.example'), path.join(root, '.env'));
  run('npm', ['install', '--no-audit', '--no-fund']);
  run(runtime, ['--version']);
  console.log('Setup complete. Configure .env, then npm run launch.');
}
