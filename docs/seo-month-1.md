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

So Month 1 is about the top 300, done well. Pages ranked 1,000 to 1,921 add little.

**The biggest pages barely have links.** GetHuman ranks #4 for "verizon customer service" (638,000 a month) with 5 referring domains, #2 for "wayfair customer service" with 1, and #1 for "fedex customer service number" with 1. What ranks is a site covering many companies well, not links to each page. Links matter for the domain as a whole, which is what the launch and the Hold Time Index are for.

**Three kinds of pages**, from the 1,921:

| Job | Pages | Example | Fit for us |
|---|---:|---|---|
| Customer service / phone number | 1,226 | "verizon customer service" (884,000 across 9 searches) | Biggest traffic. The visitor wants a person on the phone, which is exactly what we sell. |
| Cancel | 329 | "how to cancel planet fitness membership" (173,000 across 28) | Best fit. We weight these 1.5x when ranking. |
| Refund / return policy | 366 | "best buy return policy" (28,700) | Traffic, weaker fit. Month 2. |

**Ranking formula** in `targets.csv`: volume × fit (cancel 1.5, call 1.0, refund 0.6) ÷ (1 + difficulty/10). The top 10 are Verizon, FedEx, Planet Fitness cancel, Delta, USAA, PayPal, Expedia, Adobe cancel, Wayfair and Audible cancel.

**Some results can't be won and get skipped.** Searches where the brand's own site or forums hold the whole first page stay off the list even if they're big: "xfinity customer service number" (Reddit and Facebook), "costco return policy" (costco.com) and "united airlines customer service" (united.com, 7 of 10 results). Checking the top 10 results (`ahrefs keyword-serp`) before each batch catches these.

## How we get to 300 good pages in a month

**1. Probe calls verify every phone number automatically.** Hand-checking each number was the bottleneck: 30 minutes a day is enough for about 10 numbers. A probe is a short automated call. It dials the number, listens to the phone menu for about 45 seconds, transcribes it and hangs up before reaching a person. The page ships only if the greeting names the right company. It also saves the menu options ("press 2 for billing"), which no competitor publishes. A probe costs a few cents and takes no staff time at the company. Nick spot-checks 10 a day instead of approving every number.

**2. Full measurement calls on the top 100 only.** Probes can't tell us the wait to reach a person. So each weekday, 5 full calls go to the top 100 companies: navigate the menu, wait for a person, ask one real question (hours or cancellation policy), and record the menu path and the wait. That data goes on the pages worth the most, and it's what AI assistants quote.

**3. Launch speed follows indexing.** A new domain gets a small crawl budget. We publish in batches and only speed up while Google indexes at least 60% of what we've published. Link each new page from a company A to Z list and category pages (telecom, airlines, gyms, streaming, banks, shipping). Without those links Google won't find the pages.

**4. AI-assistant traffic (GEO) is built in from Day 1.**
- **Bing Webmaster Tools and IndexNow** ping on every publish. ChatGPT search draws heavily on Bing, so pages get into Bing fast.
- **Structured data** on every page: Organization with contactPoint (phone, hours), HowTo for cancel steps, and FAQ.
- **Markdown version of every page and an entry in llms.txt.**
- **An Ahrefs Brand Radar report** set up in the UI on Day 1 with about 50 prompts, such as "how do I cancel planet fitness", "verizon customer service number" and "can an AI call customer service for me". It's checked weekly with `ahrefs brand-radar`. This is how we measure AI mentions.

## Targets for October 31

- [ ] Rename live: call4.me ranks #1 for "call4me", "call4.me" and "call for me ai"
- [ ] Analytics, Search Console, Bing Webmaster and IndexNow live, with signups tracked by source
- [ ] Probe calls built. Every published number probed, the wrong-number rate measured, and Nick spot-checking daily.
- [ ] 300 pages live (the top 300 in `targets.csv`, minus unwinnable results), at least 60% indexed
- [ ] 60 of the top 100 with measured wait times
- [ ] Listed in at least 10 MCP and agent directories
- [ ] Brand Radar report live with a baseline
- [ ] Hold Time Index #1 ready to go out Monday, November 2

## Daily rhythm (from Week 2)

| When | What | Who |
|---|---|---|
| Morning | Review yesterday's pages. Spot-check 10 probed numbers. Approve the 5 measurement calls. | Nick, 30 min |
| Morning | Run probes for the next batch. Check the top 10 results for each and drop unwinnable ones. | agent |
| Midday | Place the 5 measurement calls. One distribution action (Reddit reply, directory, mention). | agent (drafts), Nick sends, 20 min |
| Afternoon | Generate and publish the day's pages from probe data plus sources. Ping IndexNow. | agent |
| Evening | Indexing ratio, rank changes, log. Set the next day's batch size from the indexing ratio. | agent |

Weekends are agent-only: builds, fixes and logs, with no calls and no posting.

## The days

### Week 1: foundation, launch links, probe calls (Oct 1 to 4)

**Thu Oct 1: rename + measurement**
- Ship the call4me rename (the `rename-call4me` worktree has 43 changed files that were never committed): titles, meta, OG cards, robots.txt, llms.txt, MCP server name.
- Analytics with signup source tracking.
- Google Search Console and Bing Webmaster Tools verified and sitemap submitted. IndexNow key published.
- Nick: create the Brand Radar report in the Ahrefs UI (about 50 prompts). Go through the 76 launch replies and add the chores people mention to `targets.csv`.

