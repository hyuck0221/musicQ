"""Offline adapters for the pinned official ACE-Step 1.5 and Stable Audio 3 APIs."""
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace


def generate_ace(spec, root, model, device):
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationParams, GenerationConfig, generate_music
    import soundfile as sf
    handler = AceStepHandler()
    status, success = handler.initialize_service(
        project_root=str(root), config_path=model['variant'], device=device,
        use_flash_attention=False, compile_model=False,
        offload_to_cpu=device != 'cpu', offload_dit_to_cpu=device != 'cpu',
        use_mlx_dit=device == 'mps',
    )
    if not success:
        raise RuntimeError(status)
    lm = LLMHandler()
    status, success = lm.initialize(
        checkpoint_dir=str(root / 'checkpoints'), lm_model_path=model['lm'],
        backend='pt', device=device, offload_to_cpu=device != 'cpu',
    )
    if not success:
        raise RuntimeError(status)
    params = GenerationParams(
        caption=spec['resolvedPrompt'], duration=spec['duration'], bpm=spec['bpm'],
        instrumental=spec['instrumental'], seed=spec['seed'], thinking=True,
        use_cot_lyrics=not spec['instrumental'], inference_steps=model['steps'],
    )
    config = GenerationConfig(batch_size=1, audio_format='wav', use_random_seed=False, seeds=[spec['seed']])
    with tempfile.TemporaryDirectory(dir=root) as output:
        result = generate_music(handler, lm, params, config, save_dir=output)
        if not result.success or not result.audios:
            raise RuntimeError(result.error or 'ACE-Step did not produce audio')
        wave, rate = sf.read(result.audios[0]['path'], always_2d=True)
        sf.write(spec['output'], wave[:int(rate * spec['duration'])], rate, subtype='PCM_16')


def generate_stable(spec, root, model, device):
    from stable_audio_3 import StableAudioModel
    from stable_audio_3.model_configs import all_models
    import soundfile as sf
    # The upstream registry resolves HF names; point this entry at its installed local files.
    all_models[model['variant']] = SimpleNamespace(resolve=lambda: (
        str(root / 'weights' / 'model_config.json'), str(root / 'weights' / 'model.safetensors'),
    ))
    pipeline = StableAudioModel.from_pretrained(model['variant'], device=device, model_half=device.startswith('cuda'))
    audio = pipeline.generate(prompt=spec['resolvedPrompt'], duration=spec['duration'], seed=spec['seed'], batch_size=1)
    sf.write(spec['output'], audio[0].detach().cpu().float().numpy().T, pipeline.model.sample_rate, subtype='PCM_16')


def main():
    root = Path(sys.argv[1]).resolve()
    spec = json.loads(Path(sys.argv[2]).read_text())
    model = json.loads((root / 'musicq-model.json').read_text())
    # Set these before importing either runtime. Inference cannot silently download missing weights.
    os.environ['HF_HOME'] = str(root / 'hf-cache')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    device = os.environ.get('MUSICQ_DEVICE', 'cpu')
    if model['family'] == 'ace-step':
        required = {'acestep-v15-turbo', 'vae', 'Qwen3-Embedding-0.6B', 'acestep-5Hz-lm-1.7B', model['variant'], model['lm']}
        for component in required:
            directory = root / 'checkpoints' / component
            if not any(path.suffix in {'.safetensors', '.bin', '.pt', '.pth'} for path in directory.rglob('*')):
                raise RuntimeError(f'설치된 체크포인트가 없습니다: {component}. 모델을 다시 설치해 주세요')
        generate_ace(spec, root, model, device)
    elif model['family'] == 'stable-audio':
        generate_stable(spec, root, model, device)
    else:
        raise ValueError('Unknown model family')


if __name__ == '__main__':
    main()
