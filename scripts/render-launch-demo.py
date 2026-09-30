#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=11", "numpy>=2"]
# ///
"""Render a source-backed terminal replay with selected original call audio.

Usage: uv run scripts/render-launch-demo.py /private/edit.json /output/folder
The edit manifest and media stay outside git. See docs/launch-demo.md.
"""

import argparse
import hashlib
from functools import lru_cache
import json
import math
import shutil
import subprocess
import textwrap
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
BG, INK = "#ffffff", "#000000"
MUTED, LINE, ACCENT = "#666666", "#cccccc", "#0000ff"
REGULAR = Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf")
BOLD = Path("/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf")
INTRO_WIDE = (-112, 0, 1804)
INTRO_CLOSE = (-20, 430, 1100)
ZOOM_DELAY, ZOOM_DURATION = .25, 1.4


def run(argv):
    subprocess.run(argv, check=True)


@lru_cache(maxsize=32)
def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else REGULAR), size)


def ease(a, b, t):
    u = min(1, max(0, t))
    return a + (b - a) * (u * u * (3 - 2 * u))


@lru_cache(maxsize=512)
def text_mask(value, size, bold):
    face = font(size, bold)
    bounds = face.getbbox(value)
    mask = Image.new("L", (max(1, bounds[2] + 1), max(1, bounds[3] + 1)))
    ImageDraw.Draw(mask).text((0, 0), value, font=face, fill=255)
    return mask


def draw_text(draw, xy, value, size=30, fill=INK, bold=False):
    draw.bitmap(xy, text_mask(value, size, bold), fill=fill)


def draw_link(draw, xy, value, size=30):
    draw_text(draw, xy, value, size, ACCENT)
    x, y = xy
    baseline = y + font(size).getbbox(value)[3] + 2
    draw.line((x, baseline, x + font(size).getlength(value), baseline), fill=ACCENT, width=1)


def wrapped(draw, xy, value, size=32, columns=75, fill=INK, gap=14):
    x, y = xy
    for line in textwrap.wrap(value, width=columns):
        draw_text(draw, (x, y), line, size, fill)
        y += size + gap
    return y


def stamp(t):
    return f"{int(t) // 60:02}:{int(t) % 60:02}"


