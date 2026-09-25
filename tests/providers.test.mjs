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
          api: { type: 'openai-chat-completions', baseUrl: 'https://api.deepseek.com/v1' },
          builtinModelIds: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash'],
          modelOptions: {
            'deepseek-flash': { reasoningLevels: ['default', 'low', 'medium', 'high'], defaultReasoningLevel: 'default',
              requestPatches: { low: { reasoning_effort: 'low' }, medium: { reasoning_effort: 'medium' }, high: { reasoning_effort: 'high' } } },
          } } },
      { templateId: 'openrouter', templateNameMap: { 'zh-CN': 'OpenRouter', 'en-US': 'OpenRouter' },
        config: { access: { type: 'api-key' }, api: { type: 'openai-chat-completions', baseUrl: 'https://openrouter.ai/api/v1' }, builtinModelIds: ['openrouter/auto'],
          modelOptions: { '*': { reasoningLevels: ['default', 'low', 'medium', 'high'], defaultReasoningLevel: 'default',
            requestPatches: { low: { reasoning: { effort: 'low' } }, medium: { reasoning: { effort: 'medium' } }, high: { reasoning: { effort: 'high' } } } } } } },
      { templateId: 'openai', templateNameMap: { 'zh-CN': 'OpenAI', 'en-US': 'OpenAI' },
        config: { access: { type: 'api-key' }, api: { type: 'openai-chat-completions', baseUrl: 'https://api.openai.com/v1' }, builtinModelIds: ['o4-mini'],
          modelOptions: { '*': { reasoningLevels: ['default', 'low', 'medium', 'high'], defaultReasoningLevel: 'default',
            requestPatches: { low: { reasoning_effort: 'low' }, medium: { reasoning_effort: 'medium' }, high: { reasoning_effort: 'high' } } } } } },
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
  assert.deepEqual(provider.modelIds, ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash']);
  assert.equal(provider.apiKeyConfigured, true);
  assert.equal(JSON.stringify(registry.publicState()).includes('sk-template'), false);
  assert.deepEqual(registry.resolve('deepseek', 'deepseek-flash', { reasoningLevel: 'high' }).requestPatch, { reasoning_effort: 'high' });
  await assert.rejects(() => registry.createPersonalProvider({ templateId: 'deepseek' }), /already exists/);
});

