# ZCode provider/model architecture — research for replication

Source: https://github.com/zai-org/ZCode (official, Apache-2.0), cloned 2026-09-25 to
`vendor/zcode-reference` (gitignored; reference only — no code copied). Local checkout at
time of study: version 3.14.3.

## What ZCode does (verified from source)

### 1. Three-layer provider configuration
- **Builtin layer** `config/provider/zcode-builtin.json` (`schemaVersion:1`, `revision:30`):
  `providerConfigRules.templateRules` — 20 provider templates (Z.ai, BigModel, Kimi, MiniMax,
  DeepSeek, 阿里云百炼, Xiaomi MiMo, OpenAI, Anthropic, xAI, OpenRouter, OpenCode, Zen…), each:
  - `templateId`, `templateNameMap` (zh-CN / en-US)
  - `access`: `{type: "api-key" | "zhipu-coding-plan-api-key", apiKeyManagementUrl}` — where the
    user obtains/manages the key
  - `api`: `{type: "anthropic-messages" | "openai-chat-completions" | "openai-responses", baseUrl}`
  - `builtinModelIds` (preset model list), `logo`
  - plus `providerRules` for account-derived providers (entitlement-driven, `zhipu-account` access)
- **Personal layer** (user-editable, sparse overlay): file `{schemaVersion, config:{providerOrder,
  providerConfigRules, modelConfigRules, defaultModelSelection}}`.
  Overlay semantics (`config-overlay.ts`): 缺省继承、Config 递归覆盖、其他值整体替换.
- **Model rules** (`modelConfigRules`): regex `modelMatch` → `properties` (contextWindow,
  inputFormat supportsImage/Video/Pdf, outputFormat, supportsToolCall, …) + `optionSpecs`
  (maxOutputTokens.max, reasoningLevel values). Rules apply by pattern across providers.

### 2. Personal config repository (`provider-node/personal-provider-config-repository.ts`)
- Atomic private write (`atomicWritePrivateTextFile`), cross-process file lock (`withFileLock`)
- Content-hash **revision**; 1s polling for external edits; **recovery** on invalid file
- `schemaVersion` field with migration map; versions newer than supported are rejected loudly

### 3. Credentials stored separately
API keys live in a dedicated `credentials.json` under a credentials dir, optionally encrypted
(`CredentialCipherProvider`) — never inside the provider config file (`providerProvisioning*.ts`).

### 4. Service facade (`provider/facades.ts`)
- `createPersonalProvider({templateId?, providerName?, locale?, initialConfig?})` → `{providerId}`
  — a custom provider is born from a template (or fully custom), then edited via **sparse overlays**
- `savePersonalProviderOverlay(providerId, config, membership?, metadata?)`
- `addPersonalModel / renamePersonalModel / deletePersonalModel / setPersonalModelEnabled`
  (`savePersonalModelDraft` carries `expectedPersonalRevision` — optimistic concurrency)
- `reorderPersonalProviders / reorderPersonalModels` (user-owned ordering, `owned-order.ts`)
- `deletePersonalProvider`
- `testModelConnectivity({providerId, modelId})` → `{success:true} | {success:false,
  error:{message, code?: "provider-unavailable"|"model-unavailable"}}` — the settings page only
  submits the selection; auth/headers/streaming are executed by the real model chain

### 5. Selection
`model-selection.ts`: `defaultModelSelection = {providerId, modelId, options?}`; resolution
yields ghost states (`selection-missing`, `provider-not-found`, …) surfaced to UI instead of
silent fallback.

### 6. UI (`packages/ui/src/settings/model-provider-section`)
Provider list + detail pane: key input with `apiKeyManagementUrl` link, per-provider model list
(enable toggles, reorder), add/rename custom model, per-model connectivity test, i18n names.

## What we replicate (adapted to workbench scale)

1. `server/builtin-providers.json` — template catalog (DeepSeek, Z.ai, BigModel, Kimi, MiniMax,
   Qwen, OpenRouter, OpenAI 兼容自定义), same field names where applicable; api type limited to
   `openai-chat-completions` (our engine's protocol) with the field kept for future extension.
2. `server/providers.mjs` — `ProviderRegistry`: builtin + personal overlay merge (same
   semantics), personal file `.state/providers.json` with `schemaVersion`, atomic private write,
   content-hash revision, external-change polling, recovery; **credentials in a separate file**
   `.state/provider-credentials.json` (mode 600, never served).
3. API: GET/POST/PATCH/DELETE `/api/providers`, `PUT /api/providers/:id/apiKey`,
   POST/DELETE per-provider models, `POST /api/providers/:id/test` (real 1-token connectivity
   test through the streaming client), `POST /api/settings/model` (defaultModelSelection).
   Validation issues mirror ZCode's codes (required-field-missing, invalid-url, duplicate-model…).
4. Engine: tasks resolve provider/model at creation; the task records its model; follow-ups keep
   using the task's provider (falling back to the active selection if deleted).
5. UI: composer model name becomes a picker; settings modal lists providers (template gallery +
   custom), key entry with `apiKeyManagementUrl` link, connectivity test, delete/enable.
6. Legacy import: first run seeds a `default` provider from the existing `.env` values.

Deviations (documented, not hidden): single-user local app — no file-lock wait strategy beyond
atomic replace, no encryption cipher (mode-600 file, loopback-only server), no entitlement/account
providers, api type fixed to chat-completions.
