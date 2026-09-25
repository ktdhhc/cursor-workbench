# Implementation contract

## Four executable gates
1. **Editor skeleton** — run genuine Code-OSS, open two files from Explorer, edit/save text, inspect syntax highlighting and take a screenshot.
2. **Agents and model** — agent-first shell, new task and persisted conversation, real streamed deepseek-flash response, visible failure recovery, screenshot.
3. **Tools** — autonomous list/read/search/write/replace loop; server-side safe paths and optimistic conflicts; terminal command approval/execution/output; change review/revert; tests and live model task evidence.
4. **Integration** — persistent Editor/Agents mode switch, open changed file through VS Code extension, parallel agents without cross-task message contamination, keyboard access/responsive check, screenshot and requirement audit.

## Architecture
`http://127.0.0.1:4317` → Express API + static React shell + /editor reverse proxy → code-server on loopback 4318. Both services run in WSL and operate on the same configured workspace. The shell keeps the editor iframe mounted between mode switches. A Node extension inside Code-OSS polls a narrow command queue to open files and publishes active editor state. Code-server is the open-source web distribution; vendor/vscode is the pinned upstream reference/source base. Never claim a full source build occurred unless it actually did.

## API contract
All API payloads are JSON, except GET /api/events (SSE). State shape:
```
{schemaVersion:2,config:{model,baseUrl,configured,workspaceName,workspacePath,editorUrl},
 modelAvailability:{ready,providerId,modelId,issue},
 tasks:Task[],activeFile:string|null,bridgeConnected:boolean,requestedMode}
Task={id,title,prompt,status:'running'|'waiting_approval'|'waiting_input'|'completed'|'error'|'cancelled',createdAt,updatedAt,
 messages:[{id,role,content,createdAt}],activities:[{id,type,tool,status,label,input,output,createdAt,completedAt}],
 changes:[{id,path,before,after,status:'pending'|'accepted'|'reverted',createdAt}],todos:[{id,content,status}],
 verification:{status:'not-run'|'running'|'passed'|'failed'|'blocked',summary?,checks:[{id,command,status,exitCode,startedAt,completedAt}]},
 plan:{content,status,createdAt}|null,approval:{id,type:'command'|'edit'|'plan',title,description,risk,command,cwd,path,preview,plan?}|null,
 interaction:{id,type:'question',question,options,multiSelect}|null,
 providerId,model,runConfig:{mode:'agent'|'ask'|'plan'|'debug',permissionMode:'build'|'edit'|'yolo',planEnabled,
   modelSelection:{providerId,modelId,options:{reasoningLevel}}},context:{estimatedBytes,limitBytes,compacted},error}
```
GET /api/state; GET /api/events sends `event: state` with the state shape (SSE writes apply backpressure per client instead of closing slow connections).
POST /api/tasks {prompt,runConfig?,title?} freezes the task's mode/permission/model/reasoning at creation; POST /api/tasks/:id/messages {content}; POST /api/tasks/:id/answer {answer} resolves a waiting_input question; POST /api/tasks/:id/retry (system recovery event, never a fabricated user message); POST /api/tasks/:id/stop; POST /api/tasks/:id/approval {approved:boolean}; POST /api/tasks/:id/changes/:changeId {action:'accept'|'revert'}.
GET /api/providers returns provider/model capability state incl. `models:[{id,reasoningLevels,defaultReasoningLevel}]` and `modelAvailability`; credentials never leave the server. POST /api/settings/model {providerId,modelId}; provider CRUD under /api/providers.
GET /api/files (tree); GET /api/file?path=...; POST /api/editor/open {path}; POST /api/editor/theme {theme:'dark'|'light'} (maps to Dark/Light Modern and queues a bridge command; the extension applies it live and idempotently, together with matching chrome colorCustomizations, so the editor window follows the workbench theme toggle); GET /api/bridge/commands; POST /api/bridge/context {path}; GET /api/health.
Errors {error:string,code,retryable}. All mutating endpoints enforce same-origin (Origin checks), bind only to loopback, and reject secret/path traversal access. Editor proxy preserves WebSockets. Configuration and state responses NEVER include keys; explicit unknown providerId 404s without fallback, model membership is validated (400), disabled/keyless providers 409.

## Agent execution model
Four work presets map to orthogonal config, not one enum: `mode` agent/ask/plan/debug (ask+plan are read-only; plan ends with a submit_plan approval that flips the task to agent), `permissionMode` build (approve every edit/command)/edit (auto file edits, commands ask)/yolo (auto-approve ordinary actions; hard safety checks still apply), and task-local `reasoningLevel` (default/low/medium/high) validated against each model's declared capabilities. The provider layer converts a level into a per-provider request patch (OpenAI `reasoning_effort`, OpenRouter `reasoning.effort`) and refuses to blanket-send reasoning fields to every endpoint; patches cannot override model/messages/tools/stream and fail closed on unsafe JSON.
Tools declare capabilities (readOnly/sideEffect/risk/needsApproval); permission decisions are derived server-side per task, never by the UI. Engine extras: find_files (substring/wildcard) and delete_file (hash-verified), update_todos checklist, ask_user blocking question (status waiting_input, answered via /answer), report_verification (failed/blocked with evidence), same-tool repetition guard (3 attempts), 200 tool-call budget, and automatic verification reminder: after code changes with no verification evidence the model gets one nudge to run checks, then verification is marked blocked instead of silently "completed". Verification commands (npm test/lint/build, node --test, pytest, cargo test…) record structured checks. Command output streams stdout/stderr separately. Retry is a dedicated endpoint recording a system recovery event.

## Security / concurrency
File tools: list_files/find_files/read_file/search_files/write_file/replace_text/delete_file. Reads max 128KB, reject binary and symlink escapes, exclude .env/.git/node_modules and private credential patterns. Edits carry expected content hash, lock writes per file, reject stale changes. Changes store before/after snapshots and conflict-aware revert. All configured provider keys (env + personal registry) are protected dynamically: file reads/writes/searches that would expose any current key are rejected (403), and keys are redacted in streams, persisted task history and API errors. Task histories persist outside workspace; restart marks in-flight tasks interrupted and repairs tool history. Max concurrent tasks four. Command execution follows the task permission level; timeout/output limit/cancellation; no key/provider environment in child process. This is local single-user software, not tenant isolation.

## Direction contract
THESIS: a task-oriented development cockpit with the genuine editor one click away; no marketing landing screen.
OWN-WORLD: Cursor/Code-OSS-like warm charcoal surfaces, neutral high-contrast text, quiet 1px dividers, small-radius controls, system UI type and monospace for code only. One restrained focus accent. Dense but legible.
STORY: choose an agent, see exactly what it is doing, inspect its changes, then jump to the edited file without losing conversation or editor state.
FIRST VIEWPORT: 48px shared title/mode bar, 250px task sidebar, flexible transcript/composer, optional 340px artifacts pane. New task has a centered concise prompt area with real capabilities and safety note; no fake activity or invented stats. Editor takes the entire body below the shared bar.
FORM: brief-pinned/no-roll competitor-like Operate surface; code-led implementation to meet the requested run-first stages, not a new visual identity exercise. No concept-roll seed or catalog QUALITY BAR card was produced. Cursor's official product references and the actual Code-OSS workbench are the visual evidence; this records the real process rather than fabricating a seed. Signature interaction: a changed path opens in the real editor while preserving the agent session.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
