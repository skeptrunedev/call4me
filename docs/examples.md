# Public call examples

`/examples` is a public page of curated audio excerpts. Its route uses the shared
layout and sign in state. The content lives in `src/content/examples.ts`; the
reviewed MP3 excerpts live in `public/static/examples`. It needs no calling
credentials, recording API requests, or call history queries to render.

The current examples use the founder's historical TAO booking and cancellation,
Monkeybrains, and Amazon Pharmacy calls. The original audio was verified against
Telnyx recordings and the saved call transcripts. Each example shows the specific
outcome supported by that conversation. The internet call did not schedule installation, and the
Amazon call did not prove the review finished. Historical prices and availability
in the audio are statements from the dated call.

Keep full recordings, signed provider download URLs, account data, word timestamp
transcripts, and editing manifests outside this repository. Never point a public
player at a provider download URL or an authenticated recording endpoint. Only
publish an account owner's recordings with their permission.

When adding an example, verify its exact provider call association, read its
saved transcript, and compare the recording with the claimed outcome. Cut names,
phone numbers, addresses, authentication, and medical details. Check the words
on both sides of every cut. Retain enough context to show what happened. Do not
present a partial result as a completed booking or resolution.

Current audio uses original voices at normal speed, selected source intervals,
8 millisecond edge fades, and FFmpeg loudness normalization at 16 LUFS below
full scale with a true peak limit of 1.5 dB below full scale. Exports are mono
MP3 at 96 kbps with source metadata removed. Update the duration and edited
transcript when changing an excerpt. No synthetic voices, music, or call sounds
belong in these recordings.

Before pushing, run `npm run check`, `npm run lint`, `npm test`, and
`npx wrangler deploy --dry-run`. In a browser, verify signed out access,
navigation from the home page, every audio file decoding and seeking, a second
player pausing the first, transcripts, narrow screens, and the purchase and
installation links. Repeat against the deployed page after CI completes.
