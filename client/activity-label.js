/** Non-tool labels are language-neutral tool names; command captions get a status prefix via i18n. */
export function commandCaption(activity) {
  const command = activity.input?.command || String(activity.label || '').replace(/^(?:Running|Command approval|Completed|Failed|Cancelled|Rejected|Approval required):\s*/i, '');
  const status = {
    completed: 'activity.cmd.completed', error: 'activity.cmd.error', failed: 'activity.cmd.failed',
    cancelled: 'activity.cmd.cancelled', rejected: 'activity.cmd.rejected', denied: 'activity.cmd.rejected',
    waiting_approval: 'activity.cmd.waiting_approval', running: 'activity.cmd.running',
  }[activity.status] || 'activity.cmd.fallback';
  return { statusKey: status, command };
}

export function activityLabel(activity, t = (key) => key) {
  if (activity.tool !== 'run_command') return activity.label || activity.tool || activity.type || 'activity.label';
  const { statusKey, command } = commandCaption(activity);
  return command ? `${t(statusKey)}: ${command}` : t(statusKey);
}
