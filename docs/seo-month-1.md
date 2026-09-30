# Month 1 Search Plan: October 2026, Day by Day

Month 1 of the [12-month search plan](seo-plan.md), rewritten as a daily schedule now that we have a launch to build on.

## Where we start (launch day, 2026-09-30)

| | |
|---|---|
| Launch post on X | 58,700 views, 460 likes, 440 bookmarks, 76 replies |
| Accounts | 16 created on launch day |
| Paid | 12 top-ups, $120 |
| Calls | 18 calls from 7 accounts |
| Search | Nothing ranks yet. The site still calls itself "callbay" in its title and robots.txt. No analytics, no Search Console. |

Bookmarks nearly equal likes. People saved it to use later, so it needs to show up when they search for the chore. The launch audience is people who want a chore done, not people shopping for an AI tool.

**We already have real call data.** Our own calls and launch-day calls reached these companies, with the time it took:

| Company | Longest call | What it was |
|---|---:|---|
| Amazon Pharmacy | 30 min | prescription support |
| Comcast Business | 23 min | account change |
| United Airlines | 22 min | reservation change |
| Xfinity | 20 min | full cancellation |
| Costco (tire center, refunds) | 9 min | order lookup, refund |
| Walgreens, CVS | 4 to 8 min | pharmacy questions |

These searches are huge and the pages that rank for them are weak (Ahrefs US, 2026-09-30):

| Search | Monthly volume |
|---|---:|
| xfinity customer service | 634,000 |
| xfinity customer service number | 272,000 |
| costco return policy | 53,000 |
| costco customer service | 20,000 |
| xfinity cancel service | 12,000 |
| how to cancel xfinity | 9,500 |
| cancel xfinity | 7,000 |

"call4me" gets 0 searches. Everything our name brings in comes from the launch and word of mouth, so the brand has to rank first for its own name, and all the growth comes from chore searches.

## Changes from the 12-month plan

1. **Fewer pages, each with real data.** The target drops from 150 pages to 60. Every page needs a hand-checked phone number, and at least 40 need our own measured call (the phone-menu path and the time it took to reach a person). Google punishes large batches of thin pages. It rewards pages with data nobody else has.
2. **We place measurement calls ourselves.** A page doesn't wait for customers to call a company 5 times. Every weekday our own account places 5 calls. Each one reaches a person, notes the menu path and the wait, and asks one real question (hours, or the cancellation policy). These are our own calls, so the 5-call privacy rule for customer data doesn't apply to them.
3. **Launch links come first.** The launch attention fades within about two weeks. Directory listings, Hacker News and the first data post happen in Weeks 1 and 2, before most of the pages exist.
4. **The comparison page moves up.** "pine ai" gets 1,100 searches a month, and launch visitors are comparing products now. The comparison page ships in Week 3 instead of Month 4.

## Targets for October 31

- [ ] Rename finished: call4.me ranks #1 for "call4me", "call4.me" and "call for me ai"
- [ ] Analytics, Google Search Console and Bing Webmaster Tools live, with signups tracked by source
- [ ] 60 company pages published, every phone number checked by hand, at least 40 with our own call data
- [ ] 1,000 tracked searches loaded and the weekly scoreboard running
- [ ] Listed in at least 10 MCP and agent directories
- [ ] Hold Time Index #1 written and ready to go out Monday, November 2

## Daily rhythm (once the pages exist)

About 90 minutes a day from Nick. The agent does the rest, and nothing it drafts ships without review.

| When | What | Who |
|---|---|---|
| Morning | Approve the day's 5 measurement calls (check each number against its source) and review yesterday's page drafts | Nick, 30 min |
| Late morning | Place the 5 calls, write their results into the company table | agent |
| Midday | One distribution action: reply to a Reddit thread, submit to a directory, answer a mention | agent drafts, Nick sends, 20 min |
| Afternoon | Draft 5 company pages from the calls and sources | agent |
| Evening | Search Console check and rank changes for the tracked searches, logged | agent |

Weekends are agent-only: build work and rank logging, with no calls and no posting.

## The days

### Week 1: turn the launch into a foundation (Oct 1 to 4)

**Thu Oct 1: finish the rename, start measuring**
- Ship the call4me rename (the `rename-call4me` worktree has 43 changed files that were never committed): page titles, meta descriptions, OG cards, robots.txt header, llms.txt, MCP server name.
- Add analytics with signup source tracking (X, HN, directories, search).
- Verify call4.me in Google Search Console and Bing Webmaster Tools, submit the sitemap, and request indexing for the home page, /examples and /mcp.
- Nick: go through the 76 replies on the launch post and add every chore people mention to `docs/seo-requests.md`. That list sets which company pages come first.

**Fri Oct 2: launch links**
- Submit the MCP server to the official MCP Registry, Smithery, Glama, mcp.so and PulseMCP. The agent drafts each listing, Nick submits.
- Add one line to the privacy page and terms: anonymous call stats may be published in aggregate. This must ship before any stat goes on a page.
- Draft the first blog post: "What a coding agent does on a 20-minute Xfinity cancellation call". Use our own calls only. A customer's call needs their permission first.

**Sat Oct 3 (agent): company table**
- D1 migration for a `companies` table: slug, name, phone numbers (each with a source URL and a verified date), hours, menu path, time to a person, cancel steps, other ways to cancel, sources.
- Load the 12 companies we've already called (list above) with the data from those calls.