def subtitle_stamp(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def intro_time(edit, source_t):
    """Map a native capture timestamp to the edited intro timeline."""
    start, end = edit["typing_start"], edit["typing_end"]
    if source_t <= start:
        return source_t
    return (start + (min(source_t, end) - start) / edit["typing_speed"]
            + max(0, source_t - end))


def intro_source_time(edit, t):
    """Select original capture frames, accelerating only the typing interval."""
    start = edit["typing_start"]
    if t <= start:
        return t
    typing_end = intro_time(edit, edit["typing_end"])
    return (start + (min(t, typing_end) - start) * edit["typing_speed"]
            + max(0, t - typing_end))


def camera_box(x, y, width):
    return x, y, x + width, y + width * 816 / 1760


def load_edit(path):
    edit = json.loads(path.read_text())
    source = (path.parent / edit["source"]).resolve()
    if not source.is_file():
        raise ValueError(f"Source recording does not exist: {source}")
    if not edit.get("provenance"):
        raise ValueError("The manifest must identify the original session and call.")
    with wave.open(str(source)) as audio:
        duration = audio.getnframes() / audio.getframerate()
    speed = float(edit.get("call_speed", 1))
    if not math.isfinite(speed) or not .5 <= speed <= 2:
        raise ValueError("call_speed must be between 0.5 and 2")
    typing_speed = float(edit.get("typing_speed", 1))
    if not math.isfinite(typing_speed) or not 1 <= typing_speed <= 4:
        raise ValueError("typing_speed must be between 1 and 4")
    typing_start = float(edit.get("terminal_typing_start_at", 0))
    typing_end = float(edit.get("terminal_typing_end_at", 0))
    if typing_speed != 1 and not (0 <= typing_start < typing_end <
                                  edit.get("terminal_submit_at", 0)):
        raise ValueError("Accelerated typing requires start and end within the prompt entry")
    edit.update(typing_speed=typing_speed, typing_start=typing_start, typing_end=typing_end)
    zoom = {"x": 0, "y": 234, "width": 1580,
            "opening_scale": INTRO_WIDE[2] / INTRO_CLOSE[2],
            "start": ZOOM_DELAY, "duration": ZOOM_DURATION}
    zoom.update(edit.get("response_zoom", {}))
    zoom = {key: float(value) for key, value in zoom.items()}
    if not (all(math.isfinite(value) for value in zoom.values()) and
            zoom["width"] > 0 and zoom["opening_scale"] > 1 and
            zoom["start"] >= 0 and zoom["duration"] > 0):
        raise ValueError("Invalid final response camera crop or zoom timing")
    edit["response_zoom"] = zoom
    if not isinstance(edit.get("end_at_response_zoom", False), bool):
        raise ValueError("end_at_response_zoom must be a boolean")
    edit["end_at_response_zoom"] = edit.get("end_at_response_zoom", False)
    if not isinstance(edit.get("response_fullscreen", False), bool):
        raise ValueError("response_fullscreen must be a boolean")
    edit["response_fullscreen"] = edit.get("response_fullscreen", False)
    result_at = float(edit.get("result_capture_at", 0))
    if not math.isfinite(result_at) or result_at < 0:
        raise ValueError("result_capture_at must be a finite nonnegative timestamp")
    edit["result_capture_at"] = result_at
    transition = float(edit.get("call_transition_duration", 0))
    if not math.isfinite(transition) or not 0 <= transition <= 1:
        raise ValueError("call_transition_duration must be between 0 and 1")
    edit["call_transition_duration"] = transition
    offset = 0.0
    cues = []
    segments = []
    removed = 0.0
    for clip in edit["clips"]:
        start, end = clip["start"], clip["end"]
        if not 0 <= start < end <= duration:
            raise ValueError(f"Invalid audio cut: {start}..{end}")
        # Explicit, reviewed source ranges keep quiet consonants out of silence cuts.
        kept = []
        cursor = start
        for cut in clip.get("remove_silence", []):
            lo, hi = cut["start"], cut["end"]
            if not cursor <= lo < hi <= end:
                raise ValueError(f"Invalid or overlapping silence cut: {cut}")
            if cursor < lo:
                kept.append({"start": cursor, "end": lo})
            removed += hi - lo
            cursor = hi
        if cursor < end:
            kept.append({"start": cursor, "end": end})
        if not kept:
            raise ValueError("A silence edit cannot remove an entire clip")

        def elapsed(t):
            return sum(max(0, min(t, span["end"]) - span["start"])
                       for span in kept) / speed

        for cue in clip["captions"]:
            if not start <= cue["start"] < cue["end"] <= end:
                raise ValueError(f"Caption outside selected audio: {cue}")
            cue_start, cue_end = elapsed(cue["start"]), elapsed(cue["end"])
            if cue_start >= cue_end:
                raise ValueError(f"Silence edit removes a complete caption: {cue}")
            cues.append({**cue, "start": offset + cue_start,
                         "end": offset + cue_end})
        segments.extend(kept)
        offset += elapsed(end)
    if not segments:
        raise ValueError("At least one audio clip is required")
    edit.update(source_path=source, cues=cues, audio_duration=offset,
                audio_segments=segments, call_speed=speed, silence_removed=removed)
    return edit


def prepare_audio(edit, output):
    # Trim before normalization, so all measurements describe only the selected audio.
    # Tiny edge fades prevent clicks. Tempo changes preserve the original voices.
    filters = []
    for i, clip in enumerate(edit["audio_segments"]):
        duration = clip["end"] - clip["start"]
        fade = min(.008, duration / 2)
        filters.append(
            f"[0:a]atrim=start={clip['start']}:end={clip['end']},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d={fade},afade=t=out:st={duration - fade}:d={fade}[a{i}]"
        )
    labels = "".join(f"[a{i}]" for i in range(len(edit["audio_segments"])))
    tempo = f"atempo={edit['call_speed']}," if edit["call_speed"] != 1 else ""
    # Pin the master to the caption timeline after tempo processing and resampling.
    samples = round(edit["audio_duration"] * 48000)
    filters.append(f"{labels}concat=n={len(edit['audio_segments'])}:v=0:a=1,"
                   f"{tempo}loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,"
                   f"apad=whole_len={samples},atrim=end_sample={samples}[out]")
    audio_path = output / "call-excerpt.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(edit["source_path"]),
         "-filter_complex", ";".join(filters), "-map", "[out]", "-ar", "48000",
         "-ac", "1", str(audio_path)])
    with wave.open(str(audio_path)) as audio:
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
        rate = audio.getframerate()
    return audio_path, samples.astype(np.float32) / 32768, rate


