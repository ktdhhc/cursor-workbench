import { useMemo, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Check, ChevronRight, FileCode2, FileDiff, LoaderCircle, PanelRightClose, RotateCcw, X } from 'lucide-react';
import { ActivityItem } from './Activity.jsx';
import { compactDiff, diffLines } from './diff.js';
import { useT } from './i18n.jsx';
import { IconButton, useDrawerFocus } from './ui.jsx';

function ChangeItem({ task, change, onAction, pending, onOpenFile }) {
  const t = useT();
  const [expanded, setExpanded] = useState(change.status === 'pending');
  const [view, setView] = useState('diff');
  const [allLines, setAllLines] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const difference = useMemo(() => diffLines(change.before, change.after), [change.before, change.after]);
  const rows = useMemo(() => allLines ? difference.rows : compactDiff(difference.rows), [difference, allLines]);
  const busy = pending.has(`change:${task.id}:${change.id}`);
  const hasChanges = difference.added > 0 || difference.removed > 0;
  const onReview = async (action) => {
    const success = await onAction(task.id, change.id, action);
    if (success) setConfirmRevert(false);
  };
  const viewNames = { diff: t('artifacts.diff'), before: t('artifacts.before'), after: t('artifacts.after') };
  return <article className={`change-item change-${change.status}`}>
    <div className="change-heading">
      <button type="button" className="change-expand" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} title={change.path}>
        <ChevronRight size={13} className={expanded ? 'chevron expanded' : 'chevron'} /><FileCode2 size={14} />
        <span className="changed-path">{change.path}</span>
      </button>
      <span className="diff-stats"><span className="diff-added">+{difference.added}</span><span className="diff-removed">−{difference.removed}</span></span>
    </div>
    <div className="change-meta"><span>{change.before === null ? t('artifacts.newFile') : change.after === null ? t('artifacts.deletedFile') : t('artifacts.modifiedFile')}</span><span className={`change-state state-${change.status}`}>{change.status === 'pending' ? t('artifacts.needsReview') : change.status === 'accepted' ? t('artifacts.accepted') : change.status === 'reverted' ? t('artifacts.reverted') : change.status}</span></div>
    {expanded && <>
      <div className="diff-toolbar">
        <div className="diff-view-selector" role="group" aria-label={t('artifacts.viewOf', { view: viewNames[view], path: change.path })}>
          {['diff', 'before', 'after'].map((value) => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{viewNames[value]}</button>)}
        </div>
        {view === 'diff' && hasChanges && <button className="text-button diff-context" type="button" onClick={() => setAllLines((value) => !value)}>{allLines ? t('artifacts.hideContext') : t('artifacts.fullFile')}</button>}
      </div>
      <div className="diff-code" role="region" aria-label={t('artifacts.viewOf', { view: viewNames[view], path: change.path })} tabIndex={0}>
        {view === 'diff' ? !hasChanges ? <div className="diff-empty">{t('artifacts.noDifferences')}</div> : <div className="diff-lines">
          {rows.map((line) => line.type === 'gap' ? <button className="diff-gap" key={line.key} type="button" onClick={() => setAllLines(true)}>{line.count === 1 ? t('artifacts.unchangedLine', { n: line.count }) : t('artifacts.unchangedLines', { n: line.count })}</button> : <div key={line.key} className={`diff-line diff-line-${line.type}`}>
            <span className="line-number" aria-hidden="true">{line.oldLine}</span><span className="line-number" aria-hidden="true">{line.newLine}</span><span className="line-sign">{line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}</span><code>{line.text || ' '}</code>
          </div>)}
        </div> : <pre>{(view === 'before' ? change.before : change.after) ?? t('artifacts.fileMissing')}</pre>}
      </div>
      <div className="change-actions">
        <button type="button" className="text-button open-file-button" onClick={() => onOpenFile(change.path)} title={t('artifacts.openFileTitle')}><ArrowUpRight size={13} />{t('artifacts.openInEditor')}</button>
        <div className="review-actions">
          {change.status !== 'reverted' && <button type="button" className="small-button" disabled={busy} onClick={() => setConfirmRevert((value) => !value)}><RotateCcw size={12} />{t('artifacts.revert')}</button>}
          {change.status === 'pending' && <button type="button" className="small-button accept-button" disabled={busy} onClick={() => onReview('accept')}>{busy ? <LoaderCircle size={12} className="spin" /> : <Check size={12} />}{t('artifacts.accept')}</button>}
        </div>
      </div>
      {confirmRevert && change.status !== 'reverted' && <div className="revert-confirmation" role="group" aria-label={t('artifacts.confirmRevert')}>
        <p>{change.before === null ? t('artifacts.removeNewFile') : t('artifacts.restoreSnapshot')} {t('artifacts.conflictNote')}</p>
        <div><button className="small-button" type="button" onClick={() => setConfirmRevert(false)} disabled={busy}>{t('artifacts.cancel')}</button><button className="small-button danger-button" type="button" onClick={() => onReview('revert')} disabled={busy}>{busy && <LoaderCircle size={12} className="spin" />}{t('artifacts.revertChange')}</button></div>
      </div>}
    </>}
  </article>;
}

