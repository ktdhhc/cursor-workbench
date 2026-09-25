import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentEngine, safeChildEnv } from '../server/engine.mjs';

const provider = { baseUrl: 'https://provider.invalid/v1', model: 'deepseek-flash', apiKey: 'test-provider-key-do-not-leak' };
function response(message) {
  const delta = { ...message };
  if (delta.tool_calls) delta.tool_calls = delta.tool_calls.map((call, index) => ({ index, ...call }));
  return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}
function tool(name, args, id = 'tool_1') { return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }; }
async function fixture(t, fetchImpl, extra = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-engine-'));
  const workspace = path.join(root, 'workspace');
  const stateDir = path.join(root, 'state');
  await mkdir(workspace);
  const options = { ...provider, workspace, stateDir, fetchImpl, ...extra };
  const engine = new AgentEngine(options);
  await engine.init();
  t.after(async () => {
    for (const task of engine.getTasks()) if (['running', 'waiting_approval'].includes(task.status)) await engine.stopTask(task.id);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  return { engine, workspace, stateDir, options };
}
async function waitFor(engine, id, predicate = task => ['completed', 'error', 'cancelled'].includes(task.status)) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const task = engine.getTasks().find(item => item.id === id);
    if (task && predicate(task)) return task;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`Timed out waiting for task; state=${JSON.stringify(engine.getTasks())}`);
}

test('persists exact public task shape and completes a real streamed tool loop', async t => {
  const requests = [];
  const events = [];
  const { engine, workspace, options } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    requests.push(body);
    if (requests.length === 1) return response({ reasoning_content: 'I should inspect.', tool_calls: [tool('read_file', { path: 'hello.txt' })] });
    if (requests.length === 2) {
      assert.equal(body.messages.find(x => x.reasoning_content)?.reasoning_content, 'I should inspect.');
      const read = JSON.parse(body.messages.at(-1).content);
      assert.equal(read.content, 'before');
      return response({ tool_calls: [tool('replace_text', { path: 'hello.txt', oldText: 'before', newText: 'after', expectedHash: read.hash }, 'tool_2')] });
    }
    return response({ content: 'Updated hello.txt.' });
  }, { onChange: tasks => events.push(tasks) });
  await writeFile(path.join(workspace, 'hello.txt'), 'before');
  const created = await engine.createTask({ prompt: 'Update the file', mode: 'agent', title: 'Real edit' });
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed', done.error);
  assert.deepEqual(Object.keys(done).sort(), ['id', 'title', 'prompt', 'status', 'createdAt', 'updatedAt', 'messages', 'activities', 'changes', 'todos', 'verification', 'plan', 'approval', 'interaction', 'error', 'providerId', 'model', 'runConfig', 'context', 'contextRefs'].sort());
  assert.equal(done.messages[0].role, 'user');
  assert.ok(done.messages.slice(1).every(x => x.role === 'assistant'));
  assert.equal(done.messages.at(-1).content, 'Updated hello.txt.');
  assert.ok(done.messages.every(x => Object.keys(x).sort().join() === 'content,createdAt,id,role'));
  assert.equal(done.runConfig.mode, 'agent');
  assert.equal(done.runConfig.permissionMode, 'edit');
  assert.equal(done.verification.status, 'blocked');
  assert.equal(done.messages.at(-1).content, 'Updated hello.txt.');
  assert.equal(done.changes[0].before, 'before');
  assert.equal(done.changes[0].after, 'after');
  assert.equal(done.changes[0].status, 'pending');
  assert.equal(await readFile(path.join(workspace, 'hello.txt'), 'utf8'), 'after');
  assert.equal(done.activities.length, 2);
  assert.ok(done.activities.every(x => x.status === 'completed'));
  assert.ok(events.length > 3);
  assert.ok(!JSON.stringify(engine.getTasks()).includes('reasoning_content'));
  done.messages[0].content = 'mutated copy';
  assert.equal(engine.getTasks()[0].messages[0].content, 'Update the file');
  const restored = new AgentEngine(options);
  await restored.init();
  assert.equal(restored.getTasks()[0].status, 'completed');
  assert.equal(restored.getTasks()[0].changes[0].after, 'after');
});

