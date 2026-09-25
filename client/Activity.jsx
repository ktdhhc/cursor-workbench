import { useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronRight, Clock3, FileCode2, FilePenLine, FileSearch, FolderSearch, LoaderCircle, Terminal, Wrench } from 'lucide-react';
import { formatDetail, formatTime } from './ui.jsx';

export function ActivityIcon({ activity, size = 15 }) {
  const tool = activity.tool || activity.type || '';
  const Icon = /command|terminal|exec/.test(tool) ? Terminal
    : /write|replace|edit/.test(tool) ? FilePenLine
      : /search/.test(tool) ? FileSearch
        : /list/.test(tool) ? FolderSearch
          : /read/.test(tool) ? FileCode2 : Wrench;
  return <Icon size={size} aria-hidden="true" />;
}

export function ActivityStatus({ status }) {
  const active = /^(running|pending|started|in_progress)$/.test(status || '');
  const failed = /^(error|failed|rejected)$/.test(status || '');
  const waiting = /^(waiting|waiting_approval)$/.test(status || '');
  const done = /^(completed|complete|success|succeeded|done)$/.test(status || '');
  return <span className={`activity-status ${failed ? 'status-error' : waiting ? 'status-waiting' : active ? 'status-running' : ''}`} title={status || 'Activity'}>
    {active ? <LoaderCircle size={13} className="spin" /> : failed ? <AlertCircle size={13} /> : waiting ? <Clock3 size={13} /> : done ? <Check size={13} /> : null}
    <span className="sr-only">{status || 'Activity'}</span>
  </span>;
}

export function ActivityItem({ activity }) {
  const failed = /^(error|failed|rejected)$/.test(activity.status || '');
  const [expanded, setExpanded] = useState(failed);
  useEffect(() => { if (failed) setExpanded(true); }, [failed]);
  const input = formatDetail(activity.input);
  const output = formatDetail(activity.output);
  return <article className={`activity-item ${failed ? 'has-error' : ''}`}>
    <button type="button" className="activity-summary" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <ChevronRight size={13} className={expanded ? 'chevron expanded' : 'chevron'} />
      <ActivityIcon activity={activity} />
      <span className="activity-label">{activity.label || activity.tool || activity.type || 'Agent activity'}</span>
      <ActivityStatus status={activity.status} />
    </button>
    {expanded && <div className="activity-detail">
      <div className="activity-meta"><span>{activity.tool || activity.type || 'Activity'}</span><span>{activity.status}</span><time dateTime={activity.createdAt}>{formatTime(activity.createdAt)}</time></div>
      {input && <div className="activity-data"><span className="detail-label">Input</span><pre>{input}</pre></div>}
      {output && <div className="activity-data"><span className="detail-label">Output</span><pre>{output}</pre></div>}
      {!output && <p className="detail-empty">{/^(running|pending|started|waiting_approval)$/.test(activity.status || '') ? 'Waiting for output…' : 'No output recorded.'}</p>}
    </div>}
  </article>;
}

export function LiveActivity({ task, onShowActivity }) {
  const activities = task.activities || [];
  const last = activities[activities.length - 1];
  if (!last) return null;
  return <button type="button" className="live-activity" onClick={onShowActivity}>
    <ActivityIcon activity={last} size={14} />
    <span>{last.label || last.tool || last.type || 'Agent activity'}</span>
    <ActivityStatus status={last.status} />
    <ChevronRight size={13} />
  </button>;
}
