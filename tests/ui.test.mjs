import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLabel } from '../client/activity-label.js';
import { readFile } from 'node:fs/promises';

test('command captions reflect current state instead of stale execution labels', () => {
  const activity = { tool: 'run_command', label: 'Running: node --test', input: { command: 'node --test' } };
  assert.equal(activityLabel({ ...activity, status: 'completed' }), 'Completed: node --test');
  assert.equal(activityLabel({ ...activity, status: 'waiting_approval' }), 'Approval required: node --test');
  assert.equal(activityLabel({ ...activity, status: 'error' }), 'Failed: node --test');
  assert.equal(activityLabel({ ...activity, status: 'cancelled' }), 'Stopped: node --test');
  assert.equal(activityLabel({ ...activity, status: 'running' }), 'Running: node --test');
  assert.equal(activityLabel({ tool: 'read_file', label: 'read_file src/main.js' }), 'read_file src/main.js');
});

test('window surfaces cannot scroll the outer clipped workspace', async () => {
  const css = await readFile(new URL('../client/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.workspace-body\s*\{[^}]*overflow:\s*clip/);
  assert.match(css, /\.agents-window\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.editor-window\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.message-heading \.copy-control\s*\{[^}]*opacity:\s*1/);
});
