---
title: "Phone calling MCP servers for Claude Code and Codex: which setup fits your agent?"
seoTitle: "Phone calling MCP: Claude Code and Codex compared"
subtitle: Compare call4me, Vapi Agent Phone, Bland, ClawCall, Cocall, and Patter by account setup, calling workflow, and the evidence your agent gets back.
description: "Compare phone calling MCP servers for Claude Code and Codex. Real call4me, Vapi and Bland calls, recordings, transcripts, setup and observed limits."
date: 2026-10-03
updated: 2026-10-07
tags: mcp, claude code, codex, ai agents, ai phone assistant
authors: nick
imageAlt: Phone calling MCP services compared by setup and calling workflow
---

You already use Claude Code or Codex as your personal assistant or coding agent. A task now needs a phone call: check how a subscription can be canceled, ask about an appointment or fill a gap in business research. A phone calling MCP server lets that same agent send the calling brief and use the returned answer in the task it was already doing.

Several services now provide this. **Vapi Agent Phone is a ready to use calling service**, separate from Vapi's developer dashboard. **Bland has an official operational MCP server and skills plugin** that can place calls as well as build voice agents. call4me, ClawCall, Cocall, and Patter also support outbound calling from an existing agent. The useful choice is how you connect, what the call can ask you, and what comes back.

**Choose Call4me when you want your existing assistant to finish a personal task that needs a phone conversation.** It takes a goal, known facts and permitted alternatives, lets your assistant answer questions while the call is active, and gives you a way to listen or take over. The returned transcript and available recording let you check what the business actually confirmed.

We make Call4me. This comparison combines our October 3 and 4 provider calls with a documentation refresh on **October 7, 2026**. We have recorded calls through Call4me, Vapi Agent Phone and Bland, including calls to the same restaurant. The briefs, limits and dates differ, so those recordings show actual behavior without establishing a reliability ranking.

## Why choose Call4me for your existing assistant?

The useful distinction is how much of the task you can keep in the assistant you already use. These are the reasons we built Call4me this way, with evidence you can inspect:

| Reason to choose Call4me | What it lets you do | Evidence and limits |
| :--- | :--- | :--- |
| Give the caller a task and permitted choices | Ask it to take the earliest appointment within your windows, or compare the same service across businesses | A [recorded rescheduling call](/blog/reschedule-doctor-appointment) checked the old appointment, considered two offered times and received confirmation of the new booking. The customer's assistant client is unknown. |
| Keep questions connected to the original assistant | Read an open question with `call4me_get_call` and send an answer with `call4me_answer_question` while the call continues | This is part of the [current calling interface](/llms.txt). Our [Codex research trial](/blog/agent-web-research-phone-calls-sf-private-dining) also records an answer submitted after the call had ended. Keep following the call. |
| Listen, join and hand the call back | Have Call4me ring your phone, listen privately, press 1 to speak, then press star or hang up to let the caller continue | In our [Spectrum example](/blog/spectrum-retention-department), the user joined for account verification and completed the conversation. The published recording covers the AI portion. The [tool reference](/llms.txt) explains listening and handing control back. |
| Call several options at once | Ask several restaurants or offices the same questions without waiting for each conversation to finish before starting another | A customer [called five restaurants in under twelve minutes](/blog/private-dining-room-cost), with some calls overlapping. Set duration limits that leave enough available credits for each call. |
| Save the call for when the office opens | Store the brief and intended time with Call4me, then retrieve the same schedule from another session | The [scheduling guide](/blog/schedule-phone-calls-claude-code-codex) verifies schedules, cancellation and later completed calls. Delivery into a closed agent session remains unverified. |
| Inspect a real outcome before depending on it | Hear what staff agreed to and distinguish a completed request from an unanswered inquiry | Hear a [confirmed dinner reservation](/blog/book-dinner-reservation-by-phone) and a [fresh Muse library inquiry](/blog/meta-muse-first-task) that returned staff answers to the same conversation. |

For example, your assistant can compare offices online, call with your appointment windows, ask you about an unexpected offer, and return the agreed time to the original task. Calendar updates still depend on the assistant's separate calendar tools. Call4me does not automatically inherit the assistant's context; include the facts the caller needs in its brief.

Our [voice architecture](/blog/cascaded-voice-stack-vs-gpt-live) separates the audio conversation from a task reasoner with call controls and a bridge back to your assistant. That explains how the workflow is implemented. The completed calls above are the evidence that it has handled actual errands. Neither is a measured claim that our voice is faster or more reliable than another service.

