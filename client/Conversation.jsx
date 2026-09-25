import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, CheckCheck, CheckCircle2, Circle, CircleDashed, FilePenLine, FileSearch, Folder, GitCompareArrows, ListChecks, LoaderCircle, Lock, MessageSquare, OctagonAlert, RotateCcw, ShieldCheck, Sparkles, Terminal, X, XCircle } from 'lucide-react';
import { isActive, isReadOnlyMode, normalizeVerification, pendingChangeCount, reasoningLabelKey, todoStatus, todoSummary } from './api.js';
import { useT } from './i18n.jsx';
import { LiveActivity } from './Activity.jsx';
import Composer from './Composer.jsx';
import Markdown from './Markdown.jsx';
import { CopyButton, ErrorNotice, formatTime, Status } from './ui.jsx';

const suggestions = [
  { Icon: FileSearch, titleKey: 'welcome.understand', promptKey: 'welcome.understandPrompt', mode: 'ask' },
  { Icon: GitCompareArrows, titleKey: 'welcome.bug', promptKey: 'welcome.bugPrompt', mode: 'debug' },
  { Icon: CheckCheck, titleKey: 'welcome.test', promptKey: 'welcome.testPrompt', mode: 'agent' },
];

const APPROVAL_KINDS = {
  command: { Icon: Terminal, titleKey: 'approval.type.command', bodyKey: 'approval.body', allowKey: 'approval.allowCommand' },
  edit: { Icon: FilePenLine, titleKey: 'approval.type.edit', bodyKey: 'approval.editBody', allowKey: 'approval.allowEdit' },
  plan: { Icon: ListChecks, titleKey: 'approval.type.plan', bodyKey: 'approval.planBody', allowKey: 'approval.allowPlan' },
};

export function Approval({ task, pending, onApprove }) {
  const t = useT();
  const approval = task.approval;
  if (!approval) return null;
  const kind = APPROVAL_KINDS[approval.type] ? approval.type : 'command';
  const { Icon, titleKey, bodyKey, allowKey } = APPROVAL_KINDS[kind];
  const busy = pending.has(`approval:${task.id}`);
  const risk = typeof approval.risk === 'string' && approval.risk ? approval.risk : null;
  const riskLabel = risk ? (['low', 'medium', 'high'].includes(risk) ? t(`approval.risk.${risk}`) : risk) : null;
  return <section className={`approval-card approval-${kind}`} aria-labelledby={`approval-${task.id}`}>
    <div className="approval-heading"><Icon size={17} /><h3 id={`approval-${task.id}`}>{approval.title || t(titleKey)}</h3>{riskLabel && <span className={`approval-risk risk-${risk}`}>{t('approval.risk', { level: riskLabel })}</span>}<span className="approval-badge">{t('approval.waiting')}</span></div>
    <p>{approval.description || t(bodyKey)}</p>
    {approval.path && <div className="approval-directory"><FilePenLine size={12} /><span>{approval.path}</span></div>}
    {approval.command && <pre className="approval-command"><code>{approval.command}</code></pre>}
    {approval.command && <div className="approval-directory"><Folder size={12} /><span>{approval.cwd || t('approval.workspaceDir')}</span></div>}
    {(approval.preview || approval.plan) && (kind === 'plan'
      ? <div className="approval-preview markdown"><Markdown content={String(approval.plan || approval.preview)} /></div>
      : <pre className="approval-command" aria-label={t('approval.preview')}><code>{typeof approval.preview === 'string' ? approval.preview : JSON.stringify(approval.preview, null, 2)}</code></pre>)}
    <div className="approval-actions"><button type="button" className="secondary-button" onClick={() => onApprove(task.id, false)} disabled={busy}><X size={14} />{t('approval.reject')}</button><button type="button" className="primary-button" onClick={() => onApprove(task.id, true)} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{t(allowKey)}</button></div>
  </section>;
}

