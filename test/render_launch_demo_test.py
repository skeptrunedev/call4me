# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11", "numpy>=2"]
# ///
"""Run with uv run test/render_launch_demo_test.py."""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import wave

import numpy as np

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location(
    "launch_renderer", Path(__file__).parents[1] / "scripts/render-launch-demo.py")
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class CallTimelineTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        rate = 48000
        signal = np.sin(2 * np.pi * 440 * np.arange(6 * rate) / rate) * 8000
        signal[int(1.5 * rate):2 * rate] = 0
        with wave.open(str(self.root / "source.wav"), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes(signal.astype("<i2").tobytes())
        self.edit = {
            "source": "source.wav", "provenance": "Synthetic test tone",
            "clips": [
                {"start": 1, "end": 3, "captions": [
                    {"start": 1.25, "end": 2.75, "speaker": "test", "text": "First"}]},
                {"start": 4, "end": 6, "captions": [
                    {"start": 4, "end": 6, "speaker": "test", "text": "Second"}]},
            ],
        }

    def load(self):
        path = self.root / "edit.json"
        path.write_text(json.dumps(self.edit))
        return renderer.load_edit(path)

    def test_legacy_timeline(self):
        edit = self.load()
        self.assertEqual(edit["audio_duration"], 4)
        self.assertEqual([(c["start"], c["end"]) for c in edit["cues"]],
                         [(.25, 1.75), (2, 4)])

    def test_typing_speed_preserves_completed_prompt_hold_and_call_timing(self):
        self.edit.update(typing_speed=2, terminal_typing_start_at=1,
                         terminal_typing_end_at=5, terminal_submit_at=7)
        edit = self.load()
        source_times = [0, .5, 1, 2, 5, 5.5, 7, 9]
        expected = [0, .5, 1, 1.5, 3, 3.5, 5, 7]
        self.assertEqual([renderer.intro_time(edit, t) for t in source_times], expected)
        self.assertEqual([renderer.intro_source_time(edit, t) for t in expected], source_times)
        self.assertEqual(renderer.intro_time(edit, 7) - renderer.intro_time(edit, 5), 2)
        self.assertEqual(edit["audio_duration"], 4)
        self.assertEqual(edit["cues"][0]["start"], .25)

    def test_typing_settings_validate_source_interval(self):
        for speed in [0, 4.1, float("nan"), float("inf")]:
            with self.subTest(speed=speed):
                self.edit["typing_speed"] = speed
                with self.assertRaisesRegex(ValueError, "typing_speed"):
                    self.load()
        self.edit.update(typing_speed=2, terminal_typing_start_at=1,
                         terminal_typing_end_at=5, terminal_submit_at=4)
        with self.assertRaisesRegex(ValueError, "prompt entry"):
            self.load()

    def test_silence_and_speed_retime_later_clips_and_spanning_captions(self):
        self.edit["call_speed"] = 1.25
        self.edit["clips"][0]["remove_silence"] = [{"start": 1.5, "end": 2}]
        edit = self.load()
        self.assertAlmostEqual(edit["audio_duration"], 2.8)
        self.assertEqual([(c["start"], c["end"]) for c in edit["cues"]],
                         [(.2, 1), (1.2, 2.8)])
        self.assertEqual(edit["silence_removed"], .5)

    def test_invalid_speed_and_overlapping_cuts(self):
        for speed in [0, 2.1, float("nan"), float("inf")]:
            with self.subTest(speed=speed):
                self.edit["call_speed"] = speed
                with self.assertRaises(ValueError):
                    self.load()
        self.edit["call_speed"] = 1
        self.edit["clips"][0]["remove_silence"] = [
            {"start": 1.5, "end": 2}, {"start": 1.9, "end": 2.1}]
        with self.assertRaisesRegex(ValueError, "overlapping"):
            self.load()

    def test_cannot_remove_spoken_caption_entirely(self):
        self.edit["clips"][0]["remove_silence"] = [{"start": 1.2, "end": 2.8}]
        with self.assertRaisesRegex(ValueError, "complete caption"):
            self.load()

    def test_rendered_audio_preserves_pitch_and_matches_caption_timeline(self):
        self.edit["call_speed"] = 1.25
        self.edit["clips"][0]["remove_silence"] = [{"start": 1.5, "end": 2}]
        edit = self.load()
        _, samples, rate = renderer.prepare_audio(edit, self.root)
        self.assertEqual(len(samples), round(2.8 * rate))
        tone = samples[round(.1 * rate):round(.35 * rate)]
        frequencies = np.fft.rfftfreq(len(tone), 1 / rate)
        peak = frequencies[np.argmax(np.abs(np.fft.rfft(tone)))]
        self.assertAlmostEqual(peak, 440, delta=4)

    def test_quiet_background_preserves_voice_gain_and_intro_outro(self):
        edit = self.load()
        call_path, _, rate = renderer.prepare_audio(edit, self.root)
        music = np.sin(2 * np.pi * 880 * np.arange(12 * rate) / rate) * 8000
        with wave.open(str(self.root / "music.wav"), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes(music.astype("<i2").tobytes())
        edit.update(intro_duration=2, result_duration=2, music={
            "source": "music.wav", "start": 0, "fade_out": .5, "fade_in": .5})

        def mix(folder):
            folder.mkdir()
            path = renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                              call_path, folder, 8)
            with wave.open(str(path)) as audio:
                self.assertEqual(audio.getnframes(), 8 * rate)
                return np.frombuffer(audio.readframes(audio.getnframes()),
                                     dtype="<i2").reshape(-1, 2).astype(float)

        baseline = mix(self.root / "baseline")
        edit["music"]["call_background_gain_db"] = -20
        background = mix(self.root / "background")
        # Adding a mixer input can change float accumulation by one PCM unit.
        np.testing.assert_allclose(background[:2 * rate], baseline[:2 * rate], atol=1, rtol=0)
        np.testing.assert_allclose(background[6 * rate:], baseline[6 * rate:], atol=1, rtol=0)
        a, b = round(3.25 * rate), round(3.75 * rate)
        voice = baseline[a:b, 0]
        mixed = background[a:b, 0]
        residual = mixed - voice
        relative_rms = np.sqrt(np.mean(residual ** 2) / np.mean(voice ** 2))
        self.assertGreater(relative_rms, .02)
        self.assertLess(relative_rms, .12)
        frequencies = np.fft.rfftfreq(len(residual), 1 / rate)
        peak = frequencies[np.argmax(np.abs(np.fft.rfft(residual)))]
        self.assertAlmostEqual(peak, 880, delta=2)
        # A gain change to the voices would leave a 440 Hz peak in the residual.
        spectrum = np.abs(np.fft.rfft(residual))
        self.assertLess(spectrum[np.argmin(abs(frequencies - 440))],
                        spectrum[np.argmin(abs(frequencies - 880))] * .01)
        self.assertLess(np.max(np.abs(background)), 32767)


if __name__ == "__main__":
    unittest.main()
