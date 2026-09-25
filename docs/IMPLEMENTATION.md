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
{config:{model,baseUrl,configured,workspaceName,workspacePath,editorUrl},
 tasks:Task[],activeFile:string|null,bridgeConnected:boolean}
Task={id,title,prompt,status:'running'|'waiting_approval'|'completed'|'error'|'cancelled',createdAt,updatedAt,messages:[{id,role,content}],activities:[{id,type,tool,status,label,input,output,createdAt}],changes:[{id,path,before,after,status:'pending'|'accepted'|'reverted'}],approval:null|{id,command,cwd},error:string|null}
```
GET /api/state; GET /api/events sends `event: state` data with the state shape.
POST /api/tasks {prompt,mode:'agent'|'ask',title?}; POST /api/tasks/:id/messages {content}; POST /api/tasks/:id/stop; POST /api/tasks/:id/approval {approved:boolean}; POST /api/tasks/:id/changes/:changeId {action:'accept'|'revert'}.
GET /api/files (tree); GET /api/file?path=...; POST /api/editor/open {path}; GET /api/bridge/commands; POST /api/bridge/context {path}; GET /api/health.
Errors {error:string}. All mutating endpoints enforce same-origin (Origin checks), bind only to loopback, and reject secret/path traversal access. Editor proxy preserves WebSockets. Configuration response NEVER includes key. User-facing state never includes internal system/tool chat messages or credentials.

## Security / concurrency
File tools: list_files/read_file/search_files/write_file/replace_text. Reads max 128KB, reject binary and symlink escapes, exclude .env/.git/node_modules and private credential patterns. Edits carry expected content hash, lock writes per file, reject stale changes. Changes store before/after snapshots and conflict-aware revert. Task histories persist outside workspace; restart marks in-flight tasks interrupted. Max concurrent tasks four. Command execution requires explicit approval; timeout/output limit/cancellation; no key/provider environment in child process. This is local single-user software, not tenant isolation.

## Direction contract
THESIS: a task-oriented development cockpit with the genuine editor one click away; no marketing landing screen.
OWN-WORLD: Cursor/Code-OSS-like warm charcoal surfaces, neutral high-contrast text, quiet 1px dividers, small-radius controls, system UI type and monospace for code only. One restrained focus accent. Dense but legible.
STORY: choose an agent, see exactly what it is doing, inspect its changes, then jump to the edited file without losing conversation or editor state.
FIRST VIEWPORT: 48px shared title/mode bar, 250px task sidebar, flexible transcript/composer, optional 340px artifacts pane. New task has a centered concise prompt area with real capabilities and safety note; no fake activity or invented stats. Editor takes the entire body below the shared bar.
FORM: brief-pinned/no-roll competitor-like Operate surface; code-led implementation to meet the requested run-first stages, not a new visual identity exercise. No concept-roll seed or catalog QUALITY BAR card was produced. Cursor's official product references and the actual Code-OSS workbench are the visual evidence; this records the real process rather than fabricating a seed. Signature interaction: a changed path opens in the real editor while preserving the agent session.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
