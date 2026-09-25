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

test('checked-in defaults contain no credential', async () => {
  const example = await readFile(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /AI_API_KEY=replace-with-your-key/);
  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  for (const entry of ['.env', '.state/', 'vendor/', 'node_modules/']) assert.ok(ignore.split('\n').includes(entry));
});