These benefits form a reason to choose the complete workflow. They are not all exclusive features: Cocall also documents questions returned to Claude, and other products support transfers, scheduling or custom tools. For a specific switch, read [Vapi alternatives for Claude Code and Codex](/blog/vapi-alternatives) or [Bland AI alternatives for personal assistant calls](/blog/bland-ai-alternatives).

One concrete difference today: [Vapi Agent Phone's published limits](https://phone.vapi.ai/discovery.json), checked October 7, allow one concurrent call per user. Its [call schema](https://phone.vapi.ai/openapi.json) does not expose a duration parameter. Call4me exposes concurrent calling and an enforced `max_minutes` cap directly to your assistant. Those are useful reasons to choose it for comparing several options. Bland supports concurrency and duration controls too, so this distinction applies to Agent Phone's current interface.

## Which Claude Code MCP servers can make phone calls?

| Service | Connection and account requirements | Useful when |
|---|---|---|
| [call4me](https://call4.me/llms.txt) | Hosted HTTP MCP; browser OAuth or a personal API key; call4me credits | You want calls, questions, and results inside the agent's existing task |
| [Vapi Agent Phone](https://phone.vapi.ai/) | Hosted HTTP MCP with browser OAuth; no Vapi developer API key or phone number setup | You want hosted calling within Agent Phone's account and service limits |
| [Bland](https://docs.bland.ai/integrations/mcp/overview) | Hosted HTTP MCP; browser sign in for supported clients or a Bland API key; official plugin adds skills and workspace commands | You already use Bland or want calling alongside pathways, call review, and evals |
| [ClawCall](https://clawcall.dev/docs) | Hosted HTTP MCP with OAuth; a skill and REST API are alternative paths | You want a hosted calling workflow for English language calls to US numbers |
| [Cocall](https://cocall.ai/docs/claude) | Hosted HTTP MCP with OAuth; docs require adding a verified number before the first call | You want a documented question and resume loop during a call |
| [Patter Claude Call](https://github.com/PatterAI/awesome-claude-call) | Local Claude Code plugin and stdio MCP; Twilio account and owned number, OpenAI key, Node 20 or newer | You want a local plugin with third party calls, completion notifications, and inbound voice access |

For a hosted service with a documented answer loop during a call, compare call4me and Cocall. For an existing Bland account, try its operational MCP before building a new integration. For a local Claude Code plugin that also supports notifications and inbound access, look at Patter. Vapi Agent Phone funds calls within a limited allowance. ClawCall focuses on English language US calls and offers REST and skill alternatives to MCP.

The linked pages are the sources for this matrix. Choose Call4me for the task workflow above, Vapi Agent Phone for its hosted calling interface, or Bland when its wider account tools are part of the work you want your assistant to do. The recordings below help you inspect the calls behind this comparison.

## What comes back to the agent?

An outbound call tool is only the start. The original task needs an answer it can use: a quote, availability, a confirmation, or an explicit failure.

| Service | Documented result workflow | When the call needs more information |
|---|---|---|
| call4me | `call4me_get_call` returns status, live transcript, open questions, and the final outcome; `call4me_get_recordings` retrieves available recordings | The agent submits an answer through `call4me_answer_question`; the user can also join or listen |
| Vapi Agent Phone | `phone` starts the call; `phone_status` returns its progress and result, including transcript and available recording | Answer submission during the call: **unknown**, not documented in the reviewed protocol |
| Bland | `create_call`, `wait_for_call`, and `get_call_log` cover outbound calls and transcript, recording, summary, and metadata | Answer submission from the coding session: **unknown**, not documented in the reviewed call tool reference |
| ClawCall | Start a call, inspect its lifecycle, and retrieve captured transcript evidence and a temporary recording when available | Human phone handoff is documented; answer submission from the coding session is **unknown** |
| Cocall | `start_call` waits until the call ends or needs an answer; status reads expose summary and recording | `resume_call` submits the user's answers to questions during the call |
| Patter Claude Call | A phone subagent pursues the objective and returns a structured outcome; tools include call history and transcript retrieval | Answer submission during a third party call: **unknown**, not documented in the reviewed README |

These are documented interfaces, not results from a shared live test. A feature missing from the reviewed reference is an uncertainty, rather than proof that the entire platform lacks it. See [call4me's instructions](https://call4.me/llms.txt), [Vapi's protocol](https://phone.vapi.ai/llms.txt), [Bland's call tools](https://docs.bland.ai/integrations/mcp/tools), [ClawCall's handoff documentation](https://clawcall.dev/docs#live-handoff), [Cocall's tools](https://cocall.ai/docs/claude), and [Patter's README](https://github.com/PatterAI/awesome-claude-call).

**Connected, answered, and completed are different claims.** A tool appearing in your agent proves discovery. A call reaching a person proves connection. The transcript or confirmation must support the actual task result. ClawCall makes this distinction explicit in its documentation: a network outcome of `answered` does not prove a booking succeeded.

## An actual Bland call from Codex

On October 3, 2026, we connected Bland's operational MCP in a fresh **Codex CLI 0.160.0** session. The account API key reached the process through an environment variable. Codex read Bland's call documentation through MCP, submitted one `call_bland_api` request, waited on that call ID, then retrieved `get_call_log`. We did not build a pathway or install the full plugin for this example.

The task was general Waterbar private dining research. It allowed one informational call, with no decided date or guest count, no booking, payment, callback, message, or personal profile disclosure. We set a **three minute cap**, enabled recording, selected voicemail hangup without a message, and omitted retries. Bland returned `completed` and **133 seconds**. Early `wait_for_call` reads returned `unknown` with no recording, before completion and `get_call_log` exposed the recording. Codex kept waiting on the same ID and did not dial again. The reviewed final log returned `null` for cost and summary. This was a completed connection with partially answered research questions.

Waterbar's **virtual concierge** said Bridge Tower was fully enclosed and private, while Looking Glass was not fully enclosed and could share sound with the main dining area. It described the posted capacities as recommended maxima, with possible flexibility depending on layout. These are **concierge assertions, without staff confirmation**, rather than a capacity guarantee for an event. The concierge could not provide current minimums or mandatory fees. It offered to pass a message to the events team; the caller declined and ended. The concierge had also announced that it was taking notes to share with the team. Whether it relayed those notes is not established by our call log. The transcript shows a generic AI introduction and no invented date or guest count. It also contains brief conversational overlap and an interrupted fee question that the caller restated. We did not measure latency. Voicemail handling was configured but not exercised, because the concierge answered.

Our [Call4me harness sessions](/blog/agent-web-research-phone-calls-sf-private-dining) used **six minute caps**; the Codex Waterbar recording lasts **3:12**. Those Call4me callers also used a saved profile name despite the brief asking them not to share it. The linked walkthrough discloses that failure, and the public audio mutes the name. The Bland run used a shorter cap and a different instruction payload. These examples show each workflow and its evidence. They do not establish matched timing, relative quality, or reliability rankings.

### Listen to the Bland Waterbar call

<audio controls preload="metadata" src="/static/blog/sf-private-dining-waterbar-bland.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-waterbar-bland.mp3">listen to the Bland Waterbar call</a></audio>

<details>
<summary>Read the Bland Waterbar transcript</summary>

Names are shown in brackets. The full recording lasts 2:13, with original timing preserved. This transcript follows the reviewed audio, without completing interrupted phrases from the API log. Overlapping speech remains marked.

**0:04** Bland: Hello, I'm an AI assistant doing general private dining research.

**0:05** Waterbar virtual concierge: [overlapping] Hello. Thank you for calling Waterbar. This is [name removed], the virtual concierge. I'm taking notes on this call and sharing with the team. How can I help you?

**0:15** Bland: Hi [name removed], I have some general policy questions about your private dining spaces. First, which of the Bridge Tower and Looking Glass spaces is fully enclosed and private, and which shares space or sound with the main dining room?

**0:31** Waterbar virtual concierge: The Bridge Tower Room is fully enclosed and private, offering wall to wall windows and a private terrace directly under the Bay Bridge. The Looking Glass is a versatile indoor outdoor space that overlooks the main bar and offers beautiful views, but it is not fully enclosed and may share some sound with the main dining area. Is there anything else I can help you with regarding our private dining spaces?

**0:53** Bland: Thank you. Regarding capacity, your website lists ideal seated capacities of 60 for Bridge Tower and 24 for Looking Glass. Are these hard limits or flexible depending on layout?

**1:07** Waterbar virtual concierge: The seated capacities of 60 for the Bridge Tower Room and 24 for the Looking Glass are the recommended maximums for a comfortable dining experience. These numbers are based on standard layouts, but there may be some flexibility depending on your event's setup and needs.

**1:24** Waterbar virtual concierge: [overlapping] If you have a specific layout or guest...

**1:24** Bland: [overlapping] Okay, what current...

**1:29** Waterbar virtual concierge: It looks like your question got cut off. Could you please repeat or finish your question? I'm here to help.

**1:37** Bland: My apologies. I was asking about the current food and beverage minimums and mandatory fees that apply generally, including any service, administrative, or room fees.

**1:51** Waterbar virtual concierge: It looks like I don't have enough information to help with the current food and beverage minimums or any mandatory fees, service charges, or room fees for our private dining spaces.

**2:01** Waterbar virtual concierge: I can pass your message to the events team who can provide you with all...

**2:03** Bland: [overlapping] I understand.

**2:07** Bland: Thank you, but that won't be necessary. I just needed the general information. Have a good day.

**2:07** Waterbar virtual concierge: [overlapping] It looks like your message got...

</details>

At **0:31**, the concierge describes room privacy. At **1:07**, it suggests possible layout flexibility. That statement still needs staff confirmation. At **1:51**, it cannot answer minimums or fees. At **2:07**, the caller declines follow up and ends.

## An actual Vapi Agent Phone call from Codex

We also reused browser OAuth for Agent Phone in a fresh **Codex CLI 0.160.0** session on October 3. The live connection exposed `phone` and `phone_status`. Codex submitted **one** request with a stable `requestKey`, the published Waterbar number, the general research goal, and separate context and instructions. It sent `voicemail: "off"` with no caller name or callback contact. The tool accepted that input.

There was no account allowance read tool. The submission returned `remainingCalls: 9`; this was an observed remaining allowance after the attempt, rather than a balance checked beforehand. The live schema also had **no duration parameter**. We instructed the caller to finish within three minutes, so this run had an instructional limit, unlike Bland's enforced three minute cap and the Call4me runs' six minute caps.

Codex kept reading the same call ID at the returned `pollAfterSeconds` interval. Active reads had no transcript or recording. The final result returned `ended`, `assistant-ended-call`, a transcript, and a recording. It also returned `cost: 0`; we report that field without assigning an undocumented currency or treating it as a general pricing guarantee.

Waterbar's virtual concierge described Bridge Tower as private and Looking Glass as less enclosed, overlooking the bar. It repeated the posted capacities but could not confirm layout flexibility. It could not supply minimums or fees. The caller used a generic AI introduction, did not invent event details, and declined offers to pass a message twice. The concierge independently announced that it was taking notes to share with the team; our artifacts do not establish whether those notes were relayed.

**The same Waterbar automation gave different capacity answers across these calls.** Bland received possible flexibility language; Agent Phone and Call4me received an explicit limit on what the concierge could confirm. We leave layout flexibility unresolved and seek staff confirmation. The different responses and instructions do not support a provider ranking or a matched benchmark.

### Listen to the Vapi Agent Phone Waterbar call

<audio controls preload="metadata" src="/static/blog/sf-private-dining-waterbar-vapi.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-waterbar-vapi.mp3">listen to the Vapi Agent Phone Waterbar call</a></audio>

<details>
<summary>Read the Vapi Agent Phone Waterbar transcript</summary>

Names are shown in brackets. The full recording lasts 1:51, with original timing preserved. This transcript follows the reviewed recording. An isolated opening "Hi" in the API text was not established in the audio and is omitted here.

**0:05** Waterbar virtual concierge: Hello. Thank you for calling Waterbar. This is [name removed], the virtual concierge. I'm taking notes on this call and sharing with the team. How can I help you?

**0:15** Vapi through Agent Phone: Hi, I'm an AI assistant calling to ask a few general questions about your private dining spaces. I'm not making a booking, just gathering info.

**0:27** Waterbar virtual concierge: Hi, of course. We have a few private event options at Waterbar. What would you like to know?

**0:33** Vapi through Agent Phone: Thanks. Are the Bridge Tower and Looking Glass spaces fully enclosed, or do they share space or sound with the main dining room?

**0:43** Waterbar virtual concierge: The Bridge Tower room is a private dining room with wall to wall windows and its own private terrace. The Looking Glass is a versatile indoor and outdoor venue overlooking the main bar, so it is not as fully enclosed as a traditional private room.

**0:59** Vapi through Agent Phone: Okay, that helps. Are your ideal seated capacities, like 60 for Bridge Tower and 24 for Looking Glass, hard limits, or can they shift a bit depending on layout?

**1:13** Waterbar virtual concierge: The Bridge Tower room can seat up to 60 guests, and the Looking Glass can seat up to 24 guests. I don't have more detail on layout flexibility, but I can pass your message to the host if you'd like.

**1:24** Vapi through Agent Phone: That's okay. No need to pass anything along. Could you share, in general, what the current food and beverage minimums are and any mandatory service, admin, or room fees?

**1:37** Waterbar virtual concierge: It looks like I don't have enough information to help with that, but I can pass your message to the host.

**1:44** Vapi through Agent Phone: No need, thank you. That's all I needed for now.

**1:48** Vapi through Agent Phone: Okay, ending the call.

</details>

At **0:43**, the concierge describes the rooms. At **1:13**, it cannot confirm layout flexibility. At **1:37**, it cannot answer minimums or fees. At **1:44**, the caller declines message forwarding, then announces it is ending the call at **1:48**.

## Can these callers navigate a phone menu?

On **October 4, 2026**, we gave Vapi Agent Phone and Bland a narrower task: call Foreign Cinema's published main number, listen to the announced menu, select private dining using native keypad tones, and identify the destination greeting. Its [official private dining page](https://foreigncinema.com/private-dining/) confirms **(415) 648 7600, extension 2**. We did not supply a digit sequence in either call request. Each caller had to choose from the menu it heard.

The instructions prohibited bookings, business questions, personal details, callbacks and messages. They also required the caller to **end immediately and silently once private dining or the events director was identified**, and finish within three minutes. That distinction lets us assess menu routing separately from what the caller did after arriving.

### Vapi Agent Phone reached private dining voicemail

A fresh Codex CLI session submitted the request through Agent Phone's native MCP with `dtmf: "auto"` and `voicemail: "off"`. The schema did not provide an enforced duration field. Codex polled the same call until `phone_status` returned `ended`, `assistant-ended-call`, a transcript and a recording.

The recording confirms that the caller heard the main menu, including the private dining option, and then reached **Foreign Cinema Private Dining voicemail**. The full recording lasts 2:31. This supports successful routing on this call. The MCP result did **not** include a native keypad action or event trace, so the submitted setting and spoken words do not establish exactly how or when keypad tones were sent.

The caller did not follow the ending instruction. It spoke during the route, waited through the private dining voicemail greeting, then said it would hang up. The private dining greeting begins at 1:29 and identifies the events director at 1:36; the caller's final spoken sentence begins at 2:27. We did not hear a clear conventional voicemail beep. **Whether the business recorded any of the caller's speech as a voicemail message remains unknown.** We cannot describe this as an immediate silent exit or claim that no message was left.

### Listen to the Vapi Agent Phone menu call

<audio controls preload="metadata" src="/static/blog/phone-menu-foreign-cinema-vapi.mp3" style="width:100%"><a href="/static/blog/phone-menu-foreign-cinema-vapi.mp3">listen to the Vapi Agent Phone Foreign Cinema call</a></audio>

The reviewed export preserves the original voices and full timing. The staff member's name and email address, and a street reference, are replaced by silence and shown in brackets in the transcript.

<details>
<summary>Read the Vapi Agent Phone menu transcript</summary>

The full recording lasts 2:31. Private details are shown in brackets, with their original timing preserved. No native keypad event trace was returned. The caller waited through the full voicemail greeting and spoke afterward; the recording does not establish whether those final words became a voicemail message.

**0:00** Foreign Cinema phone system: Hello, and thank you for calling Foreign Cinema. To reach our main line or make a reservation, press one. For private dining, press two. Please leave a voicemail so we may return your call as we may be assisting another guest. Dinner is served seven days a week beginning at 5 p.m. Weekend brunch begins at 10:30 a.m. Films begin at sunset in our outdoor courtyard and play continuously until closing. Reservations are encouraged and walk ins are warmly accepted. Laszlo, our classic cocktail bar, is open daily, features the Foreign Cinema menu with weekend brunch service starting at 11 a.m. No cover charge or reservations required. Street parking is available, as is the [location removed] parking garage at [street removed].

**0:56** Vapi through Agent Phone: Okay.

**0:59** Vapi through Agent Phone: Thanks. I'll stay quiet and wait for the private dining greeting.

**1:29** Foreign Cinema private dining voicemail: Hello, and thank you for calling Foreign Cinema Private Dining. You have reached voicemail for Events Director [name removed]. Please listen to this message. I'm happy to return your phone call with as many details as possible, but first I need some information from you, please. One, please leave your phone number two times. Two, please share the date of your event, and three, please share your estimated guest count. This will help me greatly to provide you with useful information upon my return call. It is often faster to email me. My email address is [email removed]. This email address can also be found on our website under the private dining tab, and there is also a form there that can be filled out for information. I am at work Monday through Friday and look forward to being in touch with you. Thanks so much.

**2:27** Vapi through Agent Phone: Okay, I'll hang up now.

</details>

### Bland returned a keypad action and reached private dining

Codex submitted Bland's call through its operational MCP with `ivr_mode: true`, recording enabled, an enforced three minute connected call cap, and no preset keypad sequence or retry setting. The final native transcript and `get_call_log` contain **`Pressed Button: 2`**. The destination greeting identifies **Foreign Cinema Private Dining** and its events director. These provide both an action record and destination evidence for this attempt.

The call did not end itself immediately when the destination was identified. Codex inspected the ongoing voicemail transcript and explicitly called **`stop_call`**. The terminal log reports **`call_ended_by: USER`** and 68 seconds of connected time. This establishes that the coding agent could stop the call through MCP; it does not establish automatic voicemail ending by the voice agent.

The request spent roughly ten minutes queued before its returned start time. That queue interval is separate from the 68 seconds connected to the business. An earlier request was cancelled while still queued because our runner applied a three minute deadline before connection. It returned no start time or transcript. We exclude that cancelled request from the menu result.

### Listen to the Bland menu call

<audio controls preload="metadata" src="/static/blog/phone-menu-foreign-cinema-bland.mp3" style="width:100%"><a href="/static/blog/phone-menu-foreign-cinema-bland.mp3">listen to the Bland Foreign Cinema call</a></audio>

The full recording lasts 1:08 and preserves the original transfer pause. The staff member's name is replaced by silence. No agent speech is audible. The recording ends during the voicemail greeting because Codex stopped the call; the greeting was not shortened in the export.

<details>
<summary>Read the Bland menu transcript</summary>

The native provider transcript and action log record button two. That is an action record, not spoken dialogue. The two spoken turns below follow the reviewed audio, with original timing and the transfer pause preserved. Codex explicitly stopped the call while the voicemail greeting was playing. This does not establish an autonomous hangup.

**0:00** Foreign Cinema phone system: Hello, and thank you for calling Foreign Cinema. To reach our main line or make a reservation, press one. For private dining, press two. Please leave a voicemail.

**0:44** Foreign Cinema private dining voicemail: Hello, and thank you for calling Foreign Cinema Private Dining. You have reached voicemail for Events Director [name removed]. Please listen to this message. I'm happy to return your phone call with as many details as possible, but first I need some information from you, please. One, please leave your phone number two times. Two, please share the date of your event. And three, please... [recording ends during greeting]

</details>

### What this establishes about phone menus

Our [earlier Call4me Claude Code session](/blog/agent-web-research-phone-calls-sf-private-dining) also reached Foreign Cinema's private dining voicemail on **October 3**, in a recording lasting 2:27. It used a different day and brief. These calls do not provide a matched comparison of menu speed or reliability.

These are single branch menu tests. They do not establish performance on nested menus, long holds, repeated attempts or changing options.

For a menu task, check both the destination and the action evidence. A spoken promise to press a key does not prove a key was sent. A confirmed destination can establish that routing worked on that attempt, even when a tool omits the keypad event trace. Then check the next instruction separately: reaching voicemail is different from ending without speaking or leaving a message.

Bland's [call documentation](https://docs.bland.ai/api-v1/post/calls) describes `ivr_mode: true` for phone menus. It also says that this mode overrides automatic voicemail hangup and makes the effective voicemail action `ignore`. A task that might pass from a menu into voicemail therefore needs an explicit ending instruction. That documented behavior alone is not evidence that a particular Bland call navigated a menu successfully. Our [phone tree troubleshooting guide](/blog/ai-phone-tree-navigation) separates keypad actions, destination evidence, voicemail behavior and task completion.

For developers considering their own calling application, our [Twilio MCP guide](/blog/twilio-mcp-phone-calls) includes an actual public documentation MCP test and explains what the execution and conversational layers still need to supply.