def prepare_soundtrack(edit, manifest, call_audio, output, total):
    """Preserve voice gain, with an optional quiet music bed during the call."""
    rate = 48000
    intro, result = edit["intro_duration"], edit["result_duration"]
    call_end = intro + edit["audio_duration"]
    inputs = ["-i", str(call_audio)]
    voice_fades = ""
    if edit["call_transition_duration"]:
        fade_in = min(.08, edit["audio_duration"] / 2)
        fade_out = min(.12, edit["audio_duration"] / 2)
        voice_fades = (f"afade=t=in:d={fade_in}:curve=hsin,"
                       f"afade=t=out:st={edit['audio_duration'] - fade_out}:"
                       f"d={fade_out}:curve=hsin,")
    filters = [f"[0:a]pan=stereo|c0=c0|c1=c0,{voice_fades}"
               f"adelay={round(intro * rate)}S:all=1,apad,atrim=duration={total}[call]"]
    music_master = None
    music = edit.get("music")
    if music:
        source = (manifest.parent / music["source"]).resolve()
        if not source.is_file():
            raise ValueError(f"Music source does not exist: {source}")
        start = float(music["start"])
        resume = float(music.get("outro_start", start))
        fade_out = float(music.get("fade_out", 1.1))
        fade_in = float(music.get("fade_in", .65))
        gap = float(music.get("silence_before_call", .15))
        level = float(music.get("loudness", -19))
        background_gain = music.get("call_background_gain_db")
        if background_gain is not None:
            background_gain = float(background_gain)
            if not math.isfinite(background_gain) or not -60 <= background_gain <= -12:
                raise ValueError("call_background_gain_db must be between -60 and -12")
        intro_music = intro - gap
        continuous = bool(music.get("continuous", False))
        valid_cues = start >= 0 if continuous else min(start, resume) >= 0 and 0 < gap < intro
        if not (valid_cues and 0 < fade_out < (intro if continuous else intro_music) and
                0 < fade_in < result and
                -30 <= level <= -14):
            raise ValueError("Invalid music cue, fade, or loudness setting")
        inputs += ["-i", str(source)]
        if continuous:
            if background_gain is None:
                raise ValueError("Continuous music requires call_background_gain_db")
            low = 10 ** (background_gain / 20)
            down = f"clip((t-{intro - fade_out})/{fade_out},0,1)"
            up = f"clip((t-{call_end})/{fade_in},0,1)"
            gain = (f"1+({low}-1)*({down})^2*(3-2*({down}))"
                    f"+(1-{low})*({up})^2*(3-2*({up}))")
            filters += [
                f"[1:a]atrim=start={start}:duration={total},asetpts=PTS-STARTPTS,"
                f"loudnorm=I={level}:TP=-2:LRA=11,aresample={rate},"
                "aformat=channel_layouts=stereo,"
                f"aeval=exprs='val(0)*({gain})|val(1)*({gain})':c=stereo,"
                "afade=t=in:d=0.03:curve=hsin,"
                f"afade=t=out:st={max(0, total - .8)}:d={min(.8, total)}:curve=hsin,"
                "apad,"
                f"atrim=duration={total},asplit=2[score][score_master]",
                f"[call][score]amix=inputs=2:normalize=0:dropout_transition=0,"
                f"atrim=duration={total}[out]",
            ]
            music_master = output / "music-bed.wav"
            mapped = "[out]"
        else:
            filters.extend(separate_music_cues(edit, total, rate))
            mapped = "[out]"
    else:
        mapped = "[call]"
    soundtrack = output / "soundtrack.wav"
    command = ["ffmpeg", "-y", "-loglevel", "error", *inputs,
               "-filter_complex", ";".join(filters), "-map", mapped,
               "-ar", str(rate), "-ac", "2", "-c:a", "pcm_s16le", str(soundtrack)]
    if music_master:
        command += ["-map", "[score_master]", "-ar", str(rate), "-ac", "2",
                    "-c:a", "pcm_s16le", str(music_master)]
    run(command)
    return soundtrack


