# Stage 2 — Agents Window and model gate

Date: 2026-09-25.

- `npm run build` in WSL Node24 succeeded: Vite 7.3.6, 2003 transformed modules, production CSS/JS emitted.
- Server calls the supplied DeepSeek base URL and deepseek-flash. Initial minimal connectivity returned HTTP200 and `connection-ok`.
- `node scripts/smoke-live.mjs chat` passed through the full task API and persistence, not a mock provider (see live-chat.json).
- Browser loaded http://127.0.0.1:4317, populated actual persisted task sidebar and model configuration.
- Main agent filled “Describe a new task” with Chinese prompt, clicked actual Start agent control via DOM/CUA, observed new task and actual assistant reply “浏览器对话验证成功。” with Completed status.
- `02-agents-empty.png` and `02-agents-chat.png` inspected: 1280×720 dense desktop shell, shared Editor/Agents switch, sidebar, composer and details panel all rendered; no overlapping controls. Small empty-state scroll at 720px is contained to center pane, not page overflow.
- Credentials remained server-side. API state credential scan, origin rejection and traversal checks passed in http-security.json.

Result: real Agent conversation and Agents Window gate passed. Tool and mode-switch gates are recorded separately.
