# Month 1 Search Plan: October 2026, Day by Day

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

**Ranking formula** in `targets.csv`: volume × fit (cancel 1.5, call 1.0, refund 0.6) ÷ (1 + difficulty/10). The top 10 are Verizon, FedEx, Planet Fitness cancel, Delta, USAA, PayPal, Expedia, Adobe cancel, Wayfair and Audible cancel.

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

## The days

### Week 1: foundation, launch links, template (Oct 1 to 4)

**Thu Oct 1: rename + measurement**
- Ship the call4me rename (the `rename-call4me` worktree has 43 changed files that were never committed): titles, meta, OG cards, robots.txt, llms.txt, MCP server name.
- Analytics with signup source tracking.
- Google Search Console and Bing Webmaster Tools verified and sitemap submitted. IndexNow key published.
- Nick: create the Brand Radar report in the Ahrefs UI (about 50 prompts). Go through the 76 launch replies and add the chores people mention to `targets.csv`.

**Fri Oct 2: launch links + first test call**
- Submit to the MCP Registry, Smithery, Glama, mcp.so and PulseMCP. The agent drafts, Nick submits.
- Add a line to the privacy page and terms: we publish write-ups of our own test calls, and never any customer's call.
- The first 2 test calls, Verizon (customer service) and Planet Fitness (cancel), to decide what a write-up needs to capture.

**Sat Oct 3 (agent): data model**
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
- Never publish a rep's name or anything that identifies them.
- Nothing from a customer's call goes public without their permission. Our own test calls are fine.
- Every external post, reply and pitch is drafted by the agent and sent by Nick.
- If indexing drops below 60%, stop adding pages and fix the template.
