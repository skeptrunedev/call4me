# Month 1 Search Plan: October 2026, Day by Day

**Current schedule, October 3:** follow the [coding agent ICP plan and editorial schedule](seo/icp-plan.md). It replaces the company page volume targets and future work slots below. Existing progress entries remain the historical record. The next work is fresh Claude Code and Codex walkthroughs, a complete web research plus telephone task, T3 verification and calling MCP comparisons.

Month 1 of the [12-month search plan](seo-plan.md), rewritten as a daily schedule after the launch. One rule decides what gets built: grow search and AI-assistant traffic as fast as possible.

## Where we start (launch day, 2026-09-30)

| | |
|---|---|
| Launch post on X | 58,700 views, 460 likes, 440 bookmarks, 76 replies |
| Accounts | 16 created on launch day, 12 paid ($120) |
| Search | Domain rating 0, 0 ranking keywords. Launch links aren't crawled yet. Ahrefs shows 487 referring domains; the top 40 we checked are all spam we never asked for. |
| Site | Still titled "callbay". No analytics, no Search Console, 7 URLs in the sitemap. |

## What the data says (Ahrefs US, pulled 2026-09-30)

We pulled every keyword the 5 competitors rank for with at least 500 searches a month and a difficulty of 30 or less (GetHuman, Pine, xpendy, DoNotPay, Rocket Money). Then we grouped them into one page per company per chore. The result is **1,921 pages worth 8.6 million searches a month**, stored in [`docs/seo/targets.csv`](seo/targets.csv) and ranked.

**Demand is concentrated at the top.**

| Top pages | Share of all searches |
|---:|---:|
| 50 | 43% |
| 100 | 53% |
| 200 | 65% |
| 400 | 76% |

So Month 1 is about the top of the list, done well. The top 150 alone cover 60% of all searches. Pages ranked 1,000 to 1,921 add little.

**The biggest pages barely have links.** GetHuman ranks #4 for "verizon customer service" (638,000 a month) with 5 referring domains, #2 for "wayfair customer service" with 1, and #1 for "fedex customer service number" with 1. What ranks is a site covering many companies well, not links to each page. Links matter for the domain as a whole, which is what the launch and the Hold Time Index are for.

**Three kinds of pages**, from the 1,921:

| Job | Pages | Example | Fit for us |
|---|---:|---|---|
| Customer service / phone number | 1,226 | "verizon customer service" (884,000 across 9 searches) | Biggest traffic. The visitor wants a person on the phone, which is exactly what we sell. |
| Cancel | 329 | "how to cancel planet fitness membership" (173,000 across 28) | Best fit. We weight these 1.5x when ranking. |
| Refund / return policy | 366 | "best buy return policy" (28,700) | Traffic, weaker fit. Month 2. |

