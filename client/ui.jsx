import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Circle, Clock3, Copy, LoaderCircle, Square, X } from 'lucide-react';
import { useT } from './i18n.jsx';

export const STATUS = {
  running: { label: 'status.working', Icon: LoaderCircle, className: 'running' },
  waiting_approval: { label: 'status.waiting_approval', Icon: Clock3, className: 'waiting' },
  completed: { label: 'status.completed', Icon: CheckCircle2, className: 'completed' },
  error: { label: 'status.error', Icon: AlertCircle, className: 'error' },
  cancelled: { label: 'status.cancelled', Icon: Square, className: 'cancelled' },
};

export function Status({ status, iconOnly = false, className = '' }) {
  const t = useT();
  const item = STATUS[status] || { label: status || 'status.working', Icon: Circle, className: '' };
  return <span className={`task-status status-${item.className} ${className}`} title={t(item.label)}>
    <item.Icon size={14} aria-hidden="true" className={status === 'running' ? 'spin' : undefined} />
    {iconOnly ? <span className="sr-only">{t(item.label)}</span> : <span>{t(item.label)}</span>}
  </span>;
}

export function IconButton({ label, children, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}

export function ErrorNotice({ children, onDismiss, action, className = '' }) {
  const t = useT();
  return <div className={`error-notice ${className}`} role="alert">
    <AlertCircle size={16} aria-hidden="true" />
    <div className="notice-content">{children}</div>
    {action}
    {onDismiss && <IconButton label={t('app.dismissError')} onClick={onDismiss}><X size={15} /></IconButton>}
  </div>;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [query]);
  return matches;
}

export function useDrawerFocus(ref, active, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!active || !ref.current) return;
    const panel = ref.current;
    const previous = document.activeElement;
    const selector = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]';
    const focusables = () => Array.from(panel.querySelectorAll(selector)).filter((item) => item.getClientRects().length);
    (focusables()[0] || panel).focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { event.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [active, ref]);
}

export function formatTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

export function timeAgo(value, now = Date.now(), t = (key, vars) => key) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  if (minutes < 1440) return t('time.hoursAgo', { n: Math.floor(minutes / 60) });
  if (minutes < 10080) return t('time.daysAgo', { n: Math.floor(minutes / 1440) });
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDetail(value) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function CopyButton({ text, label, copyLabel }) {
  const t = useT();
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error(t('errors.clipboard'));
      await navigator.clipboard.writeText(text);
      setState('copied');
      setError('');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState('idle'), 1800);
    } catch (failure) {
      setError(failure.message || t('errors.copyFailed'));
    }
  }
  const idleLabel = label || t('conv.copy');
  return <span className="copy-control">
    <button type="button" className="text-button copy-button" onClick={copy} aria-label={state === 'copied' ? t('conv.copied') : idleLabel}>
      {state === 'copied' ? <Check size={13} /> : <Copy size={13} />}
      <span>{state === 'copied' ? t('conv.copied') : idleLabel}</span>
    </button>
    {error && <span className="copy-error" role="alert">{error}</span>}
  </span>;
}
