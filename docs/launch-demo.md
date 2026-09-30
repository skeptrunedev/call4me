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

Show the user's request first, transition to the call audio when the native
terminal says "Calling callbay", then return to the completed native terminal
result after the audio ends. Use a white page, black serif editorial text,
default blue underlined links, and simple gray rules. Record the terminal with
a white background and a light theme to match. Label the terminal as a replay and the
audio as an edited excerpt. Do not imply that the edited running time is the
actual time it took to complete the call.

The call excerpt should demonstrate navigation of the automated phone menu,
the handoff to a human representative, and the resulting resolution. Label the
caller `ai agent`. Distinguish the business's automated assistant from its human
representative in the speaker labels. Keep authentication and other personal
details outside the selected cuts; verify new cut boundaries against the
original WAV rather than assuming timestamps from an earlier export match.

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
segment in order. Terminal footage defaults to its original speed. The audio occupies the middle of the
edit, between invocation and result. Smooth camera transforms provide the zooms.
It never substitutes terminal text or action screenshots. The matching still
comes from a frame of this same recording.

To accelerate only prompt entry, set `typing_speed` between 1 and 4 and supply
`terminal_typing_start_at` and `terminal_typing_end_at` in source seconds. Verify
the last typed character is visible at the selected end, before
`terminal_submit_at`. Footage before and after the typing range retains its
original speed, including the finished prompt hold and completed result.
Camera moves keep their original animation durations. Call audio, captions,
and music move earlier with the shortened intro; music keeps its original
playback speed. The private `intro-edit.json` records the capture and timing.

After the call, show the terminal overview briefly, ease into the complete
final response, and hold the closer view. The separate outro camera prevents
the still image framing from disabling the animation. `response_zoom` accepts
source crop `x`, `y`, and `width`, plus `start` and `duration` in seconds from
the start of the result scene. Defaults are a 0.4 second overview, a 1.2 second
move, and a crop at source x 0, y 500, width 1580. Verify the complete response
fits that crop in the selected native take. The still uses the finished close
view. Camera settings are recorded with the capture metadata and must match
when reusing video for a soundtrack revision.

The renderer defaults to the original audio speed, trims the selected ranges,
normalizes the excerpt's loudness, and derives the waveform from those samples.
An optional `call_speed` between 0.5 and 2 changes only the call playback tempo
while preserving voice pitch. This setting leaves terminal and music speed alone.
Each clip can also contain `remove_silence`, a list of source `start` and `end`
ranges to remove from inside that clip. Review these ranges against the WAV and
word timestamps. Automatic silence detection alone can mistake quiet initial
consonants for silence. Preserve short pauses and margins around spoken words.

Captions, the waveform, the playback timer, and the completed result all follow
the shortened call timeline. The playback label identifies a speed change.
The private output `call-edit.json` records the retained source ranges, removed
silence duration, speed, and retimed captions. Timing changes require a full
render; `--reuse-video` cannot retime an earlier visual edit. For example:

```json
{
  "call_speed": 1.2,
  "clips": [{
    "start": 13.0,
    "end": 17.35,
    "remove_silence": [{"start": 15.41, "end": 16.66}],
    "captions": [
      {"start": 13.04, "end": 15.05, "speaker": "automated assistant", "text": "Are you a customer?"},
      {"start": 16.5, "end": 17.2, "speaker": "ai agent", "text": "Yes."}
    ]
  }]
}
```

Exports are 1920 by 1080 at 30 frames per second, H.264/AAC MP4, PNG
still, SRT captions, and preview frames. The audio timer measures only the edited
excerpt, not the duration of the original call.

By default, optional music plays only under the terminal intro and completed result.
Choose a recognizable phrase from the supplied source, fade fully out before
the call begins, and fade back in once the call ends. Keep the call at its
verified level. When requested, add a quiet music bed beneath the call.
An audio revision should preserve the
approved video stream exactly.

To add music, supply a `music` object in the private edit manifest. `source`
names the supplied local audio or video file. `start` and `outro_start` select
the opening and closing cues in source seconds. Defaults are a 1.1 second
`fade_out`, a 0.65 second `fade_in`, 0.15 seconds of `silence_before_call`, and
music `loudness` of minus 19 LUFS. The closing cue also fades out at the end.
The renderer normalizes only the selected music, leaves the verified call
samples unchanged, and writes a stereo `soundtrack.wav` for verification.

Set `music.call_background_gain_db` to enable a quiet call background. It reduces
the song relative to the configured music loudness, without reducing or
normalizing the call voices again. A setting of minus 20 dB keeps the song very
quiet. The bed continues from the song position reached at the end of the intro,
plays at the original song speed, and fades at both call boundaries. Omit this
field to retain silence beneath the call. Allowed settings are minus 60 to
minus 12 dB.

Reuse the approved visual edit for a music revision:

```sh
uv run scripts/render-launch-demo.py /private/edit-with-music.json /output/music \
  --reuse-video /output/approved/launch-demo.mp4
```

The reused video must match the manifest's visual edit and timing. Verify its
video stream hash matches the new output. When a background is enabled, check
that the difference between the mixed call and the normalized excerpt contains
only quiet music, and that the mix does not clip. When it is disabled, verify
the call samples match the excerpt exactly in both channels. A shortened video
can be reused only when its adjacent `call-edit.json` matches the current call
timeline and captions exactly. Keep supplied songs and finished mixes outside git.
An accelerated intro also requires matching `intro-edit.json` metadata for reuse.
Changing either intro timing or the native capture requires a full render.

For smooth call boundaries, set `call_transition_duration` to 0.45 seconds.
The visual dissolve uses a smooth easing curve, starting 40 percent of its
duration before each boundary and ending afterward. Outgoing and incoming
terminal frames hold at their edges while the recording scene dissolves.
Call duration, caption timing, and the final response zoom remain unchanged.
The value defaults to zero and accepts up to one second. A full render is
required when it changes. Check caption readability through the dissolve.

Set `music.continuous` to `true` with `call_background_gain_db` to use one
continuous song excerpt throughout. `fade_out` smoothly lowers its volume
before the call, and `fade_in` brings it up after the call. This mode preserves
song position across both boundaries instead of restarting the closing cue,
and ignores `outro_start` and `silence_before_call`. It also writes the isolated
`music-bed.wav` for verification. Subtract this score from the soundtrack to
check voice gain. With visual transitions enabled, short voice fades affect
only the first 0.08 and last 0.12 seconds. Verify those intervals contain quiet
margins before applying them to a new recording.

Check the contact sheet and individual preview frames before the full render.
After rendering, decode the actual MP4, inspect frames at the zooms and caption
changes, and check the exported audio against the source transcript. Copy final
assets to the user's machine without copying private source transcripts.
