# Stage 4 — dual-window integration gate

Date: 2026-09-25.

- Browser clicked Open in editor on the actual `src/agent-verification.js` change. Shared mode changed to Editor Window; real extension acknowledged opening the file, the Code-OSS tab appeared, and rendered syntax-highlighted code contained `agentVerified = 43`. Screenshot 04-editor-integrated.png.
- In editor, Ctrl+Shift+E switched to Agents; the same shortcut restored Editor. Both aria-pressed states observed.
- Typed a temporary `// window-switch-draft` without saving, observed “1 unsaved file”, switched to Agents and back, and observed the same dirty buffer. Ctrl+Z removed the temporary draft and cleared dirty state. The iframe was not remounted during mode switches.
- Server restarted gracefully after verifying its PID/cwd. Documented `node scripts/launch.mjs` from Windows built React in WSL, reused only the existing code-server and started the backend. Existing tasks and messages were restored. The browser’s SSE reconnected.
- Re-ran actual chat and two concurrent Agent calls on the final backend. live-parallel.json proves both tasks simultaneously had running state and isolated A/B responses. No mock fallback.
- At 390×844, screenshots confirmed a legible full-width conversation/composer with hidden side panels, no page horizontal overflow. Task drawer opened through its visible button and Escape closed the dialog. Screenshot 04-mobile.png.
- Restored 1440×900 and measured Agents surface top=48 and document horizontal overflow=false.

## Final cold-start and native terminal check
After pause stopped both services, the launcher initially failed because the API PORT environment variable overrode code-server's --bind-addr. scripts/code-server.sh now consumes the API port for bridge URL then unsets PORT before exec. Both services subsequently cold-started on separate ports; cold-start.json confirms API/editor HTTP200, connected bridge and nine restored tasks. A regression test was added.

Main browser opened the native Terminal panel, entered node --test and pressed Enter. final-editor.png shows two actual workspace tests passed. Clicking the VS Code Agents status-bar button then switched the outer shell back to Agents, proving the extension-to-shell direction too.

This local app supports parallel tasks sharing one workspace with optimistic file conflicts. It does not claim independent cloud machines, git worktree isolation, or tiled simultaneous conversation panes.
