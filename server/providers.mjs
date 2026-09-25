import { readFile, writeFile, rename, mkdir, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileError } from './files.mjs';

/**
 * Provider/model registry replicating ZCode's layered design
 * (github.com/zai-org/ZCode, Apache-2.0 — design studied, code original):
 * builtin templates + personal sparse overlay, credentials stored separately,
 * atomic private writes with content-hash revision, recovery on invalid files.
 */
const SCHEMA_VERSION = 1;
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function providerError(message, status = 400) {
  return Object.assign(new Error(message), { status, statusCode: status });
}

async function fileExists(file) {
  return access(file).then(() => true, () => false);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function atomicWritePrivate(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = path.join(path.dirname(file), `.providers-${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, file);
}

export class ProviderRegistry {
  #builtin;
  #personalPath;
  #credentialsPath;
  #envDefaults;
  #personal = { providerOrder: [], providers: {}, defaultModelSelection: null };
  #credentials = {};
  #onChange;
  #fetchImpl;

  constructor({ builtinPath, personalPath, credentialsPath, envDefaults = {}, onChange = () => {}, fetchImpl } = {}) {
    if (!builtinPath || !personalPath || !credentialsPath) throw new Error('ProviderRegistry requires builtin, personal and credentials paths.');
    this.#builtinPath = builtinPath;
    this.#personalPath = personalPath;
    this.#credentialsPath = credentialsPath;
    this.#envDefaults = envDefaults;
    this.#onChange = onChange;
    this.#fetchImpl = fetchImpl;
  }

  #builtinPath;
  #templates = [];

  async init() {
    const builtin = await readJson(this.#builtinPath);
    this.#templates = builtin?.templates ?? [];
    await this.#importEnvDefaults();
    await this.#loadPersonal();
    await this.#loadCredentials();
    return this;
  }

  /** First run: seed one personal provider from the legacy .env configuration. */
  async #importEnvDefaults() {
    if (await fileExists(this.#personalPath)) return;
    const { baseUrl, model, apiKey } = this.#envDefaults;
    if (!baseUrl || !model) return;
    this.#personal = {
      providerOrder: ['default'],
      providers: {
        default: { id: 'default', name: 'Default', baseUrl, modelIds: [model], enabled: true, source: 'env' },
      },
      defaultModelSelection: { providerId: 'default', modelId: model },
    };
    if (apiKey) this.#credentials.default = apiKey;
    await this.#persist();
  }

  async #loadPersonal() {
    let raw;
    try {
      raw = await readJson(this.#personalPath);
      if (raw === null) return;
      this.#personal = this.#decodePersonal(raw);
    } catch (error) {
      // ZCode-style recovery: keep the invalid file for inspection, write back a valid default.
      // Only the personal file is rewritten — credentials may not be loaded yet.
      const backup = `${this.#personalPath}.invalid-${Date.now()}`;
      await rename(this.#personalPath, backup).catch(() => {});
      console.error(`Provider config was invalid (${error.message}); moved to ${backup}.`);
      this.#personal = { providerOrder: [], providers: {}, defaultModelSelection: null };
      await this.#persistPersonal();
    }
  }

  #decodePersonal(raw) {
    if (raw?.schemaVersion !== SCHEMA_VERSION) throw providerError(`Unsupported provider config schemaVersion.`, 400);
    const config = raw.config ?? {};
    const providers = {};
    for (const [id, value] of Object.entries(config.providers ?? {})) {
      if (!PROVIDER_ID.test(id)) throw providerError(`Invalid provider id: ${id}`);
      providers[id] = {
        id,
        name: value.name ?? id,
        templateId: value.templateId,
        baseUrl: value.baseUrl,
        enabled: value.enabled ?? true,
        modelIds: Array.isArray(value.modelIds) ? [...value.modelIds] : undefined,
        source: value.source ?? 'personal',
      };
    }
    const selection = config.defaultModelSelection ?? null;
    return {
      providerOrder: Array.isArray(config.providerOrder) ? config.providerOrder.filter(id => PROVIDER_ID.test(id)) : [],
      providers,
      defaultModelSelection: selection && providers[selection.providerId] ? { ...selection } : null,
    };
  }

  async #loadCredentials() {
    const raw = await readJson(this.#credentialsPath);
    this.#credentials = raw && typeof raw === 'object' ? { ...raw } : {};
    const envKey = this.#envDefaults.apiKey;
    if (envKey && this.#credentials.default === undefined) this.#credentials.default = envKey;
  }

  async #persistPersonal() {
    await atomicWritePrivate(this.#personalPath, {
      schemaVersion: SCHEMA_VERSION,
      config: {
        providerOrder: this.#personal.providerOrder,
        providers: this.#personal.providers,
        defaultModelSelection: this.#personal.defaultModelSelection,
      },
    });
  }

  async #persist() {
    await this.#persistPersonal();
    await atomicWritePrivate(this.#credentialsPath, this.#credentials);
  }

  #template(templateId) {
    return this.#templates.find(template => template.templateId === templateId) ?? null;
  }

  #provider(id) {
    return this.#personal.providers[id] ?? null;
  }

  #require(id) {
    const provider = this.#provider(id);
    if (!provider) throw providerError('Provider not found.', 404);
    return provider;
  }

  #resolvedModels(provider) {
    const template = provider.templateId ? this.#template(provider.templateId) : null;
    const base = provider.modelIds ?? template?.config?.builtinModelIds ?? [];
    return [...new Set(base)];
  }

  #apiKey(providerId) {
    return this.#credentials[providerId] ?? null;
  }

  /** Public view for the client — credentials are never included. */
  publicState() {
    const providers = this.#personal.providerOrder
      .map(id => this.#provider(id))
      .filter(Boolean)
      .map(provider => ({
        id: provider.id,
        name: provider.name,
        templateId: provider.templateId ?? null,
        templateName: provider.templateId ? this.#template(provider.templateId)?.templateNameMap?.['zh-CN'] ?? null : null,
        baseUrl: provider.baseUrl ?? this.#template(provider.templateId)?.config?.api?.baseUrl ?? '',
        apiKeyManagementUrl: this.#template(provider.templateId)?.config?.access?.apiKeyManagementUrl ?? null,
        apiKeyConfigured: Boolean(this.#apiKey(provider.id)),
        enabled: provider.enabled,
        source: provider.source,
        modelIds: this.#resolvedModels(provider),
      }));
    return {
      revision: this.revision(),
      templates: this.#templates.map(({ templateId, templateNameMap, config }) => ({
        templateId, name: templateNameMap?.['zh-CN'] ?? templateId,
        baseUrl: config?.api?.baseUrl ?? '',
        apiKeyManagementUrl: config?.access?.apiKeyManagementUrl ?? null,
        builtinModelIds: config?.builtinModelIds ?? [],
      })),
      providers,
      defaultModelSelection: this.#personal.defaultModelSelection,
    };
  }

  revision() {
    return Buffer.from(JSON.stringify([this.#personal, Object.keys(this.#credentials)])).toString('base64url').slice(0, 24);
  }

  /** Resolved credentials for the engine — server-side only, never serialized to the client. */
  resolve(providerId, modelId) {
    const provider = providerId ? this.#provider(providerId) : null;
    if (provider) {
      if (!provider.enabled) throw providerError('Provider is disabled.', 409);
      const key = this.#apiKey(provider.id);
      const baseUrl = provider.baseUrl ?? this.#template(provider.templateId)?.config?.api?.baseUrl;
      if (!key) throw providerError(`API key for “${provider.name}” is not configured.`, 409);
      if (!baseUrl) throw providerError(`Base URL for “${provider.name}” is not configured.`, 409);
      return { providerId: provider.id, modelId: modelId ?? this.#resolvedModels(provider)[0], baseUrl, apiKey: key, name: provider.name };
    }
    const selection = this.#personal.defaultModelSelection;
    if (selection) return this.resolve(selection.providerId, modelId ?? selection.modelId);
    const { baseUrl, model, apiKey } = this.#envDefaults;
    if (baseUrl && model && apiKey) return { providerId: 'default', modelId: modelId ?? model, baseUrl, apiKey, name: 'Default' };
    return null;
  }

  async createPersonalProvider({ templateId, name, baseUrl, apiKey, modelIds = [], enabled = true } = {}) {
    const template = templateId ? this.#template(templateId) : null;
    if (templateId && !template) throw providerError('Provider template not found.', 404);
    const effectiveBaseUrl = baseUrl ?? template?.config?.api?.baseUrl;
    if (!effectiveBaseUrl) throw providerError('A base URL is required for a custom provider.');
    if (!/^(https?:\/\/)[^\s]+$/i.test(effectiveBaseUrl)) throw providerError('Base URL must be a valid http(s) URL.');
    const id = template ? template.templateId : `custom-${randomBytes(4).toString('hex')}`;
    if (this.#provider(id)) throw providerError('A provider with this id already exists.', 409);
    const providedModels = [...new Set((modelIds ?? []).map(m => String(m).trim()).filter(Boolean))];
    const modelIdList = [...new Set([...providedModels, ...(template?.config?.builtinModelIds ?? [])])];
    if (!modelIdList.length) throw providerError('At least one model id is required.');
    this.#personal.providers[id] = {
      id,
      name: name?.trim() || template?.templateNameMap?.['zh-CN'] || id,
      templateId: templateId ?? null,
      baseUrl: baseUrl ?? null,
      enabled,
      // A template's builtin list applies unless the user narrowed it at creation.
      modelIds: providedModels.length ? modelIdList : (template ? undefined : modelIdList),
      source: template ? 'builtin' : 'personal',
    };
    if (!this.#personal.providerOrder.includes(id)) this.#personal.providerOrder.push(id);
    if (apiKey) this.#credentials[id] = apiKey;
    await this.#persist();
    this.#onChange();
    return this.#require(id);
  }

  async updatePersonalProvider(id, patch = {}) {
    const provider = this.#require(id);
    if (patch.name !== undefined) provider.name = String(patch.name).trim() || provider.name;
    if (patch.baseUrl !== undefined) {
      if (!/^(https?:\/\/)[^\s]+$/i.test(patch.baseUrl)) throw providerError('Base URL must be a valid http(s) URL.');
      provider.baseUrl = patch.baseUrl;
    }
    if (patch.enabled !== undefined) provider.enabled = Boolean(patch.enabled);
    await this.#persist();
    this.#onChange();
    return provider;
  }

  async deletePersonalProvider(id) {
    this.#require(id);
    delete this.#personal.providers[id];
    this.#personal.providerOrder = this.#personal.providerOrder.filter(entry => entry !== id);
    delete this.#credentials[id];
    if (this.#personal.defaultModelSelection?.providerId === id) this.#personal.defaultModelSelection = null;
    await this.#persist();
    this.#onChange();
  }

  async setApiKey(id, apiKey) {
    this.#require(id);
    if (typeof apiKey !== 'string' || !apiKey.trim()) throw providerError('A non-empty API key is required.');
    this.#credentials[id] = apiKey.trim();
    await this.#persist();
    this.#onChange();
  }

  async addPersonalModel(id, modelId) {
    const provider = this.#require(id);
    const model = String(modelId ?? '').trim();
    if (!model) throw providerError('A model id is required.');
    const models = this.#resolvedModels(provider);
    if (models.includes(model)) throw providerError('This model id already exists.', 409);
    provider.modelIds = [...models, model];
    await this.#persist();
    this.#onChange();
  }

  async deletePersonalModel(id, modelId) {
    const provider = this.#require(id);
    provider.modelIds = this.#resolvedModels(provider).filter(model => model !== modelId);
    await this.#persist();
    this.#onChange();
  }

  async setDefaultModelSelection({ providerId, modelId } = {}) {
    const provider = this.#require(providerId);
    const models = this.#resolvedModels(provider);
    if (!models.includes(modelId)) throw providerError('The selected model does not belong to this provider.', 400);
    this.#personal.defaultModelSelection = { providerId: provider.id, modelId };
    await this.#persist();
    this.#onChange();
  }

  /** Real connectivity probe: one tiny streaming request through the provider client. */
  async testConnectivity({ providerId, modelId }, { streamChatCompletion }) {
    let resolved;
    try {
      resolved = this.resolve(providerId, modelId);
    } catch (error) {
      // A missing key or disabled provider is a connectivity failure, not a crash.
      return { success: false, error: { message: error.message || String(error), code: 'provider-unavailable' } };
    }
    if (!resolved) throw providerError('Provider not found.', 404);
    try {
      await streamChatCompletion({
        baseUrl: resolved.baseUrl, model: resolved.modelId, apiKey: resolved.apiKey,
        messages: [{ role: 'user', content: 'ping' }], timeoutMs: 20000, fetchImpl: this.#fetchImpl,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: error.message || String(error) } };
    }
  }
}
