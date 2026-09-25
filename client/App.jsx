import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bot, CheckCircle2, Code2, Folder, Languages, LoaderCircle, Moon, PanelLeft, PanelRight, RefreshCw, ShieldAlert, Sun, WifiOff, X } from 'lucide-react';
import { useLangControls, useT } from './i18n.jsx';
import Artifacts from './Artifacts.jsx';
import Conversation, { RunConfigBadges, VerificationChip } from './Conversation.jsx';
import Sidebar from './Sidebar.jsx';
import { isActive, modelReady, normalizeRunConfig, normalizeVerification, pendingChangeCount, readJsonPreference, readPreference, request, sanitizeRunConfig, saveJsonPreference, savePreference, taskPath, taskTitle, todoSummary, useProviders, useWorkbench } from './api.js';
import ProviderSettings from './ProviderSettings.jsx';
import { initialTheme } from './i18n.jsx';
import { ErrorNotice, IconButton, Status, useMediaQuery } from './ui.jsx';

function useActions() {
  const t = useT();
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
        setErrors((previous) => [...previous, { id: ++errorId.current, label, message: failure.errorKey ? t(failure.errorKey, failure.params) : failure.message || String(failure) }]);
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
  const t = useT();
  const { lang, setLang } = useLangControls();
  const { providers, refresh: refreshProviders } = useProviders();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state, connection, error: stateError, refreshing, refresh, reconnect } = useWorkbench();
  const { run, pending, errors, dismiss } = useActions();
  const [windowMode, setWindowMode] = useState(() => readPreference('windowMode', 'agents') === 'editor' ? 'editor' : 'agents');
  const [selectedId, setSelectedId] = useState(() => readPreference('selectedTask', null));
  const [savedRunConfig, setSavedRunConfig] = useState(() => readJsonPreference('newRunConfig', null));
  const [theme, setTheme] = useState(initialTheme);
  const [drafts, setDrafts] = useState({});
  const [createdConfigs, setCreatedConfigs] = useState({});
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
  const editorDisabled = Boolean(state && state.config.editorEnabled === false);
  const draftKey = selectedId || 'new';
  const draftValue = drafts[draftKey] ?? readPreference(`draft.${draftKey}`, '');
  const canRun = modelReady(state, providers);
  // New-task configuration: the user's picks sanitized against the providers actually available.
  const newRunConfig = useMemo(() => sanitizeRunConfig(savedRunConfig, providers), [savedRunConfig, providers]);
  const updateRunConfig = useCallback((next) => {
    setSavedRunConfig(next);
    saveJsonPreference('newRunConfig', next);
  }, []);
  // Existing tasks show the run configuration they were created with, read-only.
  const taskRunConfig = useMemo(() => {
    if (!task) return null;
    if (task.runConfig) return normalizeRunConfig(task);
    const created = createdConfigs[selectedId] || readJsonPreference(`taskRunConfig.${selectedId}`, null);
    if (created) return sanitizeRunConfig(created, providers);
    if (task.mode || task.model) return normalizeRunConfig(task);
    return null;
  }, [task, selectedId, createdConfigs, providers]);
  const pendingChanges = pendingChangeCount(task);
  const todos = todoSummary(task);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('workbench.theme', theme); } catch { /* Theme stays per-session without storage. */ }
  }, [theme]);
  useEffect(() => { document.title = t('app.title'); }, [t]);
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
    const timer = setTimeout(() => setEditorIssue(t('app.editorSlow')), 25000);
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

  const updateDraft = (value) => {
    setDrafts((previous) => ({ ...previous, [draftKey]: value }));
    savePreference(`draft.${draftKey}`, value);
  };
  async function submitMessage() {
    const content = (drafts[draftKey] ?? draftValue).trim();
    const answering = task?.status === 'waiting_input';
    if (!content || !canRun || (isActive(task) && !answering)) return;
    const originalDraft = drafts[draftKey] ?? draftValue;
    const contextId = selectedId;
    const contextKey = draftKey;
    const revision = navigationRevision.current;
    // Freeze the configuration at submission time so later edits to the
    // composer (or global defaults) never mutate what this task runs with.
    const frozen = {
      mode: newRunConfig.mode,
      permissionMode: newRunConfig.permissionMode,
      planEnabled: newRunConfig.mode === 'plan',
      modelSelection: {
        providerId: newRunConfig.modelSelection.providerId,
        modelId: newRunConfig.modelSelection.modelId,
        options: { ...(newRunConfig.modelSelection.options?.reasoningLevel ? { reasoningLevel: newRunConfig.modelSelection.options.reasoningLevel } : {}) },
      },
    };
    const label = contextId ? (answering ? t('app.couldNotAnswer') : t('app.couldNotSend', { title: taskTitle(task, t) })) : t('app.couldNotStart');
    const result = await run(contextId ? `message:${contextId}` : 'create', label, async (signal) => {
      const response = await request(
        contextId ? (answering ? `${taskPath(contextId)}/answer` : `${taskPath(contextId)}/messages`) : '/api/tasks',
        { body: contextId ? (answering ? { answer: content } : { content }) : { prompt: content, mode: frozen.mode, runConfig: frozen }, signal },
      );
      if (!contextId) {
        const created = response?.task || response;
        if (!created?.id) throw new Error(t('errors.noTaskId'));
        savePreference(`taskMode.${created.id}`, frozen.mode);
        saveJsonPreference(`taskRunConfig.${created.id}`, frozen);
        setCreatedConfigs((previous) => ({ ...previous, [created.id]: frozen }));
        if (revision === navigationRevision.current) {
          setSelectedId(created.id);
          if (sidebarDrawer) setSidebarOpen(false);
        }
      }
      await refresh();
    });
    if (result.ok) {
      setDrafts((previous) => {
        const current = previous[contextKey];
        if (current !== undefined && current !== originalDraft) return previous; // the user kept typing
        savePreference(`draft.${contextKey}`, '');
        return { ...previous, [contextKey]: '' };
      });
    }
  }
  async function stopTask() {
    if (!task) return;
    const id = task.id;
    await run(`stop:${id}`, t('app.couldNotStop', { title: taskTitle(task, t) }), async (signal) => {
      await request(`${taskPath(id)}/stop`, { method: 'POST', body: {}, signal });
      await refresh();
    });
  }
  async function retryTask(id) {
    await run(`retry:${id}`, t('app.couldNotContinue'), async (signal) => {
      await request(`${taskPath(id)}/retry`, { method: 'POST', body: {}, signal });
      await refresh();
    });
  }
  async function approveTask(id, approved) {
    await run(`approval:${id}`, approved ? t('app.couldNotApprove') : t('app.couldNotReject'), async (signal) => {
      await request(`${taskPath(id)}/approval`, { body: { approved }, signal });
      await refresh();
    });
  }
  async function reviewChange(id, changeId, action) {
    const result = await run(`change:${id}:${changeId}`, action === 'revert' ? t('app.couldNotRevert') : t('app.couldNotAccept'), async (signal) => {
      await request(`${taskPath(id)}/changes/${encodeURIComponent(changeId)}`, { body: { action }, signal });
      await refresh();
    });
    return result.ok;
  }
  async function openFile(path) {
    if (!path) return;
    const result = await run(`open:${path}`, t('app.couldNotOpen', { path }), async (signal) => {
      const response = await request('/api/editor/open', { body: { path }, signal });
      setWindowMode('editor');
      setArtifactsOpen(!artifactsDrawer);
      if (!response?.id) { setNotice(t('app.openSent', { path })); return; }
      setNotice(t('app.opening', { path }));
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await pause(650, signal);
        const acknowledgement = await request(`/api/editor/commands/${encodeURIComponent(response.id)}`, { signal });
        if (acknowledgement?.error) throw new Error(acknowledgement.error);
        if (acknowledgement?.ok) { setNotice(t('app.opened', { path })); return; }
        if (acknowledgement?.ok === false && !acknowledgement.pending) throw new Error(t('errors.editorOpen'));
      }
      throw new Error(t('errors.editorQueued'));
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
        <button type="button" aria-pressed={windowMode === 'editor'} className={windowMode === 'editor' ? 'is-active' : ''} onClick={() => setWindowMode('editor')} title={editorDisabled ? t('app.editorDisabledTitle') : t('app.editorTitle')}><Code2 size={14} /><span>{t('app.editor')}</span></button>
        <button type="button" aria-pressed={windowMode === 'agents'} className={windowMode === 'agents' ? 'is-active' : ''} onClick={() => setWindowMode('agents')} title={t('app.agentsTitle')}><Bot size={14} /><span>{t('app.agents')}</span>{activeCount > 0 && <span className="mode-running-count">{activeCount}</span>}</button>
      </div>
      <div className="titlebar-meta"><span className={`connection-dot ${connection === 'live' ? 'is-live' : ''}`} title={connection === 'live' ? t('app.live') : t('app.offlineDot')} /><IconButton label={theme === 'light' ? t('app.themeDark') : t('app.themeLight')} onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}</IconButton><IconButton label={t('app.langTitle')} onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}><span className="lang-label">{lang === 'zh' ? 'EN' : '中'}</span></IconButton><span className="titlebar-workspace" title={state?.config.workspacePath}>{state?.config.workspaceName || t('sidebar.localWorkspace')}</span><span className="titlebar-shortcut" title={t('welcome.switch')}>Ctrl ⇧ E</span></div>
    </header>

    <div className="global-notices" inert={modalOpen}>
      {(connection === 'reconnecting' || connection === 'offline') && <div className="network-notice" role="alert"><WifiOff size={15} /><span>{connection === 'offline' ? t('app.offline') : t('app.reconnecting')}</span><button type="button" className="text-button" onClick={reconnect}>{t('app.reconnect')}</button></div>}
      {stateError && <ErrorNotice action={<button type="button" className="text-button" onClick={reconnect}>{t('app.reconnect')}</button>}>{stateError}</ErrorNotice>}
      {state && !canRun && <div className="configuration-notice" role="alert"><ShieldAlert size={15} /><span>{t('app.modelNotConfigured')}</span></div>}
      {errors.map((item) => <ErrorNotice key={item.id} onDismiss={() => dismiss(item.id)}><strong>{item.label}</strong><p>{item.message}</p></ErrorNotice>)}
      {notice && <div className="action-notice" role="status"><CheckCircle2 size={14} /><span>{notice}</span><IconButton label={t('app.dismissNotice')} onClick={() => setNotice('')}><X size={14} /></IconButton></div>}
    </div>

    <div className="workspace-body">
      <section className="agents-window" hidden={windowMode !== 'agents'} aria-label="Agents Window">
        <Sidebar state={state} selectedId={selectedId} onSelect={selectTask} onNew={newTask} open={sidebarOpen && windowMode === 'agents'} drawer={sidebarDrawer} onClose={closeSidebar} connection={connection} onEditor={() => setWindowMode('editor')} />
        <main className="main-workspace" inert={modalOpen}>
          <div className="conversation-header">
            <div className="conversation-title">{!sidebarOpen && <IconButton label={t('app.showSidebar')} onClick={toggleSidebar}><PanelLeft size={16} /></IconButton>}<span className="conversation-title-text">{task ? taskTitle(task, t) : selectedId ? t('app.conversationTitle') : t('app.newTask')}</span>{task && <Status status={task.status} />}</div>
            <div className="conversation-header-actions"><IconButton label={t('app.refresh')} disabled={refreshing} onClick={() => refresh()}><RefreshCw size={14} className={refreshing ? 'spin' : undefined} /></IconButton><IconButton label={artifactsOpen ? t('app.hideDetails') : t('app.showDetails')} aria-expanded={artifactsOpen} onClick={() => artifactsOpen ? closeArtifacts() : openArtifacts(artifactsTab)}><PanelRight size={16} /></IconButton></div>
          </div>
          {task && <div className="conversation-runbar">
            <RunConfigBadges config={taskRunConfig} />
            {task.verification && <VerificationChip verification={normalizeVerification(task)} />}
            {todos.total > 0 && <span className="run-chip runbar-todos" title={t('todos.title')}>{t('todos.progress', todos)}</span>}
            {pendingChanges > 0 && <button type="button" className="run-chip runbar-changes" onClick={() => openArtifacts('changes')}>{pendingChanges === 1 ? t('conv.reviewOne') : t('conv.reviewMany', { n: pendingChanges })}</button>}
          </div>}
          <Conversation task={task} selectedId={selectedId} config={state?.config} draft={draftValue} onDraft={updateDraft} runConfig={newRunConfig} taskRunConfig={taskRunConfig} onRunConfigChange={updateRunConfig} modelReady={canRun} inputRef={inputRef} pending={pending} onSubmit={submitMessage} onStop={stopTask} onRetry={retryTask} onApprove={approveTask} onOpenFile={openFile} onShowActivity={() => openArtifacts('activity')} onShowChanges={() => openArtifacts('changes')} ready={Boolean(state)} providers={providers} onManage={() => setSettingsOpen(true)} />
        </main>
        <Artifacts task={task} tab={artifactsTab} onTab={setArtifactsTab} open={artifactsOpen && windowMode === 'agents'} drawer={artifactsDrawer} onClose={closeArtifacts} pending={pending} onChangeAction={reviewChange} onOpenFile={openFile} />
      </section>

      <section className="editor-window" hidden={windowMode !== 'editor'} aria-label="Editor Window">
        {editorUrl ? <>
          <iframe ref={iframeRef} className="editor-frame" src={editorUrl} title={`Editor — ${state?.config.workspaceName || 'workspace'}`} onLoad={editorDidLoad} onError={() => setEditorIssue(t('app.editorFrameError'))} />
          {!editorLoaded && !editorIssue && <div className="editor-loading" role="status"><LoaderCircle size={20} className="spin" /><span>{t('app.editorLoading')}</span><p>{t('app.editorLoadingHint')}</p></div>}
          {editorIssue && <div className="editor-recovery"><ErrorNotice><strong>{t('app.editorConnection')}</strong><p>{editorIssue}</p><div className="editor-recovery-actions"><button type="button" className="secondary-button" onClick={reloadEditor}><RefreshCw size={13} />{t('app.reloadEditor')}</button><a className="secondary-button" href={editorUrl} target="_blank" rel="noopener noreferrer">{t('app.openSeparately')}<ArrowUpRight size={13} /></a></div></ErrorNotice></div>}
        </> : state && state.config.editorEnabled === false ? <div className="editor-unavailable">
          <Code2 size={30} strokeWidth={1.4} />
          <h2>{t('editor.notEnabledTitle')}</h2>
          <p>{t('editor.notEnabledBody')}</p>
          <ul className="editor-options">
            <li><strong>{t('editor.wslLabel')}</strong> {t('editor.wslHow')}</li>
            <li><strong>{t('editor.nativeLabel')}</strong> {t('editor.nativeHow')}</li>
            <li><strong>{t('editor.linuxLabel')}</strong> {t('editor.linuxHow')}</li>
          </ul>
        </div> : <div className="editor-unavailable"><Code2 size={30} strokeWidth={1.4} /><h2>{state ? t('app.editorUnavailable') : t('app.connecting')}</h2><p>{state ? t('app.editorUnavailableBody') : t('app.editorReadyHint')}</p><button className="secondary-button" type="button" onClick={reconnect}><RefreshCw size={14} />{t('app.reconnect')}</button></div>}
      </section>
      <ProviderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} providers={providers} refresh={refreshProviders} />
    </div>
  </div>;
}
