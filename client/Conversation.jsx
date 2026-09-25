import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCheck, FileSearch, Folder, GitCompareArrows, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Terminal, X } from 'lucide-react';
import { isActive } from './api.js';
import { useT } from './i18n.jsx';
import { LiveActivity } from './Activity.jsx';
import Composer from './Composer.jsx';
import Markdown from './Markdown.jsx';
import { CopyButton, ErrorNotice, formatTime, Status } from './ui.jsx';

const suggestions = [
  { Icon: FileSearch, titleKey: 'welcome.understand', promptKey: 'welcome.understandPrompt', mode: 'ask' },
  { Icon: GitCompareArrows, titleKey: 'welcome.bug', promptKey: 'welcome.bugPrompt', mode: 'agent' },
  { Icon: CheckCheck, titleKey: 'welcome.test', promptKey: 'welcome.testPrompt', mode: 'agent' },
];

export function Approval({ task, pending, onApprove }) {
  const t = useT();
  if (!task.approval) return null;
  const busy = pending.has(`approval:${task.id}`);
  return <section className="approval-card" aria-labelledby={`approval-${task.id}`}>
    <div className="approval-heading"><ShieldCheck size={17} /><h3 id={`approval-${task.id}`}>{t('approval.title')}</h3><span className="approval-badge">{t('approval.waiting')}</span></div>
    <p>{t('approval.body')}</p>
    <pre className="approval-command"><code>{task.approval.command}</code></pre>
    <div className="approval-directory"><Folder size={12} /><span>{task.approval.cwd || t('approval.workspaceDir')}</span></div>
    <div className="approval-actions"><button type="button" className="secondary-button" onClick={() => onApprove(task.id, false)} disabled={busy}><X size={14} />{t('approval.reject')}</button><button type="button" className="primary-button" onClick={() => onApprove(task.id, true)} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{t('approval.allow')}</button></div>
  </section>;
}

export default function Conversation({ task, selectedId, config, draft, onDraft, taskMode, onMode, inputRef, pending, onSubmit, onStop, onRetry, onApprove, onOpenFile, onShowActivity, onShowChanges, ready }) {
  const t = useT();
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
      <h1>{t('welcome.heading')}</h1>
      <p className="welcome-description">{t('welcome.sub')}</p>
      {composer}
      <div className="suggestion-list" aria-label={t('welcome.heading')}>
        {suggestions.map(({ Icon, titleKey, promptKey, mode }) => <button type="button" key={titleKey} className="suggestion" onClick={() => { onMode(mode); onDraft(t(promptKey)); inputRef.current?.focus(); }}><Icon size={15} /><span>{t(titleKey)}</span><ArrowRight size={13} /></button>)}
      </div>
      <div className="welcome-workspace"><Folder size={13} /><span>{config?.workspaceName || t('sidebar.localWorkspace')}</span><span className="workspace-safety">{t('welcome.localFiles')}</span></div>
    </div>
    <div className="welcome-shortcut">{t('welcome.switch')} <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>E</kbd></div>
  </div>;

  if (!task) return <div className="conversation-loading"><LoaderCircle className="spin" size={20} /><h2>{t('conv.loading')}</h2><p>{t('conv.loadingHint')}</p></div>;

  const last = messages[messages.length - 1];
  const pendingChanges = (task.changes || []).filter((change) => change.status === 'pending').length;
  return <div className="conversation-view">
    <div className="transcript-scroll" ref={scrollRef} onScroll={() => {
      const panel = scrollRef.current;
      if (!panel) return;
      pinned.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 90;
      setShowJump(!pinned.current);
    }} aria-label={t('conv.conversation')} tabIndex={0}>
      <div className="transcript" ref={contentRef}>
        <div className="conversation-start"><span>{t('conv.started', { date: task.createdAt ? new Date(task.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '' })}</span><span>{config?.model}</span></div>
        {messages.length === 0 && <p className="muted transcript-empty">{t('conv.noMessages')}</p>}
        {messages.map((message, index) => <article key={message.id || `${message.role}-${index}`} className={`message message-${message.role}`} aria-label={message.role === 'user' ? t('conv.you') : t('conv.agent')}>
          <div className="message-heading">{message.role === 'assistant' && <Sparkles size={14} aria-hidden="true" />}<span>{message.role === 'user' ? t('conv.you') : t('conv.agent')}</span>{message.createdAt && <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}{message.role === 'assistant' && message.content && <CopyButton text={message.content} label={t('conv.copyResponse')} />}</div>
          {message.role === 'user' ? <div className="user-message-content">{message.content}</div> : message.content ? <Markdown content={message.content} onOpenFile={onOpenFile} /> : <div className="message-placeholder">{active ? <><LoaderCircle size={14} className="spin" />{t('conv.thinking')}</> : t('conv.noResponse')}</div>}
        </article>)}
        <LiveActivity task={task} onShowActivity={onShowActivity} />
        {active && (last?.role !== 'assistant' || last?.content) && <div className="agent-progress" role="status"><Status status={task.status} /><span>{task.status === 'waiting_approval' ? t('conv.reviewCommand') : t('conv.agentWorking')}</span></div>}
        <Approval task={task} pending={pending} onApprove={onApprove} />
        {task.error && <ErrorNotice className="task-error"><strong>{task.status === 'cancelled' ? t('conv.taskStopped') : t('conv.taskError')}</strong><p>{task.error}</p></ErrorNotice>}
        {task.status === 'error' && !task.error && <ErrorNotice>{t('conv.taskFailed')}</ErrorNotice>}
        {(task.status === 'error' || task.status === 'cancelled') && <div className="recovery-row"><p>{task.status === 'cancelled' ? t('conv.stoppedBody') : t('conv.errorBody')}</p><button type="button" className="secondary-button" onClick={() => onRetry(task.id)} disabled={pending.has(`message:${task.id}`) || !config?.configured}>{pending.has(`message:${task.id}`) ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}{task.status === 'cancelled' ? t('conv.continueTask') : t('conv.retry')}</button></div>}
        {task.status === 'completed' && <div className="completion-row"><Status status="completed" />{pendingChanges > 0 && <button className="text-button" type="button" onClick={onShowChanges}>{pendingChanges === 1 ? t('conv.reviewOne') : t('conv.reviewMany', { n: pendingChanges })}<ArrowRight size={13} /></button>}</div>}
        {task.status === 'waiting_approval' && !task.approval && <ErrorNotice>{t('conv.waitingNoCommand')}</ErrorNotice>}
        <div className="transcript-end" />
      </div>
    </div>
    {showJump && <button type="button" className="jump-latest" onClick={() => { pinned.current = true; setShowJump(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' }); }}><ArrowDown size={13} />{t('conv.jumpLatest')}</button>}
    <div className="conversation-composer">{composer}</div>
  </div>;
}
