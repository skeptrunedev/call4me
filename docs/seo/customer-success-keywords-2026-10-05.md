# Customer success article keyword evidence

Researched October 5, 2026 with the installed `ahrefs` CLI, US Google database.
The existing Browserbase login helper refreshed the expired mirror session before
these reads. These are new successful Ahrefs responses, not recycled estimates.
Search volumes are Ahrefs estimated monthly searches. KD is its 0 to 100
backlink difficulty metric. Neither value proves that call4me will rank.

## Selected targets

| Article | Primary keyword | US volume | KD | Supporting keywords | Proposed slug |
| --- | --- | ---: | ---: | --- | --- |
| Ohio employer application obstacle | ohio workers compensation insurance | 150 | 2 | workers compensation insurance ohio, 150, KD 1; ohio workers comp insurance, 40, KD 0 | ohio-workers-compensation-insurance |
| Veterinary dropoff booking | drop off vet appointment | 20 | 0 | how to schedule a vet appointment, 20, KD 0; vet drop off, 10, KD 0 | drop-off-vet-appointment |
| Booking with a preferred stylist | book haircut appointment | 50 | 0 | salon appointment, 90, KD 1; how to book a haircut appointment, 10, KD unavailable | book-haircut-appointment |
| Oil change availability and quote | does les schwab do oil changes | 1,400 | 0 | les schwab oil change, 450, KD 1; les schwab oil change cost, 40, KD 0; les schwab tire rotation cost, 70, KD 0 | les-schwab-oil-change |

Each article needs the actual call outcome, a useful answer to the query, a
practical script or checklist, and a clear way to ask call4me to make the call.
Titles should target the query naturally, rather than implying that every
customer received a completed service.

## Ranking evidence and limitations

SERP reads used `ahrefs keyword-serp '<keyword>' --limit 10 --json`. The raw JSON
returns the available SERP, which may contain fewer than ten organic results.
DR and referring domain counts below are Ahrefs values for the returned pages.
A missing count is unknown, not zero.

### Ohio workers compensation insurance

The returned SERP has seven organic results. Official BWC pages hold positions
1 and 2. Position 5 is Denman Lerner's state fund explanation, DR 6 with zero
referring domains. Position 6 is Sheakley's application guide, DR 37 with zero
referring domains. Position 4 is Monast Law's employer requirements page, DR 24
with 11 referring domains. This supports an informational application guide as
a plausible opportunity without assuming call4me can outrank the government.

The foreign owner and ITIN obstacle is the distinctive real evidence within the
larger topic. `ohio bwc u3` returned zero volume and no KD; `ohio bwc u3 form`,
`bwc u3 form` and `bwc u3 application` returned no volume or KD. Do not claim
searched demand for the exact ITIN or U3 issue. The representative explained a
route through the obstacle. The call did not file an application, bind insurance
coverage or establish universal eligibility. Current primary BWC sources must
support general process claims; the call itself supports only what was said.

### Drop off vet appointment

The returned SERP has nine organic results. Reddit is first. Informational
dropoff pages include Oregon Valley Veterinary Clinic, DR 4 and zero referring
domains at position 3; Austin Pet Clinic, DR 25 and zero referring domains at
position 6; Bridgeport Veterinary Hospital, DR 6 and zero referring domains at
position 7; and Club Hill Animal Clinic, DR 3 and zero referring domains at
position 9. These are a much better topical fit than the generic phrase.

`vet appointment` has 2,000 US searches and KD 0, but its SERP begins with a
local pack and consists mostly of appointment pages. Low KD does not eliminate
that local intent mismatch. `schedule vet appointment` has KD 62. The narrower
20 search dropoff query is intentionally the main target. The example supports
an 8:30 AM Tuesday dropoff confirmation, not a completed examination or a
resolved clinic location. Do not disclose either competing location as certain.

### Book haircut appointment

The returned SERP has eight organic results and a local pack. Booksy and Fresha
booking pages rank alongside Dash Hair Salon, DR 2; BarberLab, DR 18 with zero
referring domains; and Lemon Tree's local page, DR 19 with zero referring
domains. The independent domains make this a plausible smaller target, but
the transactional and local intent still matters. Include an actual booking
workflow and call4me booking action, rather than publishing only an anecdote.

`haircut appointment` has 1,000 US searches and KD 47; `hair salon appointment`
has 200 and KD 28; `book hair appointment` has 200 and KD 35. Those are secondary
context, not the chosen easy primary. The how to variant has 10 searches but
unknown KD and no returned SERP, so it cannot justify a rankability claim.
The real call confirmed Friday at 2 PM for $60, while an earlier Thursday slot
was available. Say it booked the preferred stylist, not the earliest slot.

### Does Les Schwab do oil changes

