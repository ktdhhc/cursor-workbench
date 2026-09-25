import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('API never returns server credential configuration', async () => {
  const source = await readFile(path.join(root, 'server/index.mjs'), 'utf8');
  const config = source.slice(source.indexOf('const config ='), source.indexOf('const engine ='));
  assert.ok(!/apiKey\s*:/.test(config));
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /Cross-origin requests are not allowed/);
});

test('extension uses a token-authenticated workspace API and actual VS Code commands', async () => {
  const source = await readFile(path.join(root, 'extension/extension.cjs'), 'utf8');
  assert.match(source, /workspace\.openTextDocument/);
  assert.match(source, /window\.showTextDocument/);
  assert.match(source, /X-Bridge-Token/);
  assert.match(source, /realpath/);
});

test('editor launcher removes API PORT override before starting code-server', async () => {
  const source = await readFile(path.join(root, 'scripts/code-server.sh'), 'utf8');
  assert.ok(source.indexOf('CURSOR_WORKBENCH_URL=') < source.indexOf('unset PORT'));
  assert.ok(source.indexOf('unset PORT') < source.indexOf('exec "$ROOT/.runtime/'));
  assert.match(source, /CODE_SERVER_PORT:-4318/);
});

test('launch and setup scripts are portable across WSL distros and hosts', async () => {
  for (const file of ['scripts/launch.mjs', 'scripts/setup.mjs', 'scripts/code-server.sh']) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.ok(!source.includes('v24.19.0'), `${file} pins a machine-specific Node version`);
    assert.ok(!/'Ubuntu'/.test(source), `${file} hardcodes a WSL distro name`);
  }
  const setup = await readFile(path.join(root, 'scripts/setup.mjs'), 'utf8');
  assert.match(setup, /darwin-arm64/);
  assert.match(setup, /wsl-node\.sh/);
  assert.match(setup, /CURSOR_WORKBENCH_WSL_DISTRO/);
  const launch = await readFile(path.join(root, 'scripts/launch.mjs'), 'utf8');
  assert.match(launch, /CURSOR_WORKBENCH_NATIVE/);
  assert.match(launch, /EDITOR_ENABLED/);
  assert.match(launch, /ensurePlatformDeps/);
  assert.match(launch, /needsBuild/);
  assert.match(launch, /rollup-win32-x64-msvc/);
  assert.match(launch, /rollup-linux-x64-gnu/);
  const wslNode = await readFile(path.join(root, 'scripts/wsl-node.sh'), 'utf8');
  assert.match(wslNode, /-ge 22/);
  assert.match(wslNode, /sort -rV/);
});

test('editor exposure is opt-in through EDITOR_ENABLED', async () => {
  const source = await readFile(path.join(root, 'server/index.mjs'), 'utf8');
  assert.match(source, /EDITOR_ENABLED/);
  const app = await readFile(path.join(root, 'client/App.jsx'), 'utf8');
  assert.match(app, /editorEnabled/);
});

test('doctor reports actionable environment findings', async () => {
  const { collect } = await import('../scripts/doctor.mjs');
  const report = await collect();
  const ids = report.findings.map(finding => finding.id);
  for (const id of ['node', 'env', 'key', 'editorRuntime', 'editorSource', 'build', 'server']) {
    assert.ok(ids.includes(id), `missing doctor finding: ${id}`);
  }
  for (const finding of report.findings) {
    assert.ok(finding.ok === true || (finding.detail && finding.detail.length > 0), `${finding.id} needs guidance when failing`);
  }
});

test('task state accepts the same workspace via WSL and native Windows paths', async () => {
  const { sameWorkspacePath } = await import('../server/engine.mjs');
  assert.ok(sameWorkspacePath('/mnt/c/work/app', 'C:\\work\\app'));
  assert.ok(sameWorkspacePath('C:\\Work\\App', 'c:/work/app'));
  assert.ok(sameWorkspacePath('/mnt/c/work/app/', 'C:\\work\\app'));
  assert.ok(!sameWorkspacePath('/mnt/c/work/app', 'C:\\other\\app'));
  assert.ok(!sameWorkspacePath('/home/kaho/app', 'C:\\home\\kaho\\app'));
});

test('checked-in defaults contain no credential', async () => {
  const example = await readFile(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /AI_API_KEY=replace-with-your-key/);
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  for (const entry of ['.env', '.state/', 'vendor/', 'node_modules/']) assert.ok(ignore.split('\n').includes(entry));
});
