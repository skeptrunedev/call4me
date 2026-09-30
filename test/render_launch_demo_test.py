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


if __name__ == "__main__":
    unittest.main()
