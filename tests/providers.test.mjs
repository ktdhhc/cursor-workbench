import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderRegistry } from '../server/providers.mjs';

async function registryFixture(envDefaults = { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiKey: 'sk-env-key' }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wb-providers-'));
  const builtinPath = path.join(dir, 'builtin.json');
  await writeFile(builtinPath, JSON.stringify({
    schemaVersion: 1,
    templates: [
      { templateId: 'deepseek', templateNameMap: { 'zh-CN': 'DeepSeek', 'en-US': 'DeepSeek' },
        config: { access: { type: 'api-key', apiKeyManagementUrl: 'https://platform.deepseek.com/api_keys' },
          api: { type: 'openai-chat-completions', baseUrl: 'https://api.deepseek.com/v1' }, builtinModelIds: ['deepseek-chat', 'deepseek-reasoner'] } },
      { templateId: 'openai-compatible', templateNameMap: { 'zh-CN': '自定义', 'en-US': 'Custom' },
        config: { access: { type: 'api-key' }, api: { type: 'openai-chat-completions', baseUrl: '' }, builtinModelIds: [] } },
    ],
  }));
  const registry = await new ProviderRegistry({
    builtinPath, personalPath: path.join(dir, 'providers.json'),
    credentialsPath: path.join(dir, 'provider-credentials.json'),
    envDefaults, fetchImpl: async () => { throw new Error('no network in unit tests'); },
  }).init();
  return { registry, dir, builtinPath };
}

test('first run imports the env defaults as a personal provider with separated credentials', async () => {
  const { registry, dir } = await registryFixture();
  const state = registry.publicState();
  const provider = state.providers.find(item => item.id === 'default');
  assert.ok(provider, 'env provider imported');
  assert.equal(provider.baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(provider.apiKeyConfigured, true);
  assert.equal(provider.modelIds.includes('deepseek-flash'), true);
  assert.deepEqual(state.defaultModelSelection, { providerId: 'default', modelId: 'deepseek-flash' });
  // The config file must not contain the credential; the credentials file must.
  const personal = await readFile(path.join(dir, 'providers.json'), 'utf8');
  assert.ok(!personal.includes('sk-env-key'), 'credential leaked into provider config');
  const credentials = JSON.parse(await readFile(path.join(dir, 'provider-credentials.json'), 'utf8'));
  assert.equal(credentials.default, 'sk-env-key');
  const publicJson = JSON.stringify(state);
  assert.ok(!publicJson.includes('sk-env-key'), 'credential leaked into public state');
});

test('create from template inherits base URL and models; key stays write-only', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-template' });
  const provider = registry.publicState().providers.find(item => item.id === 'deepseek');
  assert.equal(provider.baseUrl, 'https://api.deepseek.com/v1');
  assert.deepEqual(provider.modelIds, ['deepseek-chat', 'deepseek-reasoner']);
  assert.equal(provider.apiKeyConfigured, true);
  assert.equal(JSON.stringify(registry.publicState()).includes('sk-template'), false);
  await assert.rejects(() => registry.createPersonalProvider({ templateId: 'deepseek' }), /already exists/);
});

test('custom providers require a valid base URL and at least one model', async () => {
  const { registry } = await registryFixture();
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken' }), /base URL/);
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken', baseUrl: 'ftp://x' }), /http\(s\) URL/);
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken', baseUrl: 'https://x.example' }), /model id/);
  await registry.createPersonalProvider({ name: 'mine', baseUrl: 'https://x.example/v1', modelIds: ['m1'] });
  const provider = registry.publicState().providers.find(item => item.name === 'mine');
  assert.deepEqual(provider.modelIds, ['m1']);
});

test('model management rejects duplicates and deleted providers', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek' });
  await assert.rejects(() => registry.addPersonalModel('deepseek', 'deepseek-chat'), /already exists/);
  await registry.addPersonalModel('deepseek', 'deepseek-new');
  const provider = registry.publicState().providers.find(item => item.id === 'deepseek');
  assert.ok(provider.modelIds.includes('deepseek-new'));
  await registry.deletePersonalModel('deepseek', 'deepseek-new');
  assert.equal(registry.publicState().providers.find(item => item.id === 'deepseek').modelIds.includes('deepseek-new'), false);
  await registry.deletePersonalProvider('deepseek');
  await assert.rejects(() => registry.addPersonalModel('deepseek', 'x'), /not found/);
});

test('default model selection validates provider and model membership', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-sel' });
  await registry.setDefaultModelSelection({ providerId: 'deepseek', modelId: 'deepseek-reasoner' });
  assert.deepEqual(registry.publicState().defaultModelSelection, { providerId: 'deepseek', modelId: 'deepseek-reasoner' });
  await assert.rejects(() => registry.setDefaultModelSelection({ providerId: 'deepseek', modelId: 'not-a-model' }), /does not belong/);
  await assert.rejects(() => registry.setDefaultModelSelection({ providerId: 'missing', modelId: 'x' }), /not found/);
  const resolved = registry.resolve('deepseek', 'deepseek-reasoner');
  assert.equal(resolved.apiKey, 'sk-sel');
});

test('deleting the active provider clears the selection instead of leaving a ghost', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-sel' });
  await registry.setDefaultModelSelection({ providerId: 'deepseek', modelId: 'deepseek-chat' });
  await registry.deletePersonalProvider('deepseek');
  assert.equal(registry.publicState().defaultModelSelection, null);
});

test('connectivity test reports real failures without leaking the key', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-live' });
  const result = await registry.testConnectivity({ providerId: 'deepseek', modelId: 'deepseek-chat' }, {
    streamChatCompletion: async ({ apiKey }) => { throw new Error(`upstream 401 for ${apiKey.slice(0, 3)}…`); },
  });
  assert.equal(result.success, false);
  assert.match(result.error.message, /upstream 401/);
});

test('corrupted personal config is moved aside and defaults recovered', async () => {
  const { registry, dir } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek' });
  const personalPath = path.join(dir, 'providers.json');
  await writeFile(personalPath, '{"schemaVersion":1,"config":{', 'utf8');
  const revived = await new ProviderRegistry({
    builtinPath: path.join(dir, 'builtin.json'), personalPath,
    credentialsPath: path.join(dir, 'provider-credentials.json'), envDefaults: {},
  }).init();
  assert.equal(revived.publicState().providers.length, 0);
  const files = await readFile(personalPath, 'utf8');
  assert.ok(files.includes('"schemaVersion": 1'), 'recovered file is valid again');
  await rm(dir, { recursive: true, force: true });
});

test('unsupported schema versions are rejected instead of guessed', async () => {
  const { registry, dir } = await registryFixture();
  const personalPath = path.join(dir, 'providers.json');
  await writeFile(personalPath, JSON.stringify({ schemaVersion: 99, config: {} }), 'utf8');
  const revived = await new ProviderRegistry({
    builtinPath: path.join(dir, 'builtin.json'), personalPath,
    credentialsPath: path.join(dir, 'provider-credentials.json'), envDefaults: {},
  }).init();
  assert.equal(revived.publicState().providers.length, 0);
  await rm(dir, { recursive: true, force: true });
});