const VERIFICATION_ICONS = { 'not-run': CircleDashed, running: LoaderCircle, passed: CheckCircle2, failed: XCircle, blocked: OctagonAlert };

export function VerificationChip({ verification }) {
  const t = useT();
  const status = verification?.status || 'not-run';
  const Icon = VERIFICATION_ICONS[status] || CircleDashed;
  return <span className={`verify-chip is-${status}`} title={t('verify.title')}>
    <Icon size={12} aria-hidden="true" className={status === 'running' ? 'spin' : undefined} />
    <span>{t(`verify.${status}`)}</span>
  </span>;
}

function CheckIcon({ status }) {
  const value = String(status || '').toLowerCase();
  if (/pass|ok|success|done/.test(value)) return <Check size={12} />;
  if (/fail|error/.test(value)) return <X size={12} />;
  if (/block/.test(value)) return <OctagonAlert size={12} />;
  if (/run|progress/.test(value)) return <LoaderCircle size={12} className="spin" />;
  return <Circle size={12} />;
}

export function VerificationPanel({ task }) {
  const t = useT();
  const verification = normalizeVerification(task);
  // Legacy tasks have no verification field at all; stay quiet for them.
  if (!task?.verification) return null;
  return <section className={`verify-card is-${verification.status}`} aria-label={t('verify.title')}>
    <div className="verify-head"><ShieldCheck size={14} /><span>{t('verify.title')}</span><VerificationChip verification={verification} /></div>
    {verification.status === 'not-run' && <p className="verify-hint">{t('verify.notRunHint')}</p>}
    {verification.status === 'blocked' && <p className="verify-hint">{t('verify.blockedHint')}</p>}
    {verification.checks.length > 0 && <ul className="verify-checks">
      {verification.checks.map((check, index) => <li key={check.id || check.name || index} className="verify-check">
        <CheckIcon status={check.status} />
        <span className="verify-check-name">{check.name || check.title || check.command || t('verify.title')}</span>
        {(check.detail || check.message) && <span className="verify-check-detail">{check.detail || check.message}</span>}
      </li>)}
    </ul>}
  </section>;
}

/** Compact read-only summary of the run configuration, used in the conversation header. */
export function RunConfigBadges({ config }) {
  const t = useT();
  if (!config) return null;
  const readOnly = isReadOnlyMode(config.mode);
  const reasoning = config.modelSelection?.options?.reasoningLevel;
  return <div className="run-badges">
    <span className="run-chip" title={t(`run.mode.${config.mode}.desc`)}>{t(`run.mode.${config.mode}`)}</span>
    <span className="run-chip" title={readOnly ? t('run.perm.readonly') : t(`run.perm.${config.permissionMode}.desc`)}>
      {readOnly && <Lock size={10} />}{t(`run.perm.${config.permissionMode}`)}
    </span>
    {config.modelSelection?.modelId && <span className="run-chip">{config.modelSelection.modelId}</span>}
    {reasoning && <span className="run-chip">{t('run.reasoning')} · {t(reasoningLabelKey(reasoning))}</span>}
  </div>;
}

export function TodosCard({ task }) {
  const t = useT();
  const todos = Array.isArray(task?.todos) ? task.todos : [];
  if (!todos.length) return null;
  const summary = todoSummary(task);
  return <section className="todo-card" aria-label={t('todos.title')}>
    <div className="todo-head"><ListChecks size={14} /><span>{t('todos.title')}</span><span className="todo-progress">{t('todos.progress', summary)}</span></div>
    <ul className="todo-list">
      {todos.map((todo, index) => {
        const status = todoStatus(todo);
        return <li key={todo.id || index} className={`todo-item is-${status}`}>
          {status === 'done' ? <CheckCircle2 size={13} /> : status === 'doing' ? <LoaderCircle size={13} className="spin" /> : <Circle size={13} />}
          <span>{todo.content || todo.title || todo.text || String(todo)}</span>
        </li>;
      })}
    </ul>
  </section>;
}

