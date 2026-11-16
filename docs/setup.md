# 설치·운영 가이드

[컨트롤 패널](https://musicQ.hshim.dev) · [README로 돌아가기](../README.md)

음악을 만들기 위한 **queue**, 음악을 재생하는 **cue**. 로컬 음악 생성 서버와 브라우저 컨트롤 패널입니다.

두 개의 배포 단위로 구성됩니다.

| 패키지 | 역할 |
| --- | --- |
| `packages/server` | macOS / Docker 서버. 모델 설치·추론, 생성 큐, 속성 계획, SQLite, WAV 저장, 재생 상태 관리 |
| `packages/web` | 독립 배포 가능한 React / Vite 정적 웹. 서버 주소로 연결하는 컨트롤 패널 |

## 바로 실행

Node.js **24 이상**, npm이 필요합니다. 모델을 설치할 때는 Python 3.11 또는 3.12를 권장합니다.

```sh
npm ci
cp .env.example .env
npm run dev
```

웹: http://127.0.0.1:5173 · 서버: http://127.0.0.1:4310

서버 실행 로그의 **연결 키**를 웹에 한 번 입력합니다. 인증에 성공하면 연결 정보가 이 브라우저에 저장되고 다음 방문·새로고침 시 자동 연결됩니다. 네트워크 장애는 자동 재시도하며, 인증에 실패하면 연결 설정을 다시 엽니다. 최초 실행 시 키가 생성되어 `.musicq/token`에 저장됩니다. 서버 데이터는 `.musicq/`에 남습니다. 토큰을 공개 저장소에 올리지 마세요.

기본 제공되는 **테스트 신시사이저는 AI 모델이 아닙니다.** 별도 모델 다운로드 없이 연결·큐·생성·재생 흐름을 확인하는 용도입니다. 실제 AI 음악은 모델 화면에서 설치 후 선택합니다.

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

재생 상태·탐색 위치·음량은 서버가 관리합니다. 기본 출력은 서버가 전송하는 WAV를 브라우저에서 재생합니다. 자동 재생이 차단되면 ‘소리 켜기’를 누르세요. 출력 장치를 ‘서버 PC’로 바꾸면 서버의 `ffplay`를 사용합니다 (`brew install ffmpeg`). Docker에서 호스트 스피커 재생은 기본 지원하지 않습니다. 브라우저 종료·연결 해제는 서버 작업을 중단하지 않습니다.

## macOS 설치형

릴리즈 설치 주소는 [https://musicQ.hshim.dev/install.sh](https://musicQ.hshim.dev/install.sh)입니다.

```sh
curl -fsSL https://musicQ.hshim.dev/install.sh | bash
```

Node.js 24 이상·npm·Python 3.11–3.12를 먼저 준비하세요. 설치 스크립트는 `/downloads/musicq-server.tar.gz`와 체크섬 파일을 내려받아 SHA-256을 확인한 뒤 macOS 설치를 실행합니다. 기존 설정과 데이터는 유지합니다. 소스 저장소에서도 `bash scripts/install-macos.sh`로 설치할 수 있습니다.

[서버 패키지](https://musicQ.hshim.dev/downloads/musicq-server.tar.gz) · [SHA-256](https://musicQ.hshim.dev/downloads/musicq-server.tar.gz.sha256) · [버전](https://musicQ.hshim.dev/downloads/version.json)

파일만 받으려면 아래처럼 실행합니다. 대상 폴더는 새 경로를 지정하세요.

```sh
curl -fsSL https://musicQ.hshim.dev/install.sh | bash -s -- --download-only ./musicq-server
```

소스를 `~/Library/Application Support/musicQ/server`에 복사하고 사용자 LaunchAgent를 등록합니다. 로그인 시 서버가 자동 실행됩니다. 관리자 권한이 필요하지 않습니다. 기본 바인딩은 `127.0.0.1:4310`입니다.

- 설정: `~/Library/Application Support/musicQ/server.env`
- 음악·모델·연결 키: `~/Library/Application Support/musicQ/data/`
- 로그: `~/Library/Application Support/musicQ/logs/`
- 재시작: `launchctl kickstart -k gui/$(id -u)/local.musicq.server`
- 업데이트: 수정된 저장소에서 설치 스크립트를 다시 실행합니다. 데이터·기존 설정은 유지합니다.
- 자동 실행 해제: `bash "$HOME/Library/Application Support/musicQ/uninstall.sh"`. 데이터는 보존합니다.

다른 PC의 브라우저에서 접속할 때는 설정의 `MUSICQ_HOST=0.0.0.0`과 허용 Origin을 지정하고 macOS 방화벽을 설정해야 합니다.

## Docker 설치형

```sh
docker compose up -d --build
docker compose logs server
```

로그의 연결 키를 입력합니다. 음악·DB·모델은 `musicq-data` 볼륨에 보존됩니다. `docker compose down`은 데이터를 지우지 않으며, **`down -v`는 데이터를 삭제**합니다. 기본 포트는 호스트의 loopback에만 노출됩니다. LAN에서 직접 접속하려면 `compose.yaml`의 포트를 `4310:4310`으로 바꾸고 방화벽을 설정합니다.

## Vercel 웹 배포

저장소 루트의 `vercel.json`이 웹만 정적 배포하도록 설정합니다. 로컬 서버·SQLite·모델은 서버 PC에서 실행합니다.

Vercel에서 저장소를 Import한 뒤 아래 설정을 사용하세요.

| 항목 | 설정 |
| --- | --- |
| Root Directory | 저장소 루트 (`.`), **`packages/web`로 변경하지 않음** |
| Framework Preset | Vite |
| Node.js Version | 26.x (로컬 검증 버전, 프로젝트는 Node.js 24 이상 지원) |
| Install Command | `npm ci --workspace @musicq/web --include-workspace-root=false --include=dev` |
| Build Command | `npm run build --workspace @musicq/web` |
| Output Directory | `packages/web/dist` |
| Environment Variables | 웹 배포에는 필요 없음 |

설치·빌드·출력 경로는 `vercel.json`에서 지정하므로 Dashboard에서 별도로 덮어쓸 필요가 없습니다. Vercel에서 Root Directory를 자동으로 `packages/web`로 잡았다면 저장소 루트로 되돌리세요. 웹 의존성만 설치하며, Python이나 생성 모델을 빌드 머신에 설치하지 않습니다. 빌드 시 `scripts/package-server.mjs`가 서버 소스·설치 스크립트·Docker 구성을 압축해 정적 다운로드 파일을 생성합니다. SPA 새로고침 경로와 루트 기준 정적 자산 경로도 설정되어 있습니다.

Git 연결 대신 CLI로 배포할 때도 저장소 **루트**에서 실행하세요.

```sh
npx vercel
# Preview 확인 후 Production 배포
npx vercel --prod
```

CLI의 로그인·프로젝트 연결은 본인 Vercel 계정으로 진행합니다. `.vercelignore`는 CLI 업로드에서 `.musicq`, 모델·음악·DB, `.env`와 캐시를 제외합니다. 서버 소스와 패키징 스크립트는 설치 파일 생성에 사용하고, 생성된 패키지와 웹 정적 파일만 배포합니다. Git 배포에서는 `.gitignore`로 로컬 데이터와 비밀값이 커밋되지 않도록 유지하세요. `MUSICQ_TOKEN`, `HF_TOKEN`은 로컬 서버 설정이며 Vercel에 입력하지 않습니다. 서버 주소와 연결 키는 사용자가 웹에서 입력하고 해당 브라우저에 저장합니다.

다른 정적 호스팅에 배포하려면 저장소 루트에서 `npm run build`를 실행하고 `packages/web/dist/`를 배포하세요.

공식 문서: [Vercel의 Vite 설정](https://vercel.com/docs/frameworks/frontend/vite), [프로젝트 설정](https://vercel.com/docs/project-configuration/vercel-json).

### 배포된 웹과 로컬 서버 연결

공개 컨트롤 패널은 [https://musicQ.hshim.dev](https://musicQ.hshim.dev)입니다. **신규 설치에는 이 Origin이 기본 포함됩니다.** 이전 설치를 업데이트하는 경우 **서버 PC의** `.env`(설치형은 `server.env`)를 다음처럼 설정하고 서버를 재시작합니다. Origin은 브라우저가 보내는 소문자 호스트(`https://musicq.hshim.dev`)로 지정합니다.

```dotenv
MUSICQ_ORIGINS=https://musicq.hshim.dev,http://localhost:5173,http://127.0.0.1:5173
```

Preview 배포는 도메인이 달라집니다. 사용할 Preview 주소도 정확히 추가해야 합니다. `*.vercel.app` 같은 전체 와일드카드를 허용하지 않습니다. 커스텀 도메인을 쓰면 해당 웹 도메인을 추가하세요. 브라우저 저장 정보는 원점별로 분리되므로 Preview·Production·커스텀 도메인 간에는 최초 연결 설정을 각각 한 번 해야 합니다.

HTTPS 컨트롤 패널에서도 **로컬 HTTP 서버**에 연결할 수 있습니다. 지원 주소는 `localhost`·`*.localhost`, `127.x.x.x`·`::1`, 사설 IPv4(`10.x`, `172.16–31.x`, `192.168.x`), 링크 로컬·IPv6 사설 주소와 `.local` 호스트입니다. 일반 공개 HTTP 주소와 임의의 DNS 별칭은 허용하지 않습니다. `localhost`는 브라우저를 실행한 컴퓨터를 뜻합니다. 다른 기기에서 서버에 연결하려면 서버의 LAN IP와 바인딩·방화벽 설정을 확인하세요.

최신 Chrome 등 지원 브라우저에서 최초 연결 시 **연결**을 누르고 로컬 네트워크/루프백 접근 권한을 허용하세요. 권한 상태를 확인할 수 있고 이미 허용되어 있으면 저장된 정보로 자동 연결합니다. 권한 확인 API를 지원하지 않는 브라우저는 직접 연결 버튼을 눌러 시도합니다. 차단한 권한은 사이트 설정에서 다시 허용해야 합니다. 지원하지 않는 브라우저에서는 HTTPS 역방향 프록시를 사용하세요.

API에는 `targetAddressSpace`를 지정하고, WebSocket은 브라우저가 인식하는 로컬 주소의 `ws://`를 사용합니다. 로컬 HTTP 음악은 권한을 받은 fetch로 읽어 blob URL로 재생하므로 브라우저의 HTTP 미디어 자동 업그레이드를 피합니다. 이 경우 파일 로딩을 마친 뒤 재생하며, HTTPS 음악은 기존 Range 스트리밍을 유지합니다. CORS와 연결 키 인증은 동일하게 적용합니다.

참고: [Chrome 로컬 네트워크 접근](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access).

외부 HTTPS 서버 또는 HTTPS 프록시를 사용할 때:

권장 구성:

1. 서버 PC에 접근 가능한 DNS와 TLS 역방향 프록시를 준비합니다. [Caddy 예시](Caddyfile.example)를 참고하세요. 같은 원점의 `/ws` 업그레이드와 `/api/audio/` Range 요청을 전달해야 합니다.
2. 서버 `MUSICQ_ORIGINS=https://실제-웹-호스팅-주소`를 설정합니다. 여러 주소는 쉼표로 구분합니다. CORS와 WebSocket Origin을 모두 검사합니다.
3. 웹에 `https://실제-서버-주소`와 연결 키를 입력합니다. 브라우저가 로컬 네트워크 접근 권한을 물으면 허용합니다. 브라우저별 네트워크 정책도 적용됩니다.
4. 서버 URL의 경로 접두어는 지원하지 않습니다. 서버 전용 호스트의 루트에 프록시하세요.

공개망에서는 TLS를 사용하고 연결 키를 보호하세요. 웹의 연결 키는 요청대로 브라우저 localStorage에 저장되므로 공유 PC에서는 연결 정보를 지워야 합니다. 음악과 큐는 브라우저에 저장하지 않습니다. 브라우저에는 주소·키·생성 폼만 저장합니다. 연결 해제는 저장된 주소와 키를 삭제하지 않습니다.

## 구조와 검증

```text
packages/server/src/
  app.mjs             HTTP / WebSocket / signed audio streaming
  service.mjs         persistent queue / library / playback
  planner.mjs         generation intent and score planning
  models.mjs          catalog / install process / registry
  engine.mjs          cancellable subprocess adapter
  musicgen.py         offline MusicGen inference
  install-model.py    isolated runtime and model download
  synth.mjs           test-only synthesizer
packages/web/src/     React control panel
scripts/              macOS LaunchAgent install / uninstall
```

```sh
npm run check
npm test
npm run build
```

통합 테스트는 인증·Origin, 큐 영속성·순서, 생성·중단, WAV Range, 검색·필터, 재생성, WebSocket, 모델 설치 생명주기, 다중 검색 조건의 AND/OR·범위 평가를 검증합니다. 웹 테스트는 저장된 연결 정보의 복구와 URL 검증을 확인합니다. 모델 설치 테스트는 다운로드 대신 테스트 실행기를 사용합니다. Docker 이미지 빌드와 컨테이너 내 테스트 생성·서명된 WAV Range 전송까지 확인했습니다. Python 3.14.7 / Transformers 4.57.6의 설치된 MusicGen Small로 CPU 추론을 수행해 32 kHz, 약 4.94초 WAV 생성과 유효한 오디오 샘플을 확인했습니다. 다른 대형 모델의 실제 추론과 macOS LaunchAgent 등록은 별도 환경 검증이 필요합니다.

현재 단일 사용자·단일 서버 프로세스용입니다. 여러 서버 인스턴스가 같은 데이터 디렉터리를 공유하지 않도록 하세요. 자동 모델 발견은 musicQ가 설치·등록한 음악 모델에 한정합니다. 임의의 Ollama 모델이나 컴퓨터 전체 파일은 스캔하지 않습니다.

UI direction uses [unslop by Damir Sokolovsky (@heydamir)](https://heydamir.design/unslop), CC BY 4.0. No skill source is bundled.

참고: [Node.js SQLite](https://nodejs.org/api/sqlite.html), [Vite 정적 배포](https://vite.dev/guide/static-deploy), [MusicGen](https://huggingface.co/facebook/musicgen-small).
