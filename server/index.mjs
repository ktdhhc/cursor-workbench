import express from 'express';
import http from 'node:http';
import httpProxy from 'http-proxy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { AgentEngine } from './engine.mjs';
import { ProviderRegistry } from './providers.mjs';
import { streamChatCompletion } from './provider.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4317);
const editorPort = Number(process.env.CODE_SERVER_PORT || 4318);
const workspace = path.resolve(process.env.WORKSPACE_ROOT || path.join(root, 'workspace'));
const stateDir = path.join(root, '.state');
await mkdir(stateDir, { recursive: true });
let bridgeToken;
try { bridgeToken = (await readFile(path.join(stateDir, 'bridge-token'), 'utf8')).trim(); }
catch { bridgeToken = randomBytes(32).toString('hex'); await writeFile(path.join(stateDir, 'bridge-token'), bridgeToken, { mode: 0o600 }); }
const clients = new Map();
const commandQueue = [];
const acknowledgements = new Map();
let activeFile = null;
let lastBridgeSeen = 0;
let requestedMode = null;
let broadcastTimer;
// The editor iframe is opt-in: launchers set EDITOR_ENABLED=1 only when a real
// editor runtime is actually serving. Unset means Agents-only on this machine.
const editorEnabled = /^(?:1|true)$/i.test(process.env.EDITOR_ENABLED || '');
const config = {
  model: process.env.AI_MODEL || 'deepseek-flash',
  baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
  configured: Boolean(process.env.AI_API_KEY),
  workspaceName: path.basename(workspace), workspacePath: workspace,
  editorEnabled,
  editorUrl: editorEnabled ? `/editor/?folder=${encodeURIComponent(workspace)}` : null,
};
const registry = await new ProviderRegistry({
  builtinPath: path.join(root, 'server', 'builtin-providers.json'),
  personalPath: path.join(stateDir, 'providers.json'),
  credentialsPath: path.join(stateDir, 'provider-credentials.json'),
  envDefaults: { baseUrl: config.baseUrl, model: config.model, apiKey: process.env.AI_API_KEY },
  onChange: broadcast,
}).init();
const engine = new AgentEngine({ workspace, stateDir: path.join(stateDir, 'agents'), baseUrl: config.baseUrl, model: config.model, apiKey: process.env.AI_API_KEY, onChange: broadcast,
  providerResolver: (providerId, modelId, options) => {
    const resolved = registry.resolve(providerId, modelId, options);
    return resolved ? { providerId: resolved.providerId, baseUrl: resolved.baseUrl, model: resolved.modelId, apiKey: resolved.apiKey, requestPatch: resolved.requestPatch, reasoningLevel: resolved.reasoningLevel } : null;
  },
  secretSupplier: () => registry.secretValues(),
});
await engine.init();
function modelAvailability() {
  try {
    const resolved = registry.resolve();
    if (!resolved) return { ready: false, providerId: null, modelId: null, issue: 'no-model-selected' };
    return { ready: true, providerId: resolved.providerId, modelId: resolved.modelId, issue: null };
  } catch (error) {
    return { ready: false, providerId: registry.publicState().defaultModelSelection?.providerId ?? null, modelId: registry.publicState().defaultModelSelection?.modelId ?? null, issue: error.message || 'provider-unavailable' };
  }
}
function state() {
  const availability = modelAvailability();
  return { schemaVersion: 2, config: { ...config, configured: availability.ready }, modelAvailability: availability, tasks: engine.getTasks(), activeFile, bridgeConnected: Date.now() - lastBridgeSeen < 6000, requestedMode };
}
function writeClientState(res, client, payload) {
  if (client.closed) return;
  if (client.blocked) { client.pending = payload; return; }
  try {
    if (!res.write(payload)) {
      client.blocked = true;
      res.once('drain', () => {
        client.blocked = false;
        if (client.closed || !client.pending) return;
        const pending = client.pending;
        client.pending = null;
        writeClientState(res, client, pending);
      });
    }
  } catch { clients.delete(res); }
}
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const payload = `event: state\ndata: ${JSON.stringify(state())}\n\n`;
    for (const [res, client] of clients) writeClientState(res, client, payload);
  }, 60);
}

