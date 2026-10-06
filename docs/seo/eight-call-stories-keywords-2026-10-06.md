# Keyword targeting for eight customer call stories

October 6, 2026. This audit applies [the ICP plan](icp-plan.md) and the
[previous customer story audit](customer-success-icp-keywords-2026-10-05.md).
The intended reader already uses a personal assistant or coding agent and
wants that assistant to handle the phone step of a task. Consumer task searches
are an entry route, not evidence that every searcher uses Claude Code or Codex.

Use the task phrase in the title and opening, introduce the existing assistant
workflow before the recording, and link to the established client guides.
Suggested prompts must remain separate from the historical customer evidence.
These recordings do not establish which client the customers used.

## Article decisions

Figures are Ahrefs US monthly search estimates retrieved through the CLI on
October 6. Unknown means the response was null. A returned zero is shown as
zero and is not interchangeable with null. Related phrases overlap, so their
volumes must not be added together as unique demand or forecast traffic.

| Article | Primary task phrase | US volume | KD | Supporting phrase and editorial boundary |
| --- | --- | ---: | ---: | --- |
| [Macy's stock check](/blog/macys-bow-tie-stock-check) | check store availability | 50 | 0 | Explain how a phone call fills gaps in online stock information, using one exact Macy's product. The SERP mostly contains retailer inventory help. `macys bow tie` has 20 searches and KD 0, but product shopping is not the page's main job. |
| [Dinner reservation](/blog/book-dinner-reservation-by-phone) | how to make a restaurant reservation | 30 | 0 | The phone script and confirmed table satisfy the practical task. `ai restaurant reservation` has 60 searches with unknown KD and a null SERP response, so retain it as supporting capability language. |
| [Doctor appointment](/blog/reschedule-doctor-appointment) | reschedule doctor appointment | 30 | 0 | `reschedule doctors appointment` has 20 searches and unknown KD. The exact `how to reschedule a doctor appointment` returned zero and unknown KD. Keep one page for these variants. |
| [Barber arrival update](/blog/running-late-to-barber) | running late to barber | Unknown | Unknown | `late to haircut appointment` returned zero and unknown KD. `how late can you be to a hair appointment` has 10 searches and unknown KD, but one barber's acknowledgment does not establish a general grace period. |
| [Mandarin availability call](/blog/mandarin-phone-call-scheduling) | ai phone calls in mandarin | Unknown | Unknown | `mandarin phone call`, `ai phone calls in chinese` and `chinese ai phone assistant` also have unknown volume and KD. Show a Mandarin conversation and translation, not a language course or general translation product. |
| [Veterinary consultation](/blog/veterinary-behavior-consultation-call) | veterinary behavior consultation | 10 | Unknown | Keep the information gathering task. `veterinary behaviorist cost` has 20 searches and unknown KD, but neither the provider's credentials nor national pricing is established by this anonymous example. |
| [Aquasana return request](/blog/aquasana-return-exception) | aquasana return policy | 30 | 0 | `aquasana returns` has 10 searches and unknown KD. Answer the policy question using the current official source, then clearly separate the recorded exception request. |
| [Appointment arrival update](/blog/running-late-to-appointment) | running late to appointment | Unknown | Unknown | The shorter supporting phrase `late to appointment` has 10 searches and KD 0. Keep this as the general delay notification example without inventing a universal grace period. |

The broad Macy's task is a qualified target, not a prediction that this case
study will outrank retailer help pages. Show the exact product and location,
check the retailer's online availability first, then explain what calling can
add: local quantity, physical details, collection timing and an actual answer
from the department. The original article URL stays stable.

For Aquasana, use [the official refunds and returns page](https://www.aquasana.com/refunds-and-returns.html)
for current policy, checked October 6. The call provides historical evidence of
an exception approved in one case. The search result's AI summary is not the
policy source. Do not convert that exception into a general entitlement or a
claim that money was received.

## SERP evidence and limits

The CLI returns Ahrefs' latest stored SERP, not a new Google crawl. Dates below
are the actual `lastUpdate` values in the saved responses. Domain strength and
referring domains describe those returned results; unknown referring domains
are not zero. KD 0 is not a ranking guarantee.

| Saved report | Stored lastUpdate, UTC | What the returned results establish |
| --- | --- | --- |
| `serp-store-availability.json` | 2026-09-20T11:25:15Z | Nine organic results, mostly retailer inventory help: Walmart, Bass Pro, Uniqlo, Next, Barnes & Noble, Journeys, Target and Best Buy, plus Reddit. All returned domains have DR at least 69. Journeys has zero referring domains and Target three, but their retailer authority and direct task fit remain substantial. |
| `serp-dinner.json` | 2026-09-07T03:02:25Z | Eight organic results include OpenTable, a Reddit question specifically about reserving by phone, wikiHow instructions and platform help. The phone script matches an observed informational intent; major sites still dominate the returned set. |
| `serp-doctor.json` | 2026-10-01T23:51:06Z | Nine organic results include Zocdoc, Kaiser, Northwell, MyChart video instructions and a caregiver guide. This is a patient task with platform specific answers, not primarily a software procurement query. |
| `serp-aquasana.json` | 2026-09-26T09:26:04Z | An AI overview links Aquasana's official return page. Eight organic results mix retailer listings, warranty documents and an independent review at DR 11 with two referring domains. That mixed result set warrants a directly sourced policy section, not reliance on KD alone. |
| `serp-late.json` | 2026-08-24T04:30:11Z | Nine organic results mix patient lateness with doctors keeping patients waiting. The apparent volume does not all describe a customer needing to notify an office. |
| `serp-ai-scheduling.json` | 2026-09-26T12:21:10Z | Nine organic results include apps, product comparisons and calendar or meeting automation. Low authority examples exist, but they do not make a single appointment call story satisfy the broader product selection intent. |

The Macy's specific, barber, Mandarin, veterinary cost, veterinary consultation,
AI dinner and capability SERP files returned null. No ranking, competitor
absence or easy difficulty is inferred from those responses.

## Attractive numbers that do not fit these pages

| Keyword | US volume | KD | Decision |
| --- | ---: | ---: | --- |
| ai receptionist | 9,100 | 39 | Reject for this cluster. Buying business call answering differs from giving an existing personal assistant a phone. No receptionist SERP was retrieved in this audit. |
| ai scheduling assistant | 1,600 | 0 | Reject as a primary. The actual SERP is mostly scheduling products and comparisons. |
| ai shopping assistant | 1,600 | 34 | Reject as a primary for the Macy's case. A product discovery comparison is broader than checking one item at one store. |
| ai phone assistant | 1,200 | 29 | Audience language only. Too broad to replace each story's distinct task. |
| reschedule appointment | 700 | 2 | Supporting language only. Keep the doctor article specific rather than making it compete with every scheduling story. |
| aquasana customer service | 500 | 81 | Useful context, not this article's primary target. The narrower return task is the evidenced job. |
| ai appointment booking | 250 | 9 | Do not turn customer stories into inbound booking software pages. This query was measured, but no dedicated SERP was retrieved in this audit. |
| dog behaviorist cost | 80 | 0 | Reject as the veterinary story's primary. A single anonymous veterinary quote cannot establish broad dog trainer or behaviorist prices. |
| check store inventory | 30 | 47 | Prefer the availability task, while still using ordinary inventory language where useful. |

The matching ideas report distinguishes `how late can you be to a doctor's
appointment` (100, KD 0) from `how late can you be to a doctors appointment`
(20, unknown KD) in the initial batch. Do not silently substitute one estimate
for the other. More importantly, the returned lateness SERP includes the
opposite problem, doctors running late. It does not justify rewriting the
customer's ten minute arrival update into a universal lateness policy.

The followup batch also measured `how late can you be to an appointment`
(30, KD 0), `veterinary behaviorist consultation` (10, unknown KD) and
`ai assistant restaurant reservation capabilities` (60, unknown KD). These do
not change the boundaries: the office decides whether it can still see a
patient, the veterinary example does not establish provider credentials, and
one restaurant booking is evidence of that task rather than a complete
capability comparison.

Capability language such as `claude code personal assistant` (40, unknown KD),
`ai to make phone calls` (90, unknown KD) and `can ai assistant make phone calls`
(50, unknown KD) can connect task pages to the existing setup guides. These
are not extra volumes to assign to every story.

## Keep one page per distinct task

The general appointment arrival article owns delay notifications. The barber
page stays specific to a haircut booking and links to it. Neither should
target appointment reminder software. Doctor rescheduling links to the
existing dentist rescheduling page and stays distinct from telehealth changes.
Dinner booking stays separate from private dining cost and research. Macy's
checks one product; the existing dress shoes story covers searching several
stores and obtaining a hold. Veterinary consultation questions remain separate
from the existing dropoff booking guide. Mandarin meeting availability remains
separate from scheduling a future phone call.

Keep all eight original URLs and the examples ordering. Preserve the original
recordings and transcript disclosures. The doctor call found the old booking
already canceled before arranging a replacement. Dinner was booked, but
cancellation terms were not confirmed. Neither arrival call establishes a
completed service. Mandarin produced a suggested Saturday, not a confirmed
meeting. Veterinary information comes from saved text without an available
recording, with no booking or payment. Macy's made no purchase or hold.
Aquasana approved the exception while return paperwork and payment remained
pending.

## Reproduce and measure

Ignored source exports live in `scratch/seo-eight-calls-2026-10-06/`. The
initial batch has 69 distinct exact phrases and the followup adds five, for
74 distinct phrases. The priority recheck repeats two. Four matching ideas
reports each return 100 rows, and 13 SERP requests produced six stored reports
and seven null responses. Preserve the raw files
for exact estimates, nulls, result URLs and stored dates. Do not commit provider
signatures from SERP responses.

These command shapes were checked against the installed CLI help:

```bash
ahrefs keyword-batch --file scratch/seo-eight-calls-2026-10-06/keywords.txt --db us --json
ahrefs keyword-ideas 'restaurant reservation' --type matching --db us --limit 100 --json
ahrefs keyword-serp 'how to make a restaurant reservation' --db us --limit 10 --json
```

Use Search Console to see which queries and landing pages actually earn
impressions. The outcome to measure is qualified activation: the reader
connects their existing assistant and completes a first call, followed by paid
conversion and repeat use. Broad task traffic alone does not prove ICP fit.
The unknown demand pages remain useful product evidence without an invented
traffic forecast.