test('custom providers require a valid base URL and at least one model', async () => {
  const { registry, dir } = await registryFixture();
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken' }), /base URL/);
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken', baseUrl: 'ftp://x' }), /http\(s\) URL/);
  await assert.rejects(() => registry.createPersonalProvider({ name: 'broken', baseUrl: 'https://x.example' }), /model id/);
  await registry.createPersonalProvider({ name: 'mine', baseUrl: 'https://x.example/v1', apiKey: 'sk-mine', modelIds: ['m1'] });
  const provider = registry.publicState().providers.find(item => item.name === 'mine');
  assert.deepEqual(provider.modelIds, ['m1']);
  assert.deepEqual(registry.resolve(provider.id, 'm1', { reasoningLevel: 'medium' }).requestPatch, { reasoning_effort: 'medium' });
  const persisted = JSON.parse(await readFile(path.join(dir, 'providers.json'), 'utf8'));
  assert.deepEqual(persisted.config.providers[provider.id].modelOptions.m1.reasoningLevels, ['default', 'low', 'medium', 'high']);
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

test('public state exposes model capabilities while preserving modelIds and secrets stay server-only', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-template' });
  const state = registry.publicState();
  const deepseek = state.providers.find(item => item.id === 'deepseek');
  assert.deepEqual(deepseek.modelIds, ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash']);
  assert.deepEqual(deepseek.models, [
    { id: 'deepseek-chat', reasoningLevels: ['default'], defaultReasoningLevel: 'default', contextWindow: null, maxOutputTokens: null,
      input: { text: true, image: false, video: false, pdf: false }, capabilities: { structuredOutput: false, nativeWebSearch: false, midConversationSystem: false }, enabled: true },
    { id: 'deepseek-reasoner', reasoningLevels: ['default'], defaultReasoningLevel: 'default', contextWindow: null, maxOutputTokens: null,
      input: { text: true, image: false, video: false, pdf: false }, capabilities: { structuredOutput: false, nativeWebSearch: false, midConversationSystem: false }, enabled: true },
    { id: 'deepseek-flash', reasoningLevels: ['default', 'low', 'medium', 'high'], defaultReasoningLevel: 'default', contextWindow: null, maxOutputTokens: null,
      input: { text: true, image: false, video: false, pdf: false }, capabilities: { structuredOutput: false, nativeWebSearch: false, midConversationSystem: false }, enabled: true },
  ]);
  assert.equal(JSON.stringify(state).includes('sk-template'), false);
  const secrets = registry.secretValues();
  assert.ok(secrets.includes('sk-template'));
  secrets[0] = 'mutated';
  assert.ok(registry.secretValues().includes('sk-template'), 'callers receive a copy');
});

test('resolve enforces explicit provider and model membership without falling back', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-deepseek' });
  await registry.setDefaultModelSelection({ providerId: 'deepseek', modelId: 'deepseek-chat' });
  assert.throws(() => registry.resolve('missing', 'deepseek-chat'), error => error?.status === 404);
  assert.throws(() => registry.resolve('deepseek', 'not-a-model'), error => error?.status === 400);
  assert.equal(registry.resolve(undefined, undefined).modelId, 'deepseek-chat');
});

test('resolve normalizes reasoning levels into exact provider request patches', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-deepseek' });
  await registry.createPersonalProvider({ templateId: 'openrouter', apiKey: 'sk-openrouter' });
  await registry.createPersonalProvider({ templateId: 'openai', apiKey: 'sk-openai' });
  await registry.createPersonalProvider({ name: 'custom', baseUrl: 'https://custom.example/v1', apiKey: 'sk-custom', modelIds: ['custom-model'] });

  assert.deepEqual(registry.resolve('deepseek', 'deepseek-flash', { reasoningLevel: 'high' }).requestPatch, { reasoning_effort: 'high' });
  assert.deepEqual(registry.resolve('openrouter', 'openrouter/auto', { reasoningLevel: 'medium' }).requestPatch, { reasoning: { effort: 'medium' } });
  assert.deepEqual(registry.resolve('openai', 'o4-mini', { reasoningLevel: 'low' }).requestPatch, { reasoning_effort: 'low' });
  const custom = registry.publicState().providers.find(item => item.name === 'custom');
  assert.deepEqual(registry.resolve(custom.id, 'custom-model', { reasoningLevel: 'low' }).requestPatch, { reasoning_effort: 'low' });
  const defaultResolution = registry.resolve('deepseek', 'deepseek-flash');
  assert.equal(defaultResolution.reasoningLevel, 'default');
  assert.deepEqual(defaultResolution.requestPatch, {});
  assert.throws(() => registry.resolve('deepseek', 'deepseek-chat', { reasoningLevel: 'high' }), error => error?.status === 400);
  assert.throws(() => registry.resolve('deepseek', 'deepseek-flash', { reasoningLevel: 'extreme' }), error => error?.status === 400);
});

test('connectivity probes forward the resolved request patch', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'openrouter', apiKey: 'sk-openrouter' });
  let seen;
  const result = await registry.testConnectivity({ providerId: 'openrouter', modelId: 'openrouter/auto' }, {
    streamChatCompletion: async options => { seen = options; },
  });
  assert.equal(result.success, true);
  assert.deepEqual(seen.requestPatch, {});
});

