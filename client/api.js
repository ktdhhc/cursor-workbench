import { useCallback, useEffect, useRef, useState } from 'react';

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
    throw new Error('Cannot reach the local server. Check that the workbench is running and try again.');
  }
  const text = await response.text();
  let result;
  try { result = text ? JSON.parse(text) : null; } catch {
    throw new Error(`The server returned an unexpected response (${response.status}). Check the local server and try again.`);
  }
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status} ${response.statusText}).`);
  return result;
}

function validateState(value) {
  if (!value || !value.config || !Array.isArray(value.tasks)) {
    throw new Error('The server returned an invalid workspace state. Reconnect to try again.');
  }
  return value;
}

// A fetch that began before a state event must never replace that newer event.
// Each subscription also owns its requests, so Strict Mode cleanups cannot leak.
export function useWorkbench() {
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
        setError(failure instanceof SyntaxError ? 'A live update could not be read. Reconnect to get the latest workspace state.' : failure.message);
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
      setError(`Live updates are unavailable. ${failure.message}`);
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
export const isActive = (task) => task?.status === 'running' || task?.status === 'waiting_approval';

export function taskTitle(task) {
  return task?.title || task?.prompt?.split('\n')[0] || 'Untitled agent';
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
