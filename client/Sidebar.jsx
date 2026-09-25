import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Folder, LoaderCircle, PanelLeftClose, Plus, Search, X } from 'lucide-react';
import { isActive, taskTitle } from './api.js';
import { IconButton, Status, timeAgo, useDrawerFocus } from './ui.jsx';

export default function Sidebar({ state, selectedId, onSelect, onNew, open, drawer, onClose, connection, onEditor }) {
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
    { label: 'In progress', tasks: matching.filter(isActive) },
    { label: 'Recent', tasks: matching.filter((task) => !isActive(task)) },
  ];

  return <>
    {drawer && open && <button className="drawer-backdrop" aria-label="Close task sidebar" onClick={onClose} tabIndex={-1} />}
    <aside ref={ref} className={`task-sidebar ${open ? 'is-open' : 'is-closed'} ${drawer ? 'is-drawer' : ''}`} aria-label="Agent tasks" aria-modal={drawer && open ? true : undefined} role={drawer ? 'dialog' : undefined} tabIndex={-1} inert={!open}>
      <div className="sidebar-workspace">
        <div className="workspace-identity" title={state?.config.workspacePath || 'Loading workspace'}>
          <Folder size={16} aria-hidden="true" />
          <span>{state?.config.workspaceName || 'Workspace'}</span>
        </div>
        <IconButton label="Collapse task sidebar" onClick={onClose}><PanelLeftClose size={16} /></IconButton>
      </div>
      <div className="sidebar-actions">
        <button className="new-agent-button" type="button" onClick={onNew}>
          <Plus size={16} aria-hidden="true" /><span>New agent</span><kbd>Ctrl N</kbd>
        </button>
        <div className="task-search">
          <Search size={14} aria-hidden="true" />
          <input aria-label="Search tasks" placeholder="Search tasks…" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" />
          {query && <IconButton label="Clear task search" onClick={() => setQuery('')}><X size={13} /></IconButton>}
        </div>
      </div>
      <div className="sidebar-section-heading"><span>Agents</span><span className={activeCount ? 'running-count has-running' : 'running-count'}>{activeCount > 0 && <LoaderCircle size={11} className="spin" />}{activeCount} running</span></div>
      <nav className="task-list" aria-label="Conversations">
        {!state && <div className="sidebar-empty"><LoaderCircle size={16} className="spin" /><span>Loading tasks…</span></div>}
        {state && tasks.length === 0 && <div className="sidebar-empty"><span>No agents yet</span><p>Start a task to work in this workspace.</p></div>}
        {state && tasks.length > 0 && matching.length === 0 && <div className="sidebar-empty"><span>No matching tasks</span><p>Try a title or a word from a conversation.</p><button type="button" className="text-button" onClick={() => setQuery('')}>Clear search</button></div>}
        {groups.map((group) => group.tasks.length > 0 && <div className="task-group" key={group.label}>
          <div className="task-group-label">{group.label}</div>
          {group.tasks.map((task) => <button type="button" className={`task-item ${selectedId === task.id ? 'is-selected' : ''}`} key={task.id} onClick={() => onSelect(task.id)} aria-current={selectedId === task.id ? 'page' : undefined} title={taskTitle(task)}>
            <Status status={task.status} iconOnly />
            <div className="task-item-content">
              <span className="task-item-title">{taskTitle(task)}</span>
              <span className="task-item-meta"><span>{task.status === 'waiting_approval' ? 'Command approval' : task.status === 'running' ? 'Working in workspace' : task.status === 'error' ? 'Needs attention' : task.status === 'cancelled' ? 'Stopped' : task.status === 'completed' ? 'Completed' : task.status}</span><time dateTime={task.updatedAt || task.createdAt}>{timeAgo(task.updatedAt || task.createdAt, now)}</time></span>
            </div>
          </button>)}
        </div>)}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="workspace-open" onClick={onEditor}><Folder size={14} /><span>Open workspace</span><ArrowUpRight size={14} /></button>
        <div className="workspace-connection"><span className={`connection-dot ${connection === 'live' ? 'is-live' : ''}`} /><span>{connection === 'live' ? 'Local workspace' : connection === 'connecting' ? 'Connecting to workspace' : 'Connection interrupted'}</span></div>
      </div>
    </aside>
  </>;
}
