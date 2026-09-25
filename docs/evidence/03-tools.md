# Stage 3 — files and terminal gate

Date: 2026-09-25.

## Real model actions
- `scripts/smoke-live.mjs tools` used deepseek-flash, not fixtures. It listed files, read source, wrote `src/agent-verification.js`, requested exact `node --test`, paused, ran only after approval, observed exit 0 and reported two passing tests. Final hardened-engine rerun also passed after server restart; see live-tools.json.
- Main browser selected the task and sent a follow-up to change `42` to `43`. The model read the file, called replace_text with actual hash, re-read, and entered waiting_approval. Main clicked visible Allow command for `node --test`. Task completed; actual disk change and command exit were verified. Full public transcript/activity in browser-tools.json.
- Main browser clicked Revert on the latest change, saw confirmation, confirmed, and server/disk inspection proved content returned to 42. Main accepted the original new-file change; later live reruns may add a new pending test change, which remains honestly visible.

## Defect found and repaired
The first long-transcript/approval screenshot exposed the outer `overflow:hidden` workspace being programmatically scrolled, moving panels above the viewport. Corrected outer workspace to `overflow:clip` and positioned Editor/Agents surfaces inside it. Rebuilt, refreshed and verified parent scrollTop=0, surface top=48, height=672 at 1280×720. Corrected screenshot: 03-tools.png. The defective screenshot was not used as passing evidence.

## Automated coverage
`npm test` in WSL Node24: 29 passed, 0 failed. tests-linux.log lists individual cases. Coverage includes streamed tool-call assembly, read/write conflicts, protected paths/symlinks/binary/size limits, command approve/reject/timeout/output cap/process kill, Ask isolation, max four concurrent tasks, cancellation/resume, persistence/restart repair, credential redaction and streaming-prefix protection.

The workspace’s two greeting tests do not prove the workbench itself; the workbench’s 29 unit/integration tests and real end-to-end evidence are separate.
