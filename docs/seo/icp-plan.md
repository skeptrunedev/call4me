# SEO plan for coding agent power users

Updated October 3, 2026. This is the current editorial priority and replaces the consumer page volume targets in the original October plan.

## Acceptance criteria

* Reach Claude Code, Codex and T3 Code power users who want their existing agent to make outbound phone calls.
* Prefer a precise audience match over estimated search volume. Missing Ahrefs estimates mean unknown demand, not no demand.
* Compete directly with Vapi, Bland and Twilio where the reader is choosing how to add calling. Include finished calling MCP products in the comparison.
* Provide executed walkthroughs, real information obtained by phone, recordings, tool traces and honest failure analysis.
* Keep architecture explanations separate from measured product comparisons. Claims about speed, reliability and cost require actual evidence.

## What changed in the research

The original plan optimized for people searching for cancellation instructions and customer service numbers. Those pages remain useful examples, but their readers are not necessarily users of a coding harness. The new acquisition path is a calling setup guide, a complete research workflow, or a comparison for an existing agent.

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
| claude code personal assistant | 40 | Unknown | A complete web research plus telephone workflow |
| best mcp servers for claude code | 150 | 0 | Adjacent discovery; directory distribution and a useful calling comparison |
| codex mcp | 1,500 | 10 | Adjacent setup demand; calling as a worked example, not a generic MCP rewrite |
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
| Sun Oct 4 | Menu navigation validation in progress | One Vapi Agent Phone and one Bland call to Foreign Cinema's published main line, choose private dining from the announced menu and verify the destination; no voicemail message, booking or personal details |
| Mon Oct 5 | Business hours | Follow up on private dining questions with a real event brief if supplied; keep unconfirmed prices and availability unknown |
| Tue Oct 6 | Shared comparison fixtures | Prepare owned IVR and interruption fixtures, then run equivalent tasks through available products |
| Wed Oct 7 | Evidence update | Extend the comparison with completed trials and the architecture article with measurements only where the experiment supports them |
| Thu Oct 8 | Search review | Inspect indexing and impressions for the new cluster, check which queries match our ICP, and adjust the next brief |

Publication of the selected work is authorized. Shared fixture tests and a T3 walkthrough remain separate evidence requirements. The earlier company database and mass template work move behind this cluster. More consumer pages are worthwhile when they contribute a strong example or attract users who activate the calling MCP.

## Score the result

Use qualified activation as the main outcome: a reader signs in, connects from their harness and completes a first call. Track paid conversion and repeat calling after that. Page count and broad consumer traffic are supporting metrics.

First touch landing and source attribution already exist in `src/server/lib/first-touch.ts` and `src/server/services/analytics.ts`; `sign_up`, `purchase`, `call_placed` and `call_ended` events exist in the current code. Verify production reporting before treating this as a complete funnel. Record the harness only where it is actually observable; do not guess the client from a landing page.

Review Search Console weekly for the exact calling queries and the adjacent setup queries that brought readers. Inspect whether they convert before expanding a broad term. T3's small estimate does not disqualify it. No estimated search volume or new domain difficulty score justifies a ranking guarantee.

## Current status

Five pages are written for the selected work: [Claude Code calling](/blog/claude-code-phone-calls), [Codex calling](/blog/codex-phone-calls), [SF private dining research](/blog/agent-web-research-phone-calls-sf-private-dining), [calling MCP comparison](/blog/phone-calling-mcp-comparison), and [cascaded voice stacks versus GPT Live](/blog/cascaded-voice-stack-vs-gpt-live).

Five actual calls are complete: three through Call4me, one through Bland, and one through Vapi Agent Phone. Foreign Cinema reached private dining voicemail; the other four reached Waterbar's or EPIC Steak's automated concierges. No human representative, complete event quote, availability confirmation, reservation or successful answer round trip was obtained. All five recordings preserve timing and mute private identifiers, with independently reviewed transcripts. The Call4me pages disclose the saved caller name limitation and the late question failure in Codex.

Both requested vendor accounts and calling integrations are complete. Bland connected on the free option with an account API key; Agent Phone connected through browser OAuth without a Vapi developer key. Neither setup bought a paid plan or credits. Fresh Codex CLI 0.160.0 sessions made one Waterbar inquiry through each real MCP. The comparison includes both full reviewed recordings (Bland 2:13, Agent Phone 1:51) and the 15 and 11 turn audio aligned transcripts. Bland returned null MCP cost and summary fields; Agent Phone returned `cost: 0` without a documented currency. The attempts used unequal limits, including Agent Phone's instructional rather than enforced duration. Capacity flexibility remains unresolved despite differing statements from the same concierge. No cross vendor performance ranking or controlled architecture measurement is claimed.

Fresh production Codex OAuth at `https://call4.me/mcp` is now verified after the discovery route fix in `da24e3e`. A new Codex CLI 0.160.0 session completed exactly one `call4me_get_balance` read with no calls. The three Call4me research calls still used the legacy connection; successful canonical login and balance reads do not establish a canonical dialing test. Sanitized proof is saved in `scratch/seo-icp-execution-2026-10-03/codex-fresh-oauth-verification-sanitized.json`. Other desktop, cloud and T3 surfaces remain untested.

Local verification passed type checking, lint, all 139 tests and both deployment builds. Browser checks passed for all five pages, including both comparator recordings decoding, seeking, player switching, all reviewed transcript turns and a 320px viewport. The earlier checks caught wide tables on mobile; a shared scrolling wrapper fixes them and was checked against the existing private dining article.

The five pages deployed from `3036a6b` passed production checks, including audio decoding, seeking, player switching, transcript expansion and mobile layout. The Bland evidence amendment in `0ac7862` and OAuth route fix in `da24e3e` are also deployed and verified. The final Vapi evidence and fresh OAuth proof amendment in `ae89dae` passed CI and production checks for all five pages, both vendor recordings, full transcripts, seeking, player switching, mobile layout and OAuth discovery. All five page URLs appear in the production sitemap, Atom feed and llms.txt. The scheduled IndexNow sweep accepted all five URLs, as verified in its production ledger. This does not establish search engine indexing. T3 remains untested. Nate Herk and Dominik Kundel outreach is sent and recorded separately in the outreach tracker.
