import { useEffect, useRef } from 'react';
import { ArrowUp, Brain, Bug, Check, CornerDownLeft, FilePenLine, ListChecks, LoaderCircle, Lock, MessageSquare, ShieldCheck, Sparkles, Square, Zap } from 'lucide-react';
import { isActive, isReadOnlyMode, MODES, PERMISSIONS, reasoningLabelKey, reasoningLevelsFor, sanitizeRunConfig } from './api.js';
import { useT } from './i18n.jsx';
import { ModelPicker } from './ProviderSettings.jsx';
import { Menu } from './ui.jsx';

const MODE_ICONS = { agent: Sparkles, ask: MessageSquare, plan: ListChecks, debug: Bug };
const PERMISSION_ICONS = { build: ShieldCheck, edit: FilePenLine, yolo: Zap };

function ConfigMenu({ t, icon, label, title, heading, options, current, onPick, note }) {
  return <Menu icon={icon} label={label} title={title}>
    {(close) => <>
      <div className="menu-heading">{heading}</div>
      {options.map((option) => <button type="button" role="menuitemradio" aria-checked={option.value === current} key={option.value}
        className={`menu-option ${option.value === current ? 'is-active' : ''}`}
        onClick={() => { onPick(option.value); close(); }}>
        <span className="menu-option-title"><span>{t(`run.${option.kind}.${option.value}`)}</span>{option.value === current && <Check size={13} />}</span>
        <span className="menu-option-desc">{t(`run.${option.kind}.${option.value}.desc`)}</span>
      </button>)}
      {note && <div className="menu-note"><Lock size={11} />{note}</div>}
    </>}
  </Menu>;
}

function ReasoningMenu({ t, runConfig, providers, update }) {
  const selection = runConfig.modelSelection;
  const levels = reasoningLevelsFor(providers, selection?.providerId, selection?.modelId);
  const current = selection?.options?.reasoningLevel || 'default';
  const options = ['default', ...levels];
  return <Menu icon={<Brain size={13} />} label={`${t('run.reasoning')} · ${t(reasoningLabelKey(current))}`} title={t('composer.reasoning')}>
    {(close) => <>
      <div className="menu-heading">{t('composer.reasoning')}</div>
      {options.map((level) => <button type="button" role="menuitemradio" aria-checked={level === current} key={level}
        className={`menu-option ${level === current ? 'is-active' : ''}`}
        onClick={() => {
          update({ modelSelection: { ...selection, options: level === 'default' ? {} : { reasoningLevel: level } } });
          close();
        }}>
        <span className="menu-option-title"><span>{t(reasoningLabelKey(level))}</span>{level === current && <Check size={13} />}</span>
      </button>)}
    </>}
  </Menu>;
}

/** Read-only chips summarizing the configuration an existing task was created with. */
function FrozenRunConfig({ runConfig }) {
  const t = useT();
  const ModeIcon = MODE_ICONS[runConfig.mode] || Sparkles;
  const PermissionIcon = PERMISSION_ICONS[runConfig.permissionMode] || ShieldCheck;
  const readOnly = isReadOnlyMode(runConfig.mode);
  const reasoning = runConfig.modelSelection?.options?.reasoningLevel;
  return <div className="composer-options composer-frozen" title={t('run.frozen')}>
    <span className="run-chip"><ModeIcon size={11} />{t(`run.mode.${runConfig.mode}`)}</span>
    <span className="run-chip" title={readOnly ? t('run.perm.readonly') : t(`run.perm.${runConfig.permissionMode}.desc`)}>
      {readOnly ? <Lock size={10} /> : <PermissionIcon size={11} />}{t(`run.perm.${runConfig.permissionMode}`)}
    </span>
    {runConfig.modelSelection?.modelId && <span className="run-chip">{runConfig.modelSelection.modelId}</span>}
    {reasoning && <span className="run-chip"><Brain size={10} />{t(reasoningLabelKey(reasoning))}</span>}
  </div>;
}