test('ask mode refuses model-requested mutations and command execution', async t => {
  let count = 0;
  const { engine, workspace } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.ok(body.tools.every(item => !['write_file', 'replace_text', 'run_command'].includes(item.function.name)));
    if (++count === 1) return response({ tool_calls: [
      tool('write_file', { path: 'forbidden.txt', content: 'changed', expectedHash: null }, 'write'),
      tool('run_command', { command: 'echo not-allowed' }, 'command'),
    ] });
    assert.ok(body.messages.filter(x => x.role === 'tool').every(x => JSON.parse(x.content).status === 403));
    return response({ content: 'I can only inspect in Ask mode.' });
  });
  const task = await engine.createTask({ prompt: 'Explain only', mode: 'ask' });
  const done = await waitFor(engine, task.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.changes.length, 0);
  assert.ok(done.activities.every(x => x.status === 'error'));
  await assert.rejects(readFile(path.join(workspace, 'forbidden.txt')), { code: 'ENOENT' });
});

test('approval exposes exact command and cwd, denial never spawns, and approved execution returns output', async t => {
  let count = 0;
  const { engine, workspace } = await fixture(t, async () => {
    count++;
    if (count === 1) return response({ tool_calls: [tool('run_command', { command: 'echo denied > denied.txt', cwd: '.' })] });
    if (count === 3) return response({ tool_calls: [tool('run_command', { command: 'echo approved', cwd: '.' }, 'approved')] });
    return response({ content: 'Command handled.' });
  });
  const created = await engine.createTask({ prompt: 'Try a command' });
  const waiting = await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  assert.equal(waiting.approval.command, 'echo denied > denied.txt');
  assert.equal(waiting.approval.cwd, workspace);
  await assert.rejects(readFile(path.join(workspace, 'denied.txt')), { code: 'ENOENT' });
  await engine.approveTask(created.id, false);
  assert.equal((await waitFor(engine, created.id)).activities[0].status, 'rejected');
  await assert.rejects(readFile(path.join(workspace, 'denied.txt')), { code: 'ENOENT' });
  await engine.continueTask(created.id, 'Run the approved diagnostic instead');
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  await engine.approveTask(created.id, true);
  const completed = await waitFor(engine, created.id);
  assert.equal(completed.status, 'completed', completed.error);
  const output = JSON.parse(completed.activities.at(-1).output);
  assert.equal(output.exitCode, 0);
  assert.match(output.output, /approved/);
});

test('four-task limit, immediate cancellation, isolated streams and continuation', async t => {
  const bodies = [];
  let stall = true;
  const { engine } = await fixture(t, async (_url, request) => {
    bodies.push(JSON.parse(request.body));
    if (stall) return new Response(new ReadableStream());
    return response({ content: 'Resumed independently.' });
  });
  const tasks = await Promise.all(Array.from({ length: 4 }, (_, n) => engine.createTask({ prompt: `Task ${n}` })));
  await assert.rejects(engine.createTask({ prompt: 'fifth' }), { status: 429 });
  await engine.stopTask(tasks[0].id);
  assert.equal(engine.getTasks().find(x => x.id === tasks[0].id).status, 'cancelled');
  stall = false;
  await engine.continueTask(tasks[0].id, 'Continue this task');
  const done = await waitFor(engine, tasks[0].id);
  assert.equal(done.status, 'completed');
  const request = bodies.at(-1);
  assert.ok(request.messages.some(x => x.content === 'Task 0'));
  assert.ok(!request.messages.some(x => /^Task [123]$/.test(x.content)));
  for (const task of tasks.slice(1)) await engine.stopTask(task.id);
});

test('change review accepts and conflict-aware reverts without overwriting manual edits', async t => {
  let count = 0;
  const { engine, workspace } = await fixture(t, async () => ++count === 1 ? response({ tool_calls: [tool('write_file', { path: 'new.txt', content: 'created', expectedHash: null })] }) : response({ content: 'Created.' }));
  const created = await engine.createTask({ prompt: 'Create' });
  const done = await waitFor(engine, created.id);
  const change = done.changes[0];
  await engine.resolveChange(done.id, change.id, 'accept');
  assert.equal(engine.getTasks()[0].changes[0].status, 'accepted');
  await writeFile(path.join(workspace, 'new.txt'), 'manual');
  await assert.rejects(engine.resolveChange(done.id, change.id, 'revert'), { status: 409 });
  assert.equal(await readFile(path.join(workspace, 'new.txt'), 'utf8'), 'manual');
  await writeFile(path.join(workspace, 'new.txt'), 'created');
  await engine.resolveChange(done.id, change.id, 'revert');
  assert.equal(engine.getTasks()[0].changes[0].status, 'reverted');
  await assert.rejects(readFile(path.join(workspace, 'new.txt')), { code: 'ENOENT' });
});

