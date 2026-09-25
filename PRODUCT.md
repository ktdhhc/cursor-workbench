# Cursor Workbench

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Implementation decision under the user's continuous-execution request: real VS Code / Code-OSS workbench hosted by code-server in WSL, React + Vite app shell, Express Node server, a local VS Code extension bridge. Upstream Microsoft VS Code source is cloned at vendor/vscode. The runnable editor uses code-server's prebuilt distribution rather than claiming to have compiled the whole upstream checkout. Node 24 is available in WSL.

## Users
Developers using a local browser to manually edit a project or delegate development work to AI agents.

## Product Purpose
Reproduce Cursor's core Editor Window and Agents Window experience with actual code editing, persisted agent tasks, OpenAI-compatible model calls, workspace file tools, command execution, parallel tasks, and fast switching between modes.

## Operating Context
Local single-user development on this Windows + WSL machine. Existing projects and services are outside scope. The default sandbox/demo project is a dedicated workspace directory. API credentials remain server-side in an ignored environment file. No public deployment, cloud agents, billing, team authentication, or Microsoft/Cursor marketplace entitlement is claimed.

## Capabilities and Constraints
- Editor: real VS Code file explorer, tabs, syntax highlighting, manual edit/save and integrated terminal.
- Agents: create and continue tasks; concurrent runs; streamed responses/tool activity; file reads/writes; command output; stop; changes review and conflict-aware undo.
- Same workspace visible in both windows; preserve editor state when switching.
- Given DeepSeek base URL/model configuration is preserved and must be live-tested.
- User explicitly requires iterative run/screenshot/check/fix gates.
- Browser interaction and screenshots belong to the main agent; subagents cannot use browser tools.
- Terminal commands execute on the local WSL host, not a security sandbox. Approval is required before arbitrary command execution. File tools are constrained to the workspace and exclude secrets.
- Firecrawl is not configured and no API key was found. Public official-source lookup is the documented research fallback, not a claimed Firecrawl run.
- Context7 is queried through its public MCP endpoint; raw query evidence is retained in docs/research.

## Brand Commitments
Cursor-like dense desktop developer workflow is explicitly requested. This is an independent local implementation, not the proprietary Cursor application. Do not use Cursor branding to imply affiliation.

## Product Principles
1. Real workbench and real tools, not simulated success.
2. Preserve edits and surface conflicts instead of silently overwriting.
3. Make task state, errors, command approval and changes visible.
4. Keep credentials out of client assets, logs and source control.
