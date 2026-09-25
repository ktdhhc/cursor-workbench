import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, CheckCircle2, Code2, Folder, LoaderCircle, PanelLeft, PanelRight, RefreshCw, ShieldAlert, WifiOff, X } from 'lucide-react';
import Artifacts from './Artifacts.jsx';
import Conversation from './Conversation.jsx';
import Sidebar from './Sidebar.jsx';
import { isActive, readPreference, request, savePreference, taskPath, taskTitle, useWorkbench } from './api.js';
import { ErrorNotice, IconButton, Status, useMediaQuery } from './ui.jsx';

function useActions() {
  const [pending, setPending] = useState(new Set());
  const [errors, setErrors] = useState([]);
  const inFlight = useRef(new Map());
  const mounted = useRef(true);
  const errorId = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of inFlight.current.values()) controller.abort();
      inFlight.current.clear();
    };
  }, []);
  const run = useCallback(async (key, label, operation) => {
    if (inFlight.current.has(key)) return { ok: false };
    const controller = new AbortController();
    inFlight.current.set(key, controller);
    setPending(new Set(inFlight.current.keys()));
    try {
      const value = await operation(controller.signal);
      return { ok: true, value };
    } catch (failure) {
      if (mounted.current && failure.name !== 'AbortError') {
        setErrors((previous) => [...previous, { id: ++errorId.current, label, message: failure.message || String(failure) }]);
      }
      return { ok: false };
    } finally {
      if (inFlight.current.get(key) === controller) inFlight.current.delete(key);
      if (mounted.current) setPending(new Set(inFlight.current.keys()));
    }
  }, []);
  const dismiss = useCallback((id) => setErrors((previous) => previous.filter((error) => error.id !== id)), []);
  return { run, pending, errors, dismiss };
}

