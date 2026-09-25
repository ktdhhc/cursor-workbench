import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Folder, LoaderCircle, PanelLeftClose, Plus, Search, X } from 'lucide-react';
import { isActive, taskTitle } from './api.js';
import { useT } from './i18n.jsx';
import { IconButton, Status, timeAgo, useDrawerFocus } from './ui.jsx';

export default function Sidebar({ state, selectedId, onSelect, onNew, open, drawer, onClose, connection, onEditor }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(Date.now());
  const ref = useRef(null);
  useDrawerFocus(ref, open && drawer, onClose);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const tasks = state?.tasks || [];
  const activeCount = tasks.filter(isActive).length;
  const matching = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...tasks].filter((task) => !needle || `${taskTitle(task)} ${task.prompt || ''} ${(task.messages || []).map((message) => message.content || '').join(' ')}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [tasks, query]);
  const groups = [
    { label: t('sidebar.inProgress'), tasks: matching.filter(isActive) },
    { label: t('sidebar.recent'), tasks: matching.filter((task) => !isActive(task)) },
 ];

  return <>
    {drawer && open && <button className="drawer-backdrop" aria-label={t('sidebar.close')} onClick={onClose} tabIndex={-1} />}
    <aside ref={ref} className={`task-sidebar ${open ? 'is-open' : 'is-closed'} ${drawer ? 'is-drawer' : ''}`} aria-label={t('sidebar.tasks')} aria-modal={drawer && open ? true : undefined} role={drawer ? 'dialog' : undefined} tabIndex={-1} inert={!open}>
      <div className="sidebar-workspace">
        <div className="workspace-identity" title={state?.config.workspacePath || t('sidebar.localWorkspace')}>
          <Folder size={16} aria-hidden="true" />
          <span>{state?.config.workspaceName || t('sidebar.localWorkspace')}</span>
        </div>
        <IconButton label={t('sidebar.collapse')} onClick={onClose}><PanelLeftClose size={16} /></IconButton>
      </div>
      <div className="sidebar-actions">
        <button className="new-agent-button" type="button" onClick={onNew}>
          <Plus size={16} aria-hidden="true" /><span>{t('sidebar.new')}</span><kbd>Ctrl N</kbd>
        </button>
        <div className="task-search">
          <Search size={14} aria-hidden="true" />
          <input aria-label={t('sidebar.search')} placeholder={t('sidebar.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          {query && <IconButton label={t('sidebar.clearSearch')} onClick={() => setQuery('')}><X size={13} /></IconButton>}
        </div>
      </div>
      <div className="sidebar-section-heading"><span>{t('sidebar.agents')}</span><span className={activeCount ? 'running-count has-running' : 'running-count'}>{activeCount > 0 && <LoaderCircle size={11} className="spin" />}{t('sidebar.running', { n: activeCount })}</span></div>
      <nav className="task-list" aria-label={t('conv.conversation')}>
        {!state && <div className="sidebar-empty"><LoaderCircle size={16} className="spin" /><span>{t('sidebar.loading')}</span></div>}
        {state && tasks.length === 0 && <div className="sidebar-empty"><span>{t('sidebar.empty')}</span><p>{t('sidebar.emptyHint')}</p></div>}
        {state && tasks.length > 0 && matching.length === 0 && <div className="sidebar-empty"><span>{t('sidebar.noMatch')}</span><p>{t('sidebar.noMatchHint')}</p><button type="button" className="text-button" onClick={() => setQuery('')}>{t('sidebar.clearSearch')}</button></div>}
        {groups.map((group) => group.tasks.length > 0 && <div className="task-group" key={group.label}>
          <div className="task-group-label">{group.label}</div>
          {group.tasks.map((task) => <button type="button" className={`task-item ${selectedId === task.id ? 'is-selected' : ''}`} key={task.id} onClick={() => onSelect(task.id)} aria-current={selectedId === task.id ? 'page' : undefined} title={taskTitle(task)}>
            <Status status={task.status} iconOnly />
            <div className="task-item-content">
              <span className="task-item-title">{taskTitle(task)}</span>
              <span className="task-item-meta"><span>{task.status === 'waiting_approval' ? t('sidebar.commandApproval') : task.status === 'running' ? t('sidebar.workingInWorkspace') : task.status === 'error' ? t('sidebar.needsAttention') : task.status === 'cancelled' ? t('status.cancelled') : task.status === 'completed' ? t('status.completed') : task.status}</span><time dateTime={task.updatedAt || task.createdAt}>{timeAgo(task.updatedAt || task.createdAt, now, t)}</time></span>
            </div>
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="workspace-open" onClick={onEditor}><Folder size={14} /><span>{t('sidebar.openWorkspace')}</span><ArrowUpRight size={14} /></button>
        <div className="workspace-connection"><span className={`connection-dot ${connection === 'live' ? 'is-live' : ''}`} /><span>{connection === 'live' ? t('sidebar.localWorkspace') : connection === 'connecting' ? t('sidebar.connecting') : t('sidebar.interrupted')}</span></div>
      </div>
    </aside>
  </>;
}
