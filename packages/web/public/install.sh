#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${MUSICQ_DOWNLOAD_BASE:-https://musicQ.hshim.dev}"
MODE=install
DESTINATION=
case "${1:-}" in
  '') ;;
  --download-only)
    [[ $# -eq 2 ]] || { echo '사용법: bash install.sh --download-only <새 폴더>'; exit 2; }
    MODE=download
    DESTINATION="$2"
    [[ ! -e "$DESTINATION" ]] || { echo '대상 폴더가 이미 존재합니다'; exit 1; }
    ;;
  --help|-h)
    echo 'macOS 설치: bash install.sh'
    echo '서버 파일만 받기: bash install.sh --download-only <새 폴더>'
    exit 0
    ;;
  *) echo '지원하지 않는 옵션입니다. --help를 확인하세요'; exit 2 ;;
esac
if [[ "$MODE" == install && "$(uname)" != Darwin ]]; then
  echo '자동 설치는 macOS 전용입니다. --download-only로 받은 뒤 Docker로 실행하세요'
  exit 1
fi
for command in curl tar shasum; do
  command -v "$command" >/dev/null || { echo "$command 명령이 필요합니다"; exit 1; }
done
if [[ "$MODE" == install ]]; then
  command -v node >/dev/null && command -v npm >/dev/null || { echo 'Node.js 24 이상과 npm을 먼저 설치하세요'; exit 1; }
  [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 24 ]] || { echo 'Node.js 24 이상이 필요합니다'; exit 1; }
fi
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/musicq-install.XXXXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
ARCHIVE="$TEMP_DIR/musicq-server.tar.gz"
echo 'musicQ 서버 다운로드'
curl --fail --silent --show-error --location --retry 3 "$BASE_URL/downloads/musicq-server.tar.gz" --output "$ARCHIVE"
curl --fail --silent --show-error --location --retry 3 "$BASE_URL/downloads/musicq-server.tar.gz.sha256" --output "$ARCHIVE.sha256"
read -r EXPECTED _ < "$ARCHIVE.sha256"
[[ "$EXPECTED" =~ ^[a-f0-9]{64}$ ]] || { echo '체크섬 형식이 올바르지 않습니다'; exit 1; }
ACTUAL="$(shasum -a 256 "$ARCHIVE")"
[[ "${ACTUAL%% *}" == "$EXPECTED" ]] || { echo '다운로드 검증에 실패했습니다. 잠시 후 다시 시도하세요'; exit 1; }
# Only the expected top-level folder may be extracted.
tar -tzf "$ARCHIVE" > "$TEMP_DIR/entries"
while IFS= read -r entry; do
  [[ "$entry" == musicq-server/* && "$entry" != *'/../'* && "$entry" != *'/./'* ]] || { echo '서버 패키지 경로가 올바르지 않습니다'; exit 1; }
done < "$TEMP_DIR/entries"
tar -xzf "$ARCHIVE" -C "$TEMP_DIR"
if [[ "$MODE" == download ]]; then
  mkdir -p "$(dirname "$DESTINATION")"
  mv "$TEMP_DIR/musicq-server" "$DESTINATION"
  echo "다운로드 완료: $DESTINATION"
else
  bash "$TEMP_DIR/musicq-server/scripts/install-macos.sh"
fi