def separate_music_cues(edit, total, rate):
    """Keep the original independent intro, background, and result cue mode."""
    music = edit["music"]
    intro, result = edit["intro_duration"], edit["result_duration"]
    call_end = intro + edit["audio_duration"]
    start = float(music["start"])
    resume = float(music.get("outro_start", start))
    intro_music = intro - float(music.get("silence_before_call", .15))
    fade_out = float(music.get("fade_out", 1.1))
    fade_in = float(music.get("fade_in", .65))
    level = float(music.get("loudness", -19))
    background_gain = music.get("call_background_gain_db")
    filters = [
        "[1:a]asplit=3[mi][mo][mb]" if background_gain is not None
        else "[1:a]asplit=2[mi][mo]",
        f"[mi]atrim=start={start}:duration={intro_music},asetpts=PTS-STARTPTS[ic]",
        f"[mo]atrim=start={resume}:duration={result},asetpts=PTS-STARTPTS[oc]",
        "[ic][oc]concat=n=2:v=0:a=1,"
        f"loudnorm=I={level}:TP=-2:LRA=11,aresample={rate},"
        "aformat=channel_layouts=stereo,asplit=2[ni][no]",
        f"[ni]atrim=duration={intro_music},asetpts=PTS-STARTPTS,"
        "afade=t=in:d=0.03,"
        f"afade=t=out:st={intro_music - fade_out}:d={fade_out}[opening]",
        f"[no]atrim=start={intro_music},asetpts=PTS-STARTPTS,"
        f"afade=t=in:d={fade_in},"
        f"afade=t=out:st={max(0, result - .8)}:d={min(.8, result)},"
        f"adelay={round(call_end * rate)}S:all=1[closing]",
    ]
    tracks = "[call][opening][closing]"
    if background_gain is not None:
        duration = edit["audio_duration"]
        fade = min(.3, duration / 2)
        filters.append(
            f"[mb]atrim=start={start + intro}:duration={duration},asetpts=PTS-STARTPTS,"
            f"loudnorm=I={level}:TP=-2:LRA=11,aresample={rate},"
            f"aformat=channel_layouts=stereo,volume={background_gain}dB,"
            f"afade=t=in:d={fade},afade=t=out:st={duration - fade}:d={fade},"
            f"adelay={round(intro * rate)}S:all=1[background]"
        )
        tracks += "[background]"
    filters.append(f"{tracks}amix=inputs={4 if background_gain is not None else 3}:"
                   f"normalize=0:dropout_transition=0,atrim=duration={total}[out]")
    return filters


def decode_terminal(capture, output):
    """Decode a continuous native video into a cache keyed by its content."""
    if not capture.is_file():
        raise ValueError(f"Continuous terminal capture missing: {capture}")
    digest = hashlib.sha256(capture.read_bytes()).hexdigest()
    folder = output / ("native-frames-" + digest[:12])
    folder.mkdir(parents=True, exist_ok=True)
    marker = folder / "complete.json"
    if not marker.exists():
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(capture),
             "-vf", f"fps={FPS}", str(folder / "%05d.png")])
        marker.write_text(json.dumps({"source": str(capture), "sha256": digest}))
    frames = sorted(folder.glob("*.png"))
    if not frames:
        raise ValueError("The terminal recording has no frames")
    with Image.open(frames[0]) as first:
        size = first.size
    with Image.open(frames[-1]) as last:
        if last.size != size:
            raise ValueError("Native terminal capture dimensions changed during recording")
    return frames, digest, len(frames) / FPS, size


