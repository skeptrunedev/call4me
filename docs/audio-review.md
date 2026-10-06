# Recording review CLI

Use `scripts/review-call-audio.ts` to acquire and review a real call. It never
publishes, invents redactions, shortens silence, or changes production state.
Keep its evidence directories and reviewed manifests outside the repository.
Load credentials with Node's `--env-file`; do not put keys in command arguments.

```sh
node --env-file=/private/.dev.vars --import tsx scripts/review-call-audio.ts fetch --call-id CALL_ID --out /private/call
node --env-file=/private/.dev.vars --import tsx scripts/review-call-audio.ts transcribe --file /private/call/source.wav --out /private/call/source-asr --ffmpeg /path/to/ffmpeg
```

Fetch reuses the production provider matcher, requires an exact saved or
historically verified leg, rejects ambiguous recordings, and saves the call
row and signed provider metadata privately.
Downloads use four bounded byte range requests with ETag, range and length
validation to preserve exact bytes on slow historical recording streams.
Transcription saves independent,
unprompted Whisper word timestamps and GPT audio text. Inputs over 24 MB use a
complete mono MP3 derivative; original evidence is retained. Successful results
are reused only when their source hash matches.

Read both transcripts, the saved call transcript, and source excerpts before
writing a manual manifest. Times are seconds in the original recording. Spans
must be sorted and cannot overlap. The hash comes from `source.private.json`.
The `reviewed` field records the operator's review, not an automated assertion.

```json
{
  "source": "source.wav",
  "sourceSha256": "COPY_THE_ACTUAL_SOURCE_HASH",
  "reviewed": true,
  "mutes": [{ "start": 1.2, "end": 2.8, "label": "private name" }]
}
```

```sh
node --import tsx scripts/review-call-audio.ts export --manifest /private/call/manifest.private.json --out /private/call/review.mp3 --ffmpeg /path/to/ffmpeg
node --env-file=/private/.dev.vars --import tsx scripts/review-call-audio.ts verify --manifest /private/call/manifest.private.json --file /private/call/review.mp3 --out /private/call/export-review --ffmpeg /path/to/ffmpeg
```

Export preserves the complete source timeline and original voices, with manual
mute spans, mono MP3 at 96 kbps, loudness normalization at negative 16 LUFS,
true peak limit at negative 1.5 dB, and stripped source metadata. Verify checks
decoded duration and mute interiors and runs two fresh independent export
transcriptions. MP3 boundary ringing is excluded from the numerical silence
check by an interior margin up to 100 ms. Inspect words at every boundary and
review the complete export ASR for remaining identifiers before copying an
export into public assets. Numerical verification alone does not prove that
all private details were identified or that anyone listened to the audio.
