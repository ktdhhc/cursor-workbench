import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCheck, FileSearch, Folder, GitCompareArrows, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Terminal, X } from 'lucide-react';
import { isActive } from './api.js';
import { LiveActivity } from './Activity.jsx';
import Composer from './Composer.jsx';
import Markdown from './Markdown.jsx';
import { CopyButton, ErrorNotice, formatTime, Status } from './ui.jsx';

const suggestions = [
  { Icon: FileSearch, title: 'Understand this project', prompt: 'Explore this workspace and explain its structure, main entry points, and how to run it. Do not edit files.', mode: 'ask' },
  { Icon: GitCompareArrows, title: 'Find a bug to fix', prompt: 'Inspect this workspace for a concrete bug. Explain what you find, implement a focused fix, and verify it if possible.', mode: 'agent' },
  { Icon: CheckCheck, title: 'Add a useful test', prompt: 'Inspect the existing code and test setup. Add a focused test for an important behavior that is not covered, then verify it. Ask for command approval when needed.', mode: 'agent' },
];

export function Approval({ task, pending, onApprove }) {
  if (!task.approval) return null;
  const busy = pending.has(`approval:${task.id}`);
  return <section className="approval-card" aria-labelledby={`approval-${task.id}`}>
    <div className="approval-heading"><ShieldCheck size={17} /><h3 id={`approval-${task.id}`}>Command approval required</h3><span className="approval-badge">Waiting</span></div>
    <p>This command runs on your local host, outside a security sandbox. Review it before allowing execution.</p>
    <pre className="approval-command"><code>{task.approval.command}</code></pre>
    <div className="approval-directory"><Folder size={12} /><span>{task.approval.cwd || 'Workspace directory'}</span></div>
    <div className="approval-actions"><button type="button" className="secondary-button" onClick={() => onApprove(task.id, false)} disabled={busy}><X size={14} />Reject</button><button type="button" className="primary-button" onClick={() => onApprove(task.id, true)} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}Allow command</button></div>
  </section>;
}

