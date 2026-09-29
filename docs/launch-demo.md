# Launch demo

The launch asset pairs a terminal replay of a real saved session with the original
phone recording. The reference is Brayden Wilmoth's terminal screenshot for the
Cloudflare CLI: https://x.com/BraydenWilmoth/status/2104593590307479829.

The terminal segment is one continuous screen recording of Claude Code's native
interface. Capture actual typing, submission, and native tool output. Keep the
original transcript intact. Run an isolated Claude session connected only to
`scripts/launch-replay-mcp.mjs`, with built in tools disabled. This offline MCP
server cannot dial or access credentials. It fails closed unless supplied an
explicit local fixture with a verified historical result. Label the footage as
a recorded replay. Audio playback and captions belong in a separate editorial
scene.

Show the user's request first, cut to the call audio immediately when the native
terminal says "Calling callbay", then return to the completed native terminal
result after the audio ends. Use a white page, black serif editorial text,
default blue underlined links, and simple gray rules. Record the terminal with
a white background and a light theme to match. Label the terminal as a replay and the
audio as an edited excerpt. Do not imply that the edited running time is the
actual time it took to complete the call.

Keep original recordings, private transcripts, editing manifests, and rendered
files outside the repository. Omit authentication, personal contact details, and
medical details from the selected audio and captions. Verify captions against
both the original recording and the saved call transcript.

Deliver a landscape MP4 and a matching PNG suitable for the launch post. Nothing
in this workflow publishes the assets or places a phone call.

## Render

Requires `uv`, `ffmpeg`, and Liberation Serif regular/bold fonts. The captured
terminal uses Fira Mono. Python dependencies are declared in the renderer's
script metadata.

Initialize a native Claude Code session in tmux, using `--tools ""`,
`--strict-mcp-config`, `--setting-sources ""`, and an MCP config containing only
the offline replay server. A local `--recorded-result` fixture requires
`call_id`, `business`, `summary`, and `provenance`. The system prompt must identify
the session as a historical replay and prohibit claiming a new call was made.
Display the session in a real terminal emulator on an X11 display, then record:

```sh
python3 scripts/capture-launch-terminal.py \
  --target capture:terminal --display :118 \
  --prompt /private/prompt.txt --output /private/terminal.mp4
```

For the launch theme, copy `scripts/launch-terminal-theme.json` to
`~/.claude/themes/call4me-launch.json`, and pass
`--settings '{"theme":"custom:call4me-launch"}'` only to the capture session.
Set the terminal emulator's own background to white and foreground to black.

The capture script records X11 continuously with ffmpeg and saves a timed input
event log. Use the recorded `SUBMIT` and `EXPAND_TRANSCRIPT` times in the edit
manifest. `CALLING_VISIBLE` records the first observed invocation. Verify its
exact source frame before selecting the audio cut. Inspect the raw take before
rendering, including startup notices.

```sh
uv run scripts/render-launch-demo.py /private/edit.json /output/demo --preview-only
uv run scripts/render-launch-demo.py /private/edit.json /output/demo
```

The manifest names a WAV `source` and one `terminal_capture` video relative to the
manifest, identifies the original session in `provenance`, and supplies
`terminal_submit_at`, `terminal_expand_at`, `terminal_call_at`, and
`terminal_result_at`. `terminal_call_at` cuts from the invocation into the audio;
`terminal_result_at` selects the completed terminal footage to show after the
audio. The result runs through the end of the native capture. Each entry
in `clips` has source `start` and `end` seconds plus `captions`. Each caption
contains source `start`/`end`, `speaker`, and `text`. Caption times must remain
inside their selected clip. Prompt and result text may be abridged for
readability, with that choice documented in the manifest provenance.

The renderer decodes frames from the single capture and displays each selected
segment in order at its original speed. The audio occupies the middle of the
edit, between invocation and result. Smooth camera transforms provide the zooms.
It never substitutes terminal text or action screenshots. The matching still
comes from a frame of this same recording.

The renderer uses the original audio at its original speed, trims the selected
ranges, normalizes the excerpt's loudness, and derives the waveform from those
samples. Exports are 1920 by 1080 at 30 frames per second, H.264/AAC MP4, PNG
still, SRT captions, and preview frames. The audio timer measures only the edited
excerpt, not the duration of the original call.

Optional music belongs only under the terminal intro and completed result.
Choose a recognizable phrase from the supplied source, fade fully out before
the call begins, and fade back in once the call ends. Keep the call at its
verified level with no music beneath it. An audio revision should preserve the
approved video stream exactly.

To add music, supply a `music` object in the private edit manifest. `source`
names the supplied local audio or video file. `start` and `outro_start` select
the opening and closing cues in source seconds. Defaults are a 1.1 second
`fade_out`, a 0.65 second `fade_in`, 0.15 seconds of `silence_before_call`, and
music `loudness` of minus 19 LUFS. The closing cue also fades out at the end.
The renderer normalizes only the selected music, leaves the verified call
samples unchanged, and writes a stereo `soundtrack.wav` for verification.

Reuse the approved visual edit for a music revision:

```sh
uv run scripts/render-launch-demo.py /private/edit-with-music.json /output/music \
  --reuse-video /output/approved/launch-demo.mp4
```

The reused video must match the manifest's visual edit and timing. Verify its
video stream hash matches the new output, the call samples in the master WAV
match the normalized excerpt in both channels, and music is silent for the
entire call interval. Keep supplied songs and finished mixes outside git.

Check the contact sheet and individual preview frames before the full render.
After rendering, decode the actual MP4, inspect frames at the zooms and caption
changes, and check the exported audio against the source transcript. Copy final
assets to the user's machine without copying private source transcripts.
