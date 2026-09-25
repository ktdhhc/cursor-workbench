# Prompt-to-artifact completion audit

Audited against actual files, live API results, browser interactions, screenshots, test output and Git history on 2026-09-25. This is not a declaration that every original requirement is satisfied: the named Firecrawl method remains unavailable.

## Concrete deliverables
A runnable local full-stack Web coding tool based on actual open-source VS Code, with a manual Editor Window and task-first Agents Window; real specified model calls; autonomous workspace tools and command execution; concurrent agents; state-preserving mode switching; repeatable launch/tests; stage screenshots; meaningful Git commits.

| Explicit requirement | Artifact / actual evidence | Assessment |
|---|---|---|
| Clone https://github.com/microsoft/vscode | `vendor/vscode/.git`; origin rechecked; tag 1.138.0 commit `7debcd0e2acdea1c52de81bf9ee1620444407dda`; `UPSTREAM.json`; setup script reproduces clone | Verified clone |
| Develop on VS Code open source | Real Code-OSS 1.138.0 runtime via official code-server 4.138.0; real workspace extension `extension/extension.cjs`; browser screenshots show workbench, native editor and terminal | Verified integration; uses precompiled distribution, not a claimed local source compile/fork build |
| Research Cursor 3 Agents/Editor product design **with Firecrawl first** | `docs/research/SOURCES.md` official Cursor docs/blog/changelog; attributed screenshot visually inspected | Product research completed, **Firecrawl method not executed**: no tool/config/key available. Cloud API requires credential. Official public-source fallback disclosed |
| Use Context7 for current VS Code API and chosen framework docs | Actual public MCP responses `context7-vscode.sse`, `context7-react*.sse`, `context7-express*.sse`, library resolution and query sequence | Verified real Context7 queries before implementation |
| Full-stack Web AI tool | React/Vite client + Express `server/index.mjs` + actual model/tool engine + filesystem + persisted task store + WebSocket editor proxy | Built and running on local 4317/4318 |
| Editor file tree | Native Explorer in 01-editor.png; browser expanded src and opened files matching disk | Verified |
| Multiple editor tabs | Browser opened hello.js and package.json together; 01-editor.png | Verified |
| Syntax highlighting | Real JavaScript token colors/line numbers in 01-editor.png and final-editor.png | Visually verified |
| Browse and manually edit code | Browser typed editorVerified constant, Ctrl+S; disk confirmed; workspace tests pass | Verified actual browser edit/save |
| Agent-first workbench UI | New-task composer, task sidebar, status, conversation, Changes/Activity panels; 02-agents*.png/final-desktop.png | Visually and interactively verified |
| Start AI Agent task/basic conversation | Browser entered Chinese task, clicked Start, actual DeepSeek reply + Completed; live-chat.json | Verified, no mock |
| Specified OpenAI-compatible base URL/model/key | Server uses ignored `.env`; live HTTP200 deepseek-flash, persisted true provider responses; no key returned to frontend | Verified configuration and live provider |
| Agent autonomously reads files | Real model list_files/read_file in live-tools.json/browser-tools.json | Verified |
| Agent modifies/creates files | Real model write_file and replace_text, hashes and disk values confirmed | Verified |
| Agent executes terminal commands | Model requested exact node --test, paused for approval, executed with exit0 and captured output | Verified; explicit safety approval, not unattended arbitrary host execution |
| Multiple agents in parallel | live-parallel.json: two actual tasks simultaneously running, isolated histories/replies; engine max4 tests | Verified |
| Switch Editor/Agents | Shared controls, Ctrl+Shift+E both directions, VSCode Agents statusbar bridge; 04-integration.md | Verified |
| Preserve state between modes | Unsaved browser draft survived both switches, then undo cleared dirty state; iframe stays mounted | Verified |
| Open changed file in Editor | Browser Open in editor → extension queue/ack → actual tab with changed content, 04-editor-integrated.png | Verified |
| Loop Engineering order / self-verification | Stage1 editor running before UI acceptance; stage2 chat; stage3 tools; stage4 switch; per-stage evidence MD/PNG/JSON; actual defects fixed and retested | Verified staged integration; backend/frontend code authored partly in parallel |
| Screenshot check each stage and autonomously fix issues | 01-editor,02-agents-chat,03-tools,04-editor-integrated,04-mobile; long-transcript offset fixed; final status label/contrast fixes | Verified. Formal visual-review process caveat below |
| User: subagents cannot use browser | Main performed every browser action/screenshot; agents did source/docs/modules/tests/saved-image review only | Honored |
| User: initialize Git and commit appropriate milestones | Feature branch `feat/cursor-workbench`; 512e22e editor foundation; da6f5ef real agents; later fix/acceptance commits in git log | Verified; no remote push requested/performed |

## Additional evidence and coverage boundaries
- `tests-final.log`: **32 passed, 0 failed** in WSL Node24; production build succeeded. Includes real engine/file/provider unit behavior, cancel/recovery/approval/limits/conflicts and targeted integration/UI invariants. It is **not** treated as proof of visual or live-provider requirements on its own.
- `cold-start.json`: both separate ports return200, real extension bridge connected, nine previous tasks restored. An actual cold-start PORT collision was found and fixed in scripts/code-server.sh, then cold launch succeeded.
- `final-editor.png`: native integrated terminal actually ran node --test, 2 workspace tests passed. Those 2 tests cover only the example project, not the application.
- `http-security.json`: traversal/secrets/origin/bridge restrictions; Git ignored credential/state files rechecked.
- `FINAL-REVIEW.md`: independent reviewer resolved both UI findings. Formal disposition remains **fix** solely for absent concept-roll provenance; the actual process is truthfully documented as brief-pinned/no-roll. Do not call this whole-surface approval or invent a seed.

## Remaining mismatch / scope limits
1. **Firecrawl requested method remains unmet and blocked on available credentials/tool access.** Research content used official sources instead. No fabricated Firecrawl result.
2. Actual VS Code source is cloned, but runtime is the version-aligned official precompiled Code-OSS distribution with a custom extension/shell. No full upstream compilation or invasive core-workbench fork is claimed.
3. Local single-user tool only. Approved terminal commands are host processes, not isolated VMs. Parallel tasks share a workspace with hash conflicts, not per-agent worktrees. No cloud agents/PR hosting/paid Cursor models/team service.
4. Formal concept-roll artifact absent; user-pinned competitor replication was followed. This is disclosed separately from the functional request.

The implementation requirements have concrete evidence; the unavailable named research method must not be silently marked complete.