export default function Conversation({ task, selectedId, config, draft, onDraft, taskMode, onMode, inputRef, pending, onSubmit, onStop, onRetry, onApprove, onOpenFile, onShowActivity, onShowChanges, ready }) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const pinned = useRef(true);
  const previousId = useRef(selectedId);
  const [showJump, setShowJump] = useState(false);
  const active = isActive(task);
  const messages = (task?.messages || []).filter((message) => message.role === 'user' || message.role === 'assistant');

  useLayoutEffect(() => {
    if (previousId.current !== selectedId) {
      previousId.current = selectedId;
      pinned.current = true;
      setShowJump(false);
    }
    if (pinned.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedId, task?.messages, task?.activities, task?.status, task?.approval]);
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [selectedId, Boolean(task)]);

  const composer = <Composer task={task} value={draft} onChange={onDraft} mode={taskMode} onModeChange={onMode} config={config} pending={pending} onSubmit={onSubmit} onStop={onStop} inputRef={inputRef} welcome={!selectedId} ready={ready && (!selectedId || Boolean(task))} />;
  if (!selectedId) return <div className="new-task-view">
    <div className="welcome-content">
      <div className="welcome-mark" aria-hidden="true"><Sparkles size={27} strokeWidth={1.35} /></div>
      <h1>What would you like to work on?</h1>
      <p className="welcome-description">An agent for your code. An editor when you need it.</p>
      {composer}
      <div className="suggestion-list" aria-label="Suggested tasks">
        {suggestions.map(({ Icon, title, prompt, mode }) => <button type="button" key={title} className="suggestion" onClick={() => { onMode(mode); onDraft(prompt); inputRef.current?.focus(); }}><Icon size={15} /><span>{title}</span><ArrowRight size={13} /></button>)}
      </div>
      <div className="welcome-workspace"><Folder size={13} /><span>{config?.workspaceName || 'Loading workspace…'}</span><span className="workspace-safety">Local files · Explicit command approval</span></div>
    </div>
    <div className="welcome-shortcut">Switch to your editor with <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>E</kbd></div>
  </div>;

  if (!task) return <div className="conversation-loading"><LoaderCircle className="spin" size={20} /><h2>Loading conversation</h2><p>Waiting for the latest task state.</p></div>;

  const last = messages[messages.length - 1];
  const pendingChanges = (task.changes || []).filter((change) => change.status === 'pending').length;
  return <div className="conversation-view">
    <div className="transcript-scroll" ref={scrollRef} onScroll={() => {
      const panel = scrollRef.current;
      if (!panel) return;
      pinned.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 90;
      setShowJump(!pinned.current);
    }} aria-label="Conversation" tabIndex={0}>
      <div className="transcript" ref={contentRef}>
        <div className="conversation-start"><span>Started {task.createdAt ? new Date(task.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span><span>{config?.model}</span></div>
        {messages.length === 0 && <p className="muted transcript-empty">No messages have been recorded for this task yet.</p>}
        {messages.map((message, index) => <article key={message.id || `${message.role}-${index}`} className={`message message-${message.role}`} aria-label={message.role === 'user' ? 'Your message' : 'Agent response'}>
          <div className="message-heading">{message.role === 'assistant' && <Sparkles size={14} aria-hidden="true" />}<span>{message.role === 'user' ? 'You' : 'Agent'}</span>{message.createdAt && <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}{message.role === 'assistant' && message.content && <CopyButton text={message.content} label="Copy response" />}</div>
          {message.role === 'user' ? <div className="user-message-content">{message.content}</div> : message.content ? <Markdown content={message.content} onOpenFile={onOpenFile} /> : <div className="message-placeholder">{active ? <><LoaderCircle size={14} className="spin" />Thinking…</> : 'No response content was recorded.'}</div>}
        </article>)}
        <LiveActivity task={task} onShowActivity={onShowActivity} />
        {active && (last?.role !== 'assistant' || last?.content) && <div className="agent-progress" role="status"><Status status={task.status} /><span>{task.status === 'waiting_approval' ? 'Review the command below to continue.' : 'The agent is working in your workspace.'}</span></div>}
        <Approval task={task} pending={pending} onApprove={onApprove} />
        {task.error && <ErrorNotice className="task-error"><strong>Task {task.status === 'cancelled' ? 'stopped' : 'error'}</strong><p>{task.error}</p></ErrorNotice>}
        {task.status === 'error' && !task.error && <ErrorNotice>The task failed. Review the activity log, then retry or send a follow-up.</ErrorNotice>}
        {(task.status === 'error' || task.status === 'cancelled') && <div className="recovery-row"><p>{task.status === 'cancelled' ? 'This agent has stopped. Continue from the existing conversation.' : 'Your conversation and file changes are preserved.'}</p><button type="button" className="secondary-button" onClick={() => onRetry(task.id)} disabled={pending.has(`message:${task.id}`) || !config?.configured}>{pending.has(`message:${task.id}`) ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}{task.status === 'cancelled' ? 'Continue task' : 'Retry'}</button></div>}
        {task.status === 'completed' && <div className="completion-row"><Status status="completed" />{pendingChanges > 0 && <button className="text-button" type="button" onClick={onShowChanges}>Review {pendingChanges} {pendingChanges === 1 ? 'change' : 'changes'}<ArrowRight size={13} /></button>}</div>}
        {task.status === 'waiting_approval' && !task.approval && <ErrorNotice>The agent is waiting for approval, but no command is available. Stop the task, then continue it to recover.</ErrorNotice>}
        <div className="transcript-end" />
      </div>
    </div>
    {showJump && <button type="button" className="jump-latest" onClick={() => { pinned.current = true; setShowJump(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' }); }}><ArrowDown size={13} />Jump to latest</button>}
    <div className="conversation-composer">{composer}</div>
  </div>;
}