**Ranking formula** in `targets.csv`: volume × fit (cancel 1.5, call 1.0, refund 0.6) ÷ (1 + difficulty/10). On Oct 1 we added 15 chores people named in the launch-post replies (Ahrefs US data), with new jobs: retention (haggling a bill by threatening to cancel, fit 1.5), change flight, insurance claim, lost package, charge dispute and hotel upgrade (fit 1.0). The best are "how to cancel a subscription" (#244), UnitedHealthcare (#300), United flight changes (#425) and Spectrum retention (#488); none reach the top 150. The top 10 are Verizon, FedEx, Planet Fitness cancel, Delta, USAA, PayPal, Expedia, Adobe cancel, Wayfair and Audible cancel.

**Some results can't be won and get skipped.** Searches where the brand's own site or forums hold the whole first page stay off the list even if they're big: "xfinity customer service number" (Reddit and Facebook), "costco return policy" (costco.com) and "united airlines customer service" (united.com, 7 of 10 results). Checking the top 10 results (`ahrefs keyword-serp`) before each batch catches these.

## Every page is a real call

Before a page goes up, we place a real test call to that company and do the job the page is about, as far as it can go without the caller's own account. Then the page walks through that call in detail:

- **The phone tree, step by step:** every menu, what we pressed or said, and which option actually reached a person
- **The wait:** how long each stage took, and when we called (day and time)
- **The conversation:** what the rep asked for, what they offered (retention deals, credits, transfers), which answers moved things forward and which didn't
- **What you need ready:** account number, PIN, last 4 of the card, address on file, whatever the call required
- **Where it got stuck,** and how to get past it
- **"Have your agent make this call":** the prompt, filled in with everything above

Nobody else publishes this. GetHuman and Pine list a number and generic steps. Our pages show the real path through the call, and the details are exactly what AI assistants quote. We don't need a separate phone-number check either: the number is verified because we just called it.

**What each call does, by page type:**

| Page type | The test call |
|---|---|
| Customer service (`/call/<company>`) | Get through to a person and settle one real question (hours, fees, how to change a plan). Record every step to get there. |
| Cancel (`/cancel/<company>`) | Get to the cancellation or retention department and find out exactly what they need and what they offer, up to the point where a real account is required. If we have a real account with the company, cancel it for real and document every step. |

**Rules for the calls:**
- Our own account, and a real question or task each time. We never waste an agent's time on a fake story.
- Never publish a rep's name or anything that identifies them. Quote what they said, not who they are.
- Only during the company's phone hours. Calls run in parallel, so the limit is how many write-ups we can review, not how many lines we can dial.
- Each call costs roughly $1 (a 20-minute call). 150 pages cost about $150.

**Pace is set by review.** The agent drafts each page from the call transcript. Nick reads every page before it goes up, because accuracy is the whole value. 5 pages a day in Week 2 while the template settles, 10 a day in Week 3, 15 a day from Week 4.

**Pages must be found and indexed.** A new domain gets a small crawl budget. Link every page from a `/companies` A to Z list and category pages (telecom, airlines, gyms, streaming, banks, shipping). Ping IndexNow on publish. If Google indexes less than 60% of what's published, stop and fix the template before adding more.

**AI-assistant traffic (GEO) from Day 1:**
- **Bing Webmaster Tools + IndexNow** (ChatGPT search leans on Bing)
- **Structured data on every page:** Organization with contactPoint, HowTo for the steps, FAQ
- **A markdown version of every page and an entry in llms.txt**
- **An Ahrefs Brand Radar report** with about 50 prompts, read weekly with `ahrefs brand-radar`

## Targets for October 31

- [ ] Rename live: call4.me ranks #1 for "call4me", "call4.me" and "call for me ai"
- [ ] Analytics, Search Console, Bing Webmaster and IndexNow live, with signups tracked by source
- [ ] 150 pages live, each from a real test call (the top 150 in `targets.csv`, minus unwinnable results), covering 60% of the list's search volume
- [ ] At least 60% of them indexed
- [ ] Listed in at least 10 MCP and agent directories
- [ ] Brand Radar report live with a baseline
- [ ] Hold Time Index #1 ready to go out Monday, November 2 (the test calls are its data)

## Daily rhythm (from Week 2)

| When | What | Who |
|---|---|---|
| Morning | Review and approve yesterday's drafted pages | Nick, 45 min |
| Morning | Check the top 10 results for the day's targets and drop unwinnable ones. Prepare each call's brief. | agent |
| Business hours | Place the day's test calls in parallel. Answer any question a call raises. | agent |
| Afternoon | Draft a page from each transcript: phone tree, steps, what was needed, what was offered | agent |
| Midday | One distribution action (Reddit reply, directory, mention) | agent drafts, Nick sends, 15 min |
| Evening | Publish approved pages, ping IndexNow, log indexing and rank changes | agent |

Weekends are agent-only: builds, fixes and logs, with no calls (most phone lines are closed or short-staffed) and no posting.

## Progress log

**Wed Sep 30 (launch day), done:**
- call4me rename live; Google Search Console and Bing Webmaster Tools set up, sitemap submitted to Bing, home, /examples and /mcp submitted to Brave.
- IndexNow key live at call4.me. api.indexnow.org and Bing return 429 to Workers' shared IPs, so the cron submits through yandex.com/indexnow, which shares with Bing. The cron only sends a URL when its sitemap lastmod changes: after editing a published post, set `updated:` in its frontmatter.
- 5 posts live, each built on real recorded calls, private details muted in place: [Experian phone number](https://call4.me/blog/experian-phone-number), [cancel Planet Fitness](https://call4.me/blog/cancel-planet-fitness), [Wayfair customer service](https://call4.me/blog/wayfair-customer-service), [Costco tire appointment](https://call4.me/blog/costco-tire-appointment-cancel-refund), [reschedule a dentist appointment](https://call4.me/blog/reschedule-dentist-appointment).
- 2 customer calls added to /examples with permission (dentist reschedule, Costco tire order).
- 6th post from a customer's junk removal calls ([junk removal cost](https://call4.me/blog/junk-removal-cost)), and the booking call on /examples.
- Ahrefs Site Audit project (free Webmaster Tools, verified through Search Console, weekly crawl Wednesdays 8pm PT). First crawl: health 99, 2 errors, 26 warnings. After fixes: health 100, 0 errors. Fixed: http served pages instead of redirecting to https, titles and meta descriptions too long, homepage had no h1, blog BlogPosting schema errors, archive missing from the sitemap, and slow pages (every request built the auth instance, whose OAuth plugin queried D1 three times; blog pages now read from the nearest D1 replica).
- Call fixes found while testing: joining a call by pressing 1, relaying the user's keypad to the business, surviving session resets, reattaching a stream that never sends audio, no per-number daily limits.

**Thu Oct 1, done:**
- 5 posts live (20:51 UTC, every page and recording checked), each built on a recorded call that reached a person: [USAA phone number](https://call4.me/blog/usaa-phone-number), [UPS contact number](https://call4.me/blog/ups-contact-number), [Verizon customer service](https://call4.me/blog/verizon-customer-service), [FPL phone number](https://call4.me/blog/fpl-phone-number), [FedEx customer service number](https://call4.me/blog/fedex-customer-service-number). 17 calls ($26.75), 3 of them callbacks from the business. Numbers confirmed on each company's own site first.
- **Routes that reached a person:** USAA, press 1 (not a member), 2 (joining), say "membership". UPS, say "representative" twice at the tracking number prompt. Verizon, the account's mobile number and Account PIN, then "An agent, please". FPL, on the fifth call: the new-service signup ("open a new account", "get started"), then "speak to a person" (anywhere else, "representative" gets "That option is not available"). FedEx, a real tracking number, then ask for a representative and press 1 for the callback, which came within seconds.
- **New rule:** a page only goes up if one of its calls reached a person. "A real question, no account" works for membership and policy questions but not for carriers, telcos and utilities; those needed Nick's real Verizon account, a real FedEx tracking number, or the one menu route that hands off. Walled calls stay in the page as "what happens without X".
- 2 more live from the launch-reply chores, both difficulty 0 with no brand domain in the top 10: [United change flight](https://call4.me/blog/united-change-flight) ("flight change fee", then an 18 minute hold, full hold kept in the recording) and [UnitedHealthcare phone number](https://call4.me/blog/unitedhealthcare-phone-number) (1-888-585-0631, press 1, a licensed agent in seconds; plus our untested expectation for members). 2 calls, $7.25.
- Each post also targets its second-biggest search: "usaa customer service", "ups customer service number", "verizon phone number", "fedex phone number".
- Caller fixes shipped: ask a spoken menu for a representative instead of looping; never think out loud on the line; never guess where the user is calling from; the 2-calls-at-once limit per account is removed (each call already holds its full cost before dialing).
- Still open: on phone menus, some caller lines are in the transcript but silent on the recording, and a Verizon callback heard nothing from our caller. Diagnosing both needs the voice worker's past logs (`cflogs query` now reads Workers Observability; it needs a call4me-account token with Workers Observability: Read). The caller also still stalls with "hold on" and "let me check" at menus.

**Thu Oct 1, done:**
- 5 posts from customers' overnight calls, each aimed at a keyword picked with the Ahrefs CLI before drafting (US volume and difficulty pulled that morning): [Adderall shortage](https://call4.me/blog/adderall-shortage) (9,500/mo, KD 25, 11 pharmacies), [Etihad customer service](https://call4.me/blog/etihad-customer-service) (3,000, KD 0), [American Airlines flight credit](https://call4.me/blog/american-airlines-flight-credit) (2,800, KD 0), [lawyer consultation fee](https://call4.me/blog/lawyer-consultation-fee) (3,100, KD 0), [how to find a new primary care doctor](https://call4.me/blog/how-to-find-a-new-primary-care-doctor) (600, KD 0, 15 calls). Restaurant booking, store stock and shoe hold calls were skipped: no measurable search volume.
- 4 of those calls added to /examples. Rules for customer-call posts are in `docs/examples.md`: every call embedded, dead air trimmed, names and IDs muted, and the business muted where it shows where the customer goes.
- Call bugs these calls surfaced, not yet fixed: our side hung up mid-question once, our caller went silent after a person answered, it spoke to keypad menus and talked over voice menus, and it gave a wrong callback number.

**Fri Oct 2, done:**
- 3 posts from test calls placed at about 2:18 pm Pacific, all three reaching a person ($5.25): [Allstate customer service number](https://call4.me/blog/allstate-customer-service-number) (leads with "allstate phone number", 50,000/mo, KD 0), [cancel Audible](https://call4.me/blog/cancel-audible) (about 70,000/mo across the cancel searches, KD 0) and [Fabletics customer service](https://call4.me/blog/fabletics-customer-service) (24,000/mo plus "how to cancel fabletics membership", 8,800, both KD 0; no fabletics.com page in the top 10).
- Top 10 check before dialing dropped Delta (delta.com holds 6 of 10) and PayPal (paypal.com holds 4 of 5). Expedia and Priceline were dropped because neither publishes a phone number on its own site (sign-in flows and an AI agent), so the number can't be confirmed first.
- **Routes that reached a person:** Allstate, say "no" to claims, give a reason, answer the ZIP and home-ownership questions (it guessed "Michigan" from our 248 area code). Audible, press the 3 digits it reads out (270, then 550 after it warns it will disconnect), and 2 for pause or cancel. Fabletics, say you don't have the account's phone number twice and it transfers to a person.
- Allstate's claims page lists 800-255-7828 (1-800-ALLSTATE) separately from the 800-726-6033 call center; the post gives both.
- The OpenAI account behind call4me ran out of credit during these calls (`credit_balance_exhausted`; the Fabletics recap failed on it).

**Sat Oct 3, call research done:**
- Selected Fubo, Factor and HelloFresh cancellation pages from fresh Ahrefs US metrics and results showing independent guides can rank. Exact keyword demand is 15,000, 12,000 and 8,800 searches per month respectively; these are not traffic forecasts.
- Nick authorized informational calls. Five calls completed around 11 am Pacific ($7.00), reaching humans at all three businesses. The first Fubo attempt reached only its automated assistant; repeating the human request and choosing customer service worked on the second. Factor received a second call to clarify conflicting deadline and deletion answers. No account was cancelled or changed.
- Saved recordings and raw transcripts outside git. Sanitized findings and call record links are in [the page briefs](seo/next-pages.md). Factor's representatives and website still disagree about the cutoff, and its iOS deletion flow remains unverified. Drafts must retain those limits.
- Nick then requested the new blogs and examples be added. Three cancellation guides and three linked examples are live, covering the primary queries plus trials, app help, Roku billing, support numbers and order deadlines. All five reviewed recordings and transcripts are included; raw evidence stays private. Published through the normal main deploy in `8a048c7`; CI and production checks passed. IndexNow acceptance and search indexing remain to be checked.

## The days

### Week 1: foundation, launch links, template (Oct 1 to 4)

**Thu Oct 1: 5 posts from test calls**

Calls start around 6 to 7am Pacific (all five are Eastern or Central businesses). For each: confirm the number on the company's own site (Brave browser if curl is blocked; if neither works, the post waits rather than using a third-party listing), check hours, run the Ahrefs keyword check before writing, place the test call, mute private details in place and verify with two transcription models, write the post, deploy only when no calls are live, ping IndexNow.

| Post | Monthly searches | Who ranks now | Test call asks |
|---|---:|---|---|
| Verizon customer service | 884,000 (9 searches) | Verizon community threads, GetHuman #4, Yelp | how to switch to a cheaper plan, what cancelling a line takes |
| USAA phone number | 99,500 | only GetHuman and an App Store listing | who qualifies for membership, what you need to join |
| FedEx customer service number | 72,000 ("fedex customer service" itself is job listings) | GetHuman #1 | holding a package at a location, redirecting a delivery |
| UPS contact number | 46,700 | a travel blog, Facebook, UPS regional pages, GetHuman #9 | changing or intercepting a delivery, and the cost |
| FPL phone number | 40,100 | only GetHuman | starting service at a new address, the deposit |

Verizon goes first. If USAA walls us behind member verification the way Experian did, the wall is the post.

Still open from launch day: analytics with signup source tracking; Nick to create the Ahrefs Brand Radar report. (The launch-reply chores were added to `targets.csv` on Oct 1.)

**Fri Oct 2: launch links + first test call**
- Submit to the MCP Registry, Smithery, Glama, mcp.so and PulseMCP. The agent drafts, Nick submits.
- Add a line to the privacy page and terms: we publish write-ups of our own test calls, and never any customer's call.
- The first 2 test calls, Verizon (customer service) and Planet Fitness (cancel), to decide what a write-up needs to capture.

**Sat Oct 3 (agent): data model**

**Updated priority, Oct 3:** add more pages aimed at high volume searches with attainable results. The [new page batch](seo/next-pages.md), checked against fresh Ahrefs US metrics and search result snapshots, covers Fubo cancellation (15,000/month), Factor cancellation (12,000/month) and HelloFresh cancellation (8,800/month). All three reached live representatives around 11 am Pacific. Nick subsequently requested the blogs and examples be added; three guides, three examples and five reviewed recordings are live after the normal deploy and production checks. Source conflicts remain explicit. Improve the existing Fabletics page instead of making a duplicate cancellation guide. The data model remains queued below.

- D1 `companies` and `test_calls` tables: company, page type, the number dialed and its source, when we called, each step of the phone tree (menu prompt, what we pressed or said, time spent), rep interactions, what was needed, the outcome, links to the call record.
- A script that turns a finished call's transcript into a draft phone-tree write-up for review.

**Sun Oct 4 (agent): templates**
- `/call/<company>` and `/cancel/<company>` built from the Oct 2 write-ups: answer first, phone tree as numbered steps, a timeline of the wait, what to have ready, what they offered, other ways, "have your agent make this call". JSON-LD, markdown version, IndexNow ping on publish.
- `/companies` A to Z list and category pages. Sitemap split by type.
- Check the top 10 results (`ahrefs keyword-serp`) for the top 150 targets and mark unwinnable ones.

### Week 2: the first 20 pages (Oct 5 to 11)

**Mon Oct 5:** scoreboard snapshot (`ahrefs batch` on us plus the 5 competitors). Publish Verizon and Planet Fitness. 5 test calls: FedEx, Delta, USAA, PayPal, Expedia.

**Tue Oct 6:** publish yesterday's 5. Show HN around 8am Pacific (the agent drafts, Nick posts), with the Verizon write-up as proof. 5 test calls: Adobe cancel, Wayfair, Audible cancel, fubo cancel, Hulu cancel.

**Wed Oct 7:** publish 5, 5 test calls (the next 5 in `targets.csv`).

**Thu Oct 8:** publish 5, 5 test calls. Search Console: are the first pages discovered, crawled and indexed? Fix the template, not single pages.

**Fri Oct 9:** publish 5, 5 test calls. Submit to Claude and Codex plugin lists and "awesome MCP" GitHub lists (as PRs).

**Sat Oct 10 (agent):** link related pages to each other (a company ↔ its cancel page ↔ its category). Write briefs for next week's 50 calls.

**Sun Oct 11 (agent):** indexing report for the first 22 pages (Google and Bing). Look through the drafts for the parts Nick corrected most, and fix the draft script so they come out right the first time.

### Week 3: 10 a day (Oct 12 to 18)

**Mon Oct 12:** scoreboard + first Brand Radar reading. 10 test calls, publish 10.

**Tue Oct 13:** 10 calls, publish 10. One Reddit reply (r/Comcast_Xfinity, r/PlanetFitness, r/verizon: answer the person's question first). Reddit threads rank for many of these searches, so a good reply is search traffic in its own right.

**Wed Oct 14:** 10 calls, publish 10. Ship "call4.me vs Pine" and "call4.me vs GetHuman" ("pine ai" gets 1,100 a month, "gethuman" 800).

**Thu Oct 15:** 10 calls, publish 10.

**Fri Oct 16:** 10 calls, publish 10. Halfway check: if fewer than 60% of pages are indexed, hold the pace at 10 next week and fix the template first.

**Sat Oct 17 (agent):** list pages ranked 11 to 30 and what each one is missing.

**Sun Oct 18 (agent):** briefs for next week's calls.

### Week 4: 15 a day (Oct 19 to 25)

**Mon Oct 19:** scoreboard + Brand Radar. 15 calls, publish 15.

**Tue Oct 20:** 15 calls, publish 15. Redo the test call for the 5 pages closest to page one and update their write-ups, so they show a recent date.

**Wed Oct 21:** 15 calls, publish 15. One distribution action.

**Thu Oct 22:** 15 calls, publish 15. Build a list of 10 consumer reporters who wrote about hold times, cancelling or customer service in the last year, each with a link to their article.

**Fri Oct 23:** 15 calls, publish 15. **About 150 pages live.**

**Sat Oct 24 (agent):** Hold Time Index #1 data freeze: every test call so far, fastest and slowest companies to reach a person, the longest phone trees.

**Sun Oct 25 (agent):** draft `/hold-time-index` with a chart, the method and a markdown version.

### Week 5: Index + month review (Oct 26 to 31)

**Mon Oct 26:** scoreboard + Brand Radar. Nick reviews the Index. Test calls continue at 15 a day if indexing is above 60%.

**Tue Oct 27:** reporter pitches, one per reporter, each tied to their own article. Nick reviews every one.

**Wed Oct 28:** Index final. X thread and blog post written.

**Thu Oct 29:** month review against every target above. Set Month 2: the next 150 targets, the refund pages, and whatever Brand Radar says AI assistants cite.

**Fri Oct 30:** fix what the review found. Queue the Index, the pitches and the thread.

**Sat Oct 31 (agent):** final October log.

**Mon Nov 2:** Hold Time Index #1 goes out. Nick sends the pitches and posts the thread.

## What must never slip

- No page goes up without a real test call behind it, and without Nick reading it.
- No page goes up unless one of its calls reached a live person. A phone-tree wall alone never publishes: try every route the menu offers, then use a real account, tracking number or address. A walled call can sit inside the page as "what happens without X".
- Never publish a rep's name or anything that identifies them.
- Nothing from a customer's call goes public without their permission. Our own test calls are fine.
- Every external post, reply and pitch is drafted by the agent and sent by Nick.
- If indexing drops below 60%, stop adding pages and fix the template.