The returned SERP has ten organic results. Les Schwab's own service page and
locator rank first and second. Independent discussion pages include Reddit,
TractorByNet, DR 54 and zero referring domains at position 7, and RetailWatchers,
DR 16 at position 8. A clear answer with current official availability and a
specific real store quote has an informational opening. The related cost SERP
also contains Reddit, Facebook, Yelp and TractorByNet.

The call supports a Monday morning walk in dropoff plan and a $100 to $110
combined estimate. It does not establish a reserved appointment, completed
service, national fixed pricing or oil change availability at every location.
The tire rotation query must distinguish this combined quote from a standalone
rotation price and any eligibility terms for complimentary rotations.

## Suggested metadata

These SEO titles remain within 60 characters after the layout appends
` - call4me`. Descriptions remain under 160 characters.

| Article | SEO title | Description |
| --- | --- | --- |
| Ohio | Ohio workers compensation insurance: how to apply | See how to apply for Ohio workers compensation insurance, what to ask BWC, and how a real call clarified an ITIN obstacle for a foreign owner. |
| Vet | Drop off vet appointment: what to confirm | A real call booked a Tuesday vet dropoff. Learn what to confirm about the clinic, arrival time, pickup, and contact details before leaving your pet. |
| Haircut | Book a haircut appointment with your stylist | Use a simple call script to book a haircut with your preferred stylist. A real call confirmed Friday at 2 PM for $60, with an earlier slot missed. |
| Les Schwab | Does Les Schwab do oil changes? A real phone quote | Check Les Schwab oil change availability, cost, and walk in plans. A real call got a $100 to $110 estimate for an oil change and tire rotation. |

## Reproducible evidence

Ignored raw responses live in
`scratch/seo-customer-successes-2026-10-05/`. Additional keyword ideas responses
are in adjacent ignored scratch JSON files with the same date prefix. Credentials
and customer call transcripts are not included in this document or those files.

* `batch-initial.json`: 19 exact candidate phrases through `ahrefs keyword-batch`.
* `batch-followup.json`: 15 exact phrases covering the final narrower targets.
* `ideas-vet-drop-off.json`: matching terms for `vet drop off`.
* `ideas-les-schwab.json`: matching terms for `les schwab`.
* `serp-ohio-insurance.json`: primary Ohio SERP.
* `serp-dropoff-vet.json`: primary veterinary SERP.
* `serp-book-haircut.json`: primary haircut SERP.
* `serp-les-schwab-oil-changes.json`: primary Les Schwab SERP.
* `serp-les-schwab-cost.json`: supporting cost SERP.
* `serp-vet-appointment.json`: rejected broad veterinary SERP.
* `serp-how-book-haircut.json`: null response for the smaller how to variant.

| SERP | Ahrefs lastUpdate, UTC |
| --- | --- |
| Ohio insurance | 2026-09-07T19:05:32Z |
| Vet dropoff | 2026-09-17T23:43:57Z |
| Book haircut | 2026-10-03T01:46:41Z |
| Les Schwab oil changes | 2026-09-15T01:40:52Z |
| Les Schwab cost | 2026-09-27T11:07:36Z |
| Broad vet appointment | 2026-10-03T14:09:39Z |

A successful fresh request retrieves Ahrefs' latest stored SERP; it does not
force Google to recrawl a keyword today.

## Prepared content verification

The four articles are registered in the blog inventory and have matching
examples, four SVG headline images and five anonymized recordings. The fifth
recording is the unsuccessful haircut rescheduling attempt, retained in its
article. Nick confirmed that all three account owners agreed to publication on
October 5, 2026. The collection was prepared and verified in a separate checkout
before integration into main.

Type checking, linting, the Worker deployment build and all 158 existing tests
passed. Local HTTP checks found 46 unique internal link and image targets,
all returning 200 without redirects. The sitemap, Atom feed and llms.txt
contain all four article URLs. Audio byte range requests return 206 correctly.

Expect browser checks confirmed the five recording durations, 184 valid
transcript seek links, correct recording selection and playback exclusivity,
no mobile horizontal overflow and no page JavaScript errors. Timestamp media
fragments also remain usable without JavaScript. All four headline images were
visually inspected. These checks verify the prepared pages; they do not assert
an Ahrefs Site Audit score, achieved rankings or production deployment.

## Production verification

CI run 37332295190 deployed the collection successfully. Production HTTP checks
confirmed all four article URLs, canonical tags, examples anchors and guide
links, sitemap, feed and llms.txt entries. All 41 distinct internal link targets
returned 200 without redirects. All five audio files matched the approved
exports by SHA256, and byte range responses returned the expected bytes.

The production playback pass exposed an existing unhandled AbortError when
pausing or changing recordings before playback finished starting. The timestamp
player now handles that intentional cancellation while continuing to report
unexpected playback failures. Local browser regression checks exercised eight
rapid playback and pause cycles without an unhandled cancellation, and confirmed
that an unsupported media error still surfaces. Type checking, linting, the
Worker build and all 158 tests passed for the correction.
