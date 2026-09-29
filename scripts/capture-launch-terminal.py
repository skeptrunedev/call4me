#!/usr/bin/env python3
"""Record one continuous X11 take of an isolated Claude Code replay session.

The target must be connected only to launch-replay-mcp.mjs. This script types and
submits the supplied prompt, waits for the verified result, expands the native
transcript, and stops the recording. It does not assemble screenshots.
"""
import argparse
import json
import subprocess
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True)
    parser.add_argument('--prompt', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--display', required=True)
    parser.add_argument('--size', default='1580x836')
    parser.add_argument('--until', default='ready to order.')
    args = parser.parse_args()
    target = args.target

    def keys(*values):
        subprocess.run(['tmux', 'send-keys', '-t', target, *values], check=True)

    def screen():
        return subprocess.check_output(['tmux', 'capture-pane', '-p', '-t', target], text=True)

    if 'Claude Code' not in screen():
        parser.error('The target must already be an initialized Claude Code replay session')
    subprocess.run(['tmux', 'select-window', '-t', target], check=True)
    keys('Escape')
    time.sleep(1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    recorder = subprocess.Popen([
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'x11grab',
        '-framerate', '30', '-video_size', args.size, '-draw_mouse', '0',
        '-i', args.display, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0',
        str(args.output),
    ], stdin=subprocess.PIPE)
    start = time.monotonic()
    events, done = [], False

    def event(key):
        events.append({'at': round(time.monotonic() - start, 3), 'key': key})

    try:
        time.sleep(.75)
        for character in args.prompt.read_text().strip():
            keys('C-j') if character == '\n' else keys('-l', character)
            event(character)
            time.sleep(.14 if character in '.\n' else .028)
        time.sleep(.7)
        keys('Enter')
        event('SUBMIT')
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            time.sleep(.4)
            text = ' '.join(screen().split())
            if 'Amazon Pharmacy agreed to prioritize' in text and args.until in text:
                done = True
                break
        if done:
            time.sleep(.6)
            keys('C-o')
            event('EXPAND_TRANSCRIPT')
            time.sleep(3.5)
    finally:
        recorder.stdin.write(b'q')
        recorder.stdin.flush()
        recorder.stdin.close()
        status = recorder.wait(timeout=20)
    metadata = {'events': events, 'completed': done,
                'duration': round(time.monotonic() - start, 3), 'source': 'continuous X11 capture'}
    args.output.with_suffix('.events.json').write_text(json.dumps(metadata, indent=2))
    args.output.with_suffix('.txt').write_text(screen())
    if status or not done:
        raise RuntimeError('Capture did not reach the verified result; inspect the saved take')
    print(f'Recorded continuous take: {args.output} ({metadata["duration"]:.2f}s)')


if __name__ == '__main__':
    main()