test('provider failures are usable, redact credentials and allow a fresh continuation', async t => {
  let fail = true;
  const { engine, stateDir } = await fixture(t, async () => fail
    ? new Response(JSON.stringify({ error: { message: `Invalid ${provider.apiKey}` } }), { status: 401 })
    : response({ content: 'Recovered.' }));
  const created = await engine.createTask({ prompt: 'Do work' });
  const error = await waitFor(engine, created.id);
  assert.equal(error.status, 'error');
  assert.match(error.error, /HTTP 401/);
  assert.ok(!JSON.stringify(error).includes(provider.apiKey));
  fail = false;
  await engine.continueTask(created.id, 'Try again');
  assert.equal((await waitFor(engine, created.id)).status, 'completed');
  assert.ok(!(await readFile(path.join(stateDir, 'tasks.json'), 'utf8')).includes(provider.apiKey));
});

test('restart marks in-flight tasks interrupted, clears approval and keeps tool history resumable', async t => {
  let count = 0;
  const { engine, options } = await fixture(t, async () => ++count === 1 ? response({ tool_calls: [tool('run_command', { command: 'echo interrupted' })] }) : response({ content: 'Resumed.' }));
  const created = await engine.createTask({ prompt: 'Command' });
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  // Loading the persisted state emulates a new process; it must not rerun pending commands.
  const restarted = new AgentEngine({ ...options, fetchImpl: async (_url, request) => {
    const history = JSON.parse(request.body).messages;
    assert.ok(history.some(x => x.role === 'tool' && x.content.includes('Interrupted')));
    return response({ content: 'Restart recovered.' });
  } });
  await restarted.init();
  const interrupted = restarted.getTasks()[0];
  assert.equal(interrupted.status, 'error');
  assert.match(interrupted.error, /interrupted/i);
  assert.equal(interrupted.approval, null);
  await engine.stopTask(created.id);
  await restarted.continueTask(created.id, 'Continue without retrying command');
  assert.equal((await waitFor(restarted, created.id)).status, 'completed');
});

test('child environment strips provider keys and startup hooks without breaking normal development variables', () => {
  const env = safeChildEnv({ PATH: '/bin', HOME: '/home/me', NODE_ENV: 'test', LANG: 'en_US.UTF-8', PORT: '3000', OPENAI_BASE_URL: 'private', OPENAI_API_KEY: 'secret', DEEPSEEK_API_KEY: 'secret', CUSTOM: 'actual-provider-key', NODE_OPTIONS: '--require steal.js', BASH_ENV: 'steal.sh', AWS_SECRET_ACCESS_KEY: 'secret', NPM_TOKEN: 'secret' }, ['actual-provider-key']);
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/me', NODE_ENV: 'test', LANG: 'en_US.UTF-8', PORT: '3000' });
});

function nodeCommand(code) {
  return `"${process.execPath}" -e "${code.replaceAll('"', '\\"')}"`;
}

test('commands time out and cap output while exposing failure without fabricating success', async t => {
  let turn = 0;
  const { engine } = await fixture(t, async () => {
    turn++;
    if (turn === 1) return response({ tool_calls: [tool('run_command', { command: nodeCommand('setInterval(()=>{},1000)'), timeoutMs: 100 }, 'timeout')] });
    if (turn === 3) return response({ tool_calls: [tool('run_command', { command: nodeCommand("process.stdout.write('x'.repeat(100000))"), timeoutMs: 3000 }, 'output')] });
    return response({ content: 'The command did not complete successfully.' });
  });
  const created = await engine.createTask({ prompt: 'Run checks' });
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  await engine.approveTask(created.id, true);
  const timed = await waitFor(engine, created.id);
  const first = JSON.parse(timed.activities[0].output);
  assert.equal(first.timedOut, true);
  assert.equal(timed.activities[0].status, 'error');
  await engine.continueTask(created.id, 'Try the output check');
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  await engine.approveTask(created.id, true);
  const capped = await waitFor(engine, created.id);
  const second = JSON.parse(capped.activities[1].output);
  assert.equal(second.truncated, true);
  assert.equal(Buffer.byteLength(second.output), 64 * 1024);
  assert.equal(capped.activities[1].status, 'error');
});