function UserQuestion({ task, draft, onDraft, pending, onSubmit }) {
  const t = useT();
  const interaction = task?.interaction;
  const [selected, setSelected] = useState([]);
  useEffect(() => setSelected([]), [interaction?.id]);
  if (task?.status !== 'waiting_input' || interaction?.type !== 'question') return null;
  const options = Array.isArray(interaction.options) ? interaction.options : [];
  const busy = pending.has(`message:${task.id}`);
  function choose(label) {
    if (!interaction.multiSelect) {
      onDraft(label);
      requestAnimationFrame(() => onSubmit());
      return;
    }
    setSelected((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  }
  function submitSelected() {
    if (!selected.length) return;
    onDraft(selected.join(', '));
    requestAnimationFrame(() => onSubmit());
  }
  return <section className="question-card" aria-labelledby={`question-${task.id}`}>
    <div className="question-heading"><MessageSquare size={16} /><h3 id={`question-${task.id}`}>{t('question.title')}</h3><span className="approval-badge">{t('question.waiting')}</span></div>
    <p>{interaction.question}</p>
    <div className="question-options" role={interaction.multiSelect ? 'group' : 'radiogroup'}>
      {options.map((option) => { const checked = selected.includes(option.label); return <button key={option.label} type="button" className={`question-option ${checked ? 'is-selected' : ''}`} aria-pressed={interaction.multiSelect ? checked : undefined} disabled={busy} onClick={() => choose(option.label)}><span>{option.label}</span><small>{option.description}</small></button>; })}
    </div>
    {interaction.multiSelect && <button type="button" className="primary-button question-submit" disabled={busy || !selected.length} onClick={submitSelected}>{busy ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}{t('question.submit')}</button>}
    <span className="question-custom">{t('question.custom')}</span>
  </section>;
}

export default function Conversation({ task, selectedId, config, draft, onDraft, runConfig, taskRunConfig, onRunConfigChange, modelReady, inputRef, pending, onSubmit, onStop, onRetry, onApprove, onOpenFile, onShowActivity, onShowChanges, ready, providers, onManage }) {
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

  const composer = <Composer task={task} value={draft} onChange={onDraft}
    runConfig={task ? taskRunConfig : runConfig} onRunConfigChange={task ? null : onRunConfigChange}
    modelReady={modelReady} pending={pending} onSubmit={onSubmit} onStop={onStop} inputRef={inputRef}
    welcome={!selectedId} ready={ready && (!selectedId || Boolean(task))} providers={providers} onManage={onManage} />;
  if (!selectedId) return <div className="new-task-view">
    <div className="welcome-content">
      <div className="welcome-mark" aria-hidden="true"><Sparkles size={27} strokeWidth={1.35} /></div>
      <h1>{t('welcome.heading')}</h1>
      <p className="welcome-description">{t('welcome.sub')}</p>
      {composer}
      <div className="suggestion-list" aria-label={t('welcome.heading')}>
        {suggestions.map(({ Icon, titleKey, promptKey, mode }) => <button type="button" key={titleKey} className="suggestion" onClick={() => { onRunConfigChange({ ...runConfig, mode, planEnabled: mode === 'plan' }); onDraft(t(promptKey)); inputRef.current?.focus(); }}><Icon size={15} /><span>{t(titleKey)}</span><ArrowRight size={13} /></button>)}
      </div>
      <div className="welcome-workspace"><Folder size={13} /><span>{config?.workspaceName || t('sidebar.localWorkspace')}</span><span className="workspace-safety">{t('welcome.localFiles')}</span></div>
    </div>
    <div className="welcome-shortcut">{t('welcome.switch')} <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>E</kbd></div>
  </div>;

  if (!task) return <div className="conversation-loading"><LoaderCircle className="spin" size={20} /><h2>{t('conv.loading')}</h2><p>{t('conv.loadingHint')}</p></div>;

  const last = messages[messages.length - 1];
  const pendingChanges = pendingChangeCount(task);
  const retryBusy = pending.has(`retry:${task.id}`) || pending.has(`message:${task.id}`);
  const modelLabel = taskRunConfig?.modelSelection?.modelId || task.model || config?.model;
  return <div className="conversation-view">
    <div className="transcript-scroll" ref={scrollRef} onScroll={() => {
      const panel = scrollRef.current;
      if (!panel) return;
      pinned.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 90;
      setShowJump(!pinned.current);
    }} aria-label={t('conv.conversation')} tabIndex={0}>
      <div className="transcript" ref={contentRef}>
        <div className="conversation-start"><span>{t('conv.started', { date: task.createdAt ? new Date(task.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '' })}</span><span>{modelLabel}</span></div>
        {messages.length === 0 && <p className="muted transcript-empty">{t('conv.noMessages')}</p>}
        {messages.map((message, index) => <article key={message.id || `${message.role}-${index}`} className={`message message-${message.role}`} aria-label={message.role === 'user' ? t('conv.you') : t('conv.agent')}>
          <div className="message-heading">{message.role === 'assistant' && <Sparkles size={14} aria-hidden="true" />}<span>{message.role === 'user' ? t('conv.you') : t('conv.agent')}</span>{message.createdAt && <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>}{message.role === 'assistant' && message.content && <CopyButton text={message.content} label={t('conv.copyResponse')} />}</div>
          {message.role === 'user' ? <div className="user-message-content">{message.content}</div> : message.content ? <Markdown content={message.content} onOpenFile={onOpenFile} /> : <div className="message-placeholder">{active ? <><LoaderCircle size={14} className="spin" />{t('conv.thinking')}</> : t('conv.noResponse')}</div>}
        </article>)}
        <LiveActivity task={task} onShowActivity={onShowActivity} />
        <TodosCard task={task} />
        {active && task.status !== 'waiting_input' && (last?.role !== 'assistant' || last?.content) && <div className="agent-progress" role="status"><Status status={task.status} /><span>{task.status === 'waiting_approval' ? t('conv.reviewCommand') : t('conv.agentWorking')}</span></div>}
        <Approval task={task} pending={pending} onApprove={onApprove} />
        <UserQuestion task={task} draft={draft} onDraft={onDraft} pending={pending} onSubmit={onSubmit} />
        {task.error && <ErrorNotice className="task-error"><strong>{task.status === 'cancelled' ? t('conv.taskStopped') : t('conv.taskError')}</strong><p>{task.error}</p></ErrorNotice>}
        {task.status === 'error' && !task.error && <ErrorNotice>{t('conv.taskFailed')}</ErrorNotice>}
        {(task.status === 'error' || task.status === 'cancelled') && <div className="recovery-row"><p>{task.status === 'cancelled' ? t('conv.stoppedBody') : t('conv.errorBody')}</p><button type="button" className="secondary-button" onClick={() => onRetry(task.id)} disabled={retryBusy || !modelReady}>{retryBusy ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}{task.status === 'cancelled' ? t('conv.continueTask') : t('conv.retry')}</button></div>}
        {task.status === 'completed' && <div className="completion-row"><Status status="completed" />{pendingChanges > 0 && <button className="text-button" type="button" onClick={onShowChanges}>{pendingChanges === 1 ? t('conv.reviewOne') : t('conv.reviewMany', { n: pendingChanges })}<ArrowRight size={13} /></button>}</div>}
        <VerificationPanel task={task} />
        {task.status === 'waiting_approval' && !task.approval && <ErrorNotice>{t('conv.waitingNoCommand')}</ErrorNotice>}
        <div className="transcript-end" />
      </div>
    </div>
    {showJump && <button type="button" className="jump-latest" onClick={() => { pinned.current = true; setShowJump(false); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' }); }}><ArrowDown size={13} />{t('conv.jumpLatest')}</button>}
    <div className="conversation-composer">{composer}</div>
  </div>;
}
