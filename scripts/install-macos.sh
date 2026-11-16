#!/bin/bash
set -euo pipefail
if [[ "$(uname)" != Darwin ]]; then echo 'macOS 전용 설치 스크립트입니다'; exit 1; fi
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]] || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
  echo 'Node.js 24 이상을 설치해 주세요: brew install node@24'; exit 1
fi
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Library/Application Support/musicQ"
AGENT_FILE="$HOME/Library/LaunchAgents/local.musicq.server.plist"
# Source checkouts build once; release archives already contain the control panel.
if [[ -d "$REPO_DIR/packages/web/src" ]]; then
  (cd "$REPO_DIR" && npm ci && npm run build)
fi
[[ -f "$REPO_DIR/packages/server/web/index.html" ]] || { echo '화면 빌드가 없습니다. 저장소에서 npm ci && npm run build를 실행하세요'; exit 1; }

mkdir -p "$APP_DIR/server" "$APP_DIR/data" "$APP_DIR/logs" "$(dirname "$AGENT_FILE")"
cp -R "$REPO_DIR/packages/server/src" "$APP_DIR/server/"
cp "$REPO_DIR/packages/server/package.json" "$APP_DIR/server/"
rm -rf "$APP_DIR/server/web"
cp -R "$REPO_DIR/packages/server/web" "$APP_DIR/server/web"
cp "$REPO_DIR/scripts/uninstall-macos.sh" "$APP_DIR/uninstall.sh"
chmod 700 "$APP_DIR/uninstall.sh"
npm install --prefix "$APP_DIR/server" --omit=dev --ignore-scripts
PYTHON_BIN="$(command -v python3.12 || command -v python3.11 || command -v python3 || true)"
if [[ ! -f "$APP_DIR/server.env" ]]; then
  cat > "$APP_DIR/server.env" <<ENV
MUSICQ_HOST=127.0.0.1
MUSICQ_PORT=4310
MUSICQ_DATA_DIR="$APP_DIR/data"
MUSICQ_PYTHON=$PYTHON_BIN
MUSICQ_DEVICE=cpu
ENV
  chmod 600 "$APP_DIR/server.env"
fi
export MUSICQ_INSTALL_NODE="$NODE_BIN" MUSICQ_INSTALL_DIR="$APP_DIR" MUSICQ_INSTALL_PLIST="$AGENT_FILE"
"${PYTHON_BIN:-python3}" - <<'PY'
import os, plistlib
from pathlib import Path
root = os.environ['MUSICQ_INSTALL_DIR']
config = {
 'Label': 'local.musicq.server',
 'ProgramArguments': [os.environ['MUSICQ_INSTALL_NODE'], '--env-file-if-exists='+root+'/server.env', root+'/server/src/index.mjs'],
 'WorkingDirectory': root+'/server', 'RunAtLoad': True, 'KeepAlive': True,
 'EnvironmentVariables': {'PATH': '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'},
 'StandardOutPath': root+'/logs/server.log', 'StandardErrorPath': root+'/logs/error.log',
}
with open(os.environ['MUSICQ_INSTALL_PLIST'], 'wb') as f:
 plistlib.dump(config, f)
PY
launchctl bootout "gui/$(id -u)/local.musicq.server" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_FILE"
echo "설치 완료 · http://127.0.0.1:4310"
echo "브라우저에서 http://127.0.0.1:4310 을 여세요"
echo "설정: $APP_DIR/server.env"
echo "로그: $APP_DIR/logs/server.log"
