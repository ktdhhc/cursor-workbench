import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n.jsx';

export async function request(path, { body, signal, method = body === undefined ? 'GET' : 'POST' } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const network = new Error('Cannot reach the local server. Check that the workbench is running and try again.');
    network.errorKey = 'errors.network';
    throw network;
  }
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : null; } catch {
    const unexpected = new Error(`The server returned an unexpected response (${response.status}). Check the local server and try again.`);
    unexpected.errorKey = 'errors.badResponse';
    unexpected.params = { status: response.status };
    throw unexpected;
  }
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status} ${response.statusText}).`);
  return result;
}

function validateState(value) {
  if (!value || !value.config || !Array.isArray(value.tasks)) {
    const invalid = new Error('The server returned an invalid workspace state. Reconnect to try again.');
    invalid.errorKey = 'errors.badState';
    throw invalid;
  }
  return value;
}

// A fetch that began before a state event must never replace that newer event.
// Each subscription also owns its requests, so Strict Mode cleanups cannot leak.
export function useWorkbench() {
  const t = useT();
  const [state, setState] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [subscription, setSubscription] = useState(0);
  const refreshRef = useRef(null);
  const latestState = useRef(null);

  useEffect(() => {
    let disposed = false;
    let eventRevision = 0;
    let requestRevision = 0;
    let source;
    const controllers = new Set();
    setConnection('connecting');

    const commit = (next) => {
      if (disposed) return;
      latestState.current = next;
      setState(next);
      setError(null);
    };
    const refresh = async () => {
      const controller = new AbortController();
      controllers.add(controller);
      const startedAtEvent = eventRevision;
      const requestNumber = ++requestRevision;
      setRefreshing(true);
      try {
        const next = validateState(await request('/api/state', { signal: controller.signal }));
        if (!disposed && requestNumber === requestRevision && startedAtEvent === eventRevision) commit(next);
        return disposed ? null : latestState.current;
      } catch (failure) {
        if (!disposed && failure.name !== 'AbortError' && requestNumber === requestRevision && startedAtEvent === eventRevision) {
          setError(failure.message);
        }
        return null;
      } finally {
        controllers.delete(controller);
        if (!disposed && requestNumber === requestRevision) setRefreshing(false);
      }
    };
    refreshRef.current = refresh;
    void refresh();

    const onState = (event) => {
      if (disposed) return;
      try {
        const next = validateState(JSON.parse(event.data));
        eventRevision += 1;
        commit(next);
        setConnection('live');
      } catch (failure) {
        setError(failure instanceof SyntaxError ? t('errors.liveRead') : failure.message);
      }
    };
    const onOpen = () => { if (!disposed) setConnection('live'); };
    const onError = () => { if (!disposed) setConnection('reconnecting'); };
    const onOffline = () => { if (!disposed) setConnection('offline'); };
    const onOnline = () => {
      if (disposed) return;
      setConnection(source?.readyState === EventSource.OPEN ? 'live' : 'reconnecting');
      void refresh();
    };
    try {
      source = new EventSource('/api/events');
      source.addEventListener('state', onState);
      source.addEventListener('open', onOpen);
      source.addEventListener('error', onError);
    } catch (failure) {
      setConnection('offline');
      setError(t('errors.liveUnavailable', { reason: failure.message }));
    }
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      disposed = true;
      if (refreshRef.current === refresh) refreshRef.current = null;
      for (const controller of controllers) controller.abort();
      source?.removeEventListener('state', onState);
      source?.removeEventListener('open', onOpen);
      source?.removeEventListener('error', onError);
      source?.close();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [subscription]);

  const refresh = useCallback(() => refreshRef.current?.() ?? Promise.resolve(null), []);
  const reconnect = useCallback(() => setSubscription((value) => value + 1), []);
  return { state, connection, error, refreshing, refresh, reconnect };
}

export const taskPath = (id) => `/api/tasks/${encodeURIComponent(id)}`;

/** Providers live outside /api/state so the model picker can refresh independently. */
export function useProviders() {
  const [providers, setProviders] = useState(null);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    try {
      setProviders(await request('/api/providers'));
      setError(null);
    } catch (failure) {
      setError(failure.errorKey || failure.message);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { providers, error, refresh };
}

export function activeModelLabel(providers, fallback) {
  const selection = providers?.defaultModelSelection;
  if (!selection) return fallback || null;
  const provider = providers.providers?.find((item) => item.id === selection.providerId);
  if (!provider) return selection.modelId;
  return `${selection.modelId} · ${provider.name}`;
}
export const isActive = (task) => ['running', 'waiting_approval', 'waiting_input'].includes(task?.status);

/** The agent is paused on a question; the next composer submission answers it. */
export const isWaitingInput = (task) => task?.status === 'waiting_input';

export function taskTitle(task, t) {
  return task?.title || task?.prompt?.split('\n')[0] || (t ? t('app.untitled') : 'Untitled agent');
}

export const MODES = ['agent', 'ask', 'plan', 'debug'];
export const PERMISSIONS = ['build', 'edit', 'yolo'];
export const REASONING_LEVELS = ['low', 'medium', 'high'];
export const VERIFICATION_STATUSES = ['not-run', 'running', 'passed', 'failed', 'blocked'];

/** Ask and Plan never edit files or run commands, regardless of the picked permission. */
export const isReadOnlyMode = (mode) => mode === 'ask' || mode === 'plan';

/**
 * A provider counts as usable when its availability probe says so; older
 * servers only expose `enabled` + `apiKeyConfigured`, which we fall back to.
 */
export function providerReady(provider) {
  if (!provider || provider.enabled === false) return false;
  const ready = provider.modelAvailability?.ready;
  if (typeof ready === 'boolean') return ready;
  return Boolean(provider.apiKeyConfigured);
}

/** Workspace-level readiness: prefer modelAvailability over config.configured. */
export function modelReady(state, providers) {
  const fromState = state?.modelAvailability?.ready;
  if (typeof fromState === 'boolean') return fromState;
  const fromProviders = providers?.modelAvailability?.ready;
  if (typeof fromProviders === 'boolean') return fromProviders;
  return Boolean(state?.config?.configured);
}

export function modelEntry(providers, providerId, modelId) {
  const provider = providers?.providers?.find((item) => item.id === providerId);
  if (!provider) return null;
  if (Array.isArray(provider.models)) return provider.models.find((model) => model.id === modelId) || null;
  return null;
}

/**
 * A model counts as usable unless its ModelInfo entry explicitly disables it.
 * Legacy payloads without a models[] entry are treated as enabled.
 */
export function modelEnabled(provider, modelId) {
  if (!provider || !modelId) return false;
  const entry = Array.isArray(provider.models) ? provider.models.find((model) => model.id === modelId) : null;
  return entry ? entry.enabled !== false : true;
}

/** Model IDs a provider offers that are not explicitly disabled, in modelIds order. */
export function enabledModelIds(provider) {
  const ids = Array.isArray(provider?.modelIds) && provider.modelIds.length
    ? provider.modelIds
    : (Array.isArray(provider?.models) ? provider.models.map((model) => model.id) : []);
  return ids.filter((id) => modelEnabled(provider, id));
}

/** Compact context window label: 1_000_000+ → "1M", 1000+ → "128K", null → ''. */
export function formatContextWindow(tokens) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return '';
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

/** Reasoning levels a model actually supports; empty means "default only". */
export function reasoningLevelsFor(providers, providerId, modelId) {
  const levels = modelEntry(providers, providerId, modelId)?.reasoningLevels;
  if (!Array.isArray(levels)) return [];
  return levels.filter((level) => REASONING_LEVELS.includes(level));
}

export function reasoningLabelKey(level) {
  return REASONING_LEVELS.includes(level) ? `run.reasoning.${level}` : 'run.reasoning.default';
}

export function defaultModelSelection(providers) {
  const selection = providers?.defaultModelSelection;
  if (selection?.providerId && selection?.modelId) {
    const provider = providers?.providers?.find((item) => item.id === selection.providerId);
    if (!provider || modelEnabled(provider, selection.modelId)) return { providerId: selection.providerId, modelId: selection.modelId };
  }
  const provider = (providers?.providers || []).find((item) => providerReady(item) && enabledModelIds(item).length);
  const modelId = provider ? enabledModelIds(provider)[0] : null;
  return provider && modelId ? { providerId: provider.id, modelId } : { providerId: null, modelId: null };
}

/**
 * Merge a (possibly stale or hand-edited) persisted run config with what the
 * providers actually offer, so a stored model or reasoning level that no
 * longer exists quietly falls back instead of producing a broken payload.
 */
export function sanitizeRunConfig(saved, providers) {
  const mode = MODES.includes(saved?.mode) ? saved.mode : 'agent';
  const permissionMode = PERMISSIONS.includes(saved?.permissionMode) ? saved.permissionMode : 'build';
  const requested = saved?.modelSelection && typeof saved.modelSelection === 'object' ? saved.modelSelection : {};
  const provider = providers?.providers?.find((item) => item.id === requested.providerId);
  const hasModel = Boolean(provider && requested.modelId
    && (provider.modelIds?.includes(requested.modelId) || provider.models?.some((model) => model.id === requested.modelId))
    && modelEnabled(provider, requested.modelId));
  const base = hasModel ? { providerId: requested.providerId, modelId: requested.modelId } : defaultModelSelection(providers);
  const level = requested.options?.reasoningLevel;
  const options = reasoningLevelsFor(providers, base.providerId, base.modelId).includes(level) ? { reasoningLevel: level } : {};
  return { mode, permissionMode, planEnabled: mode === 'plan', modelSelection: { ...base, options } };
}

/** Read the run configuration of an existing task, tolerating legacy fields. */
export function normalizeRunConfig(task) {
  const raw = task?.runConfig && typeof task.runConfig === 'object' ? task.runConfig : {};
  const mode = MODES.includes(raw.mode) ? raw.mode : MODES.includes(task?.mode) ? task.mode : 'agent';
  const permissionMode = PERMISSIONS.includes(raw.permissionMode) ? raw.permissionMode : 'build';
  const selection = raw.modelSelection && typeof raw.modelSelection === 'object' ? raw.modelSelection : {};
  const reasoningLevel = selection.options?.reasoningLevel;
  return {
    mode,
    permissionMode,
    planEnabled: typeof raw.planEnabled === 'boolean' ? raw.planEnabled : mode === 'plan',
    modelSelection: {
      providerId: selection.providerId || null,
      modelId: selection.modelId || task?.model || null,
      options: REASONING_LEVELS.includes(reasoningLevel) ? { reasoningLevel } : {},
    },
  };
}

export function normalizeVerification(task) {
  const raw = task?.verification && typeof task.verification === 'object' ? task.verification : {};
  return {
    status: VERIFICATION_STATUSES.includes(raw.status) ? raw.status : 'not-run',
    checks: Array.isArray(raw.checks) ? raw.checks : [],
  };
}

export function pendingChangeCount(task) {
  return (task?.changes || []).filter((change) => change.status === 'pending').length;
}

export function todoSummary(task) {
  const todos = Array.isArray(task?.todos) ? task.todos : [];
  const done = todos.filter((todo) => todoStatus(todo) === 'done').length;
  return { done, total: todos.length };
}

export function todoStatus(todo) {
  const status = String(todo?.status ?? (todo?.done ? 'done' : 'pending')).toLowerCase();
  if (/done|complete/.test(status)) return 'done';
  if (/progress|active|running|doing/.test(status)) return 'doing';
  return 'pending';
}

export function readPreference(key, fallback) {
  try { return sessionStorage.getItem(`workbench.${key}`) || fallback; } catch { return fallback; }
}

export function savePreference(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(`workbench.${key}`);
    else sessionStorage.setItem(`workbench.${key}`, value);
  } catch { /* The app remains usable when browser storage is unavailable. */ }
}

export function readJsonPreference(key, fallback) {
  try {
    const raw = sessionStorage.getItem(`workbench.${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export function saveJsonPreference(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(`workbench.${key}`);
    else sessionStorage.setItem(`workbench.${key}`, JSON.stringify(value));
  } catch { /* The app remains usable when browser storage is unavailable. */ }
}
