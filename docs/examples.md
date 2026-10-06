# Public call examples

## October 6 collection in preparation

The account owners have agreed to publication of eight additional redacted
recordings. The collection covers a store stock check, a dinner reservation,
a doctor's appointment reschedule, a barber arrival update, a Mandarin
availability check, a veterinary callback, a return exception approval and a
clinic arrival update. Append these examples after the existing collection.
Each accompanying article must preserve the recorded outcome's limits,
especially the unconfirmed replacement meeting time and the pending return
paperwork and refund. Source association, audio redaction, transcript review
and browser checks remain required before publication.

## Published collection

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
shoes put on hold at a Men's Wearhouse for same day pickup, and a Spectrum retention call
published only up to where the user joined it. For a customer call, first
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

The October 5 founder example adds a Wyoming registered agent consent request,
published at `/blog/wyoming-registered-agent-consent-form` and on the examples
page. Nick requested publication of his recording and confirmed that the
consent document arrived by email. The recorded conversation establishes a
signed and dated consent request, an account lookup, a confirmed email
destination and the representative's agreement to email it. Document receipt
is Nick's confirmation after the call. The representative did not read back
the full consent wording, and no LLC filing was submitted during the call.

The reviewed MP3 at
`public/static/examples/wyoming-registered-agent-consent.mp3` decodes to
171.82 seconds, matching the complete source WAV. It preserves original
voices, menu, hold music, waiting and final survey fragment. Names, company
name and spelling, account phone and email are muted in nine spans. The
overlap affected by company name muting and uncertain words are marked in
the full transcript. Two independent source transcriptions, word timestamps,
short source excerpts, two independent final export transcriptions and
decoded silence checks were reviewed. No human listening verification is
claimed. Raw audio, ASR outputs and the editing manifest remain outside the
repository. The article's Claude Code and Codex briefs are suggested workflows,
rather than evidence of a newly executed client integration.

The October 5 collection adds four customer stories and matching examples:
an Ohio BWC application question, a veterinary dropoff booking, a haircut
booking, and a Les Schwab oil change quote with a walk in dropoff plan. The
haircut guide also includes its brief unsuccessful rescheduling call. All five
exports retain complete source timing and original voices. Names, private
numbers and identifying clinic or salon details are muted. Exact provider leg
association, decoded silence checks and two independent source and export
transcriptions were checked. Uncertain words are marked; no human listening
verification is claimed. Nick confirmed that all three account owners agreed
to publication before these pages and recordings were deployed.

The Ohio call supplied application instructions without filing an application
or issuing coverage, and its spoken callback differed from the requested one.
The veterinary call confirmed Tuesday at 8:30 AM but left conflicting branch
names, price and clinical urgency unresolved. The haircut was confirmed for
Friday at 2 PM for $60 despite an available Thursday slot; the later call did
not confirm a change. Les Schwab accepted a walk in dropoff plan and quoted a
combined $100 to $110 estimate, without a reserved appointment or proof of
completed service. Each guide preserves these limits and links its example.

The October 4 Grok Bot example uses one informational Foreign Cinema call.
The complete reviewed caller and restaurant recording lasts 108.9 seconds,
with original timing retained at `public/static/blog/grok-foreign-cinema-walk-ins.mp3`.
The restaurant's menu supplied a walk in policy but no staff member confirmed
availability for four people or an arrival time. The article preserves the
brief unclear interjection, disputed final prompt and stop from the Bot tool.
It does not establish a keypad action, immediate silent hangup or mailbox receipt.

The October 4 voice comparison adds twelve controlled carrier SIP trials,
three per voice, captured on the receiving application's caller channel.
Appointments and reference codes are synthetic fixture facts. Public players
contain the complete received caller channel, with silence during the separate
receiver prompts preserved. They do not contain a mixed conversation and do
not establish a public telephone or handset test. Reviewed WAV extracts expose
the exact readback windows used for scoring; label their boundaries and keep
the complete recordings alongside them. The downloadable result ledger includes
audio hashes, packet gap totals, two ASR outputs per window and recognized fields.
ASR text and the caller's intended text are separate evidence, neither is a
human verified transcript. The existing five language clips are direct model
samples and now say so in both the article and the voices page.

The October 3 cancellation research adds founder examples for Factor, Fubo and
HelloFresh, linked to their cancellation guides. These are general inquiries,
not completed account cancellations. The blogs include all five calls, including
the first Fubo attempt that reached only an automated assistant and the Factor
clarification. Each export retains the complete source duration, with names and
private phone details muted. Factor's contradictory deadline and data deletion
answers remain explicit in the guide.

The October 3 coding agent research includes five founder recordings: three
Call4me calls, one Bland call, and one Vapi Agent Phone call. The Claude Code
session reached Foreign Cinema's private dining voicemail. Codex reached the
Waterbar and EPIC Steak automated concierges through Call4me, then Waterbar's
virtual concierge through Bland and Agent Phone in separate fresh sessions.
None reached a human, obtained a complete event quote, or arranged a booking.
The reviewed files live in `public/static/blog/sf-private-dining-*.mp3`,
preserve the full source durations, and mute private identifiers. Each has a
reviewed timestamp transcript. These sessions establish their named CLI
workflows, with canonical authentication checks and legacy calling
distinguished in the guides.

The calling MCP comparison includes Bland's complete reviewed 2:13 recording
at `public/static/blog/sf-private-dining-waterbar-bland.mp3` and Agent Phone's
complete reviewed 1:51 recording at
`public/static/blog/sf-private-dining-waterbar-vapi.mp3`. Their full audio aligned
transcripts contain 15 and 11 turns respectively. Bland's stereo source tracks
were checked separately to preserve overlapping words. Agent Phone's recording
was associated with its exact authenticated MCP submission and final owned call
status; no separate Vapi developer REST inspection was available. Independent
source and export transcriptions confirmed the public audio. The published
transcripts preserve audible words rather than completing interrupted phrases
or adding unverified words from API text.

The three Waterbar attempts reached the same virtual concierge but received
different capacity flexibility statements. Those statements remain unresolved
and do not establish a staff guarantee or a provider ranking. The experiments
also use unequal duration limits: six minute Call4me caps, a three minute Bland
cap, and an instructional three minute Agent Phone goal with no exposed cap
parameter. They do not establish every client surface or a cross vendor
benchmark.

The October 4 menu tests add two connected calls to Foreign Cinema's published
main line. Agent Phone reached private dining voicemail in a 2:31 recording,
but did not end immediately or silently. Its final spoken words may have been
recorded as a message; the recording does not establish that outcome. Bland's
native action log reports button 2 and its recording confirms private dining
voicemail. Codex stopped the call while the greeting continued, so the test
does not establish autonomous immediate hangup. The provider reports 68 seconds
and the recording lasts 67.74 seconds. Bland's queue delay is separate from
connected duration. An earlier attempt canceled while queued by our runner is
excluded from menu scoring and produced no recording.

The reviewed menu exports live in
`public/static/blog/phone-menu-foreign-cinema-vapi.mp3` and
`public/static/blog/phone-menu-foreign-cinema-bland.mp3`. Keep original timing,
mute private identifiers, and publish complete reviewed transcripts. Neither
submitted request specified the keypad digit. Native button evidence is
available for Bland; Agent Phone returned destination evidence without a
keypad event trace. These one branch tests do not measure nested menus, holds,
repeatability or relative speed.

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
