# Stage 5 — Windows out-of-box portability gate

Date: 2026-09-25. Goal: a Windows user without WSL can clone, install, configure a key and run the app with Agents fully working, with a clear path to enable the editor later.

## Changes
- Portability: removed the pinned nvm Node path and the hardcoded `Ubuntu` distro from setup/launch. `scripts/wsl-node.sh` resolves the newest Node ≥22 inside WSL; the distro auto-detects (`wsl -l -q`) and can be overridden with `CURSOR_WORKBENCH_WSL_DISTRO`; `CURSOR_WORKBENCH_NATIVE=1` forces the native Windows path. code-server.sh no longer needs host Node (it bundles its own runtime).
- Agents-only mode: `server/index.mjs` exposes `config.editorEnabled`/`editorUrl` only when `EDITOR_ENABLED=1` (set automatically by `npm run launch` when an editor runtime actually runs). `npm start` is Agents-only on every platform. `launch.mjs` gains a native Windows branch (build + server + Agents-only notice) when WSL is absent.
- Editor-disabled UX: clicking Editor Window (or Ctrl+Shift+E) opens a full guidance page with the three enable paths (WSL / native source build / Linux+macOS) instead of a dead error. First implementation disabled the button and showed a transient notice; replaced after browser review because the richer guidance panel was then unreachable.
- Tiered setup: on Windows without WSL, `npm run setup` skips the VS Code clone and the code-server download entirely. macOS assets (darwin-x64/arm64) are mapped in addition to Linux.
- `npm run doctor`: environment self-check (Node, platform, .env/key/model, editor runtime, upstream source, build, WSL distros, running server).
- Cross-platform build hygiene: launchers build only when client sources are newer than `dist/`, and auto-install the current platform's missing rollup/esbuild native optional deps (npm prunes the other platform's optional deps on install — npm/cli#4828). Also `index.html` is served `no-cache` so users never run a stale bundle; hashed assets keep long caching.

## Real defect found by native verification (and fixed)
The first native launch refused to start: persisted task history recorded the WSL workspace path `/mnt/c/...` while the native server resolved `C:\...` for the same physical directory. The engine treated it as a different workspace (safe, but a false conflict for anyone switching between WSL and native). `sameWorkspacePath` now normalizes `/mnt/<drive>/` ↔ `<drive>:\` (case/trailing-slash tolerant) before comparing; a regression test covers equivalence and non-equivalence.

## Verification (all real, no mocks)
- Windows Node 24: `npm install` (adds win32 optional deps), full `npm test` — **37 passed, 0 failed** (includes the new portability, opt-in editor, doctor, guidance and workspace-path tests). `npm run build` succeeded natively.
- `npm run doctor` on Windows: reports editor runtime absent, WSL present, key set — see doctor-windows.txt.
- Native Agents-only launch via `CURSOR_WORKBENCH_NATIVE=1 npm run launch`: server on 4317 with `editorEnabled:false`, `editorUrl:null`, all prior tasks restored; `05-agents-only.png` shows the shell with disabled-looking nothing — Editor button clickable, guidance page rendered (`05-editor-guidance.png`).
- Real-model smokes against the native server: `smoke-live chat` and `smoke-live tools` both passed, including the tool loop with command approval executed through Windows `cmd.exe` (smoke-native-windows.log).
- WSL regression: `node scripts/launch.mjs` auto-detected Ubuntu, skipped the up-to-date build, restarted editor (4318) + server (4317) with `editorEnabled:true`; browser confirmed the genuine editor, file tree, tabs, syntax highlighting and native terminal again (`05-wsl-restored.png`). Tests re-run in WSL: 0 failures.

## Remaining platform notes
- The native Windows path was verified on this machine; other Windows versions/defender configurations may need Build Tools only for the optional native editor build, never for Agents-only mode.
- macOS path is wired (official darwin assets) but not executed on this machine — documented as such in README.
