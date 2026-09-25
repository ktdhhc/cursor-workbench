import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkspaceFiles, contentHash } from '../server/files.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-files-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  await mkdir(workspace);
  const files = new WorkspaceFiles({ workspace });
  await files.init();
  return { root, workspace, files };
}

test('reads text and serializes optimistic edits without losing another writer', async t => {
  const { files } = await fixture(t);
  const created = await files.writeFile({ path: 'src/main.js', content: 'hello\n', expectedHash: null });
  assert.equal(created.before, null);
  const read = await files.readFile('src/main.js');
  assert.equal(read.content, 'hello\n');
  assert.equal(read.hash, '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03');
  const results = await Promise.allSettled([
    files.replaceText({ path: 'src/main.js', oldText: 'hello', newText: 'first', expectedHash: read.hash }),
    files.writeFile({ path: 'src/main.js', content: 'second', expectedHash: read.hash }),
  ]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
  assert.equal((await files.readFile('src/main.js')).content, 'first\n');
  assert.equal(contentHash(null), null);
});

test('rejects traversal, secret paths, binary and oversized reads without hiding normal source files', async t => {
  const { files, workspace } = await fixture(t);
  for (const name of ['.env', '.env.local', '.npmrc', 'credentials.json', 'private.pem']) await writeFile(path.join(workspace, name), 'secret');
  await mkdir(path.join(workspace, '.git'));
  await mkdir(path.join(workspace, 'node_modules'));
  await writeFile(path.join(workspace, 'config.json'), '{"ok":true}');
  await writeFile(path.join(workspace, 'blob.bin'), Buffer.from([1, 0, 2]));
  await writeFile(path.join(workspace, 'control.bin'), Buffer.from([1, 2, 3, 4]));
  await writeFile(path.join(workspace, 'large.txt'), 'x'.repeat(128 * 1024 + 1));
  for (const name of ['../outside', 'sub/../../outside', '..\\outside', '/etc/passwd', 'C:\\Windows\\win.ini', 'a:stream', '.env', '.env.local', '.npmrc', 'credentials.json', 'private.pem', '.git/config', 'node_modules/pkg/index.js', '.env.']) {
    await assert.rejects(files.readFile(name), { status: 403 });
    await assert.rejects(files.writeFile({ path: name, content: 'x', expectedHash: null }), { status: 403 });
  }
  await assert.rejects(files.readFile('blob.bin'), { status: 415 });
  await assert.rejects(files.readFile('control.bin'), { status: 415 });
  await assert.rejects(files.readFile('large.txt'), { status: 413 });
  assert.equal((await files.readFile('config.json')).content, '{"ok":true}');
  const names = (await files.listFiles()).map(x => x.name);
  assert.deepEqual(names, ['blob.bin', 'config.json', 'control.bin', 'large.txt']);
  const search = await files.searchFiles({ query: 'ok' });
  assert.equal(search.matches.length, 1);
  assert.equal(search.matches[0].path, 'config.json');
});

test('rejects symlink escape for reads, writes, searches and listing', async t => {
  const { files, workspace, root } = await fixture(t);
  const outside = path.join(root, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.txt'), 'hidden');
  try { await symlink(outside, path.join(workspace, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (error) {
    if (error.code === 'EPERM') return t.skip('Symlink creation requires OS permission');
    throw error;
  }
  await assert.rejects(files.readFile('linked/secret.txt'), { status: 403 });
  await assert.rejects(files.writeFile({ path: 'linked/new.txt', content: 'x', expectedHash: null }), { status: 403 });
  await assert.rejects(files.listFiles({ path: 'linked' }), { status: 403 });
  assert.deepEqual((await files.searchFiles({ query: 'hidden' })).matches, []);
});

test('requires hashes, rejects ambiguous replacements and makes undo conflict-aware', async t => {
  const { files, workspace } = await fixture(t);
  await assert.rejects(files.writeFile({ path: 'a.txt', content: 'x' }), { status: 400 });
  await files.writeFile({ path: 'a.txt', content: 'old old', expectedHash: null });
  const { hash } = await files.readFile('a.txt');
  await assert.rejects(files.replaceText({ path: 'a.txt', oldText: 'old', newText: 'new', expectedHash: hash }), { status: 409 });
  const edit = await files.replaceText({ path: 'a.txt', oldText: 'old', newText: 'new', replaceAll: true, expectedHash: hash });
  await writeFile(path.join(workspace, 'a.txt'), 'manual editor change');
  await assert.rejects(files.restoreFile({ path: 'a.txt', content: edit.before, expectedHash: edit.hash }), { status: 409 });
  assert.equal(await readFile(path.join(workspace, 'a.txt'), 'utf8'), 'manual editor change');
  const fresh = await files.writeFile({ path: 'new.txt', content: 'new', expectedHash: null });
  await files.restoreFile({ path: 'new.txt', content: null, expectedHash: fresh.hash });
  await assert.rejects(files.readFile('new.txt'), { status: 404 });
});

test('does not expose configured credentials hidden inside otherwise normal source paths', async t => {
  const { workspace } = await fixture(t);
  const files = new WorkspaceFiles({ workspace, secrets: ['test-provider-key-12345'] });
  await files.init();
  await writeFile(path.join(workspace, 'accidental.txt'), 'key: test-provider-key-12345');
  await assert.rejects(files.readFile('accidental.txt'), { status: 403 });
  assert.deepEqual((await files.searchFiles({ query: 'key' })).matches, []);
  await assert.rejects(files.writeFile({ path: 'leak.txt', content: 'test-provider-key-12345', expectedHash: null }), { status: 403 });
});

test('blocks credential stores but does not blacklist similarly named source modules', async t => {
  const { files, workspace } = await fixture(t);
  for (const name of ['.git-credentials', '.gitcookies', '.secrets', 'credentials-prod.json', 'secrets.local.yaml']) {
    await writeFile(path.join(workspace, name), 'sensitive');
    await assert.rejects(files.readFile(name), { status: 403 });
  }
  await assert.rejects(files.readFile('.config/gh/hosts.yml'), { status: 403 });
  await files.writeFile({ path: 'credentials-service.js', content: 'export const credentialProvider = () => {}', expectedHash: null });
  assert.match((await files.readFile('credentials-service.js')).content, /credentialProvider/);
});
