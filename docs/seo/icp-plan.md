# SEO plan for personal AI assistants and coding agents that make phone calls

Updated October 4, 2026. This is the current editorial priority and replaces the consumer page volume targets in the original October plan. The historical execution notes below retain their original evidence boundaries; the fresh audit at the end records the latest targeting decisions.

## Acceptance criteria

* Reach people using Claude Code, Codex, Muse, Instinct, T3 Code and similar tools who want their existing personal assistant or coding agent to make phone calls.
* Prefer a precise audience match over estimated search volume. Missing Ahrefs estimates mean unknown demand, not no demand.
* Match either the explicit capability request (give my existing assistant a phone) or a concrete task that benefits from it (subscription cancellation, appointments, reservations or business research).
* Keep subscription cancellation articles as a core task entry route. Make the path from the task to connecting the reader's existing assistant explicit, with actual phone evidence.
* Screen ICP and task fit before volume and difficulty. A generic MCP directory, inbound receptionist or sales calling keyword is not an editorial priority solely because it has a large estimate or low KD.
* Compete directly with Vapi, Bland and Twilio where the reader is choosing how to add calling. Include finished calling MCP products in the comparison.
* Provide executed walkthroughs, real information obtained by phone, recordings, tool traces and honest failure analysis.
* Keep architecture explanations separate from measured product comparisons. Claims about speed, reliability and cost require actual evidence.

## What changed in the research

The acquisition plan has two routes: people explicitly adding calls to an existing assistant, and people trying to finish a concrete task such as canceling a subscription. Cancellation articles are a core part of the second route. They show what an assistant can learn by calling, then give the reader a brief and a connection path for the agent they already use. General task traffic does not by itself establish the reader's client; measure activation rather than assuming it.

