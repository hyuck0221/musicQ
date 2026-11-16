"""Offline MusicGen adapter. argv: local model directory, generation spec JSON."""
import json
import os
from pathlib import Path
import sys


def load_musicgen(model_dir, device):
    from transformers import AutoProcessor, MusicgenConfig, MusicgenForConditionalGeneration

    # Transformers 4.57 derives config_class from class annotations. On Python 3.14
    # lazy annotations can leave this composite model with its parent's decoder
    # config_class. Explicitly bind the composite class and load the full config.
    MusicgenForConditionalGeneration.config_class = MusicgenConfig
    config = MusicgenConfig.from_pretrained(model_dir, local_files_only=True)
    processor = AutoProcessor.from_pretrained(model_dir, local_files_only=True)
    model = MusicgenForConditionalGeneration.from_pretrained(
        model_dir, config=config, local_files_only=True,
    ).to(device)
    model.eval()
    return processor, model


def generate_musicgen(model_dir, spec, device):
    import scipy.io.wavfile
    import torch

    torch.manual_seed(spec['seed'])
    processor, model = load_musicgen(model_dir, device)
    inputs = processor(text=[spec['resolvedPrompt']], padding=True, return_tensors='pt').to(device)
    with torch.inference_mode():
        audio = model.generate(**inputs, max_new_tokens=int(spec['duration'] * 50), do_sample=True)
    rate = model.config.audio_encoder.sampling_rate
    wave = audio[0].detach().cpu().numpy().T
    scipy.io.wavfile.write(spec['output'], rate, wave)


def main():
    model_dir, spec_file = sys.argv[1:]
    spec = json.loads(Path(spec_file).read_text())
    generate_musicgen(model_dir, spec, os.environ.get('MUSICQ_DEVICE', 'cpu'))


if __name__ == '__main__':
    main()
