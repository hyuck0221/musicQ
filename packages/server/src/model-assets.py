"""Download the complete, known set of weights without loading large models into RAM."""
import json
from pathlib import Path
import sys


def validate_musicgen_weights(root):
    """Check the checkpoint Transformers will select, without loading it into RAM."""
    for weights, index in [('model.safetensors', 'model.safetensors.index.json'),
                           ('pytorch_model.bin', 'pytorch_model.bin.index.json')]:
        checkpoint = root / weights
        if checkpoint.is_file() and checkpoint.stat().st_size:
            return
        if (root / index).is_file():
            weight_map = json.loads((root / index).read_text()).get('weight_map')
            if not isinstance(weight_map, dict) or not weight_map:
                raise RuntimeError(f'모델 가중치 인덱스가 올바르지 않습니다: {index}')
            for filename in set(weight_map.values()):
                shard = (root / filename).resolve()
                if (not shard.is_relative_to(root.resolve()) or
                        not shard.is_file() or not shard.stat().st_size):
                    raise RuntimeError(f'모델 가중치 파일이 누락되었습니다: {filename}. 모델 설치를 다시 시도해 주세요')
            return
    raise RuntimeError('모델 가중치 파일이 없습니다. 모델 설치를 다시 시도해 주세요')


def download_assets(manifest):
    from huggingface_hub import snapshot_download
    model = json.loads(manifest.read_text())
    root = manifest.parent
    family = model.get('family', 'musicgen')
    if family == 'musicgen':
        snapshot_download(repo_id=model['repo'], local_dir=root,
                          allow_patterns=['*.json', '*.safetensors', '*.model', 'pytorch_model*.bin', 'tokenizer.*', 'spiece.model'])
        validate_musicgen_weights(root)
    elif family == 'ace-step':
        checkpoints = root / 'checkpoints'
        # The upstream initializer validates all four main components, including its default LM.
        snapshot_download(repo_id='ACE-Step/Ace-Step1.5', local_dir=checkpoints)
        if model['repo'] != 'ACE-Step/Ace-Step1.5':
            snapshot_download(repo_id=model['repo'], local_dir=checkpoints / model['variant'])
        if model['lm'] != 'acestep-5Hz-lm-1.7B':
            snapshot_download(repo_id='ACE-Step/' + model['lm'], local_dir=checkpoints / model['lm'])
    elif family == 'stable-audio':
        snapshot_download(repo_id=model['repo'], local_dir=root / 'weights',
                          allow_patterns=['model_config.json', 'model.safetensors'])
        config = json.loads((root / 'weights' / 'model_config.json').read_text())
        repos = set()
        def collect(value):
            if isinstance(value, dict):
                if value.get('type') == 't5gemma':
                    settings = value.get('config', {})
                    repos.add(settings.get('repo_id') or settings.get('model_name') or 'google/t5gemma-b-b-ul2')
                for child in value.values():
                    collect(child)
            elif isinstance(value, list):
                for child in value:
                    collect(child)
        collect(config)
        # Current official SA3 models use this encoder; cache it even with implicit config defaults.
        repos.add('google/t5gemma-b-b-ul2')
        for repo in repos:
            snapshot_download(repo_id=repo, allow_patterns=['*.json', '*.safetensors', '*.model', 'tokenizer.*'])
    else:
        raise ValueError('Unknown music model family')


if __name__ == '__main__':
    download_assets(Path(sys.argv[1]))