Vapi is a direct competitor here. Its [Personal Agent Calling launch](https://vapi.ai/blog/vapi-personal-agent-calling), dated September 30, and [Agent Phone setup](https://phone.vapi.ai/) describe ready to use calling through MCP and browser login. Do not describe every Vapi option as requiring a custom voice stack, dashboard configuration or purchased phone number. Distinguish Agent Phone, the developer platform, the documentation MCP and skills for building agents.

[ClawCall](https://clawcall.dev/blog/how-to-build-a-claude-skill-that-makes-phone-calls) and [Patter's Claude Call plugin](https://github.com/PatterAI/awesome-claude-call) also document outbound calling from an existing harness. [Cocall](https://cocall.ai/docs/claude) documents questions returned to the user during a call. Neither outbound calling nor asking a question during a call is a defensible uniqueness claim.

One concrete evidence gap: [ClawCall's Codex guide](https://clawcall.dev/guides/codex-mcp), checked October 3, explicitly labels its instructions as not yet tested live with ClawCall. Our Codex guide can provide an actual executed session and completed call. This establishes an opening in that guide, not a claim that every competitor has untested instructions.

## Search intent and measured demand

Ahrefs US estimates pulled October 3. These are exact keyword estimates, not traffic forecasts. Related variants overlap and must not be added together as unique demand. Difficulty is not proof we can rank. Broad setup keywords describe adjacent demand; their volume is not the volume for phone calling.

| Search | Monthly searches | Difficulty | How to use it |
| :--- | ---: | ---: | :--- |
| claude code phone calls | Unknown | Unknown | Exact ICP match; first setup guide |
| codex phone calls | Unknown | Unknown | Exact ICP match; first executed walkthrough |
| t3 code mcp | 10 | Unknown | Verify the selected provider's connection path before writing |
| claude code personal assistant | 40 | Unknown | Give an existing personal assistant a calling tool, with real tasks and evidence |
| best mcp servers for claude code | 150 | 0 | Broad discovery, deferred as a dedicated article; the calling comparison stays scoped to phone tools |
| codex mcp | 1,500 | 10 | Supporting setup phrase within the phone guide; its generic demand does not drive the next brief |
| vapi mcp | 70 | Unknown | Explain which Vapi integration the reader needs |
| vapi alternatives | 150 | Unknown | A comparison scoped to calls from an existing agent |
| bland ai alternatives | 150 | 3 | The same comparison research, with a separate page only if intent warrants it |
| twilio mcp | 150 | Unknown | Explain the verified difference between platform control and a completed voice call |
| gpt live | 600 | 24 | Architecture discovery; exact cascade comparison demand remains unknown |

Source snapshots are in `scratch/seo-icp-2026-10-03/keywords-us.json`, `intent-expanded-keywords.json`, and `architecture-intent-keywords.json`. The followup sweep found no estimate for `vapi agent phone`, `vapi phone mcp` or `vapi for agents`. The followup Ahrefs SERP request returned null; use the current primary pages above, and do not invent cached rankings.

## First pages, in order

| Order | Working title | Reader's decision | Evidence that makes it useful |
| ---: | :--- | :--- | :--- |
| 1 | Make phone calls from Claude Code with MCP | Can I add this to the setup I already use? | Fresh installation and authentication, tool discovery, one real call, returned result, troubleshooting observed in that session |
| 2 | Make phone calls from Codex with MCP | Does this actually work in my Codex surface? | Executed CLI or app workflow, named tested surface and version, recording, tool trace, result in the original task; test other surfaces before claiming support |
| 3 | Use Claude Code as a personal assistant with web research and phone calls | Can it finish a task whose answer is missing online? | Original request, web sources, calls that fill specific gaps, a question answered during the call if one occurs, final sourced comparison |
| 4 | Add phone calls to the agent you use in T3 Code | Where does the calling MCP connect in T3? | Tested selected provider configuration, authenticated tool discovery and a call inside a T3 thread; distinguish this from T3's MCP for controlling threads |
| 5 | Phone calling MCP servers compared in Claude Code and Codex | Which calling tool should I connect? | Same owned phone fixtures, recorded setup effort, calls, transcripts, task results, failures and observed limits; include Call4me, Vapi Agent Phone, Bland and relevant smaller products |
| 6 | Vapi alternatives for calls from Claude Code and Codex | Which alternative fits this specific job? | Reuse the comparison's evidence, address Vapi Agent Phone directly, and show when Vapi is a good choice; publish separately only if it answers a distinct decision |
| 7 | Cascaded voice stacks vs GPT Live for phone calls with tools | Which architecture should I build or choose? | Source backed mechanisms first; a tuned streaming cascade, correction during a slow lookup, far end audio, IVR acceptance and task state for any comparative results |

Use one authoritative page per intent. Alternate spellings, calling versus phone calls, and closely related setup questions belong on that page. A T3 page must contain actual T3 workflow evidence, not a renamed Claude Code article.

## The flagship workflow

Show the coding agent researching a real task, identifying what the websites do not answer, placing targeted calls, then producing the final deliverable in the same session. For example, find suitable private dining rooms, then call to confirm availability, minimum spend and the exact arrangement. Use a real inquiry rather than invented bookings.

The final table should separate website findings, representative answers, unanswered questions and the agent's conclusions. Save the original prompt and sources alongside the call recordings and tool trace. A missing answer stays missing. A network connection or a polished recap does not prove the requested job was completed.

Existing public private dining, stock checking and cancellation recordings can explain the kinds of facts phone calls add. They do not establish a newly tested Claude Code, Codex or T3 integration. Fresh harness evidence is needed for each setup claim. Customer evidence follows the existing publication rules in `docs/examples.md`.

## Architecture article boundaries

The code already supports an explanation of native GPT Live audio with a separate Responses reasoner (`src/server/voice/session.ts`), model output versus carrier playback queues, native DTMF versus synthesized tones, and answers relayed from the harness. Implementation is evidence of the mechanism, not comparative performance.

The three highest value experiments are:

1. Replay an interruption and benign overlap on matched telephone routes. Measure when the recipient stops hearing the old speech, not just when model generation stops.
2. Change a requested date during a delayed lookup. Verify the actual tool arguments, final booking state, spoken confirmation and recap. Include a missing fact answered through the harness.
3. Navigate an owned IVR with controlled digit windows, repeated prompts, hold music and transfers. Record detected digits and the destination reached.

Compare a competent streaming cascade with equivalent tools and reasoning where possible. Compare complete products separately and disclose carrier or model differences. Publish failures and configuration alongside successes. The primary method references are [LiveKit's pipeline explanation](https://livekit.com/blog/sequential-pipeline-architecture-voice-agents), [Sierra's voice benchmark](https://sierra.ai/blog/tau-voice-benchmarking-real-time-voice-agents-on-real-world-tasks), [OpenAI's GPT Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting), and [Vapi's GPT Live compatibility documentation](https://docs.vapi.ai/gpt-live/configuration).

## Editorial schedule

| Date | Work block | Deliverable |
| :--- | :--- | :--- |
| Sat Oct 3 | Completed research and execution | Fresh Claude Code 2.1.288 and Codex CLI 0.160.0 sessions, five real SF private dining calls (three Call4me, one Bland, one Vapi Agent Phone), recordings and reviewed transcripts; automation or voicemail only |
| Sat Oct 3 | Publication and evidence amendment completed | All five pages, both vendor recordings and fresh canonical OAuth proof are published; final production browser checks passed |
| Sat Oct 3 | Competitor setup completed | Both requested vendor accounts are connected. Fresh Codex sessions completed one Bland and one Vapi Agent Phone Waterbar call, with no paid plan or credit purchase |
| Sun Oct 4 | Provider verification | Verify T3's selected provider configuration and run a call inside its thread before publishing a T3 guide |
| Sun Oct 4 | Menu routing verified | Vapi Agent Phone and Bland both reached Foreign Cinema private dining voicemail. Bland returned native button 2 evidence. Vapi spoke before ending; Codex stopped Bland while the greeting continued. Reviewed recordings and publication verification follow below |
| Mon Oct 5 | Business hours | Follow up on private dining questions with a real event brief if supplied; keep unconfirmed prices and availability unknown |
| Tue Oct 6 | Shared comparison fixtures | Prepare owned IVR and interruption fixtures, then run equivalent tasks through available products |
| Wed Oct 7 | Evidence update | Extend the comparison with completed trials and the architecture article with measurements only where the experiment supports them |
| Thu Oct 8 | Search review | Inspect indexing and impressions for the new cluster, check which queries match our ICP, and adjust the next brief |

Publication of the selected work is authorized. Shared fixture tests remain a separate evidence requirement. The earlier company database and mass template work move behind this cluster. More cancellation and related task pages are worthwhile when a real phone inquiry improves the answer and gives readers a useful task for their existing assistant.

## Score the result

Use qualified activation as the main outcome: a reader signs in, connects from their harness and completes a first call. Track paid conversion and repeat calling after that. Page count and broad consumer traffic are supporting metrics.

First touch landing and source attribution already exist in `src/server/lib/first-touch.ts` and `src/server/services/analytics.ts`; `sign_up`, `purchase`, `call_placed` and `call_ended` events exist in the current code. Verify production reporting before treating this as a complete funnel. Record the harness only where it is actually observable; do not guess the client from a landing page.

Review Search Console weekly for the exact calling queries and the adjacent setup queries that brought readers. Inspect whether they convert before expanding a broad term. T3's small estimate does not disqualify it. No estimated search volume or new domain difficulty score justifies a ranking guarantee.

## Current status

Five pages are written for the selected work: [Claude Code calling](/blog/claude-code-phone-calls), [Codex calling](/blog/codex-phone-calls), [SF private dining research](/blog/agent-web-research-phone-calls-sf-private-dining), [calling MCP comparison](/blog/phone-calling-mcp-comparison), and [cascaded voice stacks versus GPT Live](/blog/cascaded-voice-stack-vs-gpt-live).

October 3 completed five actual calls: three through Call4me, one through Bland, and one through Vapi Agent Phone. Foreign Cinema reached private dining voicemail; the other four reached Waterbar's or EPIC Steak's automated concierges. No human representative, complete event quote, availability confirmation, reservation or successful answer round trip was obtained. All five recordings preserve timing and mute private identifiers, with independently reviewed transcripts. The Call4me pages disclose the saved caller name limitation and the late question failure in Codex.

October 4 added two connected Foreign Cinema menu tests, bringing the connected call total to seven. Neither request supplied the private dining digit. Agent Phone used `dtmf: "auto"`, reached the private dining greeting, and returned a 2:31 recording without native keypad events. It did not end immediately or silently and spoke after the greeting; whether those words became a voicemail message is unknown. Bland used `ivr_mode: true`, logged button 2, and reached the same destination. Codex invoked `stop_call` while the voicemail greeting continued, so immediate autonomous hangup was not verified. The provider reports 68 seconds; the recording lasts 67.74 seconds. Bland connected after about ten and a half minutes queued. An earlier queued attempt was canceled by our runner's premature deadline and is excluded from menu scoring. Neither test made a reservation or obtained a staff answer.

Both additional recordings passed independent source and export privacy reviews. The comparison now includes four reviewed vendor recordings and complete transcripts, with seven new menu transcript seek links. October 4 local verification passed all 139 tests, type checking, lint, both deployment builds, all four recordings decoding and seeking, player switching, signed out access, modified metadata, sitemap date and a 320px viewport. The sanitized call proof and browser logs are saved under `scratch/seo-menu-validation-2026-10-04/`. Repeat the browser checks against production after deployment.

Both requested vendor accounts and calling integrations are complete. Bland connected on the free option with an account API key; Agent Phone connected through browser OAuth without a Vapi developer key. Neither setup bought a paid plan or credits. Fresh Codex CLI 0.160.0 sessions made one Waterbar inquiry through each real MCP. The comparison includes both full reviewed recordings (Bland 2:13, Agent Phone 1:51) and the 15 and 11 turn audio aligned transcripts. Bland returned null MCP cost and summary fields; Agent Phone returned `cost: 0` without a documented currency. The attempts used unequal limits, including Agent Phone's instructional rather than enforced duration. Capacity flexibility remains unresolved despite differing statements from the same concierge. No cross vendor performance ranking or controlled architecture measurement is claimed.

Fresh production Codex OAuth at `https://call4.me/mcp` is now verified after the discovery route fix in `da24e3e`. A new Codex CLI 0.160.0 session completed exactly one `call4me_get_balance` read with no calls. The three Call4me research calls still used the legacy connection; successful canonical login and balance reads do not establish a canonical dialing test. Sanitized proof is saved in `scratch/seo-icp-execution-2026-10-03/codex-fresh-oauth-verification-sanitized.json`. Other desktop, cloud and T3 surfaces remain untested.

Local verification passed type checking, lint, all 139 tests and both deployment builds. Browser checks passed for all five pages, including both comparator recordings decoding, seeking, player switching, all reviewed transcript turns and a 320px viewport. The earlier checks caught wide tables on mobile; a shared scrolling wrapper fixes them and was checked against the existing private dining article.

The five pages deployed from `3036a6b` passed production checks, including audio decoding, seeking, player switching, transcript expansion and mobile layout. The Bland evidence amendment in `0ac7862` and OAuth route fix in `da24e3e` are also deployed and verified. The final Vapi evidence and fresh OAuth proof amendment in `ae89dae` passed CI and production checks for all five pages, both vendor recordings, full transcripts, seeking, player switching, mobile layout and OAuth discovery. All five page URLs appear in the production sitemap, Atom feed and llms.txt. The scheduled IndexNow sweep accepted all five URLs, as verified in its production ledger. This does not establish search engine indexing. T3 remains untested. Nate Herk and Dominik Kundel outreach is sent and recorded separately in the outreach tracker.

## Fresh Ahrefs targeting audit, October 4

Nick requested larger search opportunities with attainable difficulty while
keeping the existing assistant and coding agent audience central. The Ahrefs CLI session
was refreshed using its existing automated login helper. This audit checked
73 initial exact phrases in the US database, a 100 result Claude MCP matching report,
a 100 result phone call matching report, and Vapi's organic keywords filtered
to volume at least 50 and difficulty at most 20. Six cached SERP reports were
retrieved to inspect intent and the authority of returned pages. Nick clarified
that broad volume must not override the existing assistant calling intent. The
larger generic candidates below are screened opportunities, not the current
editorial priorities.

The focused followup checked 39 personal assistant phrases and 25 assistant
calling or subscription task phrases, bringing the export to 127 distinct US
keywords. It also retrieved a personal assistant matching report and an
expanded Claude Code matching report. The exact personal assistant and use
case SERP requests returned null; no rankings or difficulty were inferred from
those responses. Three cancellation SERP reports were available.

### Core task entry keywords

| Query | US monthly searches | KD | Existing page |
| :--- | ---: | ---: | :--- |
| how to cancel fubo | 15,000 | 0 | `/blog/cancel-fubo` |
| how to cancel audible | 14,000 | 0 | `/blog/cancel-audible` |
| how to cancel hellofresh | 8,800 | 0 | `/blog/cancel-hellofresh` |
| how to cancel planet fitness | 5,800 | 3 | `/blog/cancel-planet-fitness` |
| how to cancel factor | 1,100 | 0 | `/blog/cancel-factor` |

These estimates are for the cancellation problem, not a measured count of
assistant users. The ICP connection is the task: learn the right route by
phone, supply a brief, connect the reader's existing assistant and verify the
actual result. Keep the direct instructions useful for every reader. Do not
claim that a phone inquiry canceled an account, or that every cancellation
requires a call.

The returned Fubo SERP, last updated October 3, includes Xpendy's guide at
DR 49 with zero referring domains. The Audible SERP, last updated October 4,
includes Lovely Audiobooks at DR 25 with two referring domains. Those provide
more concrete competition evidence than KD alone. Other returned pages include
official support, forums and stronger domains. The HelloFresh report, last
updated October 2, returns forum and question pages. Cached reports may omit
results and do not prove that our page will rank.

### Direct assistant calling keywords

`claude code personal assistant` has 40 US searches, `claude code as a personal
assistant` has 10, and `can claude make phone calls` has 10. Their KD values are
unknown. `claude personal assistant` has 150 and `claude code for personal use`
has 70, also with unknown KD; those are supporting assistant discovery terms,
not measured demand for calling. Exact Claude Code calling, Codex calling and
Instinct calling terms have no volume estimate. Muse calling phrases returned
zero. These remain useful capability pages for the intended readers, with
neither a low difficulty claim nor a large volume claim.

Qualitative audience evidence supports the distinction. The
[personal assistant plugin](https://github.com/kjenney/personal-assistant-plugin)
and [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw) describe existing
Claude Code assistants handling calendar and email tasks. A
[supplier research request](https://www.reddit.com/r/AgentsOfAI/comments/1wthn25/is_there_a_sane_way_to_let_claude_code_call_one/)
asks for Claude Code business calls and explicitly distinguishes stock
verification from sales calling. These are audience examples, not search
volume or product reliability evidence.

### Broader candidates screened

Exact decisions are in `docs/seo/keyword-targeting.csv`. Source responses and
stderr are under `scratch/seo-targeting-2026-10-04/`, which is excluded from git.
The CLI uses the existing Ahrefs mirror. A successful query checks the data
available now; it does not mean every underlying SERP was collected today.

| Query | US monthly searches | KD | Page and action |
| :--- | ---: | ---: | :--- |
| ai phone agent | 1,100 | 0 | Broad supporting category, not the homepage acquisition priority. The homepage addresses adding calls to an existing personal assistant |
| codex mcp | 1,500 | 10 | Supporting setup phrase in the existing phone calling guide, not a generic MCP article priority |
| claude code mcp servers | 600 | 0 | Defer a broad directory. The current comparison answers which servers can make phone calls |
| ai outbound calling | 1,000 | 9 | Broad supporting category only. Our comparison remains about individual calls from an existing assistant |
| ai ivr | 600 | 4 | Technical supporting topic. The phone tree article helps an existing caller complete its task |
| voicemail detection | 150 | 1 | Phone tree guide secondary term, matched to its actual menu and mailbox evidence |
| bland ai alternatives | 150 | 3 | Calling comparison, scoped to coding agents rather than whole platform replacement |
| twilio mcp server | 200 | Unknown | Existing Twilio guide, explicit server setup and execution limits |
| t3 code mcp | 10 | Unknown | Existing T3 guide, explicit provider setup and actual call evidence |

Variants overlap. Do not sum these volumes into expected traffic. Null volume
and difficulty remain unknown. The CLI's generic console footer calls blank KD
"winnable"; this audit does not adopt that interpretation.

The `ai phone agent` SERP last updated September 30 returns pages from Voqo
(DR 14, zero referring domains), Lacy (DR 1, referring domain count unavailable)
and Vexion Labs (DR 0, zero referring domains). These are concrete openings for
a focused product page, not a ranking guarantee or an ICP match. The current Voqo and Lacy
primary pages confirm that the query includes commercial phone agent intent:
[Voqo](https://www.voqo.ai/buyers-agent),
[Lacy](https://www.lacy.ai/about-lacy-ai). Vexion's presence and metrics come
from the cached Ahrefs SERP; its current page was not independently fetched.

The Claude server SERP last updated October 3 contains directories, setup pages
and an EvoMap roundup at DR 44 with three referring domains. Its low KD does
not remove the need to satisfy broad server discovery. The Codex SERP last
updated October 1 includes OpenAI community, setup guides and the unrelated
Codex blockchain service. Squirrelscan's setup page is DR 29 with zero referring
domains, an opening worth monitoring. Its 1,500 estimate describes generic MCP
intent, not 1,500 people looking for a phone caller.

The outbound calling SERP last updated October 4 includes campaign software,
workflow setup and glossary definitions. The comparison now explicitly covers
individual business inquiries from an existing harness. The AI IVR SERP last
updated October 2 mainly concerns incoming call routing. Its 600 estimate is
not demand measured for outbound menu navigation.

Defer `twilio alternative` (800, KD 0) and `twilio alternatives` (600, KD 1)
as primary targets. The September 14 SERP is predominantly SMS and carrier API
replacement, which the current hosted calling product does not replace. Also
defer `ai voice assistant` (1,600, KD 0) until a complete matching intent is
demonstrated. Keep `gpt realtime` (600, KD 0) separate from GPT Live evidence;
model naming and a dedicated comparison need verification first.

Ahrefs reports DR 0 and zero tracked organic keywords for call4.me. Search
Console has already returned article impressions, so Ahrefs' organic count
does not establish absence from Google. Treat the site as developing authority.
First require existing assistant calling intent or a useful task entry route.
Then inspect actual results and the evidence we can supply, with KD at most 10
as a ranking screen where available. KD from 11 through 20
is a secondary opportunity; higher scores need a stronger reason. These are
editorial thresholds, not predictions. Ahrefs explains the metric's limits in
its [difficulty guide](https://ahrefs.com/blog/keyword-difficulty/) and the need
to serve the query in its [intent guide](https://ahrefs.com/blog/search-intent/).

### Current article priorities

Keep the phone calling setup guides as the capability route, the cancellation
blogs as a core task route, and real business research as the workflow proof.
The Claude Code guide now explains personal assistant tasks and links the
recorded Planet Fitness inquiry. The Planet Fitness, Fubo, Audible and
HelloFresh briefs link back to the existing agent connection guides. The homepage addresses an existing
personal assistant, with guides for Claude Code, Codex, Muse, Instinct and T3.
Links to a client guide do not establish a tested integration in that client;
each guide retains its actual setup and call evidence.

The next distinct workflow article should show an existing assistant taking a
user's subscription list and authorized choices through the phone steps, or
checking business availability and returning the missing answer to its task.
Reuse the relevant setup guide rather than repeat installation instructions.
A later appointment article needs an actual confirmed appointment and the
observed return to the user's planning workflow. Published research inquiries
must remain inquiries, not become successful cancellations or bookings through
a changed title. A broad MCP server roundup is deferred.

All four specialist articles are now published. T3 includes a real recorded
Codex provider call with a partial outcome, replacing the earlier untested
status. Scheduling verifies stored records while later business calls remain
pending. The shared controlled IVR benchmark remains pending.

### Targeting change verification

All 127 exported volume and difficulty pairs match the raw Ahrefs responses.
Type checking, lint, all 155 tests and both deployment builds pass. Local
browser checks cover the homepage and five revised articles, their titles,
descriptions, canonicals, structured data and 320px layout. The homepage has
one H1. Its Claude Code, Codex and T3 guide links, prompt copy button and FAQ
expansion work. Existing recordings and benchmark limitations remain intact.
The final ICP correction updates the homepage, Claude Code guide and four
cancellation entry paths; their URLs and evidence boundaries are retained.