test('stopping an approved command terminates its process and leaves no delayed workspace mutation', async t => {
  const command = nodeCommand("setTimeout(()=>require('fs').writeFileSync('delayed.txt','bad'),800);setInterval(()=>{},1000)");
  const { engine, workspace } = await fixture(t, async () => response({ tool_calls: [tool('run_command', { command, timeoutMs: 3000 })] }));
  const created = await engine.createTask({ prompt: 'Run long check' });
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  await engine.approveTask(created.id, true);
  await waitFor(engine, created.id, x => x.activities[0].label.startsWith('Running:'));
  await new Promise(resolve => setTimeout(resolve, 50));
  const cancelled = await engine.stopTask(created.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.activities[0].status, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 900));
  await assert.rejects(readFile(path.join(workspace, 'delayed.txt')), { code: 'ENOENT' });
});

test('a cancelled multi-tool turn is repaired before continuation without executing remaining tools', async t => {
  let count = 0;
  const { engine, workspace } = await fixture(t, async (_url, request) => {
    if (++count === 1) return response({ reasoning_content: 'Wait for approval.', tool_calls: [
      tool('run_command', { command: 'echo cancelled' }, 'pending'),
      tool('write_file', { path: 'not-executed.txt', content: 'bad', expectedHash: null }, 'unstarted'),
    ] });
    const history = JSON.parse(request.body).messages;
    assert.equal(history.filter(x => x.role === 'tool').length, 2);
    assert.ok(history.find(x => x.reasoning_content)?.tool_calls.length === 2);
    return response({ content: 'Stopped tools were not rerun.' });
  });
  const created = await engine.createTask({ prompt: 'Try actions' });
  await waitFor(engine, created.id, x => x.status === 'waiting_approval');
  await engine.stopTask(created.id);
  await engine.continueTask(created.id, 'Continue explaining only');
  const completed = await waitFor(engine, created.id);
  assert.equal(completed.status, 'completed', completed.error);
  assert.equal(completed.approval, null);
  await assert.rejects(readFile(path.join(workspace, 'not-executed.txt')), { code: 'ENOENT' });
});

test('does not overwrite malformed persisted state', async t => {
  const { stateDir, options } = await fixture(t, async () => response({ content: 'ok' }));
  const state = path.join(stateDir, 'tasks.json');
  await writeFile(state, '{broken');
  await assert.rejects(new AgentEngine(options).init(), /Existing state was not overwritten/);
  assert.equal(await readFile(state, 'utf8'), '{broken');
  assert.deepEqual(await readdir(stateDir), ['tasks.json']);
});

test('restart preserves ordinary configuration code exactly so undo still works', async t => {
  const original = 'export const password = process.env.PASSWORD;\n';
  const replacement = 'export const password = process.env.APPLICATION_PASSWORD;\n';
  let count = 0;
  const { engine, workspace, options } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    if (++count === 1) return response({ tool_calls: [tool('read_file', { path: 'config.js' })] });
    if (count === 2) {
      const read = JSON.parse(body.messages.at(-1).content);
      assert.equal(read.content, original);
      return response({ tool_calls: [tool('write_file', { path: 'config.js', content: replacement, expectedHash: read.hash }, 'change')] });
    }
    return response({ content: 'Updated environment lookup.' });
  });
  await writeFile(path.join(workspace, 'config.js'), original);
  const created = await engine.createTask({ prompt: 'Update config lookup' });
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(done.changes[0].after, replacement);
  const restarted = new AgentEngine(options);
  await restarted.init();
  await restarted.resolveChange(created.id, done.changes[0].id, 'revert');
  assert.equal(await readFile(path.join(workspace, 'config.js'), 'utf8'), original);
});

