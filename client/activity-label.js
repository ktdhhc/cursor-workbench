export function activityLabel(activity) {
  if (activity.tool !== 'run_command') return activity.label || activity.tool || activity.type || 'Agent activity';
  const command = activity.input?.command || String(activity.label || '').replace(/^(?:Running|Command approval|Completed|Failed|Cancelled|Rejected):\s*/i, '');
  const prefix = {
    completed: 'Completed',
    error: 'Failed',
    failed: 'Failed',
    cancelled: 'Stopped',
    rejected: 'Rejected',
    denied: 'Rejected',
    waiting_approval: 'Approval required',
    running: 'Running',
  }[activity.status] || 'Command';
  return command ? `${prefix}: ${command}` : prefix;
}
