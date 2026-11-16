"""Install a server-owned catalog entry. Each modern model family has its own runtime."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import venv
import zipfile


def run(args, env=None):
    subprocess.run([str(arg) for arg in args], check=True, stdout=sys.stderr, env=env)


def prepare_runtime(root, model):
    if model.get('family', 'musicgen') == 'musicgen':
        python = root / 'venv' / 'bin' / 'python'
        if not python.exists():
            venv.create(root / 'venv', with_pip=True)
        run([python, '-m', 'pip', 'install', '--disable-pip-version-check',
             'torch>=2.6,<3', 'transformers>=4.51,<5', 'scipy>=1.15,<2',
             'sentencepiece>=0.2,<1', 'huggingface-hub>=0.30,<1'])
        return python

    if not (3, 11) <= sys.version_info[:2] < (3, 13):
        raise RuntimeError('이 모델은 Python 3.11 또는 3.12가 필요합니다. MUSICQ_PYTHON을 설정해 주세요')
    runtime = root / 'runtimes' / model['runtime']
    source = runtime / 'source'
    runtime.mkdir(parents=True, exist_ok=True)
    if not (source / 'pyproject.toml').exists():
        print('공식 런타임 다운로드', flush=True)
        url = f"https://codeload.github.com/{model['sourceRepo']}/zip/{model['revision']}"
        with tempfile.TemporaryDirectory(dir=runtime) as temp:
            archive = Path(temp) / 'source.zip'
            urllib.request.urlretrieve(url, archive)
            with zipfile.ZipFile(archive) as zipped:
                for member in zipped.infolist():
                    target = (Path(temp) / member.filename).resolve()
                    if not target.is_relative_to(Path(temp).resolve()):
                        raise ValueError('Invalid source archive path')
                zipped.extractall(temp)
            extracted = next(p for p in Path(temp).iterdir() if p.is_dir())
            shutil.move(str(extracted), source)
    tools = runtime / 'tools'
    if not (tools / 'bin' / 'python').exists():
        venv.create(tools, with_pip=True)
    tools_python = tools / 'bin' / 'python'
    ready = runtime / 'ready-revision'
    if not ready.exists() or ready.read_text() != model['revision']:
        run([tools_python, '-m', 'pip', 'install', '--disable-pip-version-check', 'uv>=0.6,<1'])
        print('전용 실행 환경 설치', flush=True)
        # Official lockfile and platform-specific indexes are respected by uv.
        run([tools_python, '-m', 'uv', 'sync', '--project', source, '--python', sys.executable, '--no-dev', '--locked'])
        ready.write_text(model['revision'])
    return source / '.venv' / 'bin' / 'python'


def main():
    root = Path(sys.argv[1])
    model = json.loads(sys.argv[2])
    if model.get('family') == 'stable-audio':
        # Fail before installing a multi-GB runtime when gated weights are inaccessible.
        request = urllib.request.Request(f"https://huggingface.co/{model['repo']}/resolve/main/model_config.json")
        if os.environ.get('HF_TOKEN'):
            request.add_header('Authorization', 'Bearer ' + os.environ['HF_TOKEN'])
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read(1)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise RuntimeError(f"Hugging Face에서 {model['repo']} 접근 승인을 받고 서버 HF_TOKEN을 설정해 주세요") from None
            raise
    print('음악 생성 런타임 준비', flush=True)
    python = prepare_runtime(root, model)
    directory = root / model['id']
    directory.mkdir(parents=True, exist_ok=True)
    manifest = directory / 'musicq-model.json'
    # This file is generated exclusively from the server-owned catalog.
    manifest.write_text(json.dumps(model))
    env = {**os.environ, 'HF_HOME': str(directory / 'hf-cache')}
    print('모델 가중치 다운로드', flush=True)
    run([python, Path(__file__).with_name('model-assets.py'), manifest], env=env)
    print('설치 완료', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