def prepare_terminal(edit, manifest, output):
    """Select native intro and result footage without assembling terminal images."""
    capture = (manifest.parent / edit["terminal_capture"]).resolve()
    frames, digest, duration, size = decode_terminal(capture, output)
    edit.update(native_frames=frames, capture_sha256=digest,
                capture_duration=duration, capture_size=size)
    call_at, result_at = edit["terminal_call_at"], edit["terminal_result_at"]
    if not 0 < edit["terminal_submit_at"] < call_at < result_at < edit["capture_duration"]:
        raise ValueError("Expected submit, calling, then completed result within the native capture")
    edit["intro_duration"] = intro_time(edit, call_at)
    if edit.get("terminal_result_capture"):
        result_capture = (manifest.parent / edit["terminal_result_capture"]).resolve()
        result_frames, result_digest, result_duration, result_size = decode_terminal(
            result_capture, output)
        result_start = edit["result_capture_at"]
    else:
        result_frames, result_digest, result_duration, result_size = frames, digest, duration, size
        result_start = result_at
    edit.update(result_frames=result_frames, result_capture_sha256=result_digest,
                result_capture_duration=result_duration, result_capture_size=result_size,
                result_source_start=result_start)
    available = result_duration - result_start
    zoom_end = edit["response_zoom"]["start"] + edit["response_zoom"]["duration"]
    if zoom_end > available:
        raise ValueError("Final response zoom must finish before the result footage ends")
    if edit["response_fullscreen"]:
        width, height = result_size
        if width * H != height * W:
            raise ValueError("Fullscreen result capture must have a 16:9 aspect ratio")
        if not 0 < edit["response_zoom"]["width"] < width:
            raise ValueError("Fullscreen response crop must fit inside the result capture")
    edit["result_duration"] = zoom_end if edit["end_at_response_zoom"] else available


def native_frame(edit, t, result=False):
    frames = edit.get("result_frames", edit["native_frames"]) if result else edit["native_frames"]
    index = min(len(frames) - 1, max(0, int(t * FPS)))
    return Image.open(frames[index]).convert("RGB")


def camera(edit, t):
    # Fixed aspect ratio throughout. The close view fits all three prompt lines.
    wide = camera_box(*INTRO_WIDE)
    close = camera_box(*INTRO_CLOSE)
    submit = intro_time(edit, edit["terminal_submit_at"])
    if t < submit:
        u = ease(0, 1, (t - ZOOM_DELAY) / ZOOM_DURATION)
    else:
        u = ease(1, 0, (t - submit) / .9)
    return tuple(a + (b - a) * u for a, b in zip(wide, close))


def outro_camera(edit, t, poster=False):
    """Frame the native result with its configured zoom and anchor."""
    zoom = edit["response_zoom"]
    if edit["response_fullscreen"]:
        opening_width, bottom = edit["result_capture_size"]
        u = 1 if poster else ease(0, 1, (t - zoom["start"]) / zoom["duration"])
        width = opening_width + (zoom["width"] - opening_width) * u
        return 0, bottom - width * H / W, width, bottom
    response = camera_box(zoom["x"], zoom["y"], zoom["width"])
    if poster:
        return response
    u = ease(0, 1, (t - zoom["start"]) / zoom["duration"])
    width = zoom["width"] * (zoom["opening_scale"] + (1 - zoom["opening_scale"]) * u)
    center_x = (response[0] + response[2]) / 2
    center_y = (response[1] + response[3]) / 2
    return camera_box(center_x - width / 2, center_y - width * 816 / 1760 / 2, width)


