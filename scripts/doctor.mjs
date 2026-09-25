import { access, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wslDistros } from './wsl.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = file => access(file).then(() => true, () => false);
const codeServerAsset = {
  'linux-x64': 'linux-amd64',
  'linux-arm64': 'linux-arm64',
  'darwin-x64': 'darwin-amd64',
  'darwin-arm64': 'darwin-arm64',
};

export async function collect(env = process.env) {
  const findings = [];
  const push = (id, ok, detail) => findings.push({ id, ok, detail });
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  push('node', nodeMajor >= 22, `Node ${process.versions.node} on ${process.platform}-${process.arch} (requires >=22)`);
  push('platform', ['win32', 'linux', 'darwin'].includes(process.platform), `${process.platform}-${process.arch}`);

  let envValues = {};
  try {
    envValues = parseEnv(await readFile(path.join(root, '.env'), 'utf8'));
    push('env', true, '.env found');
  } catch {
    push('env', false, '.env missing — run `npm run setup`, or copy .env.example to .env');
  }
  const key = envValues.AI_API_KEY || env.AI_API_KEY;
  const keySet = Boolean(key) && !key.startsWith('replace-');
  push('key', keySet, keySet ? 'AI_API_KEY is set (hidden)' : 'set AI_API_KEY in .env to talk to the model');
  push('model', Boolean(envValues.AI_MODEL || env.AI_MODEL || envValues.AI_BASE_URL), `${envValues.AI_BASE_URL || env.AI_BASE_URL || 'https://api.deepseek.com/v1 (default)'} · ${envValues.AI_MODEL || env.AI_MODEL || 'deepseek-flash (default)'}`);

  const asset = codeServerAsset[`${process.platform}-${process.arch}`];
  const runtime = asset ? path.join(root, `.runtime/code-server-4.138.0-${asset}`, 'bin/code-server') : null;
  const runtimeReady = runtime ? await exists(runtime) : false;
  push('editorRuntime', runtimeReady, runtimeReady ? `code-server runtime present (${asset})` : 'no code-server runtime for this platform — editor needs WSL (Windows) or a native source build');

  const sourceReady = await exists(path.join(root, 'vendor/vscode/.git'));
  push('editorSource', sourceReady, sourceReady ? 'vendor/vscode cloned (upstream 1.138.0)' : 'vendor/vscode not cloned — `npm run setup` fetches it for editor-enabled setups');

  push('build', await exists(path.join(root, 'dist/index.html')), await exists(path.join(root, 'dist/index.html')) ? 'production client build present' : 'run `npm run build` or `npm run launch`');

  if (process.platform === 'win32') {
    const distros = wslDistros();
    push('wsl', distros.length > 0, distros.length ? `WSL distros: ${distros.join(', ')}` : 'WSL not available — this machine runs Agents-only; enable the editor via WSL or a native source build');
  }

  const port = Number(env.PORT || env.PORT || 4317);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const info = await response.json().catch(() => ({}));
    push('server', true, `already responding on http://127.0.0.1:${port} (editor ${info.editorEnabled ? 'enabled' : 'disabled'})`);
  } catch {
    push('server', true, `not running — start with \`npm start\` (Agents-only) or \`npm run launch\` (with editor)`);
  }
  return { platform: `${process.platform}-${process.arch}`, findings };
}

function render(report) {
  const lines = [`Cursor Workbench environment — ${report.platform}`];
  for (const finding of report.findings) {
    lines.push(`[${finding.ok ? 'ok' : '!!'}] ${finding.id}: ${finding.detail}`);
  }
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await collect();
  console.log(render(report));
}
