"""Contract tests against the official API shapes; no weights or GPU downloads."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parents[1] / 'src' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


adapter = load('musicq_modern', 'modern-model.py')
assets = load('musicq_assets', 'model-assets.py')
musicgen = load('musicq_musicgen', 'musicgen.py')
SPEC = {'resolvedPrompt': 'warm jazz', 'duration': 15, 'bpm': 80,
        'instrumental': True, 'seed': 42, 'output': '/tmp/musicq-contract.wav'}


class AdapterTests(unittest.TestCase):
    def test_musicgen_corrects_inherited_decoder_config_on_python314(self):
        class DecoderConfig:
            pass
        composite = SimpleNamespace(decoder=DecoderConfig(), audio_encoder=SimpleNamespace(sampling_rate=32000))
        class CompositeConfig:
            from_pretrained = Mock(return_value=composite)
        instance = Mock()
        instance.to.return_value = instance
        class CompositeModel:
            # Reproduce the observed Transformers 4.57 / Python 3.14 inheritance bug.
            config_class = DecoderConfig
            @classmethod
            def from_pretrained(cls, path, **kwargs):
                self.assertIs(cls.config_class, CompositeConfig)
                self.assertIs(kwargs['config'], composite)
                self.assertTrue(kwargs['local_files_only'])
                return instance
        processor = Mock()
        auto_processor = SimpleNamespace(from_pretrained=Mock(return_value=processor))
        modules = {'transformers': SimpleNamespace(AutoProcessor=auto_processor, MusicgenConfig=CompositeConfig, MusicgenForConditionalGeneration=CompositeModel)}
        with patch.dict(sys.modules, modules):
            result = musicgen.load_musicgen('/installed/musicgen-small', 'cpu')
        CompositeConfig.from_pretrained.assert_called_once_with('/installed/musicgen-small', local_files_only=True)
        instance.to.assert_called_once_with('cpu')
        instance.eval.assert_called_once()
        self.assertEqual(result, (processor, instance))

    def test_ace_xl_uses_selected_dit_lm_seed_and_wav(self):
        events = {}
        class Handler:
            def initialize_service(self, **kwargs):
                events['handler'] = kwargs
                return 'ready', True
        class LM:
            def initialize(self, **kwargs):
                events['lm'] = kwargs
                return 'ready', True
        def generate(handler, lm, params, config, **kwargs):
            events.update(params=params, config=config)
            return SimpleNamespace(success=True, audios=[{'path': 'output.wav'}])
        sound = SimpleNamespace(read=Mock(return_value=([0] * 2000, 100)), write=Mock())
        modules = {
            'acestep.handler': SimpleNamespace(AceStepHandler=Handler),
            'acestep.llm_inference': SimpleNamespace(LLMHandler=LM),
            'acestep.inference': SimpleNamespace(GenerationParams=SimpleNamespace, GenerationConfig=SimpleNamespace, generate_music=generate),
            'soundfile': sound,
        }
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, modules):
            adapter.generate_ace(SPEC, Path(root), {'variant': 'acestep-v15-xl-sft', 'lm': 'acestep-5Hz-lm-4B', 'steps': 50}, 'mps')
        self.assertEqual(events['handler']['config_path'], 'acestep-v15-xl-sft')
        self.assertEqual(events['lm']['lm_model_path'], 'acestep-5Hz-lm-4B')
        self.assertEqual(events['lm']['backend'], 'pt')
        self.assertEqual(events['params'].inference_steps, 50)
        self.assertEqual(events['params'].bpm, 80)
        self.assertEqual(events['config'].seeds, [42])
        self.assertFalse(events['config'].use_random_seed)
        self.assertEqual(len(sound.write.call_args.args[1]), 1500)
        self.assertEqual(sound.write.call_args.kwargs['subtype'], 'PCM_16')

    def test_initialization_failure_cannot_be_reported_as_success(self):
        handler = Mock()
        handler.initialize_service.return_value = ('not enough memory', False)
        modules = {'acestep.handler': SimpleNamespace(AceStepHandler=lambda: handler),
                   'acestep.llm_inference': SimpleNamespace(LLMHandler=Mock()),
                   'acestep.inference': SimpleNamespace(GenerationParams=Mock(), GenerationConfig=Mock(), generate_music=Mock()),
                   'soundfile': Mock()}
        with patch.dict(sys.modules, modules), self.assertRaisesRegex(RuntimeError, 'not enough memory'):
            adapter.generate_ace(SPEC, Path('/tmp'), {'variant': 'xl'}, 'cpu')

    def test_stable_uses_local_weights_and_server_duration_seed(self):
        class Tensor:
            def __getitem__(self, key): return self
            def detach(self): return self
            def cpu(self): return self
            def float(self): return self
            def numpy(self): return self
            @property
            def T(self): return self
        pipe = SimpleNamespace(generate=Mock(return_value=Tensor()), model=SimpleNamespace(sample_rate=44100))
        factory = Mock(return_value=pipe)
        registry = {}
        sound = SimpleNamespace(write=Mock())
        modules = {'stable_audio_3': SimpleNamespace(StableAudioModel=SimpleNamespace(from_pretrained=factory)),
                   'stable_audio_3.model_configs': SimpleNamespace(all_models=registry), 'soundfile': sound}
        with patch.dict(sys.modules, modules):
            adapter.generate_stable(SPEC, Path('/models/sa3'), {'variant': 'medium'}, 'cuda')
        self.assertEqual(registry['medium'].resolve()[0], '/models/sa3/weights/model_config.json')
        pipe.generate.assert_called_once_with(prompt='warm jazz', duration=15, seed=42, batch_size=1)
        self.assertEqual(sound.write.call_args.args[2], 44100)

    def test_xl_download_includes_codec_text_encoder_and_4b_lm(self):
        download = Mock()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, {'huggingface_hub': SimpleNamespace(snapshot_download=download)}):
            manifest = Path(root) / 'musicq-model.json'
            manifest.write_text(json.dumps({'family': 'ace-step', 'repo': 'ACE-Step/acestep-v15-xl-turbo', 'variant': 'acestep-v15-xl-turbo', 'lm': 'acestep-5Hz-lm-4B'}))
            assets.download_assets(manifest)
        self.assertEqual([c.kwargs['repo_id'] for c in download.call_args_list], [
            'ACE-Step/Ace-Step1.5', 'ACE-Step/acestep-v15-xl-turbo', 'ACE-Step/acestep-5Hz-lm-4B'])

    def test_stable_download_caches_text_encoder_before_offline_inference(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            (root / 'weights').mkdir()
            (root / 'weights' / 'model_config.json').write_text('{}')
            manifest = root / 'musicq-model.json'
            manifest.write_text(json.dumps({'family': 'stable-audio', 'repo': 'stabilityai/stable-audio-3-medium'}))
            download = Mock()
            with patch.dict(sys.modules, {'huggingface_hub': SimpleNamespace(snapshot_download=download)}):
                assets.download_assets(manifest)
            self.assertEqual(download.call_args_list[-1].kwargs['repo_id'], 'google/t5gemma-b-b-ul2')


if __name__ == '__main__':
    unittest.main()
