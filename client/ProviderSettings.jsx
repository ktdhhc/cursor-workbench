import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, KeyRound, LoaderCircle, Plus, Settings2, Trash2, X } from 'lucide-react';
import { providerReady } from './api.js';
import { useT } from './i18n.jsx';
import { IconButton, useDrawerFocus } from './ui.jsx';

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
  const enabled = (providers?.providers ?? []).filter((provider) => providerReady(provider) && provider.modelIds.length);
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
        {enabled.map((provider) => <div key={provider.id} className="model-picker-group">
          <div className="model-picker-provider">{provider.name}</div>
          {provider.modelIds.map((modelId) => {
            const active = selection?.providerId === provider.id && selection?.modelId === modelId;
            return <button type="button" key={modelId} role="option" aria-selected={active} className="model-picker-option" onClick={() => { onSelect(provider.id, modelId); setOpen(false); }}>
              <span className="model-picker-model">{modelId}</span>{active && <Check size={14} />}
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

function ProviderDetail({ provider, onAction, busy }) {
  const t = useT();
  const [apiKey, setApiKey] = useState('');
  const [newModel, setNewModel] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState('');
  async function run(modelId) {
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
  return <div className="provider-detail">
    <div className="provider-detail-head">
      <div><div className="provider-name">{provider.name}</div><div className="provider-baseurl">{provider.baseUrl || t('providers.noBaseUrl')}</div></div>
      <div className="provider-detail-actions">
        <IconButton label={t('providers.setKey')} onClick={() => { const key = window.prompt(t('providers.keyPrompt')); if (key) onAction(`/api/providers/${encodeURIComponent(provider.id)}/apiKey`, { apiKey: key }, 'PUT'); }}><KeyRound size={14} /></IconButton>
        {provider.source !== 'env' && <IconButton label={t('providers.delete')} onClick={() => { if (window.confirm(t('providers.deleteConfirm', { name: provider.name }))) onAction(`/api/providers/${encodeURIComponent(provider.id)}`, {}, 'DELETE'); }}><Trash2 size={14} /></IconButton>}
      </div>
    </div>
    <div className="provider-key-state"><span className={provider.apiKeyConfigured ? 'provider-key-ok' : 'provider-key-missing'}>{provider.apiKeyConfigured ? t('providers.keyConfigured') : t('providers.keyMissing')}</span>
      {provider.apiKeyManagementUrl && <a href={provider.apiKeyManagementUrl} target="_blank" rel="noopener noreferrer">{t('providers.getKey')}</a>}
    </div>
    <div className="provider-models">
      {provider.modelIds.map((modelId) => <div className="provider-model" key={modelId}>
        <span className="provider-model-id">{modelId}</span>
        <span className="provider-model-actions">
          <button type="button" className="text-button" disabled={testing === modelId} onClick={() => run(modelId)}>{testing === modelId ? <LoaderCircle size={12} className="spin" /> : t('providers.test')}</button>
          {provider.source !== 'builtin' && <IconButton label={t('providers.deleteModel')} onClick={() => onAction(`/api/providers/${encodeURIComponent(provider.id)}/models/${encodeURIComponent(modelId)}`, {}, 'DELETE')}><X size={12} /></IconButton>}
        </span>
        {testResult?.modelId === modelId && <span className={`provider-test ${testResult.success ? 'is-ok' : 'is-fail'}`}>{testResult.success ? t('providers.testOk') : `${t('providers.testFail')}: ${testResult.error?.message}`}</span>}
      </div>)}
    </div>
    {provider.source !== 'builtin' && <form className="provider-add-model" onSubmit={(event) => {
      event.preventDefault();
      if (newModel.trim()) { onAction(`/api/providers/${encodeURIComponent(provider.id)}/models`, { modelId: newModel.trim() }); setNewModel(''); }
    }}>
      <input value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder={t('providers.newModelPlaceholder')} autoComplete="off" />
      <button type="submit" className="small-button"><Plus size={12} />{t('providers.addModel')}</button>
    </form>}
  </div>;
}

export default function ProviderSettings({ open, onClose, providers, refresh, busy }) {
  const t = useT();
  const ref = useRef(null);
  useDrawerFocus(ref, open, onClose);
  const [mode, setMode] = useState(null); // null = list, 'add' = form
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { if (!open) { setMode(null); setSelectedId(null); } }, [open]);
  if (!open) return null;
  const list = providers?.providers ?? [];
  const selected = list.find((item) => item.id === selectedId) ?? null;
  async function action(route, body, method = 'POST') {
    try {
      const { request } = await import('./api.js');
      const next = await request(route, { body, method });
      refresh(next);
      return true;
    } catch { return false; }
  }
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
            {list.map((provider) => <button type="button" key={provider.id} className={`provider-item ${selectedId === provider.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(provider.id)}>
              <span className="provider-item-name">{provider.name}</span>
              <span className="provider-item-meta">{provider.modelIds.length} {provider.source === 'builtin' ? t('providers.builtinBadge') : t('providers.customBadge')}</span>
            </button>)}
            <button type="button" className="new-agent-button" onClick={() => setMode('add')}><Plus size={15} /><span>{t('providers.add')}</span></button>
          </>}
        </div>
        {mode !== 'add' && (selected
          ? <ProviderDetail provider={selected} onAction={action} />
          : <div className="panel-empty"><Settings2 size={24} strokeWidth={1.4} /><h3>{t('providers.pickTitle')}</h3><p>{t('providers.detailHint')}</p></div>)}
      </div>
      <div className="artifacts-footer"><span>{busy ? t('providers.saving') : t('providers.keySecurityNote')}</span></div>
    </aside>
  </>;
}
