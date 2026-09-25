import test from 'node:test';
import assert from 'node:assert/strict';
import { streamChatCompletion } from '../server/provider.mjs';

const config = { baseUrl: 'https://provider.invalid/v1/', model: 'deepseek-flash', apiKey: 'test-provider-credential' };
function sse(events, width = 7) {
  const body = events.map(value => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`).join('');
  const bytes = new TextEncoder().encode(body);
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += width) controller.enqueue(bytes.slice(i, i + width));
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } });
}

test('assembles fragmented UTF-8 text, indexed tool calls and reasoning while streaming', async () => {
  let request;
  const deltas = [];
  const result = await streamChatCompletion({ ...config, messages: [{ role: 'user', content: 'go' }], tools: [],
    onDelta: delta => deltas.push(delta),
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body), headers: options.headers };
      return sse([
        { choices: [{ index: 0, delta: { reasoning_content: 'inspect first', content: '你好', tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read_', arguments: '{"pa' } }] } }] },
        { choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'list_files', arguments: '{}' } }, { index: 0, function: { name: 'file', arguments: 'th":"x"}' } }] } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { total_tokens: 42 } }, '[DONE]',
      ], 1);
    },
  });
  assert.equal(request.url, 'https://provider.invalid/v1/chat/completions');
  assert.equal(request.body.model, 'deepseek-flash');
  assert.equal(request.body.stream, true);
  assert.equal(request.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(result.message.content, '你好');
  assert.equal(result.message.reasoning_content, 'inspect first');
  assert.deepEqual(result.message.tool_calls.map(x => [x.id, x.function.name, x.function.arguments]), [
    ['call_a', 'read_file', '{"path":"x"}'], ['call_b', 'list_files', '{}'],
  ]);
  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.usage.total_tokens, 42);
  assert.equal(deltas.map(x => x.content || '').join(''), '你好');
});

test('surfaces HTTP and stream failures without echoing credentials', async () => {
  await assert.rejects(streamChatCompletion({ ...config, messages: [], fetchImpl: async () => new Response(JSON.stringify({ error: { message: `Bad credential ${config.apiKey}` } }), { status: 401 }) }), error => {
    assert.equal(error.status, 401);
    assert.match(error.message, /Provider HTTP 401/);
    assert.ok(!error.message.includes(config.apiKey));
    return true;
  });
  for (const events of [
    ['not json'],
    [{ choices: [{ index: 0, delta: { content: 'partial' } }] }],
    [{ error: { message: 'overloaded' } }],
    [{ choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: 'length' }] }, '[DONE]'],
  ]) await assert.rejects(streamChatCompletion({ ...config, messages: [], fetchImpl: async () => sse(events) }));
});

test('supports multiline SSE events and a finish reason without a DONE marker', async () => {
  const body = ': heartbeat\n\ndata: {"choices": [\ndata: {"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n';
  const result = await streamChatCompletion({ ...config, messages: [], fetchImpl: async () => new Response(body) });
  assert.equal(result.message.content, 'ok');
});

test('aborts or times out even when a provider stream stalls', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const fetchImpl = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const request = streamChatCompletion({ ...config, messages: [], signal: controller.signal, fetchImpl });
  setTimeout(() => controller.abort(new DOMException('Stopped', 'AbortError')), 10);
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(cancelled, true);
  await assert.rejects(streamChatCompletion({ ...config, messages: [], fetchImpl, timeoutMs: 10 }), { name: 'TimeoutError' });
});

test('missing configuration is an explicit error and never starts mock or network work', async () => {
  let fetched = false;
  await assert.rejects(streamChatCompletion({ ...config, apiKey: '', messages: [], fetchImpl: async () => { fetched = true; } }), { status: 503 });
  assert.equal(fetched, false);
});

test('accepts CR-only SSE framing and never executes incomplete tool-call streams', async () => {
  const frame = JSON.stringify({ choices: [{ index: 0, delta: { content: 'CR frames' }, finish_reason: 'stop' }] });
  const result = await streamChatCompletion({ ...config, messages: [], fetchImpl: async () => new Response(`data: ${frame}\r\rdata: [DONE]\r\r`) });
  assert.equal(result.message.content, 'CR frames');
  await assert.rejects(streamChatCompletion({ ...config, messages: [], fetchImpl: async () => sse([
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'tool', function: { name: 'write_file', arguments: '{}' } }] } }] }, '[DONE]',
  ]) }), /tool.*finish|finish.*tool/i);
});

test('applies only the resolved top-level or nested reasoning request patch', async () => {
  const bodies = [];
  const complete = { choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] };
  for (const requestPatch of [
    {},
    { reasoning_effort: 'high' },
    { reasoning: { effort: 'medium' } },
  ]) {
    await streamChatCompletion({
      ...config,
      messages: [{ role: 'user', content: 'go' }],
      requestPatch,
      fetchImpl: async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return sse([complete, '[DONE]']);
      },
    });
  }
  assert.equal('reasoning_effort' in bodies[0], false, 'default sends no top-level reasoning field');
  assert.equal('reasoning' in bodies[0], false, 'default sends no nested reasoning field');
  assert.equal(bodies[1].reasoning_effort, 'high');
  assert.equal('reasoning' in bodies[1], false, 'top-level mapping does not also send a nested mapping');
  assert.deepEqual(bodies[2].reasoning, { effort: 'medium' });
  assert.equal('reasoning_effort' in bodies[2], false, 'nested mapping does not also send a top-level mapping');
});

test('fails closed on unsafe request patches before starting a provider request', async () => {
  const unsafe = [
    { model: 'other' },
    { messages: [] },
    { tools: [] },
    { tool_choice: 'none' },
    { stream: false },
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { reasoning: JSON.parse('{"constructor":{"prototype":{"polluted":true}}}') },
    { metadata: new Date() },
    { temperature: undefined },
    { temperature: Number.NaN },
    [],
  ];
  for (const requestPatch of unsafe) {
    let fetched = false;
    await assert.rejects(
      streamChatCompletion({ ...config, messages: [], requestPatch, fetchImpl: async () => { fetched = true; } }),
      error => error?.status === 400,
    );
    assert.equal(fetched, false);
  }
  assert.equal({}.polluted, undefined);
});
