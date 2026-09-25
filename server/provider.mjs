const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.statusCode = status;
  }
}

export function redactSecrets(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) text = text.split(secret).join('[REDACTED]');
  }
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi, '$1[REDACTED]');
}

export function chatCompletionsUrl(baseUrl) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new ProviderError('Provider base URL is invalid.', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ProviderError('Provider base URL must be an HTTP(S) URL without credentials, query, or fragment.', 400);
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.toString();
}

function abortable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function boundedBody(response, maxBytes, signal) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let count = 0;
  try {
    while (count < maxBytes) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      const part = value.subarray(0, maxBytes - count);
      chunks.push(Buffer.from(part));
      count += part.byteLength;
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** One real OpenAI-compatible streaming turn. Internal message preserves reasoning_content. */
export async function streamChatCompletion({
  baseUrl, model, apiKey, messages, tools = [], signal, onDelta = () => {},
  fetchImpl = globalThis.fetch, timeoutMs = 120_000,
}) {
  if (typeof model !== 'string' || !model.trim() || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new ProviderError('Provider is not configured. Set the model and API key on the server.', 503);
  }
  if (typeof fetchImpl !== 'function') throw new ProviderError('Fetch is unavailable.', 503);
  const url = chatCompletionsUrl(baseUrl);
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Provider request timed out. Try continuing the task.', 'TimeoutError')), timeoutMs);
  let reader;
  try {
    controller.signal.throwIfAborted();
    const body = { model, messages, stream: true };
    if (tools.length) { body.tools = tools; body.tool_choice = 'auto'; }
    const response = await abortable(fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body), signal: controller.signal,
      // Never forward the credential through an unexpected cross-host redirect.
      redirect: 'error',
    }), controller.signal);
    if (!response.ok) {
      const raw = await boundedBody(response, 8192, controller.signal);
      let detail = raw;
      try { const parsed = JSON.parse(raw); detail = parsed.error?.message || parsed.message || raw; } catch { /* Plain-text provider errors are valid. */ }
      throw new ProviderError(`Provider HTTP ${response.status}: ${redactSecrets(detail, [apiKey]).slice(0, 1500) || response.statusText || 'Request failed'}`, response.status);
    }
    reader = response.body?.getReader();
    if (!reader) throw new ProviderError('Provider returned no response stream.');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const calls = new Map();
    let content = '';
    let reasoning = '';
    let hasReasoning = false;
    let finishReason = null;
    let usage = null;
    let doneMarker = false;
    let sawChoice = false;
    let total = 0;
    let buffer = '';
    let data = [];
    let eventBytes = 0;

    const dispatch = async () => {
      if (!data.length) return;
      const payload = data.join('\n');
      data = [];
      eventBytes = 0;
      if (payload.trim() === '[DONE]') { doneMarker = true; return; }
      let parsed;
      try { parsed = JSON.parse(payload); } catch { throw new ProviderError('Provider sent malformed SSE JSON. Try continuing the task.'); }
      if (parsed.error) throw new ProviderError(`Provider stream error: ${redactSecrets(parsed.error.message || JSON.stringify(parsed.error), [apiKey]).slice(0, 1500)}`);
      if (parsed.usage) usage = parsed.usage;
      if (!Array.isArray(parsed.choices)) return;
      const choice = parsed.choices.find(item => item.index === 0) || (parsed.choices.length === 1 && parsed.choices[0].index === undefined ? parsed.choices[0] : null);
      if (!choice) return;
      sawChoice = true;
      if (choice.finish_reason != null) finishReason = choice.finish_reason;
      const delta = choice.delta || {};
      if (typeof delta.content === 'string') content += delta.content;
      if (typeof delta.reasoning_content === 'string') { reasoning += delta.reasoning_content; hasReasoning = true; }
      for (const fragment of delta.tool_calls || []) {
        const index = fragment.index;
        if (!Number.isInteger(index) || index < 0 || index >= 64) throw new ProviderError('Provider returned an invalid tool-call index.');
        const call = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
        if (typeof fragment.id === 'string' && fragment.id !== call.id) call.id += fragment.id;
        if (fragment.type && fragment.type !== 'function') throw new ProviderError('Provider returned an unsupported tool-call type.');
        if (typeof fragment.function?.name === 'string') call.function.name += fragment.function.name;
        if (typeof fragment.function?.arguments === 'string') call.function.arguments += fragment.function.arguments;
        calls.set(index, call);
      }
      if (Object.keys(delta).length) await onDelta(delta);
    };

    const line = async value => {
      if (value.endsWith('\r')) value = value.slice(0, -1);
      if (!value) { await dispatch(); return; }
      if (value.startsWith(':')) return;
      if (value === 'data' || value.startsWith('data:')) {
        let part = value === 'data' ? '' : value.slice(5);
        if (part.startsWith(' ')) part = part.slice(1);
        eventBytes += Buffer.byteLength(part);
        if (eventBytes > MAX_EVENT_BYTES) throw new ProviderError('Provider SSE event exceeded the 1MB limit.');
        data.push(part);
      }
    };

    const drainLines = async final => {
      let end;
      while ((end = buffer.search(/[\r\n]/)) !== -1 && !doneMarker) {
        // A CR split from its LF must wait for the next chunk, not create a blank event.
        if (!final && buffer[end] === '\r' && end === buffer.length - 1) break;
        const value = buffer.slice(0, end);
        const width = buffer[end] === '\r' && buffer[end + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(end + width);
        await line(value);
      }
    };
    while (!doneMarker) {
      const next = await abortable(reader.read(), controller.signal);
      if (next.done) { buffer += decoder.decode(); await drainLines(true); break; }
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new ProviderError('Provider response exceeded the 2MB safety limit.');
      buffer += decoder.decode(next.value, { stream: true });
      await drainLines(false);
      if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw new ProviderError('Provider SSE line exceeded the 1MB limit.');
    }
    if (!doneMarker) {
      if (buffer) await line(buffer);
      await dispatch();
    }
    if (!sawChoice || (!doneMarker && !finishReason)) throw new ProviderError('Provider stream ended before completion. Try continuing the task.');
    if (finishReason === 'length') throw new ProviderError('Provider reached its response token limit. Try continuing the task.');
    if (finishReason === 'content_filter') throw new ProviderError('Provider filtered this response. Revise the request and continue.');
    const message = { role: 'assistant', content: content || (calls.size ? null : '') };
    if (hasReasoning) message.reasoning_content = reasoning;
    if (calls.size) {
      if (finishReason !== 'tool_calls') throw new ProviderError('Provider tool-call stream is missing a valid tool_calls finish reason. No tools were executed.');
      message.tool_calls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call);
      const ids = new Set();
      for (const call of message.tool_calls) {
        if (!call.id || !call.function.name || ids.has(call.id)) throw new ProviderError('Provider returned incomplete or duplicate tool calls.');
        ids.add(call.id);
      }
    } else if (!content && !reasoning) throw new ProviderError('Provider returned an empty response.');
    return { message, finishReason, usage };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(`Provider connection failed: ${redactSecrets(error?.message || String(error), [apiKey]).slice(0, 1500)}`);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    if (reader) { reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