function pause(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function getEditorUrl(config) {
  if (!config?.editorUrl) return null;
  try {
    const url = new URL(config.editorUrl, window.location.origin);
    // The local same-origin proxy is the only supported editor host.
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/editor/')) return null;
    if (!url.searchParams.has('folder') && config.workspacePath) url.searchParams.set('folder', config.workspacePath);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export default function App() {
  const { state, connection, error: stateError, refreshing, refresh, reconnect } = useWorkbench();
  const { run, pending, errors, dismiss } = useActions();
  const [windowMode, setWindowMode] = useState(() => readPreference('windowMode', 'agents') === 'editor' ? 'editor' : 'agents');
  const [selectedId, setSelectedId] = useState(() => readPreference('selectedTask', null));
  const [newMode, setNewMode] = useState('agent');
  const [drafts, setDrafts] = useState({});
  const [createdModes, setCreatedModes] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  const [artifactsOpen, setArtifactsOpen] = useState(() => window.matchMedia('(min-width: 1180px)').matches);
  const [artifactsTab, setArtifactsTab] = useState('changes');
  const [editorLoaded, setEditorLoaded] = useState(false);
  const [editorIssue, setEditorIssue] = useState('');
  const [notice, setNotice] = useState('');
  const sidebarDrawer = useMediaQuery('(max-width: 760px)');
  const artifactsDrawer = useMediaQuery('(max-width: 1179px)');
  const inputRef = useRef(null);
  const iframeRef = useRef(null);
  const navigationRevision = useRef(0);
  const requestedModeAt = useRef(readPreference('requestedModeAt', null));
  const frameCleanup = useRef(null);
  const shortcutsRef = useRef(null);
  const task = state?.tasks.find((item) => item.id === selectedId) || null;
  const activeCount = state?.tasks.filter(isActive).length || 0;
  const editorUrl = useMemo(() => getEditorUrl(state?.config), [state?.config.editorUrl, state?.config.workspacePath]);
  const draftKey = selectedId || 'new';
  const taskMode = task?.mode || createdModes[selectedId] || (selectedId ? readPreference(`taskMode.${selectedId}`, null) : newMode);

  useEffect(() => { savePreference('windowMode', windowMode); }, [windowMode]);
  useEffect(() => { savePreference('selectedTask', selectedId); }, [selectedId]);
  useEffect(() => {
    const requestMode = state?.requestedMode;
    if (requestMode?.mode === 'agents' && String(requestMode.at) !== requestedModeAt.current) {
      requestedModeAt.current = String(requestMode.at);
      savePreference('requestedModeAt', String(requestMode.at));
      setWindowMode('agents');
    }
  }, [state?.requestedMode?.mode, state?.requestedMode?.at]);
  useEffect(() => {
    setSidebarOpen(!sidebarDrawer);
  }, [sidebarDrawer]);
  useEffect(() => {
    setArtifactsOpen(!artifactsDrawer);
  }, [artifactsDrawer]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!editorUrl || editorLoaded) return;
    const timer = setTimeout(() => setEditorIssue('The editor is taking longer than expected. Check that the local code-server service is running, then reload the editor.'), 25000);
    return () => clearTimeout(timer);
  }, [editorUrl, editorLoaded]);
  useEffect(() => () => frameCleanup.current?.(), []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const closeArtifacts = useCallback(() => setArtifactsOpen(false), []);
  const selectTask = useCallback((id) => {
    navigationRevision.current += 1;
    setSelectedId(id);
    setWindowMode('agents');
    if (sidebarDrawer) setSidebarOpen(false);
  }, [sidebarDrawer]);
  const newTask = useCallback(() => {
    navigationRevision.current += 1;
    setSelectedId(null);
    setWindowMode('agents');
    if (sidebarDrawer) setSidebarOpen(false);
    if (artifactsDrawer) setArtifactsOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [sidebarDrawer, artifactsDrawer]);
  const openArtifacts = useCallback((tab = 'changes') => {
    setArtifactsTab(tab);
    setArtifactsOpen(true);
    if (sidebarDrawer) setSidebarOpen(false);
  }, [sidebarDrawer]);
  const toggleSidebar = () => {
    setSidebarOpen((value) => !value);
    if (artifactsDrawer) setArtifactsOpen(false);
  };
  const handleShortcut = useCallback((event) => {
    if (event.defaultPrevented || event.isComposing || event.repeat) return;
    if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      event.stopPropagation();
      setWindowMode((value) => value === 'agents' ? 'editor' : 'agents');
      return;
    }
    const target = event.target;
    const isInput = Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]') || target?.isContentEditable);
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n' && !isInput) {
      event.preventDefault();
      event.stopPropagation();
      newTask();
    }
  }, [newTask]);
  shortcutsRef.current = handleShortcut;
  useEffect(() => {
    const listener = (event) => shortcutsRef.current?.(event);
    window.addEventListener('keydown', listener, true);
    return () => window.removeEventListener('keydown', listener, true);
  }, []);

  function editorDidLoad() {
    setEditorLoaded(true);
    setEditorIssue('');
    frameCleanup.current?.();
    try {
      const frameDocument = iframeRef.current?.contentDocument;
      if (!frameDocument) return;
      const listener = (event) => shortcutsRef.current?.(event);
      frameDocument.addEventListener('keydown', listener, true);
      frameCleanup.current = () => frameDocument.removeEventListener('keydown', listener, true);
    } catch { /* A cross-origin editor cannot forward shortcuts; the shared mode bar remains available. */ }
  }

  const updateDraft = (value) => setDrafts((previous) => ({ ...previous, [draftKey]: value }));
  async function submitMessage() {
    const content = (drafts[draftKey] || '').trim();
    if (!content || !state?.config.configured || isActive(task)) return;
    const originalDraft = drafts[draftKey];
    const contextId = selectedId;
    const contextKey = draftKey;
    const revision = navigationRevision.current;
    const mode = newMode;
    const result = await run(contextId ? `message:${contextId}` : 'create', contextId ? `Could not send to “${taskTitle(task)}”` : 'Could not start agent', async (signal) => {
      const response = await request(contextId ? `${taskPath(contextId)}/messages` : '/api/tasks', { body: contextId ? { content } : { prompt: content, mode }, signal });
      if (!contextId) {
        const created = response?.task || response;
        if (!created?.id) throw new Error('The task was submitted, but the server did not return its ID. Refresh the task list before trying again.');
        savePreference(`taskMode.${created.id}`, mode);
        setCreatedModes((previous) => ({ ...previous, [created.id]: mode }));
        if (revision === navigationRevision.current) {
          setSelectedId(created.id);
          if (sidebarDrawer) setSidebarOpen(false);
        }
      }
      await refresh();
    });
    if (result.ok) setDrafts((previous) => previous[contextKey] === originalDraft ? { ...previous, [contextKey]: '' } : previous);
  }
  async function stopTask() {
    if (!task) return;
    const id = task.id;
    await run(`stop:${id}`, `Could not stop “${taskTitle(task)}”`, async (signal) => {
      await request(`${taskPath(id)}/stop`, { method: 'POST', body: {}, signal });
      await refresh();
    });
  }
  async function retryTask(id) {
    await run(`message:${id}`, 'Could not continue task', async (signal) => {
      await request(`${taskPath(id)}/messages`, { body: { content: 'Continue this task from where you left off. Review any previous error before retrying, and preserve existing workspace edits.' }, signal });
      await refresh();
    });
  }
  async function approveTask(id, approved) {
    await run(`approval:${id}`, approved ? 'Could not approve command' : 'Could not reject command', async (signal) => {
      await request(`${taskPath(id)}/approval`, { body: { approved }, signal });
      await refresh();
    });
  }
  async function reviewChange(id, changeId, action) {
    const result = await run(`change:${id}:${changeId}`, action === 'revert' ? 'Could not revert change' : 'Could not accept change', async (signal) => {
      await request(`${taskPath(id)}/changes/${encodeURIComponent(changeId)}`, { body: { action }, signal });
      await refresh();
    });
    return result.ok;
  }
  async function openFile(path) {
    if (!path) return;
    const result = await run(`open:${path}`, `Could not open ${path}`, async (signal) => {
      const response = await request('/api/editor/open', { body: { path }, signal });
      setWindowMode('editor');
      setArtifactsOpen(!artifactsDrawer);
      if (!response?.id) { setNotice(`Open request sent for ${path}.`); return; }
      setNotice(`Opening ${path} in the editor…`);
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await pause(650, signal);
        const acknowledgement = await request(`/api/editor/commands/${encodeURIComponent(response.id)}`, { signal });
        if (acknowledgement?.error) throw new Error(acknowledgement.error);
        if (acknowledgement?.ok) { setNotice(`Opened ${path} in the editor.`); return; }
        if (acknowledgement?.ok === false && !acknowledgement.pending) throw new Error('The editor could not open this file. Check the file path and the editor connection.');
      }
      throw new Error('The file-open request is still queued. Check that the editor and its workspace bridge are connected.');
    });
    if (!result.ok) setNotice('');
  }
  function reloadEditor() {
    if (!iframeRef.current || !editorUrl) return;
    setEditorIssue('');
    setEditorLoaded(false);
    // Only the explicit recovery button reloads the existing iframe.
    iframeRef.current.src = editorUrl;
  }
  const modalOpen = windowMode === 'agents' && ((sidebarDrawer && sidebarOpen) || (artifactsDrawer && artifactsOpen));

  return <div className="app-shell">
    <header className="titlebar" inert={modalOpen}>
      <div className="titlebar-brand"><span className="brand-mark"><Code2 size={16} strokeWidth={1.8} /></span><span>Workbench</span><span className="local-label">LOCAL</span></div>
      <div className="window-switcher" role="group" aria-label="Workspace window">
        <button type="button" aria-pressed={windowMode === 'editor'} className={windowMode === 'editor' ? 'is-active' : ''} onClick={() => setWindowMode('editor')} title="编辑器窗口 · Ctrl+Shift+E"><Code2 size={14} /><span>Editor Window</span></button>
        <button type="button" aria-pressed={windowMode === 'agents'} className={windowMode === 'agents' ? 'is-active' : ''} onClick={() => setWindowMode('agents')} title="智能体窗口 · Ctrl+Shift+E"><Bot size={14} /><span>Agents Window</span>{activeCount > 0 && <span className="mode-running-count">{activeCount}</span>}</button>
      </div>
      <div className="titlebar-meta"><span className={`connection-dot ${connection === 'live' ? 'is-live' : ''}`} title={connection === 'live' ? 'Live updates connected' : 'Live updates disconnected'} /><span className="titlebar-workspace" title={state?.config.workspacePath}>{state?.config.workspaceName || 'Local workspace'}</span><span className="titlebar-shortcut" title="Switch between editor and agents">Ctrl ⇧ E</span></div>
    </header>

    <div className="global-notices" inert={modalOpen}>
      {(connection === 'reconnecting' || connection === 'offline') && <div className="network-notice" role="alert"><WifiOff size={15} /><span>{connection === 'offline' ? 'You are offline.' : 'Live connection interrupted.'} Showing the last received state. Reconnecting automatically.</span><button type="button" className="text-button" onClick={reconnect}>Reconnect</button></div>}
      {stateError && <ErrorNotice action={<button type="button" className="text-button" onClick={reconnect}>Reconnect</button>}>{stateError}</ErrorNotice>}
      {state && !state.config.configured && <div className="configuration-notice" role="alert"><ShieldAlert size={15} /><span>The model is not configured. Set the API key in the server environment and restart the local server. The editor is still available.</span></div>}
      {errors.map((item) => <ErrorNotice key={item.id} onDismiss={() => dismiss(item.id)}><strong>{item.label}</strong><p>{item.message}</p></ErrorNotice>)}
      {notice && <div className="action-notice" role="status"><CheckCircle2 size={14} /><span>{notice}</span><IconButton label="Dismiss notification" onClick={() => setNotice('')}><X size={14} /></IconButton></div>}
    </div>

    <div className="workspace-body">
      <section className="agents-window" hidden={windowMode !== 'agents'} aria-label="Agents Window">
        <Sidebar state={state} selectedId={selectedId} onSelect={selectTask} onNew={newTask} open={sidebarOpen && windowMode === 'agents'} drawer={sidebarDrawer} onClose={closeSidebar} connection={connection} onEditor={() => setWindowMode('editor')} />
        <main className="main-workspace" inert={modalOpen}>
          <div className="conversation-header">
            <div className="conversation-title">{!sidebarOpen && <IconButton label="Show task sidebar" onClick={toggleSidebar}><PanelLeft size={16} /></IconButton>}<span className="conversation-title-text">{task ? taskTitle(task) : selectedId ? 'Conversation' : 'New agent'}</span>{task && <Status status={task.status} />}</div>
            <div className="conversation-header-actions"><IconButton label="Refresh workspace state" disabled={refreshing} onClick={() => refresh()}><RefreshCw size={14} className={refreshing ? 'spin' : undefined} /></IconButton><IconButton label={artifactsOpen ? 'Hide task details' : 'Show changes and activity'} aria-expanded={artifactsOpen} onClick={() => artifactsOpen ? closeArtifacts() : openArtifacts(artifactsTab)}><PanelRight size={16} /></IconButton></div>
          </div>
          <Conversation task={task} selectedId={selectedId} config={state?.config} draft={drafts[draftKey] || ''} onDraft={updateDraft} taskMode={taskMode} onMode={setNewMode} inputRef={inputRef} pending={pending} onSubmit={submitMessage} onStop={stopTask} onRetry={retryTask} onApprove={approveTask} onOpenFile={openFile} onShowActivity={() => openArtifacts('activity')} onShowChanges={() => openArtifacts('changes')} ready={Boolean(state)} />
        </main>
        <Artifacts task={task} tab={artifactsTab} onTab={setArtifactsTab} open={artifactsOpen && windowMode === 'agents'} drawer={artifactsDrawer} onClose={closeArtifacts} pending={pending} onChangeAction={reviewChange} onOpenFile={openFile} />
      </section>

      <section className="editor-window" hidden={windowMode !== 'editor'} aria-label="Editor Window">
        {editorUrl ? <>
          <iframe ref={iframeRef} className="editor-frame" src={editorUrl} title={`Editor — ${state?.config.workspaceName || 'workspace'}`} onLoad={editorDidLoad} onError={() => setEditorIssue('The editor could not be loaded. Check the local code-server service, then reload the editor.')} />
          {!editorLoaded && !editorIssue && <div className="editor-loading" role="status"><LoaderCircle size={20} className="spin" /><span>Opening your editor…</span><p>Your files and terminal run in the local workspace.</p></div>}
          {editorIssue && <div className="editor-recovery"><ErrorNotice><strong>Editor connection</strong><p>{editorIssue}</p><div className="editor-recovery-actions"><button type="button" className="secondary-button" onClick={reloadEditor}><RefreshCw size={13} />Reload editor</button><a className="secondary-button" href={editorUrl} target="_blank" rel="noopener noreferrer">Open separately<ArrowUpRight size={13} /></a></div></ErrorNotice></div>}
        </> : <div className="editor-unavailable"><Code2 size={30} strokeWidth={1.4} /><h2>{state ? 'Editor URL unavailable' : 'Connecting to your workspace'}</h2><p>{state ? 'The server must provide a same-origin /editor/ URL for this workspace.' : 'The editor will open when the local server is ready.'}</p><button className="secondary-button" type="button" onClick={reconnect}><RefreshCw size={14} />Reconnect</button></div>}
      </section>
    </div>
  </div>;
}
