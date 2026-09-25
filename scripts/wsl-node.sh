#!/usr/bin/env bash
# Print the path of the newest available Node.js >= 22 inside WSL.
# Non-login WSL shells do not source nvm, so a plain `node` may be missing or old.
set -u
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "${major:-0}" -ge 22 ]; then command -v node; exit 0; fi
fi
for candidate in $(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -rV); do
  [ -x "$candidate" ] || continue
  major=$("$candidate" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  if [ "${major:-0}" -ge 22 ]; then echo "$candidate"; exit 0; fi
done
echo "Node.js >= 22 was not found inside WSL. Install it in the distro (e.g. via nvm), or set CURSOR_WORKBENCH_WSL_DISTRO to a distro that has it." >&2
exit 1
