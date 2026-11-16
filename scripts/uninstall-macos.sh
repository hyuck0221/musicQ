#!/bin/bash
set -euo pipefail
launchctl bootout "gui/$(id -u)/local.musicq.server" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/local.musicq.server.plist"
echo "자동 실행을 해제했습니다. 음악·모델·설정은 ~/Library/Application Support/musicQ 에 보존됩니다"