test('legacy personal configs load and persist model options when models change', async () => {
  const { dir, builtinPath } = await registryFixture({});
  const personalPath = path.join(dir, 'legacy-providers.json');
  const credentialsPath = path.join(dir, 'legacy-credentials.json');
  await writeFile(personalPath, JSON.stringify({ schemaVersion: 1, config: {
    providerOrder: ['legacy'],
    providers: { legacy: { id: 'legacy', name: 'Legacy', baseUrl: 'https://legacy.example/v1', modelIds: ['legacy-model'], enabled: true } },
    defaultModelSelection: { providerId: 'legacy', modelId: 'legacy-model' },
  } }), 'utf8');
  await writeFile(credentialsPath, JSON.stringify({ legacy: 'sk-legacy' }), 'utf8');
  const registry = await new ProviderRegistry({ builtinPath, personalPath, credentialsPath, envDefaults: {} }).init();
  assert.deepEqual(registry.publicState().providers[0].models, [
    { id: 'legacy-model', reasoningLevels: ['default', 'low', 'medium', 'high'], defaultReasoningLevel: 'default',
      contextWindow: null, maxOutputTokens: null,
      input: { text: true, image: false, video: false, pdf: false },
      capabilities: { structuredOutput: false, nativeWebSearch: false, midConversationSystem: false },
      enabled: true },
  ]);
  await registry.addPersonalModel('legacy', 'legacy-next');
  const persisted = JSON.parse(await readFile(personalPath, 'utf8'));
  assert.deepEqual(persisted.config.providers.legacy.modelOptions['legacy-next'].reasoningLevels, ['default', 'low', 'medium', 'high']);
  assert.equal(JSON.stringify(persisted).includes('sk-legacy'), false);
});

test('model metadata is editable per model and a disabled model is rejected at resolve time', async () => {
  const { registry } = await registryFixture();
  await registry.createPersonalProvider({ templateId: 'deepseek', apiKey: 'sk-ds' });
  await registry.updatePersonalModel('deepseek', 'deepseek-flash', {
    contextWindow: 32000, maxOutputTokens: 4096, input: { image: true }, capabilities: { structuredOutput: true }, enabled: false,
  });
  const model = registry.publicState().providers.find(entry => entry.id === 'deepseek').models.find(entry => entry.id === 'deepseek-flash');
  assert.equal(model.contextWindow, 32000);
  assert.equal(model.maxOutputTokens, 4096);
  assert.equal(model.input.image, true);
  assert.equal(model.input.text, true);
  assert.equal(model.capabilities.structuredOutput, true);
  assert.equal(model.enabled, false);
  assert.throws(() => registry.resolve('deepseek', 'deepseek-flash'), error => error.status === 409);
  // The default selection skips the disabled model instead of failing.
  assert.equal(registry.resolve('deepseek').modelId, 'deepseek-chat');
  await assert.rejects(() => registry.updatePersonalModel('deepseek', 'deepseek-chat', { contextWindow: -5 }), error => error.status === 400);
  await assert.rejects(() => registry.updatePersonalModel('deepseek', 'deepseek-chat', { unknown: 1 }), error => error.status === 400);
  await registry.updatePersonalModel('deepseek', 'deepseek-flash', { enabled: true });
  assert.equal(registry.resolve('deepseek', 'deepseek-flash').modelId, 'deepseek-flash');
});

test('providers declare an API format and Responses models resolve without chat reasoning patches', async () => {
  const { registry } = await registryFixture();
  const created = await registry.createPersonalProvider({
    name: 'ResponsesGW', baseUrl: 'https://gw.example/v1',
    apiKey: 'sk-gw', modelIds: ['o3x'], apiFormat: 'openai-responses',
  });
  await assert.rejects(() => registry.createPersonalProvider({
    templateId: 'openai-compatible', baseUrl: 'https://gw.example/v1', modelIds: ['x'], apiFormat: 'anthropic',
  }), error => error.status === 400);
  const resolved = registry.resolve(created.id, 'o3x', { reasoningLevel: 'high' });
  assert.equal(resolved.apiFormat, 'openai-responses');
  assert.equal(resolved.reasoningLevel, 'high');
  assert.deepEqual(resolved.requestPatch, {}, 'Responses reasoning mapping is deferred; no chat patch is sent');
  await registry.updatePersonalProvider(created.id, { apiFormat: 'openai-chat-completions' });
  assert.deepEqual(registry.resolve(created.id, 'o3x', { reasoningLevel: 'high' }).requestPatch, { reasoning_effort: 'high' });
});
