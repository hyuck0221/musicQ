<div align="center">

# musicQ

음악을 만드는 **queue**, 음악을 재생하는 **cue**.

로컬 AI 음악 생성과 브라우저 컨트롤 패널.

[설치·운영 가이드](docs/setup.md) · [사용자 모델 연결](docs/model-adapter.md)

</div>

---

- **생성** — 프롬프트·간편 설정, 초 단위 길이 조절, 모델별 생성 큐
- **관리** — 모델 설치, 큐 순서 변경·중단, 음악 재생성
- **라이브러리** — 재생·삭제, 속성 점수와 다중 조건 검색

서버 하나가 화면과 API를 함께 제공합니다. 음악·모델·큐는 서버 PC에 저장됩니다.

## 시작하기

### macOS

Node.js **24 이상**, npm, Python **3.11–3.12**를 준비한 뒤 설치합니다. 로그인 시 자동 실행됩니다.

```sh
curl -fsSL https://raw.githubusercontent.com/hyuck0221/musicQ/master/install.sh | bash
```

GitHub에서 소스를 내려받아 화면과 서버를 함께 빌드·설치합니다. 업데이트할 때도 같은 명령을 사용합니다.

설치 후 [http://127.0.0.1:4310](http://127.0.0.1:4310)을 여세요. 주소 입력이나 연결 키 없이 바로 사용할 수 있습니다.

### Docker

```sh
git clone https://github.com/hyuck0221/musicQ.git
cd musicQ
docker compose up -d --build
```

[http://127.0.0.1:4310](http://127.0.0.1:4310)에서 동일하게 사용합니다. 음악·모델은 Docker 볼륨에 보관합니다.

### 직접 실행

```sh
git clone https://github.com/hyuck0221/musicQ.git
cd musicQ
npm ci
npm run build
npm start
```

브라우저에서 **모델**을 설치하고 첫 음악을 큐에 추가하세요. 다른 기기에서 접속하는 방법은 [가이드](docs/setup.md#다른-기기에서-접속)를 참고하세요.

## 지원 모델

| 모델                                | 구성               | 생성 길이         |
| ----------------------------------- | ------------------ | ----------------- |
| ACE-Step 1.5 XL Turbo / XL SFT      | DiT 4B + LM 4B     | 10–300초          |
| ACE-Step 1.5 Turbo                  | DiT 2B + LM 1.7B   | 10–300초          |
| Stable Audio 3 Medium / Small Music | 1.4B / 433M        | 5–300초 / 5–120초 |
| MusicGen Small / Medium / Large     | 300M / 1.5B / 3.3B | 5–30초            |

Stable Audio 3는 Hugging Face 접근 승인과 서버 `HF_TOKEN` 설정이 필요합니다. 모델별 메모리 요구사항·라이선스는 [가이드](docs/setup.md#모델)에서 확인하세요. 기본 테스트 신시사이저는 AI 모델 설치 없이 동작을 확인하는 용도입니다.

## 개발

소스 저장소에서 실행합니다.

```sh
npm ci
cp .env.example .env
npm run dev
```

개발 화면은 [http://127.0.0.1:5173](http://127.0.0.1:5173)입니다. Vite가 API와 WebSocket을 로컬 서버로 전달합니다.

`packages/server`는 모델·큐·저장소와 웹 제공을 담당하고, `packages/web`은 빌드 시 서버에 포함되는 React 화면입니다.

```sh
npm test
npm run check
npm run build
npm run package:server
```

릴리즈 파일은 `releases/musicq-server.tar.gz`에 생성됩니다. 빌드된 화면이 포함되어 있습니다.

<sub>UI direction: [unslop by Damir Sokolovsky](https://heydamir.design/unslop), CC BY 4.0.</sub>
