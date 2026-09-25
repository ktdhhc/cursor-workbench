import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.APP_URL || 'http://127.0.0.1:4317';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = { startedAt: new Date().toISOString(), checks: [], tasks: [] };
async function request(route, body) {
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${result.error}`);
  return result;
}
async function wait(id, approvalCommand) {
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    const task = (await request('/api/state')).tasks.find(t => t.id === id);
    if (task.status === 'waiting_approval') {
      assert.equal(task.approval.command, approvalCommand, 'Only the exact test command may be approved by the harness');
      await request(`/api/tasks/${id}/approval`, { approved: true });
      evidence.checks.push('Approved exact test command: ' + approvalCommand);
    }
    if (['completed', 'error', 'cancelled'].includes(task.status)) {
      evidence.tasks.push(task);
      assert.equal(task.status, 'completed', task.error || 'Task did not complete');
      return task;
    }
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  await request(`/api/tasks/${id}/stop`, {});
  throw new Error(`Task timeout: ${id}`);
}
try {
  const health = await request('/api/health');
  assert.equal(health.configured, true);
  assert.equal(health.model, 'deepseek-flash');
  evidence.checks.push('Configured deepseek-flash server is live');
  const mode = process.argv[2] || 'chat';
  if (mode === 'chat') {
    const created = await request('/api/tasks', { prompt: '仅回复：你好，Agent 对话已连接。不要使用工具。', mode: 'ask', title: 'Live chat verification' });
    const task = await wait(created.id);
    assert.ok(task.messages.some(m => m.role === 'assistant' && m.content.includes('对话')));
    evidence.checks.push('Real provider task completed with Chinese response');
  } else if (mode === 'tools') {
    const existingResponse = await fetch(base + '/api/file?path=src%2Fagent-verification.js');
    const existing = existingResponse.ok ? await existingResponse.json() : null;
    const value = existing?.content.includes('= 42;') ? 43 : 42;
    const expected = `export const agentVerified = ${value};`;
    const created = await request('/api/tasks', { prompt: `This is a tool integration test. 1) list files and read src/hello.js. 2) Read src/agent-verification.js if it exists, then create or modify that file to exactly this content: ${expected} followed by a newline. Use the current hash for existing files, null only for new files. 3) Run EXACTLY \`node --test\` using run_command, and wait for approval. 4) Summarize actual test results. Do not change any other file. Use tools, do not just explain.`, mode: 'agent', title: 'Read, edit, run tests' });
    const task = await wait(created.id, 'node --test');
    const file = await request('/api/file?path=src%2Fagent-verification.js');
    assert.equal(file.content.trim(), expected);
    assert.ok(task.activities.some(a => a.tool === 'read_file'));
    assert.ok(task.activities.some(a => ['write_file', 'replace_text'].includes(a.tool)));
    assert.ok(task.activities.some(a => a.tool === 'run_command'));
    assert.ok(task.changes.some(c => c.path === 'src/agent-verification.js'));
    evidence.checks.push('Real model read source, created file, requested command approval, and executed tests');
  } else if (mode === 'parallel') {
    const [a, b] = await Promise.all([
      request('/api/tasks', { prompt: 'Reply with exactly PARALLEL_A_SUCCESS. Do not use tools.', mode: 'ask', title: 'Parallel agent A' }),
      request('/api/tasks', { prompt: 'Reply with exactly PARALLEL_B_SUCCESS. Do not use tools.', mode: 'ask', title: 'Parallel agent B' }),
    ]);
    const concurrent = (await request('/api/state')).tasks.filter(t => [a.id, b.id].includes(t.id));
    assert.equal(concurrent.filter(t => t.status === 'running').length, 2);
    const [ra, rb] = await Promise.all([wait(a.id), wait(b.id)]);
    assert.ok(ra.messages.some(m => m.role === 'assistant' && m.content.includes('PARALLEL_A_SUCCESS')));
    assert.ok(rb.messages.some(m => m.role === 'assistant' && m.content.includes('PARALLEL_B_SUCCESS')));
    assert.ok(!ra.messages.some(m => m.content.includes('PARALLEL_B_SUCCESS')));
    evidence.checks.push('Two real tasks were simultaneously running and completed with isolated histories');
  } else throw new Error('Unknown smoke mode');
  evidence.ok = true;
} catch (error) { evidence.ok = false; evidence.error = error.message; process.exitCode = 1; }
finally {
  evidence.completedAt = new Date().toISOString();
  const dir = path.join(root, 'docs/evidence');
  await mkdir(dir, { recursive: true });
  const secret = process.env.AI_API_KEY;
  let json = JSON.stringify(evidence, null, 2);
  if (secret) json = json.replaceAll(secret, '[redacted]');
  await writeFile(path.join(dir, `live-${process.argv[2] || 'chat'}.json`), json + '\n');
  console.log(JSON.stringify({ ok: evidence.ok, checks: evidence.checks, error: evidence.error }, null, 2));
}
