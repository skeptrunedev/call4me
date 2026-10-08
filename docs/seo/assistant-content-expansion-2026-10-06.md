# Assistant workflow content expansion

## Scope and evidence

Nick requested all four priorities from the October 6 signal review: improve
Codex and Claude guides, publish an appointment workflow resource, improve Muse
guides, and expand the research to phone workflow. Keep existing setup URLs,
target people delegating through their current assistant, and preserve the
approved recordings' privacy and outcome limits.

Between the October 5 and October 6 cumulative Search Console snapshots, article
impressions increased from 70 to 115. Codex rose from 1 to 14, Claude from 0 to 6,
research from 0 to 5, Muse from 7 to 11, and the calling MCP comparison from 0 to
4. These five pages account for 32 of 45 additional article impressions. Muse
received the first article click. These are small, partly provisional page
signals with reporting backfill, not proof of particular keyword rankings or
conversions. Most query data is undisclosed.

Fresh Ahrefs CLI research used the US database on October 6. Estimated monthly
searches: codex mcp 1,500; claude personal assistant 150; claude code personal
assistant 40; ai appointment booking 250; ai restaurant reservation 60. Broad
skills terms are larger but do not establish phone calling intent. Appointment
results include business receptionist products, so the new article explicitly
addresses a person asking their own assistant to call. Related keyword volumes
are not additive. Missing exact phrase estimates remain unknown demand.

Private research and QA outputs are in the ignored
`scratch/seo-content-next-2026-10-06/` directory. Previous and current GSC
snapshots remain in their existing scratch directories.

## Content delivered

1. Codex gains four reusable task briefs. Claude gains concrete task examples,
   a permissions brief and a result format. Both link the approved booking,
   appointment, inventory and return stories without attributing their unknown
   initiating clients to a named assistant.
2. `ai-personal-assistant-appointment-booking` is a distinct workflow article
   with two downloadable templates and three existing reviewed recordings.
   It distinguishes a booking, an offered option and an arrival acknowledgment.
3. Muse setup and first task guides gain a current conversation connection
   worksheet, explicit checks before dialing, a result inspection prompt and
   links to the approved task evidence. Branch contact details, regular hours
   and study room policy were rechecked on the official SFPL pages October 6.
4. The research guide adds a separately labeled October 6 section about stock
   answers and authorized dinner booking. The October 3 private dining test
   remains incomplete; the later customer calls do not prove web research or a
   named client was used.

## Original Muse execution limit

A fresh consumer Muse call could not initially be executed in this runtime. No consumer
Muse tool or CLI and no signed in browser control tool were available. Earlier
Muse Code probes used a different client and cannot substitute for this test.
At that stage, the published guides retained the October 1 authenticated balance
result and the October 4 unconfirmed message delivery attempt. They claimed no
new call, recording or successful reuse. A completed consumer Muse task was the
next evidence improvement, completed in the followthrough below.

## October 6 completed consumer Muse test

The native Mac desktop worker inspected the saved Call4me connector, then a fresh
Muse conversation returned a successful balance check through the existing skill.
After the user's action confirmation, Muse placed call_pk4x8psku92xtb48 to the
official Main Library number at 4:22 pm Pacific. The independent call record
confirmed the four minute cap and completed status. Native task observations
confirmed Muse polled the same ID and retrieved its transcript and recording.

An automated menu transferred to staff, who confirmed quiet laptop use, outlet
seating on floors three through five and WiFi without a password or library card.
The published result preserves the interrupted question about a card for seating,
uncertain network spelling and untested availability, speed and future conditions.
The recap's broader seating card claim is not repeated as a confirmed answer.

The exact provider recording and public export both decode to 108.72 seconds.
Two independent source and two export transcriptions were reviewed alongside
the saved transcript. No private identifying speech was found, so the manifest
has no mute spans. Original voices and timing remain. No human listening review
is claimed. Private source data lives outside the repository under the October 6
Muse followthrough evidence directory.

The setup, first task, comparison and supplier guides now link the actual calling
evidence. Blank templates and the earlier preparation baseline remain separate
from the new dated Markdown and JSON execution reports. Existing keyword targets
are retained; the comparison still describes unequal tasks without ranking clients.

## Verification history

Root reviewed all six articles and the new assets against the original stories.
Existing audio files and source transcripts were reused without changes.
Required checks include type checking, lint, the test suite, the deployment
build, local browser checks, CI and a production browser pass. The Expect
automated agent session failed during session creation; browser checks use
Expect's direct browser commands instead.