test('streaming never exposes a partial provider credential while chunks are assembling', async t => {
  const visible = [];
  const { engine, stateDir } = await fixture(t, async () => new Response(new ReadableStream({ async start(controller) {
    for (const character of `Unexpected: ${provider.apiKey}`) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: character } }] })}\n\n`));
      await new Promise(resolve => setTimeout(resolve, 3));
    }
    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    controller.close();
  } })), { onChange: tasks => visible.push(...tasks.flatMap(task => task.messages.map(message => message.content))) });
  const created = await engine.createTask({ prompt: 'Explain' });
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed');
  assert.ok(!visible.some(text => text.includes(provider.apiKey.slice(0, 8))));
  assert.ok(!(await readFile(path.join(stateDir, 'tasks.json'), 'utf8')).includes(provider.apiKey));
});

test('task run config freezes mode, permission, model and reasoning at creation', async t => {
  const resolutions = [];
  const { engine } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.reasoning_effort, 'high');
    return response({ content: 'Configured.' });
  }, {
    providerResolver: (providerId, modelId, options) => {
      resolutions.push({ providerId, modelId, options });
      return { providerId, baseUrl: provider.baseUrl, model: modelId, apiKey: provider.apiKey, reasoningLevel: options.reasoningLevel, requestPatch: { reasoning_effort: options.reasoningLevel } };
    },
  });
  const created = await engine.createTask({ prompt: 'Debug it', runConfig: { mode: 'debug', permissionMode: 'build', modelSelection: { providerId: 'custom', modelId: 'reasoning-model', options: { reasoningLevel: 'high' } } } });
  const done = await waitFor(engine, created.id);
  assert.equal(done.runConfig.mode, 'debug');
  assert.equal(done.runConfig.permissionMode, 'build');
  assert.deepEqual(done.runConfig.modelSelection, { providerId: 'custom', modelId: 'reasoning-model', options: { reasoningLevel: 'high' } });
  assert.equal(resolutions.length >= 2, true);
});

test('build asks before edits, edit auto-edits, and yolo auto-runs commands', async t => {
  const firstTurn = new Set();
  const { engine, workspace } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    const prompt = body.messages.find(message => message.role === 'user')?.content;
    if (!firstTurn.has(prompt)) {
      firstTurn.add(prompt);
      if (prompt === 'Build edit') return response({ tool_calls: [tool('write_file', { path: 'build.txt', content: 'ok', expectedHash: null }, 'build-edit')] });
      if (prompt === 'Auto edit') return response({ tool_calls: [tool('write_file', { path: 'edit.txt', content: 'ok', expectedHash: null }, 'auto-edit')] });
      if (prompt === 'Auto command') return response({ tool_calls: [tool('run_command', { command: 'echo yolo', cwd: '.' }, 'command-yolo')] });
    }
    const needsVerification = body.messages.some(message => message.role === 'system' && message.content?.startsWith('You changed workspace files'));
    const alreadyReported = body.messages.some(message => message.role === 'tool' && message.content?.includes('No project test script'));
    if (needsVerification && !alreadyReported) return response({ tool_calls: [tool('report_verification', { status: 'blocked', summary: 'No project test script in this fixture.' }, `verification-${prompt}`)] });
    return response({ content: 'Done.' });
  });
  const build = await engine.createTask({ prompt: 'Build edit', runConfig: { mode: 'agent', permissionMode: 'build' } });
  const buildWaiting = await waitFor(engine, build.id, task => task.status === 'waiting_approval');
  assert.equal(buildWaiting.approval.type, 'edit');
  await engine.approveTask(build.id, true);
  assert.equal((await waitFor(engine, build.id)).status, 'completed');
  const edit = await engine.createTask({ prompt: 'Auto edit', runConfig: { mode: 'agent', permissionMode: 'edit' } });
  assert.equal((await waitFor(engine, edit.id)).status, 'completed');
  assert.equal(await readFile(path.join(workspace, 'edit.txt'), 'utf8'), 'ok');
  const yolo = await engine.createTask({ prompt: 'Auto command', runConfig: { mode: 'agent', permissionMode: 'yolo' } });
  const yoloDone = await waitFor(engine, yolo.id);
  assert.equal(yoloDone.status, 'completed');
  assert.match(JSON.parse(yoloDone.activities[0].output).output, /yolo/);
});

test('plan mode is read-only until a submitted plan is approved', async t => {
  let turn = 0;
  const { engine, workspace } = await fixture(t, async () => {
    if (++turn === 1) return response({ tool_calls: [tool('write_file', { path: 'blocked.txt', content: 'bad', expectedHash: null }, 'blocked'), tool('submit_plan', { plan: '1. Inspect\n2. Implement\n3. Test' }, 'plan')] });
    if (turn === 2) return response({ tool_calls: [tool('write_file', { path: 'approved.txt', content: 'good', expectedHash: null }, 'approved-edit')] });
    return response({ content: 'Implemented.' });
  });
  const created = await engine.createTask({ prompt: 'Plan then implement', runConfig: { mode: 'plan', permissionMode: 'edit' } });
  const waiting = await waitFor(engine, created.id, task => task.status === 'waiting_approval');
  assert.equal(waiting.approval.type, 'plan');
  assert.equal(waiting.activities[0].status, 'error');
  await assert.rejects(readFile(path.join(workspace, 'blocked.txt')), { code: 'ENOENT' });
  await engine.approveTask(created.id, true);
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.plan.status, 'approved');
  assert.equal(done.runConfig.mode, 'agent');
  assert.equal(await readFile(path.join(workspace, 'approved.txt'), 'utf8'), 'good');
});

test('retry is a system recovery event, not a fabricated user message', async t => {
  let fail = true;
  const { engine } = await fixture(t, async (_url, request) => {
    if (fail) return new Response('bad', { status: 500 });
    const messages = JSON.parse(request.body).messages;
    assert.equal(messages.filter(message => message.role === 'user').length, 1);
    assert.ok(messages.some(message => message.role === 'system' && /previous turn failed/i.test(message.content)));
    return response({ content: 'Recovered.' });
  });
  const created = await engine.createTask({ prompt: 'Recover me' });
  await waitFor(engine, created.id);
  fail = false;
  await engine.retryTask(created.id);
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.messages.filter(message => message.role === 'user').length, 1);
  assert.ok(done.activities.some(activity => activity.tool === 'retry'));
});

test('verification commands update structured verification state', async t => {
  let turn = 0;
  const { engine } = await fixture(t, async () => ++turn === 1
    ? response({ tool_calls: [tool('run_command', { command: nodeCommand("console.log('ok')") + ' && node --test', timeoutMs: 3000 }, 'verify')] })
    : response({ content: 'Verified.' }));
  const created = await engine.createTask({ prompt: 'Verify', runConfig: { mode: 'agent', permissionMode: 'yolo' } });
  const done = await waitFor(engine, created.id);
  assert.equal(done.verification.status, 'passed');
  assert.equal(done.verification.checks.length, 1);
  assert.equal(done.verification.checks[0].status, 'passed');
});

test('ask_user blocks without guessing and resumes with the explicit answer', async t => {
  let turn = 0;
  const { engine } = await fixture(t, async (_url, request) => {
    const body = JSON.parse(request.body);
    if (++turn === 1) return response({ tool_calls: [tool('ask_user', { question: 'Which package manager?', options: [
      { label: 'npm', description: 'Use package-lock.json.' }, { label: 'pnpm', description: 'Use pnpm-lock.yaml.' },
    ] }, 'question')] });
    const result = JSON.parse(body.messages.at(-1).content);
    assert.equal(result.answer, 'pnpm');
    return response({ content: 'Using pnpm.' });
  });
  const created = await engine.createTask({ prompt: 'Choose tooling' });
  const waiting = await waitFor(engine, created.id, task => task.status === 'waiting_input');
  assert.equal(waiting.interaction.type, 'question');
  assert.equal(waiting.interaction.options.length, 2);
  await engine.answerTask(created.id, 'pnpm');
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.interaction, null);
  assert.equal(done.messages.at(-1).content, 'Using pnpm.');
});

test('model metadata bounds the context budget and forwards output limits', async t => {
  const bodies = [];
  const { engine } = await fixture(t, async (_url, request) => {
    bodies.push(JSON.parse(request.body));
    return response({ content: 'ok' });
  }, { providerResolver: () => ({ providerId: 'p', baseUrl: provider.baseUrl, model: 'm', apiKey: provider.apiKey, contextWindow: 32000, maxOutputTokens: 1234 }) });
  const created = await engine.createTask({ prompt: 'hi' });
  const done = await waitFor(engine, created.id);
  assert.equal(done.status, 'completed', done.error);
  assert.equal(bodies[0].max_tokens, 1234);
  assert.equal(done.context.limitBytes, 96000);
});