**Sun Oct 4 (agent): tracked searches**
- Use the `ahrefs` CLI to pull the top cancel, customer-service and refund searches from gethuman.com, 19pine.ai, xpendy.com, donotpay.com and rocketmoney.com, and merge them with `seo-requests.md`.
- Keep 1,000 searches, grouped by company, sorted by volume. Store them in the repo so the scoreboard can rerun.

### Week 2: first pages from real calls (Oct 5 to 11)

**Mon Oct 5: templates + scoreboard**
- Build the `/cancel/<company>` and `/call/<company>` templates from the 12-month plan's page template. Pages stay noindex until they have at least one hand-checked item, and only indexed pages go in the sitemap. Every page gets a markdown version and a copyable "have your agent call" prompt.
- First scoreboard snapshot: `ahrefs batch` on our domain and the 5 competitors.
- Blog post from Oct 2 goes up.

**Tue Oct 6: first 5 pages + Hacker News**
- Publish Xfinity (cancel), Xfinity (customer service), Comcast Business, United Airlines and Amazon Pharmacy. All five come from calls we've already made.
- Nick posts a Show HN around 8am Pacific. The agent drafts it, and Nick edits it and posts it.
- First 5 measurement calls: the top 5 companies left on the tracked list.

**Wed Oct 7: 5 pages**
- Costco (customer service, returns), Walgreens, CVS, plus 1 from the tracked list.
- 5 measurement calls.

**Thu Oct 8: 5 pages**
- 5 measurement calls, 5 pages.
- Search Console: confirm the first 10 pages are indexed. If they aren't, fix the template, not one page at a time.

**Fri Oct 9: 5 pages + directories**
- 5 measurement calls, 5 pages.
- Submit to agent directories: Claude and Codex plugin lists, and "awesome MCP" lists on GitHub (as PRs).

**Sat Oct 10 (agent):** link each company page to its related pages (Xfinity cancel ↔ Xfinity customer service ↔ Comcast Business). Check the week's ranks.

**Sun Oct 11 (agent):** reread every live page for broken sources and stale hours. Draft next week's list of calls.

### Week 3: steady pace + the comparison page (Oct 12 to 18)

**Mon Oct 12:** scoreboard snapshot. 5 calls, 5 pages. A second blog post: "How long it takes to reach a person at 25 companies", a preview of the Hold Time Index.

**Tue Oct 13:** 5 calls, 5 pages. Reddit: reply to 1 current thread from someone stuck cancelling Xfinity or Comcast (r/Comcast_Xfinity). Answer the question in full first, and link only if it helps.

**Wed Oct 14:** 5 calls, 5 pages. Ship the comparison page, "call4.me vs Pine": a fair side-by-side table (where it works, price model, how you use it).

**Thu Oct 15:** 5 calls, 5 pages. One Reddit or forum reply.

**Fri Oct 16:** 5 calls, 5 pages. Halfway check: count pages indexed and pages with impressions. If fewer than half are indexed, stop adding pages Monday and fix quality first.

**Sat Oct 17 (agent):** rank log. Find pages ranked 11 to 30 and write up what each one is missing.

**Sun Oct 18 (agent):** recheck all numbers verified before Oct 5.

### Week 4: quality before quantity (Oct 19 to 25)

**Mon Oct 19:** scoreboard snapshot. 5 calls, 5 pages.

**Tue Oct 20:** 5 calls, 5 pages. Improve the 5 pages closest to page one (the answer at the top, a fresher measured wait).

**Wed Oct 21:** 5 calls, 5 pages. One distribution action.

**Thu Oct 22:** 5 calls, 5 pages. Build the list of 10 consumer reporters who have written about hold times, cancelling or customer service in the last year, with a link to each article.

**Fri Oct 23:** 5 calls, 5 pages. **Page count reaches 60. Page production stops here for October.**

**Sat Oct 24 (agent):** Hold Time Index #1 data freeze: every measured call through Oct 23, fastest and slowest companies to reach a person, at least 40 companies.

**Sun Oct 25 (agent):** draft the Index page (`/hold-time-index`) with a chart, how we measured, and a markdown version.

### Week 5: the Index and the month review (Oct 26 to 31)

**Mon Oct 26:** scoreboard snapshot. Nick reviews the Index draft. Measurement calls continue (5 a day) to refresh the oldest data. No new pages.

**Tue Oct 27:** write the reporter pitches, one per reporter, each tied to their own past article. Nick reviews every one.

**Wed Oct 28:** Index final. Write the X thread and the blog post that go out with it.

**Thu Oct 29:** Month review: every target above against what actually happened, plus traffic, signups by source and indexing. Rewrite the Month 2 list from what ranked.

**Fri Oct 30:** fix whatever the review found. Queue the Index, the pitches and the X thread for Monday.

**Sat Oct 31 (agent):** final October rank log and scoreboard.

**Mon Nov 2:** Hold Time Index #1 goes out. Nick sends the pitches and posts the thread.

## What must never slip

- No page shows a phone number without a source link and a verified date. A wrong number sends people to scammers.
- Nothing from a customer's call goes on a page or in a post unless that customer agreed to it. Stats from our own measurement calls are fine.
- Every external post, reply and pitch is drafted by the agent and sent by Nick.
- If Search Console shows pages dropping out of the index, stop adding pages until the template is fixed.
