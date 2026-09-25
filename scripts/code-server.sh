#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export CURSOR_WORKBENCH_URL="http://127.0.0.1:${PORT:-4317}"
export CURSOR_WORKBENCH_BRIDGE_TOKEN="$(cat "$ROOT/.state/bridge-token")"
# code-server gives PORT precedence over --bind-addr; it must not inherit the API port.
unset PORT
exec "$ROOT/.runtime/code-server-4.138.0-linux-amd64/bin/code-server" \
  --config "$ROOT/.state/code-server.yaml" \
  --bind-addr "127.0.0.1:${CODE_SERVER_PORT:-4318}" \
  --auth none --disable-telemetry --disable-update-check \
  --user-data-dir "$ROOT/.state/code" \
  --extensions-dir "$ROOT/.state/extensions" \
  --app-name "Cursor Workbench" \
  --welcome-text "Cursor Workbench" \
  --disable-workspace-trust \
  "${WORKSPACE_ROOT:-$ROOT/workspace}"
