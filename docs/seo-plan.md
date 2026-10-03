# Call for Me Search Plan

**Current priority, October 3:** the [coding agent ICP plan](seo/icp-plan.md) takes precedence over the consumer page production targets below. Focus on Claude Code, Codex and T3 Code users adding outbound calling to their existing harness, with executed setup guides, complete research workflows and tested comparisons. The consumer research and historical targets below remain reference material.

A daily routine for becoming the site people land on when they need to call a company and don't want to, ahead of Pine, GetHuman, DoNotPay and Rocket Money.

Data: Ahrefs US database, pulled 2026-09-28. Traffic = estimated organic visits per month.

## The goal, defined so we can score it

**Win:** by 2027-09-28, call4.me has the largest share of organic clicks and AI-assistant mentions across a tracked set of about 1,000 "call this company for me" searches. The set covers cancelling, customer service numbers, refunds, disputes and bookings. We score it every Monday against the four vendors below.

**Also tracked:** total organic traffic. We should pass Pine and xpendy on this. DoNotPay and Rocket Money are a stretch. GetHuman (569k visits, 55k keywords, 6,300 ranking pages) will not be passed on total traffic in 12 months. We beat it on the shared keyword set, which is the part of its traffic that overlaps with what we sell.

## Scoreboard today: we start at zero

| Domain | Domain rating | Keywords | Traffic / mo | Ref. domains | What they sell |
|---|---:|---:|---:|---:|---|
| gethuman.com | 63 | 55,210 | 569,482 | 8,386 | Phone numbers and phone-tree shortcuts for reaching a person |
| rocketmoney.com | 74 | 5,485 | 124,572 | 9,514 | Subscription cancelling and bill negotiation |
| donotpay.com | 70 | 16,476 | 100,262 | 8,116 | Disputes, cancellations, refunds |
| xpendy.com | 49 | 13,612 | 64,948 | 3,962 | Cancellation guides |
| 19pine.ai | 41 | 10,254 | 37,481 | 2,850 | An AI that calls companies for you (closest to us) |
| **call4.me** | **0** | **0** | **0** | **510\*** | Your AI agent calls for you |

\* All 510 are auto-generated "buy backlinks" spam sites (backlinker.shop, pbnseolinks.shop and similar), nearly all nofollow. They give us no authority. Leave them alone and never add to them. Bland, Vapi and Retell (domain rating 72 to 78) are left out on purpose: they sell voice agents to businesses, a different buyer.

## What the data says: nobody searches for "an AI that calls for me"

Direct searches for this kind of app are tiny: "pine ai" gets 1,100 a month, "google duplex" 800, and "can chatgpt make phone calls" 40. About 40 other phrasings, including "call on my behalf", register zero. The demand sits in the chore itself. Pine is the closest product to ours, and only about 2% of its search traffic comes from its own name.

| Pine page type | Share of traffic | Example searches (monthly volume) |
|---|---:|---|
| Cancel a subscription | 38% | scribd cancel subscription (21,000), how to cancel factor meals (13,000), how to cancel dashpass (9,300) |
| Blog, mostly refund and cancel policies | 25% | frontier cancellation policy (3,300), what is costco's return policy (2,200) |
| Customer service contact | 23% | stan store customer service telephone number (3,600), tinder customer service (3,600) |
| Complaints, parking tickets, lowering bills | 7% | dispute ticket nyc (250), xfinity retention offers (200) |

Share of the traffic to Pine's top 100 pages (about 19,000 of its 37,000 monthly visits).

## Strategy: five bets

1. **Chore pages, not AI pages.** One page per company per job: `/cancel/planet-fitness`, `/call/starz`. This is where all four competitors get their traffic. Skip the "ai phone call" terms: they are aimed at businesses buying voice agents, and those results are held by sites with domain ratings in the 70s.
2. **Every page does the job.** Google's AI summaries, Reddit and TikTok already fill the top of these results. A how-to page that only tells people what to do loses to the AI summary. Our page ends with "have your agent make this call" and the copy prompt. No competitor can offer that from a coding agent.
3. **Real call data is the moat.** Each call we place teaches us something: hold time, which menu path reached a person, what the retention rep offered, whether it worked. Pages show "measured across N calls in the last 30 days". Nobody else publishes this, and AI assistants cite data they can't find anywhere else.
4. **Earn links with data, never buy them.** Publish a monthly **Hold Time Index**: the slowest and fastest companies to reach by phone, from our own calls. Consumer reporters and Reddit link to data like this. It is the only link source this plan relies on.
5. **Be the answer in AI assistants.** call4.me already passes every isitagentready check. Every company page also ships as markdown and in llms.txt, and the MCP server is listed in every agent directory. Someone asking Claude or ChatGPT "call Comcast for me" should be pointed to us.

## Page template: what one company page contains

