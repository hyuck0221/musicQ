# 로컬 모델 명령 어댑터

musicQ의 관리형 MusicGen 외에 이미 설치된 음악 생성 모델을 연결할 수 있습니다. 서버 설정에 **실행 파일과 인자 배열**을 등록하면 웹의 모델 목록에 ‘사용자 모델’로 나타납니다.

```dotenv
MUSICQ_MODEL_NAME=My local music model
MUSICQ_MODEL_COMMAND=["/absolute/path/to/python","/absolute/path/to/adapter.py"]
MUSICQ_MODEL_TIMEOUT=1800
```

서버를 재시작하세요. 셸 명령 문자열은 지원하지 않으며 `shell: false`로 실행합니다. 여러 로컬 모델은 서버 설정에 `MUSICQ_MODELS_FILE=/absolute/path/models.json`으로 등록합니다. JSON 예시:

```json
[
  {"id": "local-ace-step", "name": "ACE-Step", "maxDuration": 180, "command": ["/path/to/python", "/path/to/ace_adapter.py"]},
  {"id": "local-other", "name": "Other music model", "maxDuration": 120, "command": ["/path/to/python", "/path/to/other_adapter.py"]}
]
```

각 ID는 `local-`로 시작하는 소문자·숫자·하이픈이고 중복될 수 없습니다. `maxDuration`은 5–300초입니다. 어댑터는 아래 계약을 구현해야 합니다. musicQ는 등록된 명령의 존재와 실제 모델 유형을 자동 검증하지 않으므로 서버 소유자가 음악 모델만 등록해야 합니다. 파일은 서버 시작 시 읽습니다. 아래 예시는 연결 형식이며 ACE-Step 어댑터 자체를 포함하지 않습니다. 사용자 명령 모델은 웹에서 삭제할 수 없습니다. 외부 도구로 설치한 모델을 자동 스캔하지 않습니다.

서버가 명령의 마지막 인자로 **JSON 스펙 파일의 절대 경로**를 붙입니다. JSON은 다음 형태입니다.

```json
{
  "title": "차분한 Lo-fi",
  "modelId": "custom",
  "mode": "guided",
  "prompt": "soft piano",
  "resolvedPrompt": "soft piano. Lo-fi, 차분한, 작업. 80 BPM, 30 seconds. instrumental, no vocals. energy: 15/100...",
  "category": "작업",
  "genre": "Lo-fi",
  "mood": "차분한",
  "duration": 30,
  "bpm": 80,
  "instrumental": true,
  "scores": {"energy": 15, "brightness": 35, "warmth": 80, "danceability": 35, "complexity": 35},
  "seed": 42,
  "planner": "intent-rules-v1",
  "output": "/absolute/server/data/audio/job-id.wav"
}
```

어댑터 계약:

1. 마지막 인자의 JSON을 읽습니다. 사용자 문자열을 셸로 평가하지 마세요.
2. 서버에 설치된 로컬 모델에 `resolvedPrompt`, `duration`, `seed` 등을 전달합니다.
3. 결과를 `output`에 **RIFF WAV** 형식으로 저장하고 종료 코드 0으로 종료합니다. 실제 음원 길이는 요청 `duration`과 일치해야 합니다.
4. 실패할 때는 0이 아닌 코드와 짧은 stderr 메시지를 반환합니다.
5. SIGTERM으로 중단될 수 있어야 합니다. 서버는 프로세스 그룹에 SIGTERM을 보내고 2초 후에도 실행 중이면 SIGKILL을 보냅니다. 별도 daemon으로 추론을 분리하면 중단 보장이 깨집니다.

스펙 파일은 작업 종료 후 제거됩니다. 부분 출력은 실패·중단 시 지워집니다. 완료된 음원에는 최종 프롬프트·속성·모델·시드를 저장합니다. 참고 구현은 `packages/server/src/musicgen.py`입니다.