const app = express();
app.disable('x-powered-by');
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
app.use((req, res, next) => {
  if (!allowedHosts.has(req.headers.host)) return res.status(403).json({ error: 'Only local access is allowed.' });
  const origin = req.headers.origin;
  if (origin) {
    try { if (!allowedHosts.has(new URL(origin).host)) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' }); }
    catch { return res.status(403).json({ error: 'Invalid origin.' }); }
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${editorPort}`, ws: true, changeOrigin: false });
proxy.on('error', (_err, _req, res) => {
  if (res?.writeHead && !res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
  res?.end?.('Editor is starting or unavailable. Run npm run launch.');
});
app.use('/editor', (req, res) => proxy.web(req, res));
app.use(express.json({ limit: '256kb' }));
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.get('/api/health', (_req, res) => { const current = state(); res.json({ ok: true, model: current.modelAvailability.modelId || config.model, configured: current.modelAvailability.ready, editorEnabled: config.editorEnabled, bridgeConnected: current.bridgeConnected }); });
app.get('/api/state', (_req, res) => res.json(state()));
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const client = { blocked: false, pending: null, closed: false };
  clients.set(res, client);
  writeClientState(res, client, `event: state\ndata: ${JSON.stringify(state())}\n\n`);
  const heartbeat = setInterval(() => {
    if (!client.blocked) { try { res.write(': heartbeat\n\n'); } catch { clients.delete(res); } }
  }, 15000);
  req.on('close', () => { client.closed = true; clients.delete(res); clearInterval(heartbeat); });
});
app.get('/api/files', async (_req, res) => res.json(await engine.files.listFiles()));
app.get('/api/file', async (req, res) => res.json(await engine.files.readFile(req.query.path)));
app.post('/api/tasks', async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'A JSON task body is required.' });
  res.status(201).json(await engine.createTask(req.body));
});
app.post('/api/tasks/:id/messages', async (req, res) => res.json(await engine.continueTask(req.params.id, req.body?.content)));
app.post('/api/tasks/:id/answer', async (req, res) => res.json(await engine.answerTask(req.params.id, req.body?.answer)));
app.post('/api/tasks/:id/retry', async (req, res) => res.json(await engine.retryTask(req.params.id)));
app.post('/api/tasks/:id/stop', async (req, res) => res.json(await engine.stopTask(req.params.id)));
app.post('/api/tasks/:id/approval', async (req, res) => {
  if (typeof req.body.approved !== 'boolean') return res.status(400).json({ error: 'approved must be a boolean.' });
  res.json(await engine.approveTask(req.params.id, req.body.approved));
});
app.post('/api/tasks/:id/changes/:changeId', async (req, res) => res.json(await engine.resolveChange(req.params.id, req.params.changeId, req.body.action)));
app.get('/api/providers', (_req, res) => res.json({ ...registry.publicState(), modelAvailability: modelAvailability() }));
app.post('/api/providers', async (req, res) => {
  const { templateId, name, baseUrl, apiKey, modelIds, enabled } = req.body ?? {};
  await registry.createPersonalProvider({ templateId, name, baseUrl, apiKey, modelIds, enabled });
  broadcast();
  res.status(201).json(registry.publicState());
});
app.patch('/api/providers/:id', async (req, res) => {
  await registry.updatePersonalProvider(req.params.id, req.body ?? {});
  broadcast();
  res.json(registry.publicState());
});
app.delete('/api/providers/:id', async (req, res) => {
  await registry.deletePersonalProvider(req.params.id);
  broadcast();
  res.json(registry.publicState());
});
app.put('/api/providers/:id/apiKey', async (req, res) => {
  await registry.setApiKey(req.params.id, req.body?.apiKey);
  broadcast();
  res.json(registry.publicState());
});
app.post('/api/providers/:id/models', async (req, res) => {
  await registry.addPersonalModel(req.params.id, req.body?.modelId);
  broadcast();
  res.json(registry.publicState());
});
app.delete('/api/providers/:id/models/:modelId', async (req, res) => {
  await registry.deletePersonalModel(req.params.id, req.params.modelId);
  broadcast();
  res.json(registry.publicState());
});
app.post('/api/providers/:id/test', async (req, res) => {
  res.json(await registry.testConnectivity({ providerId: req.params.id, modelId: req.body?.modelId }, { streamChatCompletion }));
});
app.post('/api/settings/model', async (req, res) => {
  if (typeof req.body?.providerId !== 'string' || typeof req.body?.modelId !== 'string') return res.status(400).json({ error: 'providerId and modelId are required.' });
  await registry.setDefaultModelSelection(req.body);
  broadcast();
  res.json(registry.publicState());
});
app.post('/api/editor/open', async (req, res) => {
  const file = await engine.files.readFile(req.body.path);
  if (commandQueue.length >= 50) return res.status(503).json({ error: 'Editor command queue is full. Check the bridge connection.' });
  const command = { id: randomUUID(), type: 'open', path: file.path, createdAt: Date.now() };
  commandQueue.push(command);
  res.status(202).json({ id: command.id, queued: true });
});
app.get('/api/editor/commands/:id', (req, res) => res.json(acknowledgements.get(req.params.id) || { pending: true }));
app.use('/api/bridge', (req, res, next) => {
  const supplied = Buffer.from(String(req.headers['x-bridge-token'] || ''));
  const expected = Buffer.from(bridgeToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(403).json({ error: 'Bridge token required.' });
  lastBridgeSeen = Date.now();
  next();
});
app.get('/api/bridge/commands', (_req, res) => {
  const commands = commandQueue.splice(0).filter(c => Date.now() - c.createdAt < 60000);
  res.json({ commands });
});
app.post('/api/bridge/ack', (req, res) => {
  acknowledgements.set(req.body.id, { ok: req.body.ok === true, error: req.body.error || null });
  if (acknowledgements.size > 100) acknowledgements.delete(acknowledgements.keys().next().value);
  res.json({ ok: true });
});
app.post('/api/bridge/context', (req, res) => {
  activeFile = typeof req.body.path === 'string' && !req.body.path.startsWith('..') ? req.body.path : null;
  broadcast(); res.json({ ok: true });
});
app.post('/api/bridge/mode', (req, res) => {
  requestedMode = { mode: 'agents', at: Date.now() }; broadcast(); res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(root, 'dist'), {
  dotfiles: 'deny',
  setHeaders: (res, filePath) => {
    // Hashed assets cache forever; index.html must revalidate so users never run a stale bundle.
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
app.use((err, _req, res, _next) => {
  const key = process.env.AI_API_KEY;
  const message = String(err.message || 'Unexpected server error.');
  const secrets = [key, ...registry.secretValues()].filter(Boolean);
  const safeMessage = secrets.reduce((value, secret) => value.replaceAll(secret, '[redacted]'), message);
  res.status(err.status || err.statusCode || 500).json({ error: safeMessage, code: err.code || 'request-failed', retryable: Boolean(err.retryable) });
});
const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (!allowedHosts.has(req.headers.host) || (origin && ![...allowedHosts].some(h => origin === `http://${h}`))) return socket.destroy();
  if (req.url.startsWith('/editor/')) { req.url = req.url.slice('/editor'.length); proxy.ws(req, socket, head); }
  else socket.destroy();
});
server.listen(port, '127.0.0.1', () => console.log(`Cursor Workbench: http://127.0.0.1:${port}\nWorkspace: ${workspace}\nModel: ${config.model}`));
async function shutdown() {
  for (const task of engine.getTasks()) if (['running', 'waiting_approval'].includes(task.status)) await engine.stopTask(task.id);
  for (const [client] of clients) client.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
