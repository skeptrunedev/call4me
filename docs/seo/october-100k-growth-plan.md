# Call4me October audience growth plan

Planning date: October 6, 2026. Target: 100,000 total October website visitors by October 31 who fit the existing assistant ICP, with a maximum cash budget of $5,000. Nick confirmed this is the whole month, rather than 100,000 additional visitors. The deadline is midnight Pacific at the end of October 31.

The best available route is a campaign built around real calling demonstrations, distributed by people who already use coding agents and personal assistants. Existing articles and recordings supply most of the evidence. Spend on getting people to try and share those workflows, then amplify whichever demonstration produces qualified visits.

**100,000 is a stretch outcome, not a supported forecast.** Neither current search growth nor researched paid placements can reasonably supply it this month. The plan below preserves that target, shows the earned reach it requires, and limits cash risk while testing whether that reach is developing. No placement, creator commitment, ad purchase or outreach has been executed under this plan.

## Audience and measurement

The ICP is a person already using Claude Code, Codex, Muse, Instinct, T3 or a comparable personal assistant who wants it to place outbound calls for their own tasks. Developers buying an inbound receptionist, cold calling operators and generic AI entertainment viewers are not automatically qualified.

Count a website visitor once across October using GA4 `totalUsers`, filtered to `hostName` exactly `call4.me` AND `eventName` exactly `page_view`. This is an observable visitor proxy, not a census of distinct humans: consent, blocking, devices, internal visits and undetected bots affect it. The initial baseline has no explicit staff or browser QA exclusion. Apply available internal and bot exclusions consistently, restate the baseline if filtering changes, and retain the same definition for the final report. Never sum daily or channel users into a monthly unique total. Impressions, video views, pageviews, sessions, crawler requests and AI citations do not count as visitors.

Report ICP fit separately. A client specific source or landing page is evidence of targeting, not proof of each visitor's existing tool use. Add an optional question about the assistant the visitor already uses, with an unknown option, and preserve that answer with first touch attribution. Record verified client connections and first completed calls as stronger signals. Unknown visitors do not become verified ICP visitors. A sampled ICP estimate must disclose its sample size, selection bias and uncertainty; it must not be presented as 100,000 individually verified people.

Use the strict interpretation in the reach model: 100,000 ICP visitors, not 100,000 mixed visitors with a few qualified signups. Until qualification measurement is working, we can report website progress and audience targeting, but cannot certify the ICP part of the goal.

## Current evidence

The live GA4 audit for October 1 through October 6, with the last day incomplete, found approximately **1,500 visitors with recorded pageviews**. The initial pageview filtered report contained 1,492 users, 1,730 sessions and 3,053 pageviews. The property's timezone is America/Los_Angeles. Unfiltered GA4 reported 1,537 users, but the application also emits server events with synthetic client IDs for accounts never observed in a browser. That larger total is unsuitable for this website goal.

The pageview report's daily users were 987, 243, 67, 90, 135 and 50 for October 1 through 6. These overlap across days and must not be added. The recent complete days show roughly 100 users per day, not a continuing launch day surge. A passive October planning range of roughly 3,000 to 5,000 visitors is a scenario, not a statistical forecast. It allows for daily overlap and uncertain growth; extrapolating the launch spike would overstate the baseline.

The October 6 Search Console snapshot contains 29 October Google clicks, with October 5 onward incomplete. Fresh Ahrefs CLI data still reports zero estimated organic traffic, zero ranking keywords and zero tracked AI citations. That does not negate observed search or assistant referrals. These tools cover different things.

Fresh US Ahrefs estimates are 1,500 monthly searches for `codex mcp`, 150 for `claude personal assistant`, and 40 for `claude code personal assistant`. Exact `meta muse mcp` demand remains unknown. Related phrases overlap and the broad setup term does not imply phone calling intent. Keep improving the existing pages, but do not put tens of thousands of October visitors into an SEO forecast.

The current Reddit spend table contains no spend rows. This is missing reporting, not zero spending. Reconcile existing October ads, sponsorships and commitments before releasing any new cash. Raw analytics reports, query provenance and the scenario calculation remain in the ignored `scratch/october-100k-plan-2026-10-06/` directory.

## What reaching 100000 requires

Even crediting all 1,492 measured pageview users toward the target leaves 98,508 additional people, or **3,940 per day over the 25 full days from October 7 through October 31**. Their ICP fit is currently unknown, so this is a generous lower bound on the remaining acquisition task.