**Fri Oct 2: launch links**
- Submit to the MCP Registry, Smithery, Glama, mcp.so and PulseMCP. The agent drafts, Nick submits.
- Add a line to the privacy page and terms: anonymous call stats may be published in aggregate.
- First blog post, about one of our own long calls (for example the 23-minute Comcast Business call). No customer's call goes public without their permission.

**Sat Oct 3 (agent): company table + probe calls**
- D1 `companies` table: slug, name, job, phone numbers (each with a source URL, the probe transcript and a verified date), hours, menu options, measured wait, cancel steps, other ways to cancel.
- Probe mode in the dialer: a max duration of 60 seconds, hang up before a person answers, transcribe the greeting and menu, and check that the company name appears.

**Sun Oct 4 (agent): templates**
- `/call/<company>` and `/cancel/<company>`: answer first, number with source and verified date, menu options from the probe, measured wait when we have one, other ways, and a "have your agent call" prompt. JSON-LD, markdown version, IndexNow ping on publish.
- `/companies` A to Z list and category pages. Sitemap split by type.
- Run the top-10 check (`ahrefs keyword-serp`) on the top 150 targets and mark unwinnable ones.

### Week 2: first 100 (Oct 5 to 11)

**Mon Oct 5:** scoreboard snapshot (`ahrefs batch` on us plus 5 competitors). Probe the top 50 numbers. Blog post goes up.

**Tue Oct 6:** publish the **top 25** (Verizon, FedEx, Planet Fitness cancel, Delta, USAA, PayPal, Expedia, Adobe cancel, Wayfair, Audible cancel...). Show HN around 8am Pacific (the agent drafts, Nick posts). First 5 measurement calls: Verizon, FedEx, Delta, USAA, PayPal.

**Wed Oct 7:** publish targets 26 to 50. 5 measurement calls.

**Thu Oct 8:** Search Console check on the first 25: are they discovered, crawled, indexed? Fix templates, not single pages. Publish 51 to 75. 5 measurement calls.

**Fri Oct 9:** publish 76 to 100. 5 measurement calls. Submit to Claude and Codex plugin lists and "awesome MCP" GitHub lists (as PRs).

**Sat Oct 10 (agent):** probe 101 to 200 and run the top-10 check. Link related pages to each other (company ↔ its cancel page ↔ its category).

**Sun Oct 11 (agent):** indexing report for the first 100 (Google and Bing). Set Week 3's pace: **40 a day if at least 60% are indexed, 20 a day if not.**

### Week 3: 100 to 200 (Oct 12 to 18)

**Mon Oct 12:** scoreboard + first Brand Radar reading. Publish at the set pace. 5 measurement calls.

**Tue Oct 13:** publish. 5 calls. One Reddit reply (r/Comcast_Xfinity, r/PlanetFitness, r/verizon: answer the person's question first). Reddit threads rank for many of these searches, so good replies are search traffic in their own right.

**Wed Oct 14:** publish. 5 calls. Ship "call4.me vs Pine" and "call4.me vs GetHuman" ("pine ai" gets 1,100 a month, "gethuman" 800).

**Thu Oct 15:** publish. 5 calls. Update the top 25 with their measured wait times.

**Fri Oct 16:** publish. 5 calls. Halfway check: if fewer than half of all pages are indexed, stop publishing Monday and fix page quality first.

**Sat Oct 17 (agent):** probe 201 to 300 and run the top-10 check. List pages ranked 11 to 30 and what each one is missing.

**Sun Oct 18 (agent):** recheck every probe older than 14 days on the top 50.

### Week 4: 200 to 300 and strengthening the head (Oct 19 to 25)

**Mon Oct 19:** scoreboard + Brand Radar. Publish at the set pace. 5 calls.

**Tue Oct 20:** publish. 5 calls. Improve the 10 pages closest to page one (sharper answer at the top, fresher wait time, better FAQ).

**Wed Oct 21:** publish. 5 calls. One distribution action.

**Thu Oct 22:** publish. 5 calls. Build a list of 10 consumer reporters who wrote about hold times, cancelling or customer service in the last year, each with a link to their article.

**Fri Oct 23:** reach 300 pages. 5 calls.

**Sat Oct 24 (agent):** Hold Time Index #1 data freeze: every measured call, fastest and slowest companies to reach a person.

**Sun Oct 25 (agent):** draft `/hold-time-index` with a chart, the method and a markdown version.

### Week 5: Index + month review (Oct 26 to 31)

**Mon Oct 26:** scoreboard + Brand Radar. Nick reviews the Index. Measurement calls continue. New pages only if indexing is above 60%.

**Tue Oct 27:** reporter pitches, one per reporter, each tied to their own article. Nick reviews every one.

**Wed Oct 28:** Index final. X thread and blog post written.

**Thu Oct 29:** month review against every target above. Set Month 2: the refund pages, pages 301 to 700, and whatever Brand Radar says AI assistants cite.

**Fri Oct 30:** fix what the review found. Queue the Index, the pitches and the thread.

**Sat Oct 31 (agent):** final October log.

**Mon Nov 2:** Hold Time Index #1 goes out. Nick sends the pitches and posts the thread.

## What must never slip

- No number is published without a source link and a passing probe. A wrong number sends people to scammers.
- Probe calls hang up before a person answers, and at most 1 probe per number per 14 days.
- Nothing from a customer's call goes public without their permission. Our own calls are fine.
- Every external post, reply and pitch is drafted by the agent and sent by Nick.
- If indexing drops below 60%, stop publishing and fix the template.
