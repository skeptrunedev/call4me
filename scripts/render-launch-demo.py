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


def scene(edit, t, samples, rate, poster=False):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    intro = edit.get("intro_duration", 10.0)
    play_t = max(0, min(edit["audio_duration"], t - intro))
    playing = intro <= t < intro + edit["audio_duration"] and not poster
    ended = t >= intro + edit["audio_duration"] or poster

    draw_text(d, (104, 52), "call4.me", 42, ACCENT, True)
    draw_text(d, (468, 65), "your agent can make phone calls.", 29, INK)
    d.rounded_rectangle((90, 148, 1830, 958), radius=19, fill=PANEL, outline=LINE, width=2)
    d.line((91, 216, 1828, 216), fill=LINE, width=2)
    for i, color in enumerate(["#b77470", "#c6aa75", "#8ba88b"]):
        d.ellipse((121 + 26 * i, 175, 132 + 26 * i, 186), fill=color)
    draw_text(d, (223, 168), "Claude Code", 25, MUTED)
    draw_text(d, (1454, 169), "session replay", 22, MUTED)

    typed = edit["prompt"]
    if not poster and t < 4.4:
        typed = typed[:max(0, round(len(typed) * (t - .6) / 3.8))]
    draw_text(d, (132, 264), ">", 34, ACCENT, True)
    wrapped(d, (181, 264), typed, 34, 74, gap=14)
    if t < 4.8 and int(t * 2) % 2 == 0:
        lines = textwrap.wrap(typed, width=74) or [""]
        x = 181 + d.textlength(lines[-1], font=font(34)) + 4
        y = 264 + (len(lines) - 1) * 48
        d.rectangle((x, y + 7, x + 17, y + 38), fill=ACCENT)

    if t >= 5 or poster:
        d.ellipse((136, 459, 147, 470), fill=GREEN)
        draw_text(d, (181, 447), "callbay_place_call", 32, GREEN, True)
        draw_text(d, (591, 451), "(MCP)", 25, MUTED)
        draw_text(d, (181, 504), edit["business"], 30)
        draw_text(d, (181, 551), edit["tool_detail"], 25, MUTED)

    if playing:
        d.line((132, 615, 1787, 615), fill=LINE, width=2)
        d.ellipse((137, 646, 149, 658), fill=ACCENT)
        draw_text(d, (172, 637), "ORIGINAL CALL AUDIO", 22, ACCENT)
        draw_text(d, (1335, 637), f"{stamp(play_t)} / {stamp(edit['audio_duration'])}", 22, MUTED)
        # A moving window from the real waveform, with no decorative random motion.
        start = int(max(0, play_t - 1.4) * rate)
        for i in range(96):
            lo = start + int(i / 96 * 2.8 * rate)
            hi = min(len(samples), lo + int(2.8 * rate / 96))
            rms = float(np.sqrt(np.mean(samples[lo:hi] ** 2))) if lo < hi else 0
            h = min(32, 2 + rms * 140)
            x = 176 + i * 15
            d.rounded_rectangle((x, 705 - h, x + 5, 705 + h), 2,
                                fill=ACCENT if i < 48 else "#606166")
        cue = next((c for c in edit["cues"] if c["start"] <= play_t < c["end"]), None)
        if cue:
            draw_text(d, (174, 765), cue["speaker"], 22,
                      GREEN if cue["speaker"] == "CALL FOR ME" else MUTED)
            wrapped(d, (174, 805), cue["text"], 33, 72, gap=9)
        d.line((133, 935, 1787, 935), fill=LINE, width=3)
        d.line((133, 935, 133 + 1654 * play_t / edit["audio_duration"], 935), fill=ACCENT, width=3)
    elif ended:
        d.line((132, 615, 1787, 615), fill=LINE, width=2)
        d.line([(136, 679), (144, 687), (159, 668)], fill=GREEN, width=4)
        draw_text(d, (182, 658), edit["result_title"], 35, GREEN, True)
        wrapped(d, (181, 721), edit["result_body"], 31, 72, gap=14)
        draw_text(d, (181, 862), "give your agent a phone.  call4.me", 29, ACCENT)
    elif t >= 7:
        draw_text(d, (181, 677), "play the call recording", 31, ACCENT)
        draw_text(d, (181, 731), "sound on", 25, MUTED)

    # Camera movement stays within the terminal's safe text bounds.
    if not poster:
        if t < 5.8:
            zoom = ease(1, 1.12, (t - 1) / 1.4)
            cx, cy = 890, 355
        elif t < 8.4:
            zoom = ease(1.12, 1, (t - 5.8) / 1.3)
            cx, cy = 890, 355
        elif not ended:
            zoom = ease(1, 1.065, (t - 8.4) / 1.5)
            cx, cy = 960, 600
        else:
            elapsed = t - intro - edit["audio_duration"]
            zoom = ease(1.065, 1, (elapsed - .6) / 1.5)
            cx, cy = 960, 600
        crop_w, crop_h = W / zoom, H / zoom
        x = min(W - crop_w, max(0, cx - crop_w / 2))
        # Preserve the brand's upper safe margin even when focusing on the player.
        y = min(32, H - crop_h, max(0, cy - crop_h / 2))
        im = im.transform((W, H), Image.Transform.EXTENT,
                          (x, y, x + crop_w, y + crop_h), Image.Resampling.BICUBIC)
    # This editorial disclosure is outside the camera transform and always readable.
    d = ImageDraw.Draw(im)
    d.rectangle((0, 996, W, H), fill=BG)
    draw_text(d, (104, 1020), "real session replay · original call audio · edited for length", 21, MUTED)
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
    audio, samples, rate = prepare_audio(edit, args.output)
    intro, outro = edit.get("intro_duration", 10.0), edit.get("outro_duration", 4.0)
    total = intro + edit["audio_duration"] + outro
    preview_times = [0, 3, 5.6, 8.1, intro + 3, intro + 13, total - 2]
    frames = [scene(edit, t, samples, rate) for t in preview_times]
    sheet = Image.new("RGB", (960 * 2, 540 * 4), BG)
    for i, frame in enumerate(frames):
        sheet.paste(frame.resize((960, 540), Image.Resampling.LANCZOS),
                    (i % 2 * 960, i // 2 * 540))
    sheet.save(args.output / "contact-sheet.jpg", quality=90)
    scene(edit, total, samples, rate, poster=True).save(args.output / "launch-still.png")
    for i, t in enumerate([5.6, intro + 3, total - 2]):
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
