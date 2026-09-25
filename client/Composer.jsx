import { useEffect, useRef } from 'react';
import { ArrowUp, ChevronDown, CornerDownLeft, LoaderCircle, MessageSquare, Sparkles, Square } from 'lucide-react';
import { isActive } from './api.js';
import { useT } from './i18n.jsx';
import { ModelPicker } from './ProviderSettings.jsx';

export default function Composer({ task, value, onChange, mode, onModeChange, config, pending, onSubmit, onStop, inputRef, welcome = false, ready, providers, onManage, onSelectModel }) {
  const t = useT();
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
        aria-label={task ? t('composer.messageAgent') : t('composer.describeNew')}
        placeholder={task ? active ? t('composer.followupActive') : t('composer.followup') : t('composer.planNew')}
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
          {!task ? <label className="mode-select" title={t('composer.modeHint')}>
            {mode === 'agent' ? <Sparkles size={13} /> : <MessageSquare size={13} />}
            <select aria-label={t('composer.taskMode')} value={mode} onChange={(event) => onModeChange(event.target.value)} disabled={submitting}><option value="agent">{t('composer.modeAgent')}</option><option value="ask">{t('composer.modeAsk')}</option></select><ChevronDown size={12} />
          </label> : <span className="composer-mode" title={t('composer.followupHint')}>{mode === 'ask' ? <MessageSquare size={13} /> : <Sparkles size={13} />}<span>{mode === 'ask' ? t('composer.modeAsk') : mode === 'agent' ? t('composer.modeAgent') : t('composer.modeFollowup')}</span></span>}
          <span className="composer-divider" />
          {providers ? <ModelPicker providers={providers} onManage={onManage} onSelect={onSelectModel} /> : <span className="model-label">{t('composer.modelLoading')}</span>}
        </div>
        {active ? <button type="button" className="stop-button" onClick={onStop} disabled={stopping} aria-label={t('composer.stopAgent')} title={t('composer.stopThis')}>{stopping ? <LoaderCircle size={13} className="spin" /> : <Square size={11} fill="currentColor" />}<span>{stopping ? t('composer.stopping') : t('composer.stop')}</span></button>
          : <button type="submit" className="send-button" disabled={disabled} aria-label={task ? t('composer.sendFollowup') : t('composer.startAgent')} title={task ? t('composer.followupHintKey') : t('composer.startHint')}>{submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}</button>}
      </div>
    </form>
    <div className="composer-hint"><span>{task?.status === 'waiting_approval' ? t('composer.hintApproval') : active ? t('composer.hintDraft') : welcome ? t('composer.hintWelcome') : t('composer.hintChanges')}</span><span className="enter-hint"><CornerDownLeft size={11} /> {t('composer.send')} <span>·</span> {t('composer.newline')}</span></div>
  </div>;
}
