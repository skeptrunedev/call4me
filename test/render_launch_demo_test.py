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
from unittest.mock import patch
import wave

import numpy as np
from PIL import Image, ImageDraw

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

    def test_outro_zooms_without_scrolling_and_keeps_entire_final_response_in_view(self):
        edit = self.load()
        edit.update(intro_duration=2, result_duration=6, capture_duration=10,
                    terminal_result_at=4, terminal_submit_at=2)
        source = Image.new("RGB", (1580, 836), "white")
        ImageDraw.Draw(source).rectangle((22, 556, 1510, 641), fill="black")
        with patch.object(renderer, "native_frame", return_value=source):
            opening = renderer.scene(edit, 6, np.zeros(1), 48000)
            closing = renderer.scene(edit, 11, np.zeros(1), 48000)
        self.assertNotEqual(opening.tobytes(), closing.tobytes())
        first = renderer.outro_camera(edit, 0)
        last = renderer.outro_camera(edit, 5)
        self.assertLess(last[2] - last[0], first[2] - first[0])
        intro_first = renderer.camera(edit, 0)
        for t in np.linspace(0, 1.65, 31):
            intro_box = renderer.camera(edit, t)
            outro_box = renderer.outro_camera(edit, t)
            # Relative text growth and easing must match the actual intro camera.
            self.assertAlmostEqual((first[2] - first[0]) / (outro_box[2] - outro_box[0]),
                                   (intro_first[2] - intro_first[0]) /
                                   (intro_box[2] - intro_box[0]))
        self.assertLessEqual(last[0], 22)
        self.assertGreaterEqual(last[2], 1510)
        self.assertLessEqual(last[1], 556)
        self.assertGreaterEqual(last[3], 641)
        self.assertEqual(renderer.outro_camera(edit, 5, poster=True), last)
        # The response center must never translate while the text grows.
        center_x = (last[0] + last[2]) / 2
        center_y = (last[1] + last[3]) / 2
        for t in np.linspace(0, 3, 31):
            box = renderer.outro_camera(edit, t)
            self.assertAlmostEqual((center_x - box[0]) / (box[2] - box[0]), .5)
            self.assertAlmostEqual((center_y - box[1]) / (box[3] - box[1]), .5)

    def test_end_at_zoom_removes_result_hold(self):
        self.edit["end_at_response_zoom"] = True
        edit = self.load()
        edit.update(terminal_capture="capture.mp4", terminal_submit_at=2,
                    terminal_call_at=3, terminal_result_at=4)
        capture = self.root / "capture.mp4"
        capture.write_bytes(b"synthetic capture")
        digest = renderer.hashlib.sha256(capture.read_bytes()).hexdigest()
        frames = self.root / ("native-frames-" + digest[:12])
        frames.mkdir()
        (frames / "complete.json").write_text("{}")
        for i in range(300):
            (frames / f"{i + 1:05}.png").touch()
        for name in ["00001.png", "00300.png"]:
            Image.new("RGB", (1580, 836), "white").save(frames / name)
        renderer.prepare_terminal(edit, self.root / "edit.json", self.root)
        self.assertAlmostEqual(edit["result_duration"], 1.65)
        self.assertEqual(renderer.outro_camera(edit, edit["result_duration"]),
                         renderer.outro_camera(edit, edit["result_duration"], poster=True))
        edit["end_at_response_zoom"] = False
        renderer.prepare_terminal(edit, self.root / "edit.json", self.root)
        self.assertEqual(edit["result_duration"], 6)

    def cached_capture(self, name, size, count, color):
        capture = self.root / name
        capture.write_bytes(name.encode())
        digest = renderer.hashlib.sha256(capture.read_bytes()).hexdigest()
        folder = self.root / ("native-frames-" + digest[:12])
        folder.mkdir(exist_ok=True)
        (folder / "complete.json").write_text("{}")
        image = Image.new("RGB", size, color)
        first = folder / "00001.png"
        image.save(first)
        for i in range(1, count):
            (folder / f"{i + 1:05}.png").hardlink_to(first)
        return digest

    def test_separate_native_result_capture_preserves_intro_and_fills_screen(self):
        self.edit.update(terminal_capture="intro.mp4", terminal_submit_at=2,
                         terminal_call_at=3, terminal_result_at=4,
                         terminal_result_capture="result.mp4", result_capture_at=.5,
                         response_fullscreen=True, end_at_response_zoom=True,
                         response_zoom={"width": 1040})
        intro_digest = self.cached_capture("intro.mp4", (1580, 836), 300, "red")
        result_digest = self.cached_capture("result.mp4", (1696, 954), 90, "blue")
        edit = self.load()
        renderer.prepare_terminal(edit, self.root / "edit.json", self.root)
        self.assertEqual(edit["capture_sha256"], intro_digest)
        self.assertEqual(edit["result_capture_sha256"], result_digest)
        self.assertEqual(edit["intro_duration"], 3)
        self.assertEqual(edit["result_source_start"], .5)
        self.assertEqual(edit["result_duration"], 1.65)
        self.assertEqual(renderer.native_frame(edit, 0).getpixel((0, 0)), (255, 0, 0))
        # Native result pixels reach every edge; no editorial page or white fill remains.
        for t in [7, 7.8, 8.65]:
            image = renderer.scene(edit, t, np.zeros(1), 48000)
            self.assertEqual(image.getextrema(), ((0, 0), (0, 0), (255, 255)))
        self.assertEqual(renderer.outro_camera(edit, 0), (0, 0, 1696, 954))
        self.assertEqual(renderer.outro_camera(edit, 1.65), (0, 369, 1040, 954))
        for t in np.linspace(0, 1.65, 31):
            x, y, right, bottom = renderer.outro_camera(edit, t)
            self.assertEqual(x, 0)
            self.assertEqual(bottom, 954)
            self.assertGreaterEqual(y, 0)
            self.assertLessEqual(right, 1696)
            self.assertAlmostEqual((right - x) / (bottom - y), 16 / 9)

    def test_fullscreen_capture_rejects_wrong_aspect_size_or_short_footage(self):
        self.edit.update(terminal_capture="intro.mp4", terminal_submit_at=2,
                         terminal_call_at=3, terminal_result_at=4,
                         response_fullscreen=True, end_at_response_zoom=True,
                         response_zoom={"width": 1040})
        self.cached_capture("intro.mp4", (1580, 836), 300, "red")
        for name, size, count, message in [
                ("square.mp4", (954, 954), 90, "16:9"),
                ("small.mp4", (960, 540), 90, "fit inside"),
                ("short.mp4", (1696, 954), 30, "finish before")]:
            with self.subTest(name=name):
                self.cached_capture(name, size, count, "blue")
                self.edit["terminal_result_capture"] = name
                with self.assertRaisesRegex(ValueError, message):
                    renderer.prepare_terminal(self.load(), self.root / "edit.json", self.root)
        self.edit.update(terminal_result_capture="square.mp4", result_capture_at=2)
        with self.assertRaisesRegex(ValueError, "finish before"):
            renderer.prepare_terminal(self.load(), self.root / "edit.json", self.root)

    def test_result_capture_settings_require_finite_start_and_boolean_mode(self):
        for value in [-1, float("nan"), float("inf")]:
            self.edit["result_capture_at"] = value
            with self.assertRaisesRegex(ValueError, "result_capture_at"):
                self.load()
        self.edit.update(result_capture_at=0, response_fullscreen="true")
        with self.assertRaisesRegex(ValueError, "response_fullscreen"):
            self.load()

    def test_dissolves_remove_boundary_jump_without_changing_scene_timing(self):
        edit = self.load()
        edit.update(intro_duration=2, result_duration=6, capture_duration=10,
                    terminal_result_at=4, terminal_submit_at=1,
                    call_transition_duration=.45)
        source = Image.new("RGB", (1580, 836), "white")
        ImageDraw.Draw(source).rectangle((100, 500, 1400, 700), fill="blue")
        samples = np.zeros(48000)
        with patch.object(renderer, "native_frame", return_value=source):
            for boundary in [2, 6]:
                with self.subTest(boundary=boundary):
                    before = np.array(renderer.scene(edit, boundary - 1 / 120,
                                                     samples, 48000), dtype=float)
                    after = np.array(renderer.scene(edit, boundary + 1 / 120,
                                                    samples, 48000), dtype=float)
                    hard_before = np.array(renderer.scene_frame(
                        edit, boundary - 1 / 120, samples, 48000), dtype=float)
                    hard_after = np.array(renderer.scene_frame(
                        edit, boundary + 1 / 120, samples, 48000), dtype=float)
                    self.assertLess(np.mean(abs(after - before)),
                                    np.mean(abs(hard_after - hard_before)) * .1)
            # Away from transitions, native scenes and the final zoom stay intact.
            for t in [0, 3, 8, 11]:
                self.assertEqual(renderer.scene(edit, t, samples, 48000).tobytes(),
                                 renderer.scene_frame(edit, t, samples, 48000).tobytes())

    def test_invalid_transition_duration(self):
        for duration in [-.1, 1.1, float("nan"), float("inf")]:
            with self.subTest(duration=duration):
                self.edit["call_transition_duration"] = duration
                with self.assertRaisesRegex(ValueError, "call_transition_duration"):
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

    def test_continuous_song_has_no_boundary_gap_or_restart_and_preserves_voice(self):
        edit = self.load()
        call_path, voice, rate = renderer.prepare_audio(edit, self.root)
        # Nonperiodic carrier period relative to either boundary detects cue restarts.
        frequency = 883.7
        carrier = np.sin(2 * np.pi * frequency * np.arange(12 * rate) / rate)
        with wave.open(str(self.root / "music.wav"), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(rate)
            audio.writeframes((carrier * 8000).astype("<i2").tobytes())
        edit.update(intro_duration=2, result_duration=2, call_transition_duration=.45,
                    music={"source": "music.wav", "start": 0, "fade_out": .5,
                           "fade_in": .5, "call_background_gain_db": -20,
                           "continuous": True})
        path = renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                          call_path, self.root, 8)

        def read(path):
            with wave.open(str(path)) as audio:
                self.assertEqual(audio.getnframes(), 8 * rate)
                return np.frombuffer(audio.readframes(audio.getnframes()),
                                     dtype="<i2").reshape(-1, 2).astype(float)

        mixed = read(path)
        score = read(self.root / "music-bed.wav")
        residual = mixed - score
        # Subtracting the score recovers the original call without any gain change.
        a, b = round(2.1 * rate), round(5.8 * rate)
        np.testing.assert_allclose(residual[a:b, 0], voice[a - 2 * rate:b - 2 * rate]
                                   * 32768, atol=1, rtol=0)
        for boundary in [2, 6]:
            a, b = round((boundary - .01) * rate), round((boundary + .01) * rate)
            tone = score[a:b, 0]
            self.assertGreater(np.sqrt(np.mean(tone ** 2)), 100)
            # Correlation across each boundary confirms uninterrupted song position.
            self.assertGreater(np.corrcoef(tone, carrier[a:b])[0, 1], .999)
            left_rms = np.sqrt(np.mean(tone[:len(tone) // 2] ** 2))
            right_rms = np.sqrt(np.mean(tone[len(tone) // 2:] ** 2))
            self.assertAlmostEqual(left_rms / right_rms, 1, delta=.05)
        opening_rms = np.sqrt(np.mean(score[rate:round(1.25 * rate), 0] ** 2))
        background_rms = np.sqrt(np.mean(score[3 * rate:round(3.25 * rate), 0] ** 2))
        closing_rms = np.sqrt(np.mean(score[round(6.6 * rate):round(6.85 * rate), 0] ** 2))
        self.assertAlmostEqual(background_rms / opening_rms, .1, delta=.002)
        # Loudness normalization can vary the carrier gain slightly over time.
        self.assertAlmostEqual(closing_rms / opening_rms, 1, delta=.01)
        self.assertLess(np.max(np.abs(mixed)), 32767)
        # A fractional endpoint must preserve the full isolated verification timeline.
        edit["result_duration"] = 2.105
        fractional = self.root / "fractional-score"
        fractional.mkdir()
        renderer.prepare_soundtrack(edit, self.root / "edit.json", call_path,
                                    fractional, 8.105)
        for name in ["soundtrack.wav", "music-bed.wav"]:
            with wave.open(str(fractional / name)) as audio:
                self.assertEqual(audio.getnframes(), round(8.105 * rate))

    def test_ringback_adds_only_selected_original_speed_cue_without_retiming(self):
        edit = self.load()
        call_path, _, rate = renderer.prepare_audio(edit, self.root)
        # A nonperiodic frequency reveals a changed source offset or playback speed.
        ring = (np.sin(2 * np.pi * 623.7 * np.arange(4 * rate) / rate)
                * 4000).astype("<i2")
        music = (np.sin(2 * np.pi * 883.7 * np.arange(12 * rate) / rate)
                 * 6000).astype("<i2")
        for name, samples in [("ring.wav", ring), ("music.wav", music)]:
            with wave.open(str(self.root / name), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(rate)
                audio.writeframes(samples.tobytes())
        edit.update(intro_duration=2, result_duration=2, terminal_submit_at=1)

        def read(path):
            with wave.open(str(path)) as audio:
                self.assertEqual(audio.getnframes(), 8 * rate)
                return np.frombuffer(audio.readframes(audio.getnframes()),
                                     dtype="<i2").reshape(-1, 2).astype(float)

        for mode in ["none", "separate", "continuous"]:
            with self.subTest(mode=mode):
                edit.pop("ringback", None)
                edit.pop("music", None)
                if mode != "none":
                    edit["music"] = {
                        "source": "music.wav", "start": 0, "fade_out": .5,
                        "fade_in": .5, "call_background_gain_db": -20,
                        "continuous": mode == "continuous"}
                baseline_folder = self.root / (mode + "-baseline")
                baseline_folder.mkdir()
                baseline = read(renderer.prepare_soundtrack(
                    edit, self.root / "edit.json", call_path, baseline_folder, 8))
                # Exercise the default gain as well as an explicit cue level.
                gain = -6 if mode == "none" else -9
                edit["ringback"] = {
                    "source": "ring.wav", "start": 1.2, "source_start": .2,
                    "duration": .6, "music_duck_db": 0}
                if mode != "none":
                    edit["ringback"]["gain_db"] = gain
                folder = self.root / (mode + "-ring")
                folder.mkdir()
                mixed = read(renderer.prepare_soundtrack(
                    edit, self.root / "edit.json", call_path, folder, 8))
                isolated = read(folder / "ringback-bed.wav")
                start, end = round(1.2 * rate), round(1.8 * rate)
                self.assertTrue(np.all(isolated[:start] == 0))
                self.assertTrue(np.all(isolated[end:] == 0))
                # Between the click prevention fades, samples retain source phase and gain.
                a, b = start + round(.05 * rate), end - round(.05 * rate)
                # Match FFmpeg's standard mono to stereo conversion, then the requested gain.
                expected = (ring[round(.25 * rate):round(.75 * rate)]
                            * 10 ** (gain / 20) / np.sqrt(2))
                np.testing.assert_allclose(isolated[a:b, 0], expected, atol=1, rtol=0)
                np.testing.assert_allclose(mixed - isolated, baseline, atol=1, rtol=0)
                np.testing.assert_allclose(mixed[:start], baseline[:start], atol=1, rtol=0)
                np.testing.assert_allclose(mixed[end:], baseline[end:], atol=1, rtol=0)
                if mode == "continuous":
                    self.assertEqual((folder / "music-bed.wav").read_bytes(),
                                     (baseline_folder / "music-bed.wav").read_bytes())
                self.assertLess(np.max(np.abs(mixed)), 32767)

                if mode == "continuous":
                    edit["ringback"].pop("music_duck_db")
                    duck_folder = self.root / "continuous-duck"
                    duck_folder.mkdir()
                    ducked = read(renderer.prepare_soundtrack(
                        edit, self.root / "edit.json", call_path, duck_folder, 8))
                    score = read(duck_folder / "music-bed.wav")
                    original_score = read(baseline_folder / "music-bed.wav")
                    # The song carries on through the ring with a short smooth level dip.
                    a, b = round(1.3 * rate), round(1.45 * rate)
                    np.testing.assert_allclose(score[a:b], original_score[a:b]
                                               * 10 ** (-4 / 20), atol=1, rtol=0)
                    np.testing.assert_allclose(score[:rate], original_score[:rate],
                                               atol=1, rtol=0)
                    np.testing.assert_allclose(score[2 * rate:], original_score[2 * rate:],
                                               atol=1, rtol=0)
                    # Isolating the two beds leaves exactly the original call track.
                    np.testing.assert_allclose(ducked - score - isolated,
                                               baseline - original_score, atol=2, rtol=0)
                    self.assertGreater(np.corrcoef(score[a:b, 0],
                                                  original_score[a:b, 0])[0, 1], .999)

    def test_ringback_rejects_invalid_source_settings_and_cues_outside_intro(self):
        edit = self.load()
        edit.update(intro_duration=2, result_duration=2, terminal_submit_at=1)
        cue = {"source": "source.wav", "start": 1.2, "duration": .6}
        for key, value in [
                ("start", float("nan")), ("start", float("inf")),
                ("source_start", -1), ("source_start", float("nan")),
                ("duration", 0), ("duration", float("inf")),
                ("gain_db", float("nan")), ("gain_db", 1),
                ("music_duck_db", float("inf")), ("music_duck_db", -13),
                ("source", "missing.wav"), ("source", None),
                ("start", .9), ("start", 1.5)]:
            with self.subTest(key=key, value=value):
                edit["ringback"] = {**cue, key: value}
                with patch.object(renderer, "run") as execute:
                    with self.assertRaisesRegex(ValueError, "[Rr]ingback"):
                        renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                                    self.root / "source.wav", self.root, 8)
                    execute.assert_not_called()
        # Submission is evaluated on the accelerated typing timeline, not source time.
        edit.update(typing_start=.5, typing_end=1.5, typing_speed=2,
                    terminal_submit_at=1.75, ringback=cue)
        with self.assertRaisesRegex(ValueError, "after prompt submission"):
            renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                        self.root / "source.wav", self.root, 8)

    def test_hangup_adds_only_post_call_cue_and_preserves_music_ring_and_voice(self):
        edit = self.load()
        call_path, _, rate = renderer.prepare_audio(edit, self.root)
        effect = (np.sin(2 * np.pi * 743.7 * np.arange(rate) / rate)
                  * 5000).astype("<i2")
        music = (np.sin(2 * np.pi * 883.7 * np.arange(12 * rate) / rate)
                 * 6000).astype("<i2")
        for name, samples in [("hangup.wav", effect), ("music.wav", music)]:
            with wave.open(str(self.root / name), "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(rate)
                audio.writeframes(samples.tobytes())
        edit.update(intro_duration=2, result_duration=2, terminal_submit_at=1,
                    ringback={"source": "source.wav", "start": 1.2, "duration": .3})

        def read(path):
            with wave.open(str(path)) as audio:
                self.assertEqual(audio.getnframes(), 8 * rate)
                return np.frombuffer(audio.readframes(audio.getnframes()),
                                     dtype="<i2").reshape(-1, 2).astype(float)

        for mode in ["none", "separate", "continuous"]:
            with self.subTest(mode=mode):
                edit.pop("hangup", None)
                edit.pop("music", None)
                if mode != "none":
                    edit["music"] = {
                        "source": "music.wav", "start": 0, "fade_out": .5,
                        "fade_in": .5, "call_background_gain_db": -20,
                        "continuous": mode == "continuous"}
                baseline_folder = self.root / (mode + "-before-hangup")
                baseline_folder.mkdir()
                baseline = read(renderer.prepare_soundtrack(
                    edit, self.root / "edit.json", call_path, baseline_folder, 8))
                edit["hangup"] = {
                    "source": "hangup.wav", "start": 6.02, "duration": .18,
                    "source_start": .2, "gain_db": -9}
                folder = self.root / (mode + "-with-hangup")
                folder.mkdir()
                mixed = read(renderer.prepare_soundtrack(
                    edit, self.root / "edit.json", call_path, folder, 8))
                isolated = read(folder / "hangup-bed.wav")
                start, end = round(6.02 * rate), round(6.2 * rate)
                self.assertTrue(np.all(isolated[:start] == 0))
                self.assertTrue(np.all(isolated[end:] == 0))
                # Original source phase verifies both the offset and playback speed.
                a, b = start + round(.05 * rate), end - round(.05 * rate)
                expected = effect[round(.25 * rate):round(.33 * rate)]
                expected = expected * 10 ** (-9 / 20) / np.sqrt(2)
                np.testing.assert_allclose(isolated[a:b, 0], expected, atol=1, rtol=0)
                np.testing.assert_allclose(mixed - isolated, baseline, atol=1, rtol=0)
                np.testing.assert_allclose(mixed[:start], baseline[:start], atol=1, rtol=0)
                np.testing.assert_allclose(mixed[end:], baseline[end:], atol=1, rtol=0)
                self.assertEqual((folder / "ringback-bed.wav").read_bytes(),
                                 (baseline_folder / "ringback-bed.wav").read_bytes())
                if mode == "continuous":
                    self.assertEqual((folder / "music-bed.wav").read_bytes(),
                                     (baseline_folder / "music-bed.wav").read_bytes())
                self.assertLess(np.max(abs(mixed)), 32767)

    def test_hangup_rejects_invalid_sources_and_cues_outside_post_call_window(self):
        edit = self.load()
        edit.update(intro_duration=2, result_duration=2)
        cue = {"source": "source.wav", "start": 6.02, "duration": .18}
        for key, value in [
                ("source", "missing.wav"), ("source", None),
                ("start", float("nan")), ("start", float("inf")),
                ("source_start", -1), ("source_start", float("nan")),
                ("duration", 0), ("duration", float("inf")),
                ("gain_db", float("nan")), ("gain_db", 1),
                ("start", 5.9), ("start", 6.15), ("start", 6.26)]:
            with self.subTest(key=key, value=value):
                edit["hangup"] = {**cue, key: value}
                with patch.object(renderer, "run") as execute:
                    with self.assertRaisesRegex(ValueError, "[Hh]angup"):
                        renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                                    self.root / "source.wav", self.root, 8)
                    execute.assert_not_called()
        edit["hangup"] = cue
        edit["response_zoom"]["start"] = 0
        with self.assertRaisesRegex(ValueError, "before the final zoom"):
            renderer.prepare_soundtrack(edit, self.root / "edit.json",
                                        self.root / "source.wav", self.root, 8)


if __name__ == "__main__":
    unittest.main()
