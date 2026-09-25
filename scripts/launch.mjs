import { spawn, spawnSync } from 'node:child_process';
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wslDistros, toWslPath } from './wsl.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = file => access(file).then(() => true, () => false);

// npm prunes the other platform's optional native deps on each install
// (npm/cli#4828). Detect and heal before building on this platform.
const rollupNative = {
  'linux-x64': '@rollup/rollup-linux-x64-gnu', 'linux-arm64': '@rollup/rollup-linux-arm64-gnu',
  'win32-x64': '@rollup/rollup-win32-x64-msvc', 'darwin-x64': '@rollup/rollup-darwin-x64', 'darwin-arm64': '@rollup/rollup-darwin-arm64',
};
const esbuildNative = {
  'linux-x64': '@esbuild/linux-x64', 'linux-arm64': '@esbuild/linux-arm64',
  'win32-x64': '@esbuild/win32-x64', 'darwin-x64': '@esbuild/darwin-x64', 'darwin-arm64': '@esbuild/darwin-arm64',
};

async function newerThanDist(relative) {
  const distTime = (await stat(path.join(root, 'dist/index.html'))).mtimeMs;
  const target = path.join(root, relative);
  const info = await stat(target);
  return info.isDirectory() ? await sourcesNewerThan(target, distTime) : info.mtimeMs > distTime;
}
async function sourcesNewerThan(dir, distTime) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, item.name);
    if (item.isDirectory()) { if (await sourcesNewerThan(child, distTime)) return true; }
    else if ((await stat(child)).mtimeMs > distTime) return true;
  }
  return false;
}

async function needsBuild() {
  if (!await exists(path.join(root, 'dist/index.html'))) return true;
  for (const entry of ['index.html', 'vite.config.mjs', 'package.json', 'client']) {
    if (await newerThanDist(entry)) return true;
  }
  return false;
}

async function ensurePlatformDeps() {
  const pkg = `${process.platform}-${process.arch}`;
  for (const dependency of [rollupNative[pkg], esbuildNative[pkg]]) {
    if (dependency && !await exists(path.join(root, 'node_modules', dependency))) {
      console.log(`Installing platform build dependency ${dependency}…`);
      spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
      return;
    }
  }
}

async function buildClient() {
  if (!await needsBuild()) {
    console.log('Client build is up to date; skipping build.');
    return;
  }
  await ensurePlatformDeps();
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (build.status !== 0) process.exit(build.status || 1);
}

async function responds(port, path = '/api/health') {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(1500) });
    return response;
  } catch {
    return null;
  }
}

async function readEnvFile() {
  try {
    return parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
  } catch {
    return {};
  }
}

async function startServer({ editorEnabled }) {
  const child = spawn(process.execPath, ['--env-file=.env', 'server/index.mjs'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, ...(editorEnabled ? { EDITOR_ENABLED: '1' } : {}) },
  });
  await writeFile(path.join(root, '.state/launch-pids.json'), JSON.stringify([child.pid]));
  return child;
}

function watchChildren(children) {
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill('SIGTERM');
    setTimeout(() => process.exit(code), 2500).unref();
  }
  for (const child of children) child.on('exit', code => { if (!stopping) stop(code || 0); });
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
}

async function launchWithEditor({ envFile, port, editorPort, workspace }) {
  await buildClient();
  await mkdir(path.join(root, '.logs'), { recursive: true });
  await cp(path.join(root, 'extension'), path.join(root, '.state/extensions/local-workbench.cursor-workbench-bridge-0.1.0'), { recursive: true });
  const children = [];
  const existing = await responds(editorPort, '/healthz');
  if (existing) {
    const info = await existing.json().catch(() => ({}));
    if (!['alive', 'expired'].includes(info.status)) throw new Error(`Port ${editorPort} is occupied by another service.`);
    console.log(`Reusing running code-server on ${editorPort}.`);
  } else {
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|PASSWORD|SECRET|^AI_)/i.test(key)));
    const editor = spawn(process.platform === 'win32' ? 'bash' : '/bin/bash', [path.join(root, 'scripts/code-server.sh')], {
      cwd: root, stdio: 'inherit',
      env: { ...cleanEnv, PORT: String(port), CODE_SERVER_PORT: String(editorPort), WORKSPACE_ROOT: workspace },
    });
    children.push(editor);
  }
  const server = await startServer({ editorEnabled: true });
  children.push(server);
  console.log(`Open http://127.0.0.1:${port} — Ctrl+C stops processes started by this launcher.`);
  watchChildren(children);
}

async function launchAgentsOnly() {
  const envFile = await readEnvFile();
  const port = Number(envFile.PORT || 4317);
  if (await responds(port)) throw new Error(`Port ${port} already responds. Open the running app or choose a different port in .env; it was not stopped.`);
  await buildClient();
  await mkdir(path.join(root, '.logs'), { recursive: true });
  const server = await startServer({ editorEnabled: false });
  console.log(`Open http://127.0.0.1:${port} — Agents-only mode (no editor runtime on this machine).`);
  console.log('Agent tasks, file tools and approved terminal commands work. To enable the real editor, see README: “Enable the editor without WSL”, or install WSL and run `npm run launch` again.');
  watchChildren([server]);
}

async function main() {
  if (process.platform === 'win32') {
    const forceNative = /^(?:1|true)$/i.test(process.env.CURSOR_WORKBENCH_NATIVE || '');
    const distros = forceNative ? [] : wslDistros();
    if (distros.length) {
      const distro = process.env.CURSOR_WORKBENCH_WSL_DISTRO || distros[0];
      console.log(`Using WSL distro: ${distro}`);
      const child = spawn('wsl.exe', ['-d', distro, '--cd', toWslPath(root), '--exec', '/bin/bash', '-c',
        'set -e; NB="$(bash scripts/wsl-node.sh)"; export PATH="$(dirname "$NB"):$PATH"; exec node scripts/launch.mjs'], { stdio: 'inherit' });
      child.on('exit', code => process.exit(code || 0));
      return;
    }
    await launchAgentsOnly();
    return;
  }
  const envFile = await readEnvFile();
  const port = Number(envFile.PORT || 4317);
  const editorPort = Number(envFile.CODE_SERVER_PORT || 4318);
  const workspace = path.resolve(envFile.WORKSPACE_ROOT || path.join(root, 'workspace'));
  await access(workspace);
  await launchWithEditor({ envFile, port, editorPort, workspace });
}

main().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
