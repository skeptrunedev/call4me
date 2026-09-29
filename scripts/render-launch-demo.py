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


def load_edit(path):
    edit = json.loads(path.read_text())
    source = (path.parent / edit["source"]).resolve()
    if not source.is_file():
        raise ValueError(f"Source recording does not exist: {source}")
    if not edit.get("provenance"):
        raise ValueError("The manifest must identify the original session and call.")
    with wave.open(str(source)) as audio:
        duration = audio.getnframes() / audio.getframerate()
    offset = 0.0
    cues = []
    for clip in edit["clips"]:
        start, end = clip["start"], clip["end"]
        if not 0 <= start < end <= duration:
            raise ValueError(f"Invalid audio cut: {start}..{end}")
        for cue in clip["captions"]:
            if not start <= cue["start"] < cue["end"] <= end:
                raise ValueError(f"Caption outside selected audio: {cue}")
            cues.append({**cue, "start": offset + cue["start"] - start,
                         "end": offset + cue["end"] - start})
        offset += end - start
    edit.update(source_path=source, cues=cues, audio_duration=offset)
    return edit


def prepare_audio(edit, output):
    # Trim before normalization, so all measurements describe only the selected audio.
    # Tiny edge fades prevent clicks. No time stretching or generated voice is used.
    filters = []
    for i, clip in enumerate(edit["clips"]):
        duration = clip["end"] - clip["start"]
        filters.append(
            f"[0:a]atrim=start={clip['start']}:end={clip['end']},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d=0.008,afade=t=out:st={duration - .008}:d=0.008[a{i}]"
        )
    labels = "".join(f"[a{i}]" for i in range(len(edit["clips"])))
    filters.append(f"{labels}concat=n={len(edit['clips'])}:v=0:a=1,"
                   "loudnorm=I=-16:TP=-1.5:LRA=11[out]")
    audio_path = output / "call-excerpt.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(edit["source_path"]),
         "-filter_complex", ";".join(filters), "-map", "[out]", "-ar", "48000",
         "-ac", "1", str(audio_path)])
    with wave.open(str(audio_path)) as audio:
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2")
        rate = audio.getframerate()
    return audio_path, samples.astype(np.float32) / 32768, rate


def prepare_soundtrack(edit, manifest, call_audio, output, total):
    """Keep the verified call untouched; place music only outside its interval."""
    rate = 48000
    intro, result = edit["intro_duration"], edit["result_duration"]
    call_end = intro + edit["audio_duration"]
    inputs = ["-i", str(call_audio)]
    filters = [f"[0:a]pan=stereo|c0=c0|c1=c0,"
               f"adelay={round(intro * rate)}S:all=1,apad,atrim=duration={total}[call]"]
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
        intro_music = intro - gap
        if not (min(start, resume) >= 0 and 0 < gap < intro and
                0 < fade_out < intro_music and 0 < fade_in < result and
                -30 <= level <= -14):
            raise ValueError("Invalid music cue, fade, or loudness setting")
        inputs += ["-i", str(source)]
        filters += [
            "[1:a]asplit=2[mi][mo]",
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
            "[call][opening][closing]amix=inputs=3:normalize=0:dropout_transition=0,"
            f"atrim=duration={total}[out]",
        ]
        mapped = "[out]"
    else:
        mapped = "[call]"
    soundtrack = output / "soundtrack.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filters), "-map", mapped,
         "-ar", str(rate), "-ac", "2", "-c:a", "pcm_s16le", str(soundtrack)])
    return soundtrack


def prepare_terminal(edit, manifest, output):
    """Decode one continuous capture. No assembled terminal images are accepted."""
    capture = (manifest.parent / edit["terminal_capture"]).resolve()
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
    edit["native_frames"] = frames
    edit["capture_duration"] = len(frames) / FPS
    edit["capture_sha256"] = digest
    call_at, result_at = edit["terminal_call_at"], edit["terminal_result_at"]
    if not 0 < edit["terminal_submit_at"] < call_at < result_at < edit["capture_duration"]:
        raise ValueError("Expected submit, calling, then completed result within the native capture")
    edit["intro_duration"] = call_at
    edit["result_duration"] = edit["capture_duration"] - result_at


