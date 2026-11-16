#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  '') ;;
  --help|-h)
    echo 'musicQ macOS 설치: curl -fsSL https://raw.githubusercontent.com/hyuck0221/musicQ/master/install.sh | bash'
    exit 0
    ;;
  *) echo '지원하지 않는 옵션입니다. --help를 확인하세요'; exit 2 ;;
esac

[[ "$(uname)" == Darwin ]] || { echo 'macOS 전용 설치입니다. 다른 운영체제는 README의 Docker 설치를 사용하세요'; exit 1; }
for command in curl tar node npm; do
  command -v "$command" >/dev/null || { echo "$command 명령이 필요합니다. Node.js 24 이상과 npm을 먼저 설치하세요"; exit 1; }
done
[[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 24 ]] || { echo 'Node.js 24 이상이 필요합니다: brew install node@24'; exit 1; }
if ! command -v python3 >/dev/null && ! command -v python3.12 >/dev/null && ! command -v python3.11 >/dev/null; then
  echo 'Python을 먼저 설치하세요: brew install python@3.12'
  exit 1
fi

INSTALL_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/musicq-github.XXXXXXXX")"
trap 'rm -rf "$INSTALL_TEMP"' EXIT
mkdir "$INSTALL_TEMP/source"
echo 'GitHub에서 musicQ를 내려받습니다'
curl --fail --silent --show-error --location --retry 3 \
  https://codeload.github.com/hyuck0221/musicQ/tar.gz/refs/heads/master \
  --output "$INSTALL_TEMP/source.tar.gz"
tar -xzf "$INSTALL_TEMP/source.tar.gz" --strip-components=1 -C "$INSTALL_TEMP/source"
[[ -f "$INSTALL_TEMP/source/scripts/install-macos.sh" ]] || { echo '설치 파일을 찾을 수 없습니다'; exit 1; }
bash "$INSTALL_TEMP/source/scripts/install-macos.sh"