def scene_frame(edit, t, samples, rate, poster=False, phase=None):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    intro = edit["intro_duration"]
    play_t = max(0, min(edit["audio_duration"], t - intro))
    playing = (phase == "call" if phase else intro <= t < intro + edit["audio_duration"]) and not poster
    finished = (phase == "result" if phase else t >= intro + edit["audio_duration"]) or poster
    elapsed = max(0, t - intro - edit["audio_duration"])
    if finished and edit["response_fullscreen"]:
        source = native_frame(edit, edit["result_source_start"] + elapsed, result=True)
        return source.transform((W, H), Image.Transform.EXTENT,
                                outro_camera(edit, elapsed, poster), Image.Resampling.BICUBIC)
    if playing:
        play_t = min(play_t, max(0, edit["audio_duration"] - 1 / FPS))
    label = "call complete" if finished else "listen to the call" if playing else "ask your agent"
    draw_link(d, (90, 40), "call4.me", 56)
    draw_link(d, (1450, 66), label, 30)
    d.line((80, 120, 1840, 120), fill=LINE, width=1)

    if not playing:
        # Every pixel inside this viewport comes from the continuous X11 capture.
        # Camera framing and optional typing tempo never redraw terminal text.
        source_t = (edit.get("result_source_start", edit["terminal_result_at"]) + elapsed
                    if finished else intro_source_time(edit, min(intro, max(0, t))))
        source = native_frame(edit, source_t, result=finished)
        crop = (outro_camera(edit, max(0, t - intro - edit["audio_duration"]), poster)
                if finished else camera(edit, min(intro, max(0, t))))
        viewport = source.transform((1760, 816), Image.Transform.EXTENT,
                                    crop, Image.Resampling.BICUBIC,
                                    fillcolor=BG)
        im.paste(viewport, (80, 145))
        d = ImageDraw.Draw(im)
        d.rectangle((80, 145, 1840, 961), outline=LINE, width=1)
    elif playing:
        draw_link(d, (115, 212), "phone calls > pharmacy", 30)
        draw_text(d, (110, 273), "amazon pharmacy support", 62, INK, True)
        recording_label = "original call recording"
        if edit["call_speed"] != 1:
            recording_label += f" · {edit['call_speed']:g}× speed"
        draw_text(d, (114, 362), recording_label, 30, MUTED)
        draw_text(d, (1390, 366), f"{stamp(play_t)} / {stamp(edit['audio_duration'])}", 26, MUTED)
        start = int(max(0, play_t - 1.4) * rate)
        for i in range(108):
            lo = start + int(i / 108 * 2.8 * rate)
            hi = min(len(samples), lo + int(2.8 * rate / 108))
            rms = float(np.sqrt(np.mean(samples[lo:hi] ** 2))) if lo < hi else 0
            h = min(72, 3 + rms * 270)
            x = 120 + i * 15.4
            d.rounded_rectangle((x, 537 - h, x + 5, 537 + h), 2,
                                fill=ACCENT if i < 54 else "#cccccc")
        cue = next((c for c in edit["cues"] if c["start"] <= play_t < c["end"]), None)
        if cue:
            draw_text(d, (115, 693), cue["speaker"].lower(), 30, ACCENT)
            wrapped(d, (111, 755), cue["text"], 49, 80, gap=16)
        d.line((115, 948, 1798, 948), fill=LINE, width=3)
        d.line((115, 948, 115 + 1683 * play_t / edit["audio_duration"], 948), fill=ACCENT, width=3)
    draw_text(d, (91, 1016), "recorded terminal replay · original call audio · edited for length", 25, MUTED)
    return im