def native_frame(edit, t):
    index = min(len(edit["native_frames"]) - 1, max(0, int(t * FPS)))
    return Image.open(edit["native_frames"][index]).convert("RGB")


def camera(edit, t, poster=False):
    # Fixed aspect ratio throughout. The close view fits all three prompt lines.
    def box(x, y, width):
        return x, y, x + width, y + width * 816 / 1760

    wide = box(-112, 0, 1804)
    close = box(-20, 430, 1100)
    result = box(0, 98, 1580)
    submit = edit["terminal_submit_at"]
    if poster:
        return result
    if t >= edit["terminal_expand_at"]:
        u = ease(0, 1, (t - edit["terminal_expand_at"]) / 1.2)
        return tuple(a + (b - a) * u for a, b in zip(wide, result))
    if t < submit:
        u = ease(0, 1, (t - .25) / 1.4)
    else:
        u = ease(1, 0, (t - submit) / .9)
    return tuple(a + (b - a) * u for a, b in zip(wide, close))


def scene(edit, t, samples, rate, poster=False):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    intro = edit["intro_duration"]
    play_t = max(0, min(edit["audio_duration"], t - intro))
    playing = intro <= t < intro + edit["audio_duration"] and not poster
    finished = t >= intro + edit["audio_duration"] or poster
    label = "call complete" if finished else "listen to the call" if playing else "ask your agent"
    draw_link(d, (90, 40), "call4.me", 56)
    draw_link(d, (1450, 66), label, 30)
    d.line((80, 120, 1840, 120), fill=LINE, width=1)

    if not playing:
        # Every pixel inside this viewport comes from the continuous X11 capture.
        # The only treatment is camera framing; there is no redrawn terminal text.
        source_t = (edit["capture_duration"] - .25 if poster else
                    edit["terminal_result_at"] + t - intro - edit["audio_duration"]
                    if finished else t)
        source = native_frame(edit, source_t)
        viewport = source.transform((1760, 816), Image.Transform.EXTENT,
                                    camera(edit, source_t, finished), Image.Resampling.BICUBIC,
                                    fillcolor=BG)
        im.paste(viewport, (80, 145))
        d = ImageDraw.Draw(im)
        d.rectangle((80, 145, 1840, 961), outline=LINE, width=1)
    elif playing:
        draw_link(d, (115, 212), "phone calls > pharmacy", 30)
        draw_text(d, (110, 273), "amazon pharmacy support", 62, INK, True)
        draw_text(d, (114, 362), "original call recording", 30, MUTED)
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
    args.output.mkdir(parents=True, exist_ok=True)
    prepare_terminal(edit, args.manifest.resolve(), args.output)
    audio, samples, rate = prepare_audio(edit, args.output)
    intro = edit["intro_duration"]
    total = intro + edit["audio_duration"] + edit["result_duration"]
    preview_times = [0, 3, edit["terminal_submit_at"] - .2, intro - 1 / FPS,
                     intro + 1, intro + 8, intro + edit["audio_duration"], total - 2]
    frames = [scene(edit, t, samples, rate) for t in preview_times]
    sheet = Image.new("RGB", (960 * 2, 540 * 4), BG)
    for i, frame in enumerate(frames):
        sheet.paste(frame.resize((960, 540), Image.Resampling.LANCZOS),
                    (i % 2 * 960, i // 2 * 540))
    sheet.save(args.output / "contact-sheet.jpg", quality=90)
    scene(edit, total, samples, rate, poster=True).save(args.output / "launch-still.png")
    for i, t in enumerate([edit["terminal_submit_at"] - .2, total - .25, intro + 1]):
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
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", str(total),
             "-movflags", "+faststart", str(output)])
        print(f"Updated soundtrack: {output} ({total:.2f}s)", flush=True)
        return
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0", "-i", str(soundtrack),
               "-map", "0:v", "-map", "1:a:0", "-t", str(total), "-c:v", "libx264",
               "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-b:a", "192k", "-movflags", "+faststart", str(output)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i in range(math.ceil(total * FPS)):
            encoder.stdin.write(scene(edit, i / FPS, samples, rate).tobytes())
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
