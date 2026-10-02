# Public call examples

`/examples` publishes real conversations with their original voices at normal
speed. Its route uses the shared layout and sign in state. Content lives in
`src/content/examples.ts`; reviewed MP3 recordings live in
`public/static/examples`. It needs no calling credentials, recording API
requests, or call history queries to render.

The examples use the founder's historical TAO booking and cancellation,
Monkeybrains, Amazon Pharmacy, and same day eye exam calls, plus customer calls
published with the account owners' permission: a dentist reschedule, a Costco
Tire Center order lookup, a junk removal quote and booking, a doctor's visit
switched to video, a private dining room quote, a lawyer consultation booked
at a negotiated fee, a pharmacy stock check for a medication in shortage, an Etihad complaint
follow-up, a new patient booking at a primary care practice, and a pair of dress
shoes put on hold at a Men's Wearhouse for same day pickup. For a customer call, first
confirm the dialed number is the business's published number and not the
account's own phone: one "pizzeria" order turned out to be the owner's phone.
For medical calls, also mute anything that would identify the practice's
specialty, such as its menu of providers and the doctor's weekly schedule. For customer calls, also mute the business name when it would
identify where the customer goes (the dental practice), the procedure, and
every reading of an order number; check the saved transcript for words the
recording buries under crosstalk, since independent transcription can miss them. Original audio was verified against
Telnyx recordings and saved call transcripts. Each outcome is supported by its
conversation. The internet call did not schedule installation, and the Amazon
call did not prove the review finished. Prices and availability in the audio
are historical statements from the dated call.

Keep raw recordings, signed provider URLs, account data, word timestamp
transcripts, and editing manifests outside this repository. Public players
must only use the reviewed static exports. Publish an account owner's recording
with their permission.

Preserve greetings, menus, questions, lookup pauses, and holds. Replace actual
private identifiers with silence at the same source timestamps instead of
removing the surrounding conversation. Muted fields include names, addresses,
unit identifiers, postal codes, telephone numbers, verification codes, and
specific medications, doses, and prescription dates. Show bracketed labels
where those words would appear in the transcript. Keep the words asking for or
introducing those details, including the reservation name and account checks.
Do not synthesize replacement names or imply a question happened if it did not.

The TAO and Monkeybrains exports retain the full source recording durations.
The Amazon export retains the entire call through the representative's goodbye
at 5:46. Its remaining 24 minutes 9 seconds of automated feedback survey and
repeated survey prompts are omitted and marked after the goodbye in the
transcript. No business conversation, phone menu, or hold was shortened.

Blog posts built from customer calls embed a recording for every call they
use, including short hang-ups and failed calls. Dead air longer than about 3
seconds, where nobody speaks, may be shortened to about 1 second; never remove
conversation, hold music, hold messages or menu prompts, and mark each cut in
the transcript. Routes, cities and prices are not private and stay audible, as
does a medication when the post is about that medication. Mute the business
name wherever it would show where the customer goes (the firm or practice they
booked) and, for stock checks of a sensitive medication, every pharmacy's name.

Exports use original voices at normal speed, FFmpeg loudness normalization at
16 LUFS below full scale, a true peak limit of 1.5 dB below full scale, and mono
MP3 at 96 kbps with source metadata removed. The silent privacy spans preserve
timing. Update the duration and transcript together whenever audio changes.
No synthetic voices, music, or call sounds belong in these recordings.

Before publishing, verify the exact provider call association, read the saved
transcript, and check the source words around each silent interval. Decode the
export, verify its duration and silence intervals, and independently transcribe
it to look for remaining private details. Do not present a partial result as a
completed booking or resolution.

Before pushing, run `npm run check`, `npm run lint`, `npm test`, and
`npx wrangler deploy --dry-run`. In a browser, verify signed out access,
navigation from the home page, every audio file decoding and seeking, a second
player pausing the first, transcripts, narrow screens, and the purchase and
installation links. Repeat against the deployed page after CI completes.