Local verification passed type checking, lint, 241 tests with one existing
skip, and the site deployment build. Expect verified all six pages, TOC
targets, every linked download, layouts at 320px and 1280px, all three new
article players loading and seeking, automatic player switching, the transcript
destinations, navigation from the homepage, archive, feed, sitemap and the
missing article 404. Root visually reviewed the new cover and rendered page.

The completed Muse call followthrough passed type checking, lint, 241 tests
with one existing skip, and the site deployment build. Expect verified all four
updated guides at 320px and 1280px without document overflow, canonical URLs,
valid structured data, the recording anchor, the 108.72 second player loading
and seeking to 100 seconds, the expanded transcript, and both dated execution
report downloads. The public audio hash matches the independently reviewed export.

## Article customer measurement, October 7

The reusable report reads current Search Console page results and aggregates
existing first touch attribution in D1. It does not change production data:

```sh
npm run seo:conversions -- --start 2026-09-28 --end 2026-10-07 --data-state all
```

The default Search Console data state is `final`. Use `all` to include recent
provisional data. The report returns Google's first incomplete date and last
available date separately. Google dates use Pacific time. The account cohort
uses inclusive UTC calendar dates, with conversion followup through the run's
`conversionsAsOf` timestamp. An optional `--as-of` ISO timestamp fixes that
cutoff for comparisons. Account and payment statuses remain their current
values, so this does not reconstruct a historical database snapshot.

The Google read uses `gws` and the existing personal profile for
`me@skeptrune.com`, restricted to `sc-domain:call4.me`. No authentication or
permission changes are needed. If Google fails, the JSON explicitly marks
Search Console unavailable and the command exits unsuccessfully; D1 attribution
is still available in the output. Missing Google rows are null rather than
claims that a page has never appeared in search. No clicks to signup percentage
is calculated across these different systems and timezones.

The D1 query excludes the same internal accounts as the dashboard. It returns
aggregate counts only, never account identifiers, emails, telephone numbers,
transcripts or call content. An article receives acquisition credit only when
the stored first touch names that exact article path and its timestamp is no
later than account creation. Later observed touches are reported separately.
Touches dated after the requested conversion cutoff, and missing or malformed
attribution, remain unknown. Visits to articles after a
homepage landing are not observable as assisted conversions in this report.

The report's `fundedCheckoutAccounts` metric means successful checkout funding currently
marked `paid`, with `paid_at`
before the conversion cutoff, matching the dashboard's purchase definition.
Pending and refunded topups do not count. Each account counts once regardless
of the number of purchases. Credit balance is not evidence of a purchase.
The stored amount represents credits before discounts, not net cash received.
A completed checkout can have no charge, so this metric does not establish a
cash positive customer or revenue.
First completed call means an outbound call marked `completed`, whose earliest
`ended_at` is before the cutoff. Inbound callbacks and attempts that failed,
were canceled or were unanswered do not count. Call completion does not imply
a resolved task or prove which assistant initiated it.

At 18:05 Pacific on October 7, the September 28 through October 7 cohort had
122 noninternal accounts. Of those, 56 had unknown attribution and 16 had a
first touch recorded after signup. The remaining 50 had a stored first touch
recorded before signup. Only one of those named an article:

| Article | Google impressions | Google clicks | Attributed signups | Funded checkout accounts | First completed call accounts |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Grok connectors and phone calls | 8 | 0 | 1 | 1 | 0 |
| Muse setup | 11 | 1 | 0 | 0 | 0 |
| Codex calling | 21 | 0 | 0 | 0 | 0 |
| Calling MCP comparison | 12 | 0 | 0 | 0 | 0 |
| Claude calling | 7 | 0 | 0 | 0 | 0 |

The Grok customer's source is recorded as direct, not Google. It is evidence
of an article landing followed by signup and completed checkout funding, not
a proven SEO conversion or verified net cash receipt. Across all current articles, Google reported 149 impressions and
one click, with data through October 6 and October 5 onward incomplete. The
Muse page has the one reported Google click, without an attributed signup.
Other articles have no recorded acquisition in this cohort. Unknown attribution
prevents interpreting that as proof they never influenced a customer. Ahrefs'
zero keyword estimate does not override Google's observed impressions or click.

The private aggregate JSON is in
`scratch/article-conversions-2026-10-07.json` in the main checkout. Its SHA256
is `3c5b6b0f461a0357047fa2c2acf15acea745e280d9fc48652ffba9081303b911`.
The command above independently refreshes both sources. SQL tests cover
internal exclusions, missing and late attribution, distinct accounts with
multiple purchases and calls, inbound and failed call exclusions, conversion
followup, cohort boundaries and unreported search rows.