def scene(edit, t, samples, rate, poster=False):
    duration = edit["call_transition_duration"]
    if duration and not poster:
        boundaries = [(edit["intro_duration"], "intro", "call"),
                      (edit["intro_duration"] + edit["audio_duration"], "call", "result")]
        for boundary, before, after in boundaries:
            start = boundary - duration * .4
            if start <= t < start + duration:
                weight = ease(0, 1, (t - start) / duration)
                return Image.blend(scene_frame(edit, t, samples, rate, phase=before),
                                   scene_frame(edit, t, samples, rate, phase=after), weight)
    return scene_frame(edit, t, samples, rate, poster)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--reuse-video", type=Path,
                        help="Copy an approved video stream while replacing only its soundtrack")
    args = parser.parse_args()
    if not shutil.which("ffmpeg") or not REGULAR.exists() or not BOLD.exists():
        parser.error("ffmpeg and the Liberation Serif regular/bold fonts are required")
    edit = load_edit(args.manifest.resolve())
    call_plan = {
        "call_speed": edit["call_speed"],
        "silence_removed": edit["silence_removed"],
        "audio_duration": edit["audio_duration"],
        "source_segments": edit["audio_segments"],
        "captions": edit["cues"],
    }
    if args.reuse_video and (edit["call_speed"] != 1 or edit["silence_removed"]):
        previous_plan = args.reuse_video.parent / "call-edit.json"
        if not previous_plan.is_file() or json.loads(previous_plan.read_text()) != call_plan:
            parser.error("Reused video must have a matching call-edit.json timeline; "
                         "changed call timing or captions require a full render")
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "call-edit.json").write_text(json.dumps(call_plan, indent=2) + "\n")
    prepare_terminal(edit, args.manifest.resolve(), args.output)
    intro_plan = {
        "capture_sha256": edit["capture_sha256"],
        "capture_duration": edit["capture_duration"],
        "capture_size": list(edit["capture_size"]),
        "result_capture_sha256": edit["result_capture_sha256"],
        "result_capture_duration": edit["result_capture_duration"],
        "result_capture_size": list(edit["result_capture_size"]),
        "result_source_start": edit["result_source_start"],
        "response_fullscreen": edit["response_fullscreen"],
        "typing_speed": edit["typing_speed"],
        "typing_start": edit["typing_start"],
        "typing_end": edit["typing_end"],
        "intro_duration": edit["intro_duration"],
        "result_duration": edit["result_duration"],
        "terminal_submit_at": edit["terminal_submit_at"],
        "terminal_expand_at": edit["terminal_expand_at"],
        "terminal_call_at": edit["terminal_call_at"],
        "terminal_result_at": edit["terminal_result_at"],
        "response_zoom": edit["response_zoom"],
        "end_at_response_zoom": edit["end_at_response_zoom"],
        "call_transition_duration": edit["call_transition_duration"],
    }
    if args.reuse_video:
        previous_intro = args.reuse_video.parent / "intro-edit.json"
        if previous_intro.is_file():
            if json.loads(previous_intro.read_text()) != intro_plan:
                parser.error("Changed terminal capture, camera, or intro timing requires a full render")
        elif edit["typing_speed"] != 1:
            parser.error("Accelerated intro reuse requires matching intro-edit.json metadata")
    (args.output / "intro-edit.json").write_text(json.dumps(intro_plan, indent=2) + "\n")
    audio, samples, rate = prepare_audio(edit, args.output)
    intro = edit["intro_duration"]
    total = intro + edit["audio_duration"] + edit["result_duration"]
    frame_count = math.ceil(total * FPS)
    video_duration = frame_count / FPS
    submit = intro_time(edit, edit["terminal_submit_at"])
    call_end = intro + edit["audio_duration"]
    preview_times = [0, min(3, submit - .3), submit - .2, intro - 1 / FPS,
                     intro + 1, intro + 8, call_end, call_end + 1,
                     call_end + edit["response_zoom"]["start"] + edit["response_zoom"]["duration"],
                     total - 1 / FPS]
    frames = [scene(edit, t, samples, rate) for t in preview_times]
    sheet = Image.new("RGB", (960 * 2, 540 * math.ceil(len(frames) / 2)), BG)
    for i, frame in enumerate(frames):
        sheet.paste(frame.resize((960, 540), Image.Resampling.LANCZOS),
                    (i % 2 * 960, i // 2 * 540))
    sheet.save(args.output / "contact-sheet.jpg", quality=90)
    scene(edit, total, samples, rate, poster=True).save(args.output / "launch-still.png")
    for i, t in enumerate([submit - .2, total - .25, intro + 1]):
        scene(edit, t, samples, rate).save(args.output / f"preview-{i + 1}.png")
    captions = []
    for i, cue in enumerate(edit["cues"], 1):
        captions.append(f"{i}\n{subtitle_stamp(intro + cue['start'])} --> "
                        f"{subtitle_stamp(intro + cue['end'])}\n{cue['speaker']}: {cue['text']}\n")
    (args.output / "launch-demo.srt").write_text("\n".join(captions))
    if args.preview_only:
        print(f"Preview ready. Planned duration: {total:.2f}s", flush=True)
        return
    output = args.output / "launch-demo.mp4"
    soundtrack = prepare_soundtrack(edit, args.manifest.resolve(), audio, args.output, total)
    if args.reuse_video:
        if not args.reuse_video.is_file() or args.reuse_video.resolve() == output.resolve():
            parser.error("--reuse-video must name a separate existing approved video")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(args.reuse_video),
             "-i", str(soundtrack), "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", str(video_duration),
             "-movflags", "+faststart", str(output)])
        print(f"Updated soundtrack: {output} ({total:.2f}s)", flush=True)
        return
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0", "-i", str(soundtrack),
               "-map", "0:v", "-map", "1:a:0", "-t", str(video_duration), "-c:v", "libx264",
               "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-b:a", "192k", "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i in range(frame_count):
            # End on the completed zoom even when its timestamp falls between frames.
            t = total if edit["end_at_response_zoom"] and i == frame_count - 1 else i / FPS
            encoder.stdin.write(scene(edit, t, samples, rate).tobytes())
            if i % (FPS * 5) == 0:
                print(f"Rendering {i / FPS:.0f}/{total:.1f}s", flush=True)
    finally:
        encoder.stdin.close()
        result = encoder.wait()
    if result:
        raise RuntimeError(f"ffmpeg failed with exit code {result}")
    print(f"Rendered {output} ({total:.2f}s)", flush=True)


if __name__ == "__main__":
    main()
