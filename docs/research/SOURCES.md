# Research and provenance

Retrieved 2026-09-25. Firecrawl was explicitly requested but no Firecrawl tool, installed configuration or API key was available. Its official cloud search requires bearer credentials (https://github.com/mendableai/firecrawl). Public official-source WebFetch/curl research was used instead; no Firecrawl execution is claimed.

## Cursor 3 verified interaction facts
- https://cursor.com/blog/cursor-3 — launched 2026-04-02: agent-focused window across projects, retained IDE; sidebar local/cloud agents.
- https://cursor.com/docs/agent/agents-window — two windows can coexist; command palette Open Agents Window/Open IDE; file tree and per-agent artifacts.
- https://cursor.com/changelog/3-0 — Editor keeps code workflows and flexible splits; Agent Tabs.
- https://cursor.com/changelog/3-1 — tiled parallel-agent panes and persistent layout.
- https://cursor.com/changelog/3-4 — artifact tabs, tool activity density Compact/Balanced/Detailed.
- https://cursor.com/changelog/side-chat — side conversations with main context.

Core scope adopted: real editor, task sidebar, concurrent runs, separate histories, tool activity, changes review, terminal output/approval, switch to file in editor. Cloud execution, PR workflows, multi-repository projects, canvases, side chats and proprietary Cursor models are outside the requested core build.

## Visual evidence
`cursor-agents-reference.png` downloaded from https://cursor.com/docs-static/images/agent/file-agents-window-final.png (actual JPEG payload despite upstream png extension), inspected by the main agent: narrow conversation left, large file artifact/editor right, compact headers and integrated follow-up composer. This is a research reference only, not a shipping asset. Other verified official media:
- https://cursor.com/docs-static/images/agent/open-agents-window-final.png
- https://cursor.com/docs-static/images/agent/open-editor-window-final.png
- https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/changelog/redesigned-picker.png
- https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/blog/final-demo-agents-sidebar.mp4

## Context7 actually used
Public MCP endpoint https://mcp.context7.com/mcp successfully resolved and queried:
- `/websites/code_visualstudio_api`: activation, commands, webview messaging, VS Code API.
- `/websites/react_dev`: React effects/external subscription lifecycle.
- `/expressjs/express/v5.2.0`: Express async errors, static serving, wildcard routes.
Raw returned evidence is retained as `context7-*.sse`. Library IDs were resolved first. Documentation was read before implementation; examples are cross-checked rather than blindly copied.

## Open-source editor base
- https://github.com/microsoft/vscode — cloned at `vendor/vscode`, tag **1.138.0**, commit **7debcd0e2acdea1c52de81bf9ee1620444407dda**.
- https://github.com/coder/code-server/releases/tag/v4.138.0 — precompiled web distribution, Code 1.138.0, code-server commit `59c988c744a240b05b039f57b856a5312f19d5b1`.
- https://github.com/microsoft/vscode/wiki/How-to-Contribute
- https://github.com/microsoft/vscode/wiki/Selfhosting-on-Windows-WSL
- https://code.visualstudio.com/api/extension-guides/web-extensions — browser-only extension cannot launch native process; this build uses a server-backed extension host.
- https://code.visualstudio.com/api/extension-capabilities/overview#restrictions — normal extension APIs do not arbitrarily alter workbench DOM.

Local runtime uses the precompiled Code-OSS distribution to avoid a multi-gigabyte source compilation under low available memory. The project adds a real VS Code extension and full-stack shell, not a replacement Monaco imitation. It does not claim a source build or Microsoft Marketplace licensing.
