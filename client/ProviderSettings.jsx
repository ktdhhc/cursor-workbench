import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, LoaderCircle, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react';
import { enabledModelIds, formatContextWindow, modelEntry, providerReady } from './api.js';
import { useT } from './i18n.jsx';
import { IconButton, useDrawerFocus } from './ui.jsx';

/** Small pill badge for model metadata (context window, vision, …). */
function ModelBadges({ entry, showOff = false }) {
  const t = useT();
  const context = formatContextWindow(entry?.contextWindow);
  const vision = entry?.input?.image === true;
  const off = showOff && entry?.enabled === false;
  if (!context && !vision && !off) return null;
  return <span className="provider-model-badges">
    {context && <span className="provider-model-badge" title={t('providers.modelContext')}>{context}</span>}
    {vision && <span className="provider-model-badge">{t('providers.modelBadgeVision')}</span>}
    {off && <span className="provider-model-badge is-off">{t('providers.modelBadgeOff')}</span>}
  </span>;
}

/** Compact on/off switch used for providers and individual models. */
function Toggle({ checked, disabled, onChange, label }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
    className={`provider-model-toggle ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)}>
    <span className="provider-model-toggle-thumb" />
  </button>;
}

export function ModelPicker({ providers, onManage, onSelect, selection: selectionProp }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDrawerFocus(ref, open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);
  const selection = selectionProp ?? providers?.defaultModelSelection ?? null;
  const enabled = (providers?.providers ?? [])
    .map((provider) => ({ provider, modelIds: enabledModelIds(provider) }))
    .filter(({ provider, modelIds }) => providerReady(provider) && modelIds.length);
  const activeProvider = selection?.providerId ? (providers?.providers ?? []).find((provider) => provider.id === selection.providerId) : null;
  const activeLabel = selection?.modelId ? (activeProvider ? `${selection.modelId} · ${activeProvider.name}` : selection.modelId) : t('composer.modelLoading');
  return <div className="model-picker" ref={ref}>
    <button type="button" className="model-label model-picker-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="listbox" title={t('providers.pickTitle')}>
      <span>{activeLabel}</span><ChevronDown size={12} />
    </button>
    {open && <>
      <button className="drawer-backdrop model-picker-backdrop" tabIndex={-1} onClick={() => setOpen(false)} aria-label={t('providers.close')} />
      <div className="model-picker-menu" role="listbox" aria-label={t('providers.title')}>
        {enabled.length === 0 && <div className="model-picker-empty">{t('providers.noneEnabled')}</div>}
        {enabled.map(({ provider, modelIds }) => <div key={provider.id} className="model-picker-group">
          <div className="model-picker-provider">{provider.name}</div>
          {modelIds.map((modelId) => {
            const active = selection?.providerId === provider.id && selection?.modelId === modelId;
            const entry = modelEntry(providers, provider.id, modelId);
            return <button type="button" key={modelId} role="option" aria-selected={active} className="model-picker-option" onClick={() => { onSelect(provider.id, modelId); setOpen(false); }}>
              <span className="model-picker-model">{modelId}</span>
              <ModelBadges entry={entry} />
              {active && <Check size={14} />}
            </button>;
          })}
        </div>)}
        <button type="button" className="model-picker-manage" onClick={() => { setOpen(false); onManage(); }}><Settings2 size={13} />{t('providers.manage')}</button>
      </div>
    </>}
  </div>;
}

function AddProviderForm({ providers, onDone }) {
  const t = useT();
  const templates = providers?.templates ?? [];
  const [templateId, setTemplateId] = useState('openai-compatible');
  const template = templates.find((item) => item.templateId === templateId);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = templateId === 'openai-compatible' || !template;
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const { request } = await import('./api.js');
      await request('/api/providers', { body: { templateId: chosen ? null : templateId, name, baseUrl: chosen ? baseUrl : undefined, apiKey, modelIds: models.split(',').map((item) => item.trim()).filter(Boolean) } });
      onDone(true);
    } catch (failure) {
      setError(failure.errorKey ? t(failure.errorKey) : failure.message);
    } finally {
      setBusy(false);
    }
  }
  return <form className="provider-form" onSubmit={(event) => { event.preventDefault(); if (!busy) void submit(); }}>
    <label className="provider-field"><span>{t('providers.template')}</span>
      <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
        {templates.map((item) => <option key={item.templateId} value={item.templateId}>{item.name}</option>)}
      </select>
    </label>
    <label className="provider-field"><span>{t('providers.name')}</span>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={chosen ? t('providers.namePlaceholder') : template?.name} autoComplete="off" />
    </label>
    {chosen && <label className="provider-field"><span>Base URL</span>
      <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" required />
    </label>}
    <label className="provider-field"><span>API Key</span>
      <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('providers.keyPlaceholder')} autoComplete="new-password" />
    </label>
    <label className="provider-field"><span>{t('providers.modelIds')}</span>
      <input value={models} onChange={(event) => setModels(event.target.value)} placeholder={chosen ? 'model-a, model-b' : template?.builtinModelIds?.[0] || 'model-id'} autoComplete="off" />
      <small>{t('providers.modelIdsHint')}</small>
    </label>
    {error && <div className="provider-error" role="alert">{error}</div>}
    <div className="provider-form-actions">
      <button type="button" className="small-button" onClick={() => onDone(false)}><X size={12} />{t('artifacts.cancel')}</button>
      <button type="submit" className="small-button accept-button" disabled={busy}>{busy ? <LoaderCircle size={12} className="spin" /> : <Plus size={12} />}{t('providers.create')}</button>
    </div>
  </form>;
}

/** Base URL row: read-only text with an inline edit mode that saves via PATCH. */
function BaseUrlRow({ provider, run, busy }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(provider.baseUrl || '');
  useEffect(() => { setEditing(false); setValue(provider.baseUrl || ''); }, [provider.id, provider.baseUrl]);
  async function save() {
    const ok = await run(`/api/providers/${encodeURIComponent(provider.id)}`, { baseUrl: value.trim() }, 'PATCH');
    if (ok) setEditing(false);
  }
  if (!editing) {
    return <div className="provider-model-inline">
      <span className="provider-baseurl">{provider.baseUrl || t('providers.noBaseUrl')}</span>
      <IconButton label={t('providers.baseUrlEdit')} onClick={() => { setValue(provider.baseUrl || ''); setEditing(true); }}><Pencil size={12} /></IconButton>
    </div>;
  }
  return <form className="provider-model-inline is-editing" onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
    <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" autoFocus />
    <IconButton label={t('providers.baseUrlSave')} disabled={busy} className="is-confirm" onClick={() => { if (!busy) void save(); }}><Check size={13} /></IconButton>
    <IconButton label={t('providers.baseUrlCancel')} disabled={busy} onClick={() => { setEditing(false); setValue(provider.baseUrl || ''); }}><X size={13} /></IconButton>
  </form>;
}

/** API key status row plus an inline password input with visibility toggle and save. */
function ApiKeyRow({ provider, run }) {
  const t = useT();
  const [apiKey, setApiKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setApiKey(''); setVisible(false); }, [provider.id]);
  async function save() {
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    const ok = await run(`/api/providers/${encodeURIComponent(provider.id)}/apiKey`, { apiKey: apiKey.trim() }, 'PUT');
    setBusy(false);
    if (ok) { setApiKey(''); setVisible(false); }
  }
  return <>
    <div className="provider-key-state"><span className={provider.apiKeyConfigured ? 'provider-key-ok' : 'provider-key-missing'}>{provider.apiKeyConfigured ? t('providers.keyConfigured') : t('providers.keyMissing')}</span>
      {provider.apiKeyManagementUrl && <a href={provider.apiKeyManagementUrl} target="_blank" rel="noopener noreferrer">{t('providers.getKey')}</a>}
    </div>
    <form className="provider-model-inline provider-model-key" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <input type={visible ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={t('providers.keyPlaceholder')} autoComplete="new-password" />
      <IconButton label={visible ? t('providers.apiKeyHide') : t('providers.apiKeyShow')} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={13} /> : <Eye size={13} />}</IconButton>
      <button type="submit" className="small-button" disabled={busy || !apiKey.trim()}>{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}{t('providers.apiKeySave')}</button>
    </form>
  </>;
}

/** Modal dialog for editing a single model's metadata. */
function ModelEditDialog({ provider, modelId, entry, run, onClose }) {
  const t = useT();
  const ref = useRef(null);
  useDrawerFocus(ref, true, onClose);
  const numberValue = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
  const [contextWindow, setContextWindow] = useState(numberValue(entry?.contextWindow));
  const [maxOutput, setMaxOutput] = useState(numberValue(entry?.maxOutputTokens));
  const [input, setInput] = useState({
    image: entry?.input?.image === true,
    video: entry?.input?.video === true,
    pdf: entry?.input?.pdf === true,
  });
  const [capabilities, setCapabilities] = useState({
    structuredOutput: entry?.capabilities?.structuredOutput === true,
    nativeWebSearch: entry?.capabilities?.nativeWebSearch === true,
    midConversationSystem: entry?.capabilities?.midConversationSystem === true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parseTokens = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
  };
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    const message = await run(`/api/providers/${encodeURIComponent(provider.id)}/models/${encodeURIComponent(modelId)}`, {
      contextWindow: parseTokens(contextWindow),
      maxOutputTokens: parseTokens(maxOutput),
      input: { text: true, ...input },
      capabilities,
    }, 'PATCH');
    setBusy(false);
    if (message === null) onClose();
    else setError(message);
  }
  const inputTypes = [['image', 'providers.modelInputImage'], ['video', 'providers.modelInputVideo'], ['pdf', 'providers.modelInputPdf']];
  const capabilityTypes = [['structuredOutput', 'providers.modelCapStructured'], ['nativeWebSearch', 'providers.modelCapWebSearch'], ['midConversationSystem', 'providers.modelCapMidSystem']];
  return <>
    <button className="drawer-backdrop provider-model-modal-backdrop" tabIndex={-1} aria-label={t('artifacts.cancel')} onClick={() => { if (!busy) onClose(); }} />
    <div className="provider-model-modal" role="dialog" aria-modal="true" aria-label={t('providers.modelEditTitle')} ref={ref} tabIndex={-1}>
      <div className="artifacts-header">
        <div className="provider-settings-title"><Settings2 size={14} /><span>{t('providers.modelEditTitle')}</span></div>
        <IconButton label={t('artifacts.close')} onClick={onClose} disabled={busy}><X size={15} /></IconButton>
      </div>
      <form className="provider-form provider-model-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="provider-field"><span>{t('providers.modelIds')}</span>
          <span className="provider-model-readonly">{modelId}</span>
        </div>
        <label className="provider-field"><span>{t('providers.modelContext')}</span>
          <input type="number" min="0" step="1" value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} placeholder="128000" autoComplete="off" />
          <small>{t('providers.modelContextHint')}</small>
        </label>
        <label className="provider-field"><span>{t('providers.modelMaxOutput')}</span>
          <input type="number" min="0" step="1" value={maxOutput} onChange={(event) => setMaxOutput(event.target.value)} placeholder="8192" autoComplete="off" />
          <small>{t('providers.modelMaxOutputHint')}</small>
        </label>
        <details className="provider-model-advanced">
          <summary>{t('providers.modelAdvanced')}</summary>
          <div className="provider-model-advanced-body">
            <div className="provider-field"><span>{t('providers.modelInputTypes')}</span>
              <div className="provider-model-checks">
                <label className="provider-model-check is-locked"><input type="checkbox" checked disabled />{t('providers.modelInputText')}</label>
                {inputTypes.map(([key, labelKey]) => <label key={key} className="provider-model-check">
                  <input type="checkbox" checked={input[key]} onChange={(event) => setInput((value) => ({ ...value, [key]: event.target.checked }))} />{t(labelKey)}
                </label>)}
              </div>
            </div>
            <div className="provider-field"><span>{t('providers.modelCapabilities')}</span>
              <div className="provider-model-checks">
                {capabilityTypes.map(([key, labelKey]) => <label key={key} className="provider-model-check">
                  <input type="checkbox" checked={capabilities[key]} onChange={(event) => setCapabilities((value) => ({ ...value, [key]: event.target.checked }))} />{t(labelKey)}
                </label>)}
              </div>
            </div>
          </div>
        </details>
        {error && <div className="provider-error" role="alert">{error}</div>}
        <div className="provider-form-actions">
          <button type="button" className="small-button" onClick={onClose} disabled={busy}><X size={12} />{t('artifacts.cancel')}</button>
          <button type="submit" className="small-button accept-button" disabled={busy}>{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}{t('providers.modelSave')}</button>
        </div>
      </form>
    </div>
  </>;
}

function ProviderDetail({ provider, providers, onAction, onEditModel }) {
  const t = useT();
  const [newModel, setNewModel] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  useEffect(() => { setError(''); setTestResult(null); setNewModel(''); }, [provider.id]);
  async function run(route, body, method = 'POST', raw = false) {
    setError('');
    const message = await onAction(route, body, method);
    if (message) setError(message);
    return raw ? message : !message;
  }
  async function guarded(key, fn) {
    if (pending) return;
    setPending(key);
    try { await fn(); } finally { setPending(''); }
  }
  async function test(modelId) {
    setTesting(modelId);
    setTestResult(null);
    try {
      const { request } = await import('./api.js');
      const result = await request(`/api/providers/${encodeURIComponent(provider.id)}/test`, { body: { modelId } });
      setTestResult({ modelId, ...result });
    } catch (failure) {
      setTestResult({ modelId, success: false, error: { message: failure.errorKey ? t(failure.errorKey) : failure.message } });
    } finally {
      setTesting('');
    }
  }
  const apiFormat = provider.apiFormat === 'openai-responses' ? 'openai-responses' : 'openai-chat-completions';
  const providerDisabled = provider.enabled === false;
  return <div className="provider-detail">
    <div className="provider-detail-head">
      <div className="provider-detail-title">
        <div className="provider-name">{provider.name}</div>
        <Toggle checked={!providerDisabled} disabled={Boolean(pending)} label={providerDisabled ? t('providers.enableProvider') : t('providers.disableProvider')}
          onChange={(enabled) => guarded('provider', () => run(`/api/providers/${encodeURIComponent(provider.id)}`, { enabled }, 'PATCH'))} />
      </div>
      <div className="provider-detail-actions">
        {provider.source !== 'env' && <IconButton label={t('providers.delete')} onClick={() => { if (window.confirm(t('providers.deleteConfirm', { name: provider.name }))) run(`/api/providers/${encodeURIComponent(provider.id)}`, {}, 'DELETE'); }}><Trash2 size={14} /></IconButton>}
      </div>
    </div>
    <BaseUrlRow provider={provider} run={run} busy={Boolean(pending)} />
    <label className="provider-model-format"><span>{t('providers.apiFormat')}</span>
      <select value={apiFormat} disabled={Boolean(pending)}
        onChange={(event) => guarded('format', () => run(`/api/providers/${encodeURIComponent(provider.id)}`, { apiFormat: event.target.value }, 'PATCH'))}>
        <option value="openai-chat-completions">{t('providers.apiFormatChat')}</option>
        <option value="openai-responses">{t('providers.apiFormatResponses')}</option>
      </select>
    </label>
    <ApiKeyRow provider={provider} run={run} />
    {error && <div className="provider-error" role="alert">{error}</div>}
    <div className="provider-models">
      {provider.modelIds.map((modelId) => {
        const entry = modelEntry(providers, provider.id, modelId);
        const modelOff = entry?.enabled === false;
        return <div className={`provider-model ${modelOff ? 'is-off' : ''}`} key={modelId}>
          <span className="provider-model-id">{modelId}</span>
          <ModelBadges entry={entry} showOff />
          <span className="provider-model-actions">
            <Toggle checked={!modelOff} disabled={Boolean(pending)} label={modelOff ? t('providers.modelEnable') : t('providers.modelDisable')}
              onChange={(enabled) => guarded(`model:${modelId}`, () => run(`/api/providers/${encodeURIComponent(provider.id)}/models/${encodeURIComponent(modelId)}`, { enabled }, 'PATCH'))} />
            <IconButton label={t('providers.modelEdit')} disabled={Boolean(pending)} onClick={() => onEditModel(modelId)}><Pencil size={12} /></IconButton>
            <button type="button" className="text-button" disabled={testing === modelId} onClick={() => test(modelId)}>{testing === modelId ? <LoaderCircle size={12} className="spin" /> : t('providers.test')}</button>
            {provider.source !== 'builtin' && <IconButton label={t('providers.deleteModel')} onClick={() => run(`/api/providers/${encodeURIComponent(provider.id)}/models/${encodeURIComponent(modelId)}`, {}, 'DELETE')}><X size={12} /></IconButton>}
          </span>
          {testResult?.modelId === modelId && <span className={`provider-test ${testResult.success ? 'is-ok' : 'is-fail'}`}>{testResult.success ? t('providers.testOk') : `${t('providers.testFail')}: ${testResult.error?.message}`}</span>}
        </div>;
      })}
    </div>
    {provider.source !== 'builtin' && <form className="provider-add-model" onSubmit={(event) => {
      event.preventDefault();
      if (newModel.trim()) { run(`/api/providers/${encodeURIComponent(provider.id)}/models`, { modelId: newModel.trim() }); setNewModel(''); }
    }}>
      <input value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder={t('providers.newModelPlaceholder')} autoComplete="off" />
      <button type="submit" className="small-button"><Plus size={12} />{t('providers.addModel')}</button>
    </form>}
  </div>;
}

export default function ProviderSettings({ open, onClose, providers, refresh, busy }) {
  const t = useT();
  const ref = useRef(null);
  const [mode, setMode] = useState(null); // null = list, 'add' = form
  const [selectedId, setSelectedId] = useState(null);
  const [editingModel, setEditingModel] = useState(null); // { provider, modelId }
  useDrawerFocus(ref, open, () => { if (editingModel) { setEditingModel(null); return; } onClose(); });
  useEffect(() => { if (!open) { setMode(null); setSelectedId(null); setEditingModel(null); } }, [open]);
  if (!open) return null;
  const list = providers?.providers ?? [];
  const selected = list.find((item) => item.id === selectedId) ?? null;
  async function action(route, body, method = 'POST') {
    try {
      const { request } = await import('./api.js');
      const next = await request(route, { body, method });
      refresh(next);
      return null;
    } catch (failure) {
      return failure.errorKey ? t(failure.errorKey) : (failure.message || t('providers.saveFailed'));
    }
  }
  const editingProvider = editingModel ? list.find((item) => item.id === editingModel.providerId) : null;
  return <>
    <button className="drawer-backdrop" aria-label={t('providers.close')} onClick={onClose} tabIndex={-1} />
    <aside className="provider-settings" ref={ref} role="dialog" aria-modal="true" aria-label={t('providers.title')} tabIndex={-1}>
      <div className="artifacts-header">
        <div className="provider-settings-title"><Settings2 size={15} /><span>{t('providers.title')}</span></div>
        <IconButton label={t('artifacts.close')} onClick={onClose}><X size={16} /></IconButton>
      </div>
      <div className="provider-settings-body">
        <div className="provider-list">
          {mode === 'add' ? <AddProviderForm providers={providers} onDone={(created) => { setMode(null); if (created) refresh(); }} /> : <>
            {list.map((provider) => <button type="button" key={provider.id} className={`provider-item ${selectedId === provider.id ? 'is-selected' : ''} ${provider.enabled === false ? 'is-off' : ''}`} onClick={() => setSelectedId(provider.id)}>
              <span className="provider-item-name">{provider.name}</span>
              <span className="provider-item-meta">{provider.modelIds.length} {provider.source === 'builtin' ? t('providers.builtinBadge') : t('providers.customBadge')}</span>
            </button>)}
            <button type="button" className="new-agent-button" onClick={() => setMode('add')}><Plus size={15} /><span>{t('providers.add')}</span></button>
          </>}
        </div>
        {mode !== 'add' && (selected
          ? <ProviderDetail provider={selected} providers={providers} onAction={action} onEditModel={(modelId) => setEditingModel({ providerId: selected.id, modelId })} />
          : <div className="panel-empty"><Settings2 size={24} strokeWidth={1.4} /><h3>{t('providers.pickTitle')}</h3><p>{t('providers.detailHint')}</p></div>)}
      </div>
      <div className="artifacts-footer"><span>{busy ? t('providers.saving') : t('providers.keySecurityNote')}</span></div>
      {editingModel && editingProvider && <ModelEditDialog
        provider={editingProvider} modelId={editingModel.modelId}
        entry={modelEntry(providers, editingProvider.id, editingModel.modelId)}
        run={action} onClose={() => setEditingModel(null)} />}
    </aside>
  </>;
}
