# Launch demo

The launch asset pairs a terminal replay of a real saved session with the original
phone recording. The reference is Brayden Wilmoth's terminal screenshot for the
Cloudflare CLI: https://x.com/BraydenWilmoth/status/2104593590307479829.

The terminal segment must be captured from Claude Code's native interface. A
hand-drawn approximation loses the compact spacing, input affordances, and tool
output that make the recording convincing. Restore a sanitized, abridged copy of
the actual session for recording; keep the original transcript intact and disable
tools in the capture session. Audio playback and captions belong in a separate
editorial scene, not inside an invented terminal player.

Show the user's request first, focus on the call tool, then play a short captioned
excerpt that demonstrates the result. Label the terminal as a replay and the
audio as an edited excerpt. Do not imply that the edited running time is the
actual time it took to complete the call.

Keep original recordings, private transcripts, editing manifests, and rendered
files outside the repository. Omit authentication, personal contact details, and
medical details from the selected audio and captions. Verify captions against
both the original recording and the saved call transcript.

Deliver a landscape MP4 and a matching PNG suitable for the launch post. Nothing
in this workflow publishes the assets or places a phone call.

## Render

Requires `uv`, `ffmpeg`, and Fira Mono regular/medium fonts. Python dependencies
are declared in the renderer's script metadata.

```sh
uv run scripts/render-launch-demo.py /private/edit.json /output/demo --preview-only
uv run scripts/render-launch-demo.py /private/edit.json /output/demo
```

The manifest names a WAV source relative to the manifest, identifies the original
session in `provenance`, and supplies `prompt`, `business`, `tool_detail`,
`result_title`, and `result_body`. `intro_duration` defaults to 10 seconds and
`outro_duration` to 4 seconds. Each entry in `clips` has source `start` and `end`
seconds plus `captions`. Each caption contains source `start`/`end`, `speaker`,
and `text`. Caption times must remain inside their selected clip. Prompt and
result text may be abridged for readability, with that choice documented in the
manifest provenance.

The renderer uses the original audio at its original speed, trims the selected
ranges, normalizes the excerpt's loudness, and derives the waveform from those
samples. Exports are 1920 by 1080 at 30 frames per second, H.264/AAC MP4, PNG
still, SRT captions, and preview frames. The audio timer measures only the edited
excerpt, not the duration of the original call.

Check the contact sheet and individual preview frames before the full render.
After rendering, decode the actual MP4, inspect frames at the zooms and caption
changes, and check the exported audio against the source transcript. Copy final
assets to the user's machine without copying private source transcripts.
