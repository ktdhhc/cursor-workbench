import { spawn, spawnSync } from 'node:child_process';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform === 'win32') {
  const linuxRoot = '/mnt/' + root[0].toLowerCase() + root.slice(2).replaceAll('\\', '/');
  const child = spawn('wsl.exe', ['-d', 'Ubuntu', '--cd', linuxRoot, '--exec', '/bin/bash', '-c', 'export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"; exec node scripts/launch.mjs'], { stdio: 'inherit' });
  child.on('exit', code => process.exit(code || 0));
} else {
  const envFile = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
  const port = Number(envFile.PORT || 4317);
  const editorPort = Number(envFile.CODE_SERVER_PORT || 4318);
  const workspace = path.resolve(envFile.WORKSPACE_ROOT || path.join(root, 'workspace'));
  await access(workspace);
  await mkdir(path.join(root, '.logs'), { recursive: true });
  await cp(path.join(root, 'extension'), path.join(root, '.state/extensions/local-workbench.cursor-workbench-bridge-0.1.0'), { recursive: true });
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);
  async function available(url) {
    try { return await fetch(url, { signal: AbortSignal.timeout(1500) }); } catch { return null; }
  }
  const existing = await available(`http://127.0.0.1:${port}/api/health`);
  if (existing) throw new Error(`Port ${port} already responds. Open the running app or choose different ports in .env; it was not stopped.`);
  const children = [];
  const editorExisting = await available(`http://127.0.0.1:${editorPort}/healthz`);
  if (editorExisting) {
    const info = await editorExisting.json().catch(() => ({}));
    if (!['alive', 'expired'].includes(info.status)) throw new Error(`Port ${editorPort} is occupied by another service.`);
    console.log(`Reusing running code-server on ${editorPort}.`);
  } else {
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|PASSWORD|SECRET|^AI_)/i.test(key)));
    const editor = spawn('/bin/bash', [path.join(root, 'scripts/code-server.sh')], { cwd: root, stdio: 'inherit', env: { ...cleanEnv, PORT: String(port), CODE_SERVER_PORT: String(editorPort), WORKSPACE_ROOT: workspace } });
    children.push(editor);
  }
  const server = spawn(process.execPath, ['--env-file=.env', 'server/index.mjs'], { cwd: root, stdio: 'inherit' });
  children.push(server);
  await writeFile(path.join(root, '.state/launch-pids.json'), JSON.stringify(children.map(child => child.pid)));
  console.log(`Open http://127.0.0.1:${port} — Ctrl+C stops processes started by this launcher.`);
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
