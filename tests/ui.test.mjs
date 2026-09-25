import test from 'node:test';
import assert from 'node:assert/strict';
import { activityLabel, commandCaption } from '../client/activity-label.js';
import { readFile } from 'node:fs/promises';

test('command captions reflect current state instead of stale execution labels', () => {
  const activity = { tool: 'run_command', label: 'Running: node --test', input: { command: 'node --test' } };
  const id = (key) => key;
  assert.equal(activityLabel({ ...activity, status: 'completed' }, id), 'activity.cmd.completed: node --test');
  assert.equal(activityLabel({ ...activity, status: 'waiting_approval' }, id), 'activity.cmd.waiting_approval: node --test');
  assert.equal(activityLabel({ ...activity, status: 'error' }, id), 'activity.cmd.error: node --test');
  assert.equal(activityLabel({ ...activity, status: 'cancelled' }, id), 'activity.cmd.cancelled: node --test');
  assert.equal(activityLabel({ ...activity, status: 'running' }, id), 'activity.cmd.running: node --test');
  assert.equal(activityLabel({ tool: 'read_file', label: 'read_file src/main.js' }, id), 'read_file src/main.js');
  assert.deepEqual(commandCaption({ ...activity, status: 'completed' }), { statusKey: 'activity.cmd.completed', command: 'node --test' });
});

test('window surfaces cannot scroll the outer clipped workspace', async () => {
  const css = await readFile(new URL('../client/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.workspace-body\s*\{[^}]*overflow:\s*clip/);
  assert.match(css, /\.agents-window\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.editor-window\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.message-heading \.copy-control\s*\{[^}]*opacity:\s*1/);
});

test('editor-disabled state guides users instead of dead-ending', async () => {
  const app = await readFile(new URL('../client/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /editorDisabled \? t\('app.editorDisabledTitle'\)/);
  assert.match(app, /t\('editor.notEnabledTitle'\)/);
  const i18n = await readFile(new URL('../client/i18n.jsx', import.meta.url), 'utf8');
  assert.match(i18n, /'editor\.notEnabledTitle': 'Editor not enabled on this machine'/);
  assert.match(i18n, /'editor\.notEnabledTitle': '编辑器未在本机启用',/);
  assert.match(i18n, /'welcome\.heading': '想做点什么？'/);
  const css = await readFile(new URL('../client/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.editor-options/);
  assert.match(css, /data-theme='light'/);
  assert.match(css, /--canvas: #f7f6f2/);
});
