export const REASONING_LEVELS = Object.freeze(['default', 'low', 'medium', 'high']);

const REASONING_LEVEL_SET = new Set(REASONING_LEVELS);
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Clone a value only if it is representable as ordinary, pollution-safe JSON. */
export function clonePlainJson(value, path = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite JSON numbers.`);
    return value;
  }
  if (Array.isArray(value)) {
    const clone = [];
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new TypeError(`${path} must not contain sparse arrays.`);
      clone.push(clonePlainJson(value[index], `${path}[${index}]`));
    }
    return clone;
  }
  if (!isPlainObject(value)) throw new TypeError(`${path} must contain only ordinary JSON values.`);
  const clone = {};
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new TypeError(`${path} contains a forbidden key.`);
    clone[key] = clonePlainJson(value[key], `${path}.${key}`);
  }
  return clone;
}

export function defaultOnlyModelOption() {
  return { reasoningLevels: ['default'], defaultReasoningLevel: 'default', requestPatches: {} };
}

export function safeReasoningModelOption() {
  return {
    reasoningLevels: [...REASONING_LEVELS],
    defaultReasoningLevel: 'default',
    requestPatches: {
      low: { reasoning_effort: 'low' },
      medium: { reasoning_effort: 'medium' },
      high: { reasoning_effort: 'high' },
    },
  };
}

export function normalizeModelOption(value, fallback = defaultOnlyModelOption()) {
  if (value === undefined) return clonePlainJson(fallback, 'model option fallback');
  const option = clonePlainJson(value, 'model option');
  if (!isPlainObject(option)) throw new TypeError('Model option must be an object.');
  if (!Array.isArray(option.reasoningLevels) || option.reasoningLevels.length === 0) {
    throw new TypeError('Model option reasoningLevels must be a non-empty array.');
  }
  const reasoningLevels = [];
  for (const level of option.reasoningLevels) {
    if (typeof level !== 'string' || !REASONING_LEVEL_SET.has(level) || reasoningLevels.includes(level)) {
      throw new TypeError('Model option contains an invalid reasoning level.');
    }
    reasoningLevels.push(level);
  }
  if (!reasoningLevels.includes('default')) throw new TypeError('Model option must support the default reasoning level.');
  const defaultReasoningLevel = option.defaultReasoningLevel ?? 'default';
  if (typeof defaultReasoningLevel !== 'string' || !reasoningLevels.includes(defaultReasoningLevel)) {
    throw new TypeError('Model option defaultReasoningLevel must be supported by the model.');
  }
  const patches = option.requestPatches ?? {};
  if (!isPlainObject(patches)) throw new TypeError('Model option requestPatches must be an object.');
  const requestPatches = {};
  for (const [level, patch] of Object.entries(patches)) {
    if (level === 'default' || !reasoningLevels.includes(level)) throw new TypeError('Model option contains a request patch for an unsupported reasoning level.');
    const clonedPatch = clonePlainJson(patch, `request patch for ${level}`);
    if (!isPlainObject(clonedPatch)) throw new TypeError('A reasoning request patch must be an object.');
    requestPatches[level] = clonedPatch;
  }
  for (const level of reasoningLevels) {
    if (level !== 'default' && requestPatches[level] === undefined) {
      throw new TypeError(`Model option is missing the ${level} request patch.`);
    }
  }
  return { reasoningLevels, defaultReasoningLevel, requestPatches };
}

export function normalizeModelOptionMap(value) {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) throw new TypeError('modelOptions must be an object.');
  const options = {};
  for (const [modelId, option] of Object.entries(value)) {
    if (!modelId || DANGEROUS_KEYS.has(modelId)) throw new TypeError('modelOptions contains an invalid model id.');
    options[modelId] = normalizeModelOption(option);
  }
  return options;
}

export function explicitModelOptionMap(modelIds, value, fallback = defaultOnlyModelOption()) {
  const configured = normalizeModelOptionMap(value) ?? {};
  const options = {};
  for (const modelId of modelIds) options[modelId] = normalizeModelOption(configured[modelId] ?? configured['*'] ?? fallback);
  return options;
}

export function publicModelOption(modelId, option) {
  const normalized = normalizeModelOption(option);
  return {
    id: modelId,
    reasoningLevels: [...normalized.reasoningLevels],
    defaultReasoningLevel: normalized.defaultReasoningLevel,
  };
}

export function resolveReasoningOption(option, reasoningLevel) {
  const normalizedOption = normalizeModelOption(option);
  let normalizedLevel = reasoningLevel;
  if (normalizedLevel === undefined) normalizedLevel = normalizedOption.defaultReasoningLevel;
  else {
    if (typeof normalizedLevel !== 'string') throw new TypeError('reasoningLevel must be a string.');
    normalizedLevel = normalizedLevel.trim().toLowerCase();
  }
  if (!REASONING_LEVEL_SET.has(normalizedLevel) || !normalizedOption.reasoningLevels.includes(normalizedLevel)) {
    throw new RangeError(`Reasoning level “${String(reasoningLevel)}” is not supported by this model.`);
  }
  return {
    reasoningLevel: normalizedLevel,
    requestPatch: normalizedLevel === 'default'
      ? {}
      : clonePlainJson(normalizedOption.requestPatches[normalizedLevel], 'resolved request patch'),
  };
}