`call4.me/cancel/<company>`

1. **Answer first:** the fastest way to cancel, in two sentences (the part AI summaries quote)
2. **Phone number and hours**, each with a source link and a "verified on" date
3. **Phone menu path** to reach a person (for example "press 2, then 0"), from our own calls
4. **Measured hold time** and success rate, shown only once we have at least 5 calls
5. **What they offered to keep people**, so you know what to accept or turn down
6. **Other ways to cancel** (online, email, mail), linked to the company's own pages
7. **Have your agent call:** a copy prompt with the company, the goal and the account details to have ready
8. Markdown twin at the same URL with `Accept: text/markdown`

A page is published with noindex until it has at least one hand-verified item on top of the template (verified number, menu path or call data). This keeps us clear of Google's scaled-content penalty.

## The daily routine

About 90 minutes of Nick's time. The rest runs on a daily agent job whose output is reviewed before it ships.

| When | What | Who |
|---|---|---|
| Morning | Review the agent's overnight drafts: 5 new company pages a day in months 1 to 3, then 10 a day. Check every phone number against its source, then approve or reject. | Nick, 30 min |
| Morning | Refresh 3 existing pages with new call data and re-verify their numbers. Oldest pages first. | agent |
| Midday | One distribution action: answer a real Reddit or forum thread from someone stuck on hold, submit to one directory, or reply to one mention. Drafted by the agent, sent by Nick. | Nick, 20 min |
| Afternoon | Check Search Console for indexing errors and pages that fell out of the index. Fix the template, not the single page. | agent, flags to Nick |
| Evening | Pull rank changes for the tracked searches with the `ahrefs` CLI and log the gains and losses. | agent |

- **Every Monday:** scoreboard snapshot (`ahrefs batch` on the five domains), share of voice on the tracked set, and one blog post in Nick's voice.
- **First Monday of each month:** publish the Hold Time Index and pitch it to 10 consumer reporters.
- **Each quarter:** merge or remove pages with no impressions after 90 days, and re-rank the company list by search volume.

## Twelve months: phases and targets

Traffic targets are our own estimates, not forecasts. They assume the page count and link work below actually ship. Pine reaches 37,000 visits a month from about 10,000 ranking keywords.

### Month 1 (Oct 2026)

The day-by-day schedule, updated after the 2026-09-30 launch, is in [seo-month-1.md](seo-month-1.md). It ranks 1,921 company pages by opportunity (`docs/seo/targets.csv`) and aims for the top 150 live in October, each built from a real test call.

Build the base: a company table in D1 (numbers, hours, menu paths, cancel steps, sources, verified date), the `/cancel` and `/call` templates, sitemap, Search Console, and the tracked list of 1,000 searches. Add a line to the privacy page and terms: anonymous call stats may be published in aggregate. Ship the first 150 pages, ordered by volume.

**Target:** 150 pages indexed; tracked list and scoreboard live.

### Months 2–3

5 pages a day across the 400 highest-volume subscriptions. First Hold Time Index in November. Take on the chores Pine covers thinly: airline refunds, internet retention departments, insurance claims.

**Target:** 600 pages; 3,000 visits/mo; first page-one rankings.

### Months 4–6

Move to 10 pages a day. Add refunds, disputes and bills, plus the bookings that matched the original pitch (doctors, restaurants, hotels) as a smaller cluster. Add hold-time data to pages once they pass 5 calls. Create comparison pages: "Pine AI alternative" and "GetHuman vs Call for Me".

**Target:** 1,500 pages; 20,000 visits/mo; 50 referring domains from the Index.

### Months 7–9

Work on links: the Index has six months of history, which is enough for trend stories. Guest data for consumer outlets. Improve the 100 pages ranked 4 to 15 before adding new ones.

**Target:** pass Pine (40,000+ visits/mo); top share of voice among the five on cancel searches.

### Months 10–12

Consolidate. Remove or merge pages that never ranked. Refresh every page's verified date. Push the customer-service cluster, where GetHuman is strongest, using our measured hold times as the difference.

**Target:** 2,500 pages; 100,000+ visits/mo (passes xpendy, closes on DoNotPay); first place in share of voice on the tracked set.

## Ways this fails: risks and guards

- **Scaled-content penalty.** Google demotes large sets of templated pages. Guard: noindex until a page has verified or measured data, a quarterly purge, and a cap on the daily page count.
- **Wrong phone numbers.** A wrong number sends people to scammers. Guard: every number has a source link and a verified date, and pages older than 90 days are re-checked by the daily refresh.
- **Call privacy.** Publish only aggregates across at least 5 calls, never content from a single call. Update the privacy page before the first stat goes live.
- **Clicks shrinking.** AI summaries answer "how to cancel X" directly. Guard: the page's value is the action and the measured data, and AI-assistant mentions count toward the score.