export default function Artifacts({ task, tab, onTab, open, drawer, onClose, pending, onChangeAction, onOpenFile }) {
  const t = useT();
  const ref = useRef(null);
  useDrawerFocus(ref, open && drawer, onClose);
  const changes = task?.changes || [];
  const activities = task?.activities || [];
  const reviewCount = changes.filter((change) => change.status === 'pending').length;
  function onTabKey(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next = tab === 'changes' ? 'activity' : 'changes';
      onTab(next);
      ref.current?.querySelector(`#${next}-tab`)?.focus();
    }
  }
  return <>
    {open && drawer && <button className="drawer-backdrop artifacts-backdrop" aria-label={t('artifacts.close')} onClick={onClose} tabIndex={-1} />}
    <aside className={`artifacts-panel ${open ? 'is-open' : 'is-closed'} ${drawer ? 'is-drawer' : ''}`} ref={ref} role={drawer ? 'dialog' : undefined} aria-modal={drawer && open ? true : undefined} aria-label={t('artifacts.details')} tabIndex={-1} inert={!open}>
      <div className="artifacts-header">
        <div className="artifacts-tabs" role="tablist" aria-label={t('artifacts.tabs')} onKeyDown={onTabKey}>
          <button id="changes-tab" type="button" role="tab" aria-selected={tab === 'changes'} aria-controls="changes-panel" tabIndex={tab === 'changes' ? 0 : -1} onClick={() => onTab('changes')}>{t('artifacts.changes')}{changes.length > 0 && <span className="tab-count">{changes.length}</span>}</button>
          <button id="activity-tab" type="button" role="tab" aria-selected={tab === 'activity'} aria-controls="activity-panel" tabIndex={tab === 'activity' ? 0 : -1} onClick={() => onTab('activity')}>{t('artifacts.activity')}{activities.length > 0 && <span className="tab-count">{activities.length}</span>}</button>
        </div>
        <IconButton label={t('artifacts.close')} onClick={onClose}>{drawer ? <X size={16} /> : <PanelRightClose size={16} />}</IconButton>
      </div>
      {tab === 'changes' ? <section id="changes-panel" role="tabpanel" aria-labelledby="changes-tab" className="artifacts-content" tabIndex={0}>
        {changes.length > 0 ? <>
          <div className="changes-summary"><span>{reviewCount ? (reviewCount === 1 ? t('artifacts.reviewOne') : t('artifacts.reviewMany', { n: reviewCount })) : t('artifacts.allReviewed')}</span><p>{t('artifacts.reviewHint')}</p></div>
          {changes.map((change) => <ChangeItem key={change.id} task={task} change={change} pending={pending} onAction={onChangeAction} onOpenFile={onOpenFile} />)}
        </> : <div className="panel-empty"><FileDiff size={24} strokeWidth={1.4} /><h3>{t('artifacts.noChanges')}</h3><p>{task ? t('artifacts.noChangesTask') : t('artifacts.noChangesNew')}</p><span>{t('artifacts.diffHint')}</span></div>}
      </section> : <section id="activity-panel" role="tabpanel" aria-labelledby="activity-tab" className="artifacts-content activity-list" tabIndex={0}>
        {activities.length ? <><div className="activity-intro">{t('artifacts.intro')}</div>{activities.map((activity) => <ActivityItem key={activity.id} activity={activity} />)}</> : <div className="panel-empty"><Activity size={24} strokeWidth={1.4} /><h3>{t('artifacts.noActivity')}</h3><p>{task ? t('artifacts.activityTask') : t('artifacts.activityNew')}</p><span>{t('artifacts.activityFooter')}</span></div>}
      </section>}
      <div className="artifacts-footer"><FileCode2 size={12} /><span>{task ? t('artifacts.changesShare') : t('artifacts.connectedLocal')}</span></div>
    </aside>
  </>;
}
