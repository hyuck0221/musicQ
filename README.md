<div align="center">

# musicQ

음악을 만드는 **queue**, 음악을 재생하는 **cue**.

로컬 모델은 내 컴퓨터에서, 컨트롤은 브라우저에서.

[**컨트롤 패널 열기 ↗**](https://musicQ.hshim.dev) · [서버 다운로드](https://musicQ.hshim.dev/downloads/musicq-server.tar.gz) · [설치·운영 가이드](docs/setup.md) · [사용자 모델 연결](docs/model-adapter.md)

</div>

---

- **생성** — 프롬프트·간편 설정, 초 단위 길이 조절, 모델별 생성 큐
- **관리** — 모델 설치, 큐 순서 변경·중단, 음악 재생성
- **라이브러리** — 재생·삭제, 속성 점수와 다중 조건 검색

음악·모델·큐는 서버 PC에 저장됩니다. 연결 정보는 브라우저에 저장되어 다음 접속부터 자동 연결됩니다.

## 시작하기

macOS는 **Node.js 24 이상·Python 3.11–3.12**, Docker는 **Docker Compose**가 필요합니다.

### macOS

터미널에서 설치합니다. 로그인 시 서버가 자동 실행됩니다.

```sh
curl -fsSL https://musicQ.hshim.dev/install.sh | bash
```

설치 스크립트는 서버 패키지를 내려받고 SHA-256을 확인합니다. 설정·음악·모델은 `~/Library/Application Support/musicQ`에 보관합니다.

연결 키 확인:

```sh
cat "$HOME/Library/Application Support/musicQ/data/token"
```

### Docker

서버 패키지를 내려받아 실행합니다.

```sh
curl -fsSL https://musicQ.hshim.dev/downloads/musicq-server.tar.gz | tar -xz
cd musicq-server
docker compose up -d --build
docker compose logs server
```

### 컨트롤 패널 연결

1. 같은 컴퓨터는 `http://localhost:4310`, 같은 네트워크는 `http://서버의-로컬-IP:4310`을 사용합니다.
2. [musicQ.hshim.dev](https://musicQ.hshim.dev)에서 **서버 주소**와 **연결 키**를 입력합니다.
3. **모델**에서 사용할 모델을 설치하고 첫 음악을 큐에 추가합니다.

서버는 기본적으로 `http://127.0.0.1:4310`에서 실행됩니다. 지원 브라우저에서 로컬 네트워크 접근을 허용하면 HTTP로 연결할 수 있습니다. 외부 서버나 HTTP 접속을 지원하지 않는 브라우저는 [HTTPS 설정](docs/setup.md#배포된-웹과-로컬-서버-연결)을 사용하세요.

## 지원 모델

| 모델                                | 구성               | 생성 길이         |
| ----------------------------------- | ------------------ | ----------------- |
| ACE-Step 1.5 XL Turbo / XL SFT      | DiT 4B + LM 4B     | 10–300초          |
| ACE-Step 1.5 Turbo                  | DiT 2B + LM 1.7B   | 10–300초          |
| Stable Audio 3 Medium / Small Music | 1.4B / 433M        | 5–300초 / 5–120초 |
| MusicGen Small / Medium / Large     | 300M / 1.5B / 3.3B | 5–30초            |

Stable Audio 3는 Hugging Face 접근 승인과 서버 `HF_TOKEN` 설정이 필요합니다. 모델별 메모리 요구사항·라이선스는 [가이드](docs/setup.md#모델)에서 확인하세요. 기본 테스트 신시사이저는 AI 모델 설치 없이 동작을 확인하는 용도입니다.

<details>
<summary>개발 및 배포</summary>

```sh
npm ci
cp .env.example .env
npm run dev
```

웹 `http://127.0.0.1:5173` · 서버 `http://127.0.0.1:4310`

`packages/server`는 설치형 서버, `packages/web`은 Vercel에 배포하는 정적 웹입니다.

```sh
npm test
npm run check
npm run build
```

[Vercel 배포](docs/setup.md#vercel-웹-배포) · [서버 설정·삭제](docs/setup.md#macos-설치형)

</details>

<sub>UI direction: [unslop by Damir Sokolovsky](https://heydamir.design/unslop), CC BY 4.0.</sub>
