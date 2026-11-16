# 설치·운영 가이드

[README로 돌아가기](../README.md)

서버 PC가 웹 화면·API·WebSocket·음악 파일을 같은 포트에서 제공합니다. 브라우저는 접속한 서버를 자동으로 사용합니다. 별도 웹 배포나 연결 키는 필요하지 않습니다.

| 패키지 | 역할 |
| --- | --- |
| `packages/server` | 모델 설치·추론, 큐, SQLite, WAV 저장·전송, 프론트 제공 |
| `packages/web` | 서버에 포함되는 React / Vite 컨트롤 패널 |

## 직접 실행

Node.js **24 이상**, npm이 필요합니다. 모델 설치에는 Python **3.11–3.12**를 권장합니다.

```sh
git clone https://github.com/hyuck0221/musicQ.git
cd musicQ
npm ci
cp .env.example .env
npm run build
npm start
```

[http://127.0.0.1:4310](http://127.0.0.1:4310)을 열면 스튜디오가 바로 표시됩니다. `npm run build`는 프론트를 빌드해 `packages/server/web/`에 복사합니다. 서버 데이터는 `.musicq/`에 보존됩니다.

브라우저에는 생성 폼만 저장하며, 서버 주소·연결 키는 저장하지 않습니다. 이전 버전의 연결 정보는 새 화면에서 정리합니다. 연결이 끊기면 자동으로 재시도합니다.

테스트 신시사이저는 AI 모델 없이 생성·재생을 확인하는 용도입니다. 실제 음악 모델은 **모델** 화면에서 설치하세요.

## 모델

웹의 **모델**에서 ACE-Step 1.5 Turbo / XL Turbo / XL SFT, Stable Audio 3 Medium / Small Music, MusicGen Small / Medium / Large를 설치·취소·삭제할 수 있습니다. 설치된 음악 생성 모델만 새 음악의 모델 선택에 나타납니다. 설치는 서버의 격리된 Python venv에서 런타임과 Hugging Face 가중치를 내려받습니다. 첫 설치는 네트워크·저장 공간·메모리를 사용하며 수 분 이상 걸릴 수 있습니다. 가중치 용량 외에 PyTorch 실행 환경의 공간도 필요합니다.

- Python 3.14 / Transformers 4.57의 설정 클래스 상속 문제를 피하기 위해 MusicGen 로더는 전체 `MusicgenConfig`를 명시합니다. 기존 모델 가중치를 다시 설치할 필요가 없습니다.
- MusicGen 생성 길이: 5–30초, 슬라이더로 1초 단위 조절. 순차 추론으로 모델 하나가 한 번에 실행됩니다.
- 기본 추론 장치: CPU. `.env`의 `MUSICQ_DEVICE=mps` 또는 `cuda`로 변경 가능하며 장치·연산 호환성에 따라 실패할 수 있습니다. Apple Silicon에서는 macOS 직접 실행을 권장합니다. Docker 구성은 CPU 실행입니다.
- Python 선택: `MUSICQ_PYTHON=/opt/homebrew/bin/python3.12`.
- MusicGen 가중치는 **CC-BY-NC 4.0**입니다. 상업적 사용은 해당 모델 라이선스를 확인해야 합니다.
- 간편 설정은 영어 프롬프트로 변환합니다. 직접 입력한 프롬프트는 그대로 전달하므로 MusicGen에서는 영어가 권장됩니다.
- MusicGen은 instrumental 모델입니다. 보컬 허용·정확한 BPM·느낌 점수는 프롬프트 조건이며 모델이 그대로 구현함을 보장하지 않습니다.
- 설치 중 서버가 종료되면 실패 상태로 복구하며 다시 설치할 수 있습니다. 취소된 다운로드 조각은 재설치에 재사용할 수 있고, 삭제로 제거할 수 있습니다.
- 모델이 대기/생성 중인 큐에서 사용되고 있으면 삭제할 수 없습니다.

관리형 모델 외의 다른 여러 로컬 모델은 서버의 `MUSICQ_MODELS_FILE`과 [명령 어댑터](model-adapter.md)를 통해 등록합니다. 브라우저가 임의의 명령어나 저장소를 서버에 실행시키는 기능은 제공하지 않습니다.

### 최신 모델 런타임

| 모델 | 구성 | musicQ 길이 | 실행 환경 |
| --- | --- | --- | --- |
| ACE-Step 1.5 XL Turbo | DiT 4B + LM 4B, 8 steps | 10–300초 | 전용 ACE-Step Python 환경 |
| ACE-Step 1.5 XL SFT | DiT 4B + LM 4B, 50 steps | 10–300초 | 전용 ACE-Step Python 환경 |
| ACE-Step 1.5 Turbo | DiT 2B + LM 1.7B | 10–300초 | 전용 ACE-Step Python 환경 |
| Stable Audio 3 Medium | 1.4B, CUDA 권장 | 5–300초 | 전용 Stable Audio 3 Python 환경 |
| Stable Audio 3 Small Music | 433M, 음악 전용 | 5–120초 | 전용 Stable Audio 3 Python 환경 |

ACE-Step XL은 기존 MusicGen보다 큰 DiT와 계획 LM을 함께 사용합니다. 공식 XL 안내의 GPU 기준은 DiT에 INT8 양자화와 offload를 함께 적용하면 12 GB VRAM, offload만 적용하면 16 GB, offload 없이 20 GB 이상입니다. XL과 4B LM을 함께 사용하는 공식 권장은 24 GB 이상이며, musicQ가 함께 사용하는 4B LM과 CPU/MPS의 float32 실행은 추가 메모리를 사용합니다. 실제 가용 메모리와 생성 길이에 따라 메모리 부족이 발생할 수 있습니다. CPU는 매우 느릴 수 있습니다. `MUSICQ_DEVICE`를 서버 하드웨어에 맞게 설정하세요.

신규 모델은 `models/runtimes/<family>/source/.venv`에 공식 소스·lockfile 기반으로 설치합니다. 공식 코드 리비전은 카탈로그에 고정되어 있습니다. MusicGen의 기존 venv와 분리하여 Transformers 4/5 충돌을 방지합니다. 설치에는 Python 3.11–3.12를 사용하세요. Docker에서도 Python이 준비되어 있으며, Linux ACE-Step 공식 lockfile은 큰 CUDA 런타임을 포함할 수 있습니다. 체크포인트와 텍스트 인코더도 모두 설치 단계에서 다운로드하고 추론 시에는 Hugging Face 오프라인 모드를 사용합니다.

Stable Audio 3는 gated 모델입니다. [모델](https://huggingface.co/stabilityai/stable-audio-3-medium)과 [텍스트 인코더](https://huggingface.co/google/t5gemma-b-b-ul2)의 조건을 확인·승인한 뒤, 서버 환경에 `HF_TOKEN`을 설정하세요. 토큰은 서버 환경변수로만 사용하며 브라우저에 전송하지 않습니다. macOS 설치형은 `server.env`, 개발은 `.env`, Docker는 compose 환경변수로 전달합니다. 접근 승인이 없으면 설치 실패 사유가 표시됩니다. 실제 가중치·보조 모델 용량은 버전과 캐시에 따라 달라져 고정된 다운로드 크기로 표시하지 않습니다.

모델 삭제는 해당 가중치·개별 캐시를 지웁니다. 다른 모델이 공유하는 전용 런타임은 보존합니다. HeartMuLa 7B처럼 공개 가중치가 아직 없는 모델, API 전용 Stable Audio 3 Large, 효과음 전용 Small SFX는 설치 목록에 넣지 않았습니다.

모델별 공식 문서: [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5), [Stable Audio 3](https://github.com/Stability-AI/stable-audio-3). 신규 어댑터는 공식 API 계약을 모의 검증했으며, 실제 대형 가중치 설치·GPU/MPS 추론은 이 작업에서 수행하지 않았습니다.

## 생성·저장·재생

1. 간편 설정 또는 프롬프트를 선택하고, 모델·장르·느낌·용도·길이·템포를 지정합니다. 길이는 모델별 최소·최대 범위에서 1초 단위 슬라이더로 조절합니다.
2. 서버 큐에 등록합니다. 순서 변경·삭제·정지·재개가 가능합니다. 큐 정지는 다음 작업을 막으며 현재 작업은 계속합니다. **생성 중단**은 현재 추론 프로세스 그룹을 종료하고 큐를 정지합니다.
3. 생성 직전 서버가 에너지·밝기·온기·리듬감·복잡도를 0–100으로 확정합니다. 점수와 최종 프롬프트·시드를 먼저 저장한 뒤 추론합니다.
4. 결과 WAV와 메타데이터를 서버에 보관합니다. 스튜디오에는 검색 없는 **완료** 목록을 표시하고, 라이브러리 화면에서 검색·필터·정렬·속성 조회·재생·삭제·재생성합니다.

라이브러리의 **필터 추가**로 조건을 최대 20개까지 추가·삭제할 수 있습니다. 장르·느낌·용도·모델·템포·길이·5개 속성 점수·보컬 설정·이름·프롬프트를 지원합니다. 숫자는 이상·이하·같음·다름·범위, 텍스트는 포함·미포함 등의 조건을 사용합니다. 조건들은 AND(모두 일치) 또는 OR(하나 이상 일치)로 결합하며, 검색어는 조합 결과를 추가로 제한합니다. 검색·조건 평가·정렬은 서버에서 수행합니다.

점수는 **규칙 기반 생성 의도**이며 완성 음원을 분석한 측정치가 아닙니다. 직접 점수를 지정할 수도 있습니다. 재생성은 모델과 의도 점수를 유지하고 새 시드를 사용합니다.

재생 상태·탐색 위치·음량은 서버가 관리합니다. 서버가 전송하는 WAV를 브라우저에서 재생합니다. 자동 재생이 차단되면 ‘소리 켜기’를 누르세요. 음량은 곡을 선택하기 전에도 재생바에서 조절할 수 있습니다. 브라우저 종료·연결 해제는 서버 작업을 중단하지 않습니다.

## macOS 설치형

저장소를 직접 복제하지 않고 GitHub 주소로 바로 설치합니다. Node.js 24 이상·npm·Python을 먼저 준비하세요.

```sh
curl -fsSL https://raw.githubusercontent.com/hyuck0221/musicQ/master/install.sh | bash
```

설치 스크립트는 GitHub의 `master` 브랜치를 임시 폴더에 내려받아 빌드·설치한 뒤 임시 파일을 정리합니다. Git 명령은 필요하지 않습니다. 소스 저장소나 릴리즈 파일을 이미 받은 경우 `bash scripts/install-macos.sh`로 설치할 수도 있습니다.

화면을 빌드하고 서버와 함께 `~/Library/Application Support/musicQ/server`에 설치합니다. 사용자 LaunchAgent를 등록하여 로그인 시 자동 실행합니다. 관리자 권한은 필요하지 않습니다.

설치 후 [http://127.0.0.1:4310](http://127.0.0.1:4310)을 여세요.

- 설정: `~/Library/Application Support/musicQ/server.env`
- 음악·모델·DB: `~/Library/Application Support/musicQ/data/`
- 로그: `~/Library/Application Support/musicQ/logs/`
- 재시작: `launchctl kickstart -k gui/$(id -u)/local.musicq.server`
- 업데이트: 위 GitHub 설치 명령을 다시 실행합니다. 기존 설정·데이터는 유지합니다.
- 자동 실행 해제: `bash "$HOME/Library/Application Support/musicQ/uninstall.sh"`. 데이터는 보존합니다.

이전 설치의 `MUSICQ_TOKEN`·`MUSICQ_ORIGINS` 설정과 `data/token` 파일은 더 이상 사용하지 않습니다. 기존 음악과 모델은 그대로 사용할 수 있습니다.

## Docker 설치형

소스 저장소 또는 빌드된 릴리즈 패키지에서 실행합니다.

```sh
docker compose up -d --build
docker compose logs server
```

이미지에 프론트가 포함되며 [http://127.0.0.1:4310](http://127.0.0.1:4310)에서 사용합니다. 음악·DB·모델은 `musicq-data` 볼륨에 보존됩니다. `docker compose down`은 데이터를 지우지 않으며, `down -v`는 데이터를 삭제합니다.

## 다른 기기에서 접속

기본 설정은 서버 PC에서만 접속 가능한 `127.0.0.1:4310`입니다.

- macOS·직접 실행: 설정 파일의 `MUSICQ_HOST=0.0.0.0`을 지정하고 서버를 재시작합니다.
- Docker: `compose.yaml`의 포트를 `4310:4310`으로 변경합니다.

같은 네트워크의 브라우저에서 `http://서버의-IP:4310`을 여세요. macOS 방화벽에서 해당 포트 접근을 허용해야 할 수 있습니다. 화면·API·WebSocket이 같은 주소를 사용하므로 별도 Origin 목록이나 로컬 네트워크 접근 권한 설정은 필요하지 않습니다.

연결 키가 없는 단일 사용자 서버입니다. 접근 가능한 기기에서 음악·모델을 관리할 수 있으므로 LAN 공유는 신뢰하는 네트워크에서 사용하세요. 서버는 다른 사이트에서 오는 API·WebSocket 요청을 거부합니다.

## 개발과 릴리즈

```sh
npm ci
npm run dev
```

개발 화면: [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite의 `/api`, `/health`, `/ws` 프록시가 서버 `127.0.0.1:4310`으로 요청을 전달합니다. 이 포트가 프록시 기본값이므로 개발 시 서버 포트는 유지하세요.

```sh
npm run check
npm test
npm run build
npm run package:server
```

릴리즈 패키지와 SHA-256·버전 파일은 `releases/`에 생성됩니다. 화면 빌드·서버 소스·macOS 설치 스크립트·Docker 구성이 포함되며, 음악·모델·환경 파일은 포함하지 않습니다. 압축 해제 후 macOS는 `bash scripts/install-macos.sh`, Docker는 `docker compose up -d --build`로 실행합니다.

프론트·서버를 각각 호스팅하는 설정은 제거했습니다. 기존 외부 호스팅 프로젝트의 배포 중단·삭제와 DNS 정리는 해당 서비스 관리 화면에서 별도로 진행합니다.

서버는 단일 프로세스로 실행하세요. 여러 인스턴스가 같은 데이터 디렉터리를 공유하지 않도록 합니다. 관리형 모델과 등록한 음악 모델만 표시하며 컴퓨터 전체를 스캔하지 않습니다.

UI direction uses [unslop by Damir Sokolovsky](https://heydamir.design/unslop), CC BY 4.0.