/** Interactive config bar for a new task: mode preset, permission level, model, reasoning. */
function RunConfigBar({ runConfig, onRunConfigChange, providers, onManage, disabled }) {
  const t = useT();
  const readOnly = isReadOnlyMode(runConfig.mode);
  const ModeIcon = MODE_ICONS[runConfig.mode] || Sparkles;
  const PermissionIcon = PERMISSION_ICONS[runConfig.permissionMode] || ShieldCheck;
  const update = (patch) => onRunConfigChange(sanitizeRunConfig({ ...runConfig, ...patch }, providers));
  return <div className="composer-options">
    <ConfigMenu t={t} icon={<ModeIcon size={13} />} label={t(`run.mode.${runConfig.mode}`)} title={t('composer.taskMode')}
      heading={t('composer.taskMode')} options={MODES.map((value) => ({ kind: 'mode', value }))} current={runConfig.mode}
      onPick={(mode) => update({ mode, planEnabled: mode === 'plan' })} />
    <ConfigMenu t={t} icon={readOnly ? <Lock size={12} /> : <PermissionIcon size={13} />} label={t(`run.perm.${runConfig.permissionMode}`)} title={t('composer.permission')}
      heading={t('composer.permission')} options={PERMISSIONS.map((value) => ({ kind: 'perm', value }))} current={runConfig.permissionMode}
      onPick={(permissionMode) => update({ permissionMode })}
      note={readOnly ? t('run.perm.readonly') : null} />
    <span className="composer-divider" />
    {providers
      ? <ModelPicker providers={providers} selection={runConfig.modelSelection} onManage={onManage}
          onSelect={(providerId, modelId) => update({ modelSelection: { providerId, modelId, options: {} } })} />
      : <span className="model-label">{t('composer.modelLoading')}</span>}
    <ReasoningMenu t={t} runConfig={runConfig} providers={providers} update={update} />
  </div>;
}

export default function Composer({ task, value, onChange, runConfig, onRunConfigChange, modelReady = true, pending, onSubmit, onStop, inputRef, welcome = false, ready, providers, onManage }) {
  const t = useT();
  const composing = useRef(false);
  const active = isActive(task);
  const answering = task?.status === 'waiting_input';
  const submitting = pending.has(task ? `message:${task.id}` : 'create');
  const stopping = task && pending.has(`stop:${task.id}`);
  const disabled = !ready || !modelReady || (active && !answering) || submitting || !value.trim();
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
  const hint = task?.status === 'waiting_input' ? t('composer.hintAnswer')
    : task?.status === 'waiting_approval' ? t('composer.hintApproval')
    : active ? t('composer.hintDraft')
      : welcome ? (isReadOnlyMode(runConfig?.mode) ? t('composer.hintReadonly') : t('composer.hintWelcome'))
        : t('composer.hintChanges');
  const placeholder = task
    ? (task.status === 'waiting_input' ? t('composer.answerPlaceholder') : active ? t('composer.followupActive') : t('composer.followup'))
    : t('composer.planNew');
  return <div className={`composer-wrapper ${welcome ? 'welcome-composer' : ''}`}>
    <form className={`composer ${active && !answering ? 'agent-is-running' : ''}`} onSubmit={submit}>
      <textarea
        ref={inputRef}
        aria-label={task ? t('composer.messageAgent') : t('composer.describeNew')}
        placeholder={placeholder}
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
        {runConfig && (task || !onRunConfigChange
          ? <FrozenRunConfig runConfig={runConfig} />
          : <RunConfigBar runConfig={runConfig} onRunConfigChange={onRunConfigChange} providers={providers} onManage={onManage} disabled={submitting} />)}
        {active && !answering ? <button type="button" className="stop-button" onClick={onStop} disabled={stopping} aria-label={t('composer.stopAgent')} title={t('composer.stopThis')}>{stopping ? <LoaderCircle size={13} className="spin" /> : <Square size={11} fill="currentColor" />}<span>{stopping ? t('composer.stopping') : t('composer.stop')}</span></button>
          : <button type="submit" className="send-button" disabled={disabled} aria-label={answering ? t('composer.sendAnswer') : task ? t('composer.sendFollowup') : t('composer.startAgent')} title={answering ? t('composer.sendAnswer') : task ? t('composer.followupHintKey') : t('composer.startHint')}>{submitting ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={17} />}</button>}
      </div>
    </form>
    <div className="composer-hint"><span>{hint}</span><span className="enter-hint"><CornerDownLeft size={11} /> {t('composer.send')} <span>·</span> {t('composer.newline')}</span></div>
  </div>;
}