Using the entire $5,000 to buy that gap would require about **five cents per new visitor**, before production or other costs. A directly relevant publisher's current main ad costs $349; it reports 60 unique clicks for a recent voice AI sponsor. That is approximately $5.82 per click, before visit loss, overlap and qualification. This is one publisher's reported result, not a universal ad benchmark. [Whatplugin Q4 media kit](https://advertise.whatplugin.ai/).

The following is a sensitivity model, not booked distribution or a probability forecast. Assume 1% of relevant earned impressions click, 90% of those clicks become new human site visitors after overlap, and 70% of those visitors fit the ICP. Also assume 2,500 additional passive visitors and 800 additional paid visitors across the remaining month. Those last two inputs, and all three conversion percentages, are planning assumptions that tests must replace.

| Scenario | Earned impressions required | New visitors from earned distribution | Modeled ICP visitors from earned distribution | October total website visitors of all types |
| --- | ---: | ---: | ---: | ---: |
| Working campaign | 1,000,000 | 9,000 | 6,300 | 13,792 |
| Strong campaign | 4,000,000 | 36,000 | 25,200 | 40,792 |
| Breakout campaign | 16,000,000 | 144,000 | 100,800 | 148,792 |

The last column includes the measured 1,492 baseline and the assumed passive and paid additions. It must not be labeled ICP traffic. The 800 paid visitors are particularly uncertain: the researched newsletter supports only tens of clicks, and the remaining paid contribution has no measured result yet. Setting paid visitors to zero reduces each total by 800 and does not change the conclusion. Only the breakout scenario clears 100,000 modeled ICP visitors without assuming the unknown baseline and other channels are qualified. At a 2% outbound click rate the required earned impressions roughly halve; at 0.5% they roughly double. A million platform views is therefore useful progress but far short of the goal.

We have not secured this reach. Making the target credible requires large earned distribution through multiple creators or publishers, unusually strong sharing, or a better observed click rate. If those do not materialize, the honest forecast remains below the target; spending the remainder on low quality traffic does not fix that.

## The campaign to run

The central story is **give the assistant you already use a phone, then let it finish a real errand**. Every preview should show the request, a meaningful part of the actual call, and what the assistant returned. The site provides the full recording, transcript, reusable brief and the appropriate connection guide. This gives viewers a reason to visit rather than consuming the entire value in a social clip.

Start with three existing evidence packages:

1. **An assistant crosses the gap between web research and a staff answer.** Use the [completed consumer Muse library call](https://call4.me/blog/meta-muse-first-task). This establishes a real saved connector workflow. Preserve its limits around seating availability and untested WiFi performance.
2. **A real booking gets confirmed.** Use the [approved dinner reservation recording](https://call4.me/blog/book-dinner-reservation-by-phone). State that the initiating customer client is unknown. Do not present it as a newly executed Claude or Codex session.
3. **A phone conversation gets an exception approved.** Use the [approved return exception example](https://call4.me/blog/aquasana-return-exception). Paperwork and payment remained pending. Do not turn approval into a completed refund claim.

Produce two short edits per package, one opening on the user's task and one on the staff's substantive answer. Reuse the existing recording review and demo rendering workflow in `docs/launch-demo.md`. Show the outcome accurately, retain a link to the complete source, and recheck privacy at the new edit boundaries. Do not make more calls solely to manufacture content. A creator can choose their own genuine task within a specific authorization and call budget.

Keep Claude and Codex setup pages as the installation destinations. Use the Muse article for its demonstrated client flow. Do not require a new website build before distributing evidence that is already usable. If a public interactive demo is prepared, use an owned test number; do not offer anonymous visitors unlimited calls to third parties.

## Distribution priorities

| Priority and target | Concrete action | Cost and evidence boundary |
| --- | --- | --- |
| 1. Existing audience and real customers | Nick publishes an original demonstration, answers substantive replies and invites willing agent users to share their own real workflow. Send each channel to a tagged source page and its client setup link. | No media fee. Customer participation and new publication consent must be explicit. Existing social reach is not a guaranteed repeat. |
| 2. PulseMCP | Propose a technical collaboration about what an MCP calling tool can actually finish, including approvals, returned results and failures. Offer the existing evidence package and do the writing. | [PulseMCP explicitly offers collaboration with promotion by both parties and no payment](https://www.pulsemcp.com/work-with-us). Editorial acceptance, date and traffic are unknown. Use its Content Collaboration contact route. |
| 3. Agent creators, starting with Theo and the T3 ecosystem | Offer a real task the creator chooses, a usable connection guide and access to complete evidence. Ask for a dated October delivery and comparable outbound click history before discussing a paid commitment. | [Theo's sponsor page](https://t3.gg/sponsor-me) provides the contact route, `youtube@t3.gg`. Price and October availability are unknown. The creator budget below is our ceiling, not his quoted rate. His channel's total monthly views are not one video's reach. |
| 4. One small newsletter test | Test the strongest demonstrated task with a tagged link and a client specific next step. | [Whatplugin's current media kit](https://advertise.whatplugin.ai/) gives a $349 main placement with an estimated 40 to 100 clicks. This tests message quality and activation; it is not the volume engine. Confirm an October date first. |
| 5. TLDR editorial or tightly scoped placement | Offer the best execution evidence as a useful technical story. Request a quote only for a small relevant slot if editorial coverage is unavailable. | [TLDR has developer and AI audiences](https://advertise.tldr.tech/audiences/software-developers/). Pricing and delivery remain unconfirmed. Do not allocate money based on its subscriber count. |
| 6. MCP discovery | Audit current listings before adding duplicates. Make descriptions lead with outbound calling from an existing agent and link to tested setup evidence. | [Official MCP Registry](https://registry.modelcontextprotocol.io/) and [Smithery documentation](https://smithery.ai/docs) are relevant discovery routes. Installs and tool requests without a site visit do not count toward this target. No traffic volume is assumed. |
| 7. A substantive Hacker News submission | Nick personally decides whether the working product or technical evidence is worth sharing, writes the submission and participates in the discussion. | [Show HN rules](https://news.ycombinator.com/showhn.html) require something people can try. [HN guidelines](https://news.ycombinator.com/newsguidelines.html) prohibit generated posts and automated posting. No guaranteed placement or coordinated voting. |

Treat Latent.Space as an opportunistic editorial lead, not an October dependency: its [contact guidance](https://www.latent.space/about) asks for about one month of lead time for major announcements. Do not spend most of this budget on one broad AI newsletter with unknown qualified clicks. Do not buy directory bundles or backlinks to inflate reach.

No paid creator quote has been verified. Before any agreement, record the actual deliverable, publication date, link placement, evidence access, disclosure, fee including charges, and expected click range with its source. Payment must not depend on a positive review. If no suitable creator accepts the ceiling, keep the allocation unspent and continue editorial distribution.

## Cash budget

These are maximum allocations, not supplier quotes or authorization to spend. The $5,000 ceiling includes fees, cash production and promotion costs, and the face value of trial credits. It excludes Nick's existing labor and routine product infrastructure. Any new campaign software charge comes out of the reserve.

| Use | Maximum |
| --- | ---: |
| Creator participation and demonstrated workflow distribution | $1,500 |
| Small paid distribution tests, then the winning creative | $1,000 |
| One relevant newsletter test | $349 |
| Editing and captions for existing evidence | $500 |
| Capped credits for genuine creator or customer tasks | $250 |
| Existing October spend, fees and conditional reserve | $1,401 |
| **Total ceiling** | **$5,000** |

Reconcile already incurred October campaign costs first. Deduct them from the reserve, then reduce optional creator or paid allocations if necessary. Do not assume an empty spend table leaves all $5,000 available. If costs already exceed $5,000, the total October budget constraint is already unmet; this plan cannot repair that by relabeling spending. Do not commit nonrefundable costs until the reconciled ledger fits the ceiling.

Release at most **$999 initially**, and less if prior spending requires it: $300 editing, $150 trial credits, $200 paid tests and the $349 newsletter. These are subsets of the table, not additional money. Hold the remaining planned funds until evidence supports a specific next step. Credits are for authentic testing and published work with permission, not a giveaway for views or clicks.

Use paid tests to compare a small number of messages in the actual agent audience. The following are internal decision thresholds, not forecasts: after 100 new human visits or the $200 test cap, require at least five verified client connections, evidence of at least two first completed calls, and no material mismatch in the audience sample before considering expansion. Check conversion lag for 72 hours. If the sample is inconclusive at the cap, hold spending rather than labeling the test a winner. A high cost per visitor may still be commercially useful, but it cannot support the 100,000 visitor forecast.

The initial paid test is Reddit Ads, using its Traffic objective. Prepare two capped $100 ad groups for October 9 through 12: Claude users to the Claude calling guide, and Codex users to the Codex calling guide. Check whether `r/ClaudeAI` and `r/codex` are eligible community targets in the account and whether targeting expansion can be disabled. If precise targeting is unavailable, hold the test rather than silently broadening it. Start with one authentic booking preview and one authentic information gathering preview, clearly separating historical customer evidence from tested client setup. This small test compares audience and message packages, not a statistically isolated creative effect. Use landing page visit optimization only if the account is eligible; otherwise use clicks and assess actual arrivals independently. [Reddit targeting](https://www.business.reddit.com/advertise/targeting/community-and-interest), [objective and eligibility reference](https://ads-api.reddit.com/docs/v3/guides/programs/campaign/campaign-objective-matrix).

Use `utm_source=reddit`, `utm_medium=paid`, `utm_campaign=october_agent_calls`, plus distinct audience and creative values following `docs/reddit-ads-attribution.md`. Track production pageviews, client selection, verified connection, signup and first completed call through first party attribution. Do not enable advertising pixels on call recordings or sensitive pages; existing blog measurement and first touch attribution should be verified before spending. Platform reported clicks are diagnostic, not the success metric.

For the mass traffic objective, measure cost per new qualified visitor after fees and production. Only scale with a revised budget and remaining reach calculation. There is no amount of reallocating this $5,000 that compensates for an unfilled earned reach requirement in the millions.

## Schedule and owners

| Dates, Pacific | Deliverable | Owner and decision |
| --- | --- | --- |
| October 7 and 8 | Reconcile spend, verify the production visitor query, add audience qualification, select three evidence packages and finish the first two edits. Prepare tailored proposals for PulseMCP, Theo, TLDR and the newsletter. | Agent prepares assets, source links and reporting. Nick reviews external copy and commitments. No new long article batch. |
| October 9 through 12 | Publish the first original demonstration, run the capped tests, distribute the second and third stories, and secure dates for any accepted partner work. Respond to actual questions. | Nick handles external posts and contacts. Agent measures visits and activation, prepares variations and fixes observed landing friction. |
| October 13 through 19 | Concentrate on the demonstrated winner. Release a second wave with participating creators or publishers, plus one useful technical breakdown based on actual questions. | Expand only channels with observed audience fit. Keep unconfirmed placement reach out of the forecast. |
| October 20 through 26 | Publish the strongest verified followup outcomes and remaining dated partner pieces. Compare first call completion across sources. | Recalculate required daily visitors and remaining cash every day. Stop weak paid delivery. |
| October 27 through 31 | Finish confirmed placements, improve the best performing entry pages and close the month without buying catchup traffic. | Nick and agent publish the final scorecard after analytics processing, with provisional October 31 data labeled until complete. |

Plan for 60 to 90 minutes of Nick's time per day for original posting, creator conversations, approvals and replies. Agent work covers research, evidence assembly, editing preparation, attribution and reporting. Creator and editor delivery must be agreed explicitly. If Nick cannot supply that time, reduce output and expected reach rather than treating distribution as automatic.

## Gates that keep the plan honest

By **October 8**, the budget ledger and visitor report must work and the first demonstrable asset must be ready. If measurement cannot distinguish website use from server events, fix it before claiming traffic progress.

The stretch checkpoints track ICP visitors. If qualification is estimated, show the estimate and its uncertainty beside verified counts. The website totals below are illustrations at the model's assumed 70% fit, not a substitute for measuring fit.

| Checkpoint | Cumulative ICP visitors | Approximate website visitors at 70% fit | Remaining ICP visitors needed per day |
| --- | ---: | ---: | ---: |
| October 12 | 10,000 | 14,286 | 4,737 over 19 days |
| October 19 | 35,000 | 50,000 | 5,417 over 12 days |
| October 26 | 70,000 | 100,000 | 6,000 over 5 days |
| October 31 | 100,000 | 142,858 | Deadline |

By **October 12**, also require a demonstrated path to client connections and a dated distribution inventory. For every scheduled placement, record defensible low and high outbound click estimates, source evidence, expected visit loss and overlap. Add remaining owned distribution capacity. If even that upper scenario cannot approach the remaining ICP gap, explicitly label 100,000 as dependent on an unplanned breakout. Preserve the reserve; do not call a collection of unaccepted pitches a distribution plan already in motion.

The October 19 and October 26 checkpoints require sustained acceleration and qualified arrivals, not one isolated view spike. Missing a gate means revising the forecast and effort allocation while retaining the original target. No change from visitors to social views is allowed in the final scorecard.

Each morning, report October unique website visitors, qualified visitors or a clearly labeled estimate, new client connections, first completed calls, spend plus commitments, remaining cash and the remaining daily requirement. Report Google clicks and AI referrals as small separate acquisition sources. A completed call is not automatically a successfully resolved task.

## Recommendation

Run this as a constrained distribution experiment with a 100,000 ICP visitor stretch target. Put the majority of effort into people sharing credible work with other agent users. Keep SEO maintenance, setup clarity and proof quality as support for that distribution. The current evidence supports making this attempt; it does not support promising 100,000 qualified visitors by October 31 for $5,000.
