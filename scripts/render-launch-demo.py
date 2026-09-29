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
BG, PANEL, INK = "#101113", "#191b1e", "#ecebe7"
MUTED, LINE, ACCENT, GREEN = "#9b9c9e", "#35383c", "#df9b77", "#a8c89b"
MONO = Path("/usr/share/fonts/opentype/fira/FiraMono-Regular.otf")
BOLD = Path("/usr/share/fonts/opentype/fira/FiraMono-Medium.otf")


def run(argv):
    subprocess.run(argv, check=True)


@lru_cache(maxsize=32)
def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else MONO), size)


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
    edit["intro_duration"] = len(frames) / FPS
    edit["capture_sha256"] = digest


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
    ended = t >= intro + edit["audio_duration"] and not poster
    label = "the result" if ended else "listen to the call" if playing else "ask your agent"
    draw_text(d, (90, 48), "call4.me", 42, ACCENT, True)
    draw_text(d, (1330, 66), label, 26, MUTED)

    if not playing and not ended:
        # Every pixel inside this viewport comes from the continuous X11 capture.
        # The only treatment is camera framing; there is no redrawn terminal text.
        source_t = intro - .25 if poster else t
        source = native_frame(edit, source_t)
        viewport = source.transform((1760, 816), Image.Transform.EXTENT,
                                    camera(edit, t, poster), Image.Resampling.BICUBIC,
                                    fillcolor="#141416")
        mask = Image.new("L", viewport.size)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, 1759, 815), radius=16, fill=255)
        im.paste(viewport, (80, 145), mask)
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((80, 145, 1840, 961), radius=16, outline=LINE, width=2)
    elif playing:
        draw_text(d, (115, 212), "AMAZON PHARMACY", 26, ACCENT)
        draw_text(d, (110, 273), "A real conversation.", 62, INK, True)
        draw_text(d, (114, 362), "Original call recording", 27, MUTED)
        draw_text(d, (1390, 366), f"{stamp(play_t)} / {stamp(edit['audio_duration'])}", 26, MUTED)
        start = int(max(0, play_t - 1.4) * rate)
        for i in range(108):
            lo = start + int(i / 108 * 2.8 * rate)
            hi = min(len(samples), lo + int(2.8 * rate / 108))
            rms = float(np.sqrt(np.mean(samples[lo:hi] ** 2))) if lo < hi else 0
            h = min(72, 3 + rms * 270)
            x = 120 + i * 15.4
            d.rounded_rectangle((x, 537 - h, x + 5, 537 + h), 2,
                                fill=ACCENT if i < 54 else "#484a4f")
        cue = next((c for c in edit["cues"] if c["start"] <= play_t < c["end"]), None)
        if cue:
            draw_text(d, (115, 693), cue["speaker"], 25,
                      GREEN if cue["speaker"] == "CALL FOR ME" else ACCENT)
            wrapped(d, (111, 755), cue["text"], 43, 60, gap=16)
        d.line((115, 948, 1798, 948), fill=LINE, width=3)
        d.line((115, 948, 115 + 1683 * play_t / edit["audio_duration"], 948), fill=ACCENT, width=3)
    else:
        draw_text(d, (115, 275), "One prompt. One phone call.", 59, INK, True)
        wrapped(d, (115, 403), edit["result_title"], 41, 59, GREEN, gap=18)
        draw_text(d, (115, 667), "give your agent a phone.", 42, MUTED)
        draw_text(d, (112, 751), "call4.me", 62, ACCENT, True)

    draw_text(d, (91, 1016), "recorded terminal replay · original call audio · edited for length", 21, MUTED)
    return im


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--preview-only", action="store_true")
    args = parser.parse_args()
    if not shutil.which("ffmpeg") or not MONO.exists() or not BOLD.exists():
        parser.error("ffmpeg and the Fira Mono regular/medium fonts are required")
    edit = load_edit(args.manifest.resolve())
    args.output.mkdir(parents=True, exist_ok=True)
    prepare_terminal(edit, args.manifest.resolve(), args.output)
    audio, samples, rate = prepare_audio(edit, args.output)
    intro, outro = edit.get("intro_duration", 10.0), edit.get("outro_duration", 4.0)
    total = intro + edit["audio_duration"] + outro
    preview_times = [0, 3, edit["terminal_submit_at"] - .2, intro - .25, intro + 1, intro + 8, total - 2]
    frames = [scene(edit, t, samples, rate) for t in preview_times]
    sheet = Image.new("RGB", (960 * 2, 540 * 4), BG)
    for i, frame in enumerate(frames):
        sheet.paste(frame.resize((960, 540), Image.Resampling.LANCZOS),
                    (i % 2 * 960, i // 2 * 540))
    sheet.save(args.output / "contact-sheet.jpg", quality=90)
    scene(edit, total, samples, rate, poster=True).save(args.output / "launch-still.png")
    for i, t in enumerate([edit["terminal_submit_at"] - .2, intro - .25, intro + 1]):
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
    command = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
               "-s", f"{W}x{H}", "-r", str(FPS), "-i", "pipe:0", "-i", str(audio),
               "-filter_complex", f"[1:a]adelay={round(intro * 1000)}:all=1,apad[a]",
               "-map", "0:v", "-map", "[a]", "-t", str(total), "-c:v", "libx264",
               "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac",
               "-b:a", "160k", "-movflags", "+faststart", str(output)]
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
