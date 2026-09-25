import { useEffect, useRef } from 'react';
import { ArrowUp, ChevronDown, CornerDownLeft, LoaderCircle, MessageSquare, Sparkles, Square } from 'lucide-react';
import { isActive } from './api.js';

export default function Composer({ task, value, onChange, mode, onModeChange, config, pending, onSubmit, onStop, inputRef, welcome = false, ready }) {
  const composing = useRef(false);
  const active = isActive(task);
  const submitting = pending.has(task ? `message:${task.id}` : 'create');
  const stopping = task && pending.has(`stop:${task.id}`);
  const disabled = !ready || !config?.configured || active || submitting || !value.trim();
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, welcome ? 220 : 180)}px`;
  }, [value, task?.id, welcome, inputRef]);
  function submit(event) {
    event?.preventDefault();
    if (!disabled) void onSubmit();
  }
  return <div className={`composer-wrapper ${welcome ? 'welcome-composer' : ''}`}>
    <form className={`composer ${active ? 'agent-is-running' : ''}`} onSubmit={submit}>
      <textarea
        ref={inputRef}
        aria-label={task ? 'Message this agent' : 'Describe a new task'}
        placeholder={task ? active ? 'Write a follow-up while your agent works…' : 'Ask a follow-up or describe the next step…' : 'Plan, build, or ask about your code…'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={welcome ? 3 : 2}
        spellCheck={false}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
            event.preventDefault();
            if (!disabled) submit();
          }
        }}
      />
      <div className="composer-toolbar">
        <div className="composer-options">
          {!task ? <label className="mode-select" title="Agent can edit files. Ask is for questions about your workspace.">
            {mode === 'agent' ? <Sparkles size={13} /> : <MessageSquare size={13} />}
            <select aria-label="Task mode" value={mode} onChange={(event) => onModeChange(event.target.value)} disabled={submitting}><option value="agent">Agent</option><option value="ask">Ask</option></select><ChevronDown size={12} />
          </label> : <span className="composer-mode" title="Follow-ups continue this task in its original mode.">{mode === 'ask' ? <MessageSquare size={13} /> : <Sparkles size={13} />}<span>{mode === 'ask' ? 'Ask' : mode === 'agent' ? 'Agent' : 'Follow-up'}</span></span>}
          <span className="composer-divider" />
          <span className="model-label" title={`Model configured on the local server${config?.baseUrl ? ` · ${config.baseUrl}` : ''}`}>{config?.model || 'Loading model…'}</span>
        </div>
        {active ? <button type="button" className="stop-button" onClick={onStop} disabled={stopping} aria-label="Stop agent" title="Stop this agent">{stopping ? <LoaderCircle size={13} className="spin" /> : <Square size={11} fill="currentColor" />}<span>{stopping ? 'Stopping' : 'Stop'}</span></button>
          : <button type="submit" className="send-button" disabled={disabled} aria-label={task ? 'Send follow-up' : 'Start agent'} title={task ? 'Send follow-up (Enter)' : 'Start agent (Enter)'}>{submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}</button>}
      </div>
    </form>
    <div className="composer-hint"><span>{task?.status === 'waiting_approval' ? 'Allow or reject the command to continue.' : active ? 'Your draft is saved here. Send it when the agent finishes.' : welcome ? 'Works in your local workspace. Commands need approval.' : 'Changes are written to your workspace. Review them in Changes.'}</span><span className="enter-hint"><CornerDownLeft size={11} /> send <span>·</span> Shift Enter for newline</span></div>
  </div>;
}
