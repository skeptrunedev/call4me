---
title: Web research and phone calls in your AI agent: comparing SF private dining
seoTitle: AI agent web research and phone calls: a real task
subtitle: We used Codex to research and call Waterbar and EPIC Steak, plus a separate Claude Code call to Foreign Cinema. Here is what the websites answered, what the calls added, and what stayed unknown.
description: A real Codex web research and phone workflow, plus customer stock and reservation examples. Reusable briefs, recordings and clear limits on each result.
date: 2026-10-03
updated: 2026-10-06
tags: claude code, codex, mcp, ai agents, private dining, ai phone assistant
authors: nick
imageAlt: Official websites, phone calls and a sourced private dining comparison in an existing AI agent
---

**An agent with web search and a calling MCP can research a shortlist, call about the gaps, and return a comparison in the same task. The phone does not guarantee a human answer or a quote.** We tried that workflow on October 3, 2026, with a real request: compare San Francisco private dining options.

We used a fresh Codex CLI session to read the official Waterbar and EPIC Steak websites, place two calls through call4me, follow the conversations and produce a sourced comparison. A separate fresh Claude Code session called Foreign Cinema. That third call is additional evidence, rather than part of the Codex session.

The request did not specify an event date, guest count or budget. We kept those unknown. Every call was informational, with no reservation, hold or payment authorized.

## Start with the questions the websites cannot settle

Search was useful before calling. The restaurants publish spaces, capacities and inquiry routes. Reading those first gave the caller specific questions instead of asking a host to repeat an entire event brochure.

| Restaurant | Official website findings | Question for the call |
|---|---|---|
| Waterbar | Bridge Tower Room: 60 seated or 75 reception. Looking Glass: 24 seated or 50 reception, overlooking the main bar | How enclosed are the spaces, and are capacities fixed or dependent on layout? |
| EPIC Steak | Private Bay Room: 10 to 70 seated, 120 reception. Semi private Piazza: 10 to 50 seated, 100 reception; the page also describes a Piazza reception buyout of up to 175 | Which configuration explains the two Piazza reception capacities? |
| Foreign Cinema | Several private event spaces, including Modernism West and the Director's Table; a dedicated private dining inquiry route | Which space fits which group size, and what event details are needed for a quote? |

Sources checked October 3: [Waterbar private dining](https://www.waterbarsf.com/private-dining/), [EPIC Steak private events](https://www.epicsteak.com/private-events/) and [Foreign Cinema private dining](https://foreigncinema.com/private-dining/). These are published capacities, not confirmations that a room is available for your event.

Codex also found differences between Waterbar's current page and a linked event guide. That is a reason to ask for a current written proposal. Combining inconsistent documents into one apparently precise answer would hide the uncertainty.

## Give the phone caller the research context

The useful prompt contains the task, known facts, missing facts and permitted actions together. This is a reusable version of our brief:

> Compare private dining options at these restaurants. Read their official websites first and identify the gaps. Call the published business numbers only for general information. No event date, guest count or budget is decided, so do not invent one. Ask about room privacy, capacity, how minimums vary, whether a room fee counts toward food and beverage, and the inquiry process. Do not reserve, hold, pay, leave a voicemail or arrange a callback. If a quote requires event details, mark it unknown. Keep following the calls and return one table separating website facts from phone answers.

For this task, `call4me_get_requirements` identified `general` as an appropriate category. We passed the research questions through its `questions` field. A reservation category would have asked for booking details we did not have.

The observed Codex tool sequence was:

```text
Read official websites with web search
call4me_get_balance
call4me_get_requirements(category: "general")
call4me_place_call(Waterbar, max_minutes: 6)
call4me_place_call(EPIC Steak, max_minutes: 6)
call4me_get_call(wait_seconds: 30), repeated for both calls
call4me_get_recordings, when available
Return the sourced comparison in the original session
```

The calling service runs the audio conversation. Codex remains responsible for choosing the questions and incorporating the answers into the research. Relevant context needs to reach the call brief; the phone caller does not automatically inherit every earlier message in your harness.

## What the phone answered, and what it did not

The three calls reached two automated concierges and a private dining voicemail. **We did not reach a human events coordinator.** Treat an automated answer as what that system said, rather than a negotiated quote or a human confirmation.

| Restaurant | Who answered | What the attempt established | Still unresolved |
|---|---|---|---|
| Waterbar | A virtual concierge | It described Bridge Tower as the more enclosed private space and Looking Glass as more open to the main bar. It repeated the published capacities, could not confirm layout flexibility, and directed general questions to the private dining team by email | Current minimums, any separate room fee, flexible layouts and an event specific proposal |
| EPIC Steak | An AI concierge | Its inquiry flow required a guest count, including after the caller explained that none was decided. It said no human was available and provided an email inquiry route | The Piazza configuration discrepancy, minimums, room fees and event specific terms |
| Foreign Cinema | Private dining voicemail | The greeting requested a callback number, event date and estimated guests, and said email could be faster. It gave the events team's working days as Monday through Friday | Room fit, capacity, minimums and all event specific availability |

No minimum spend was confirmed. We have no event date to check availability against. Those cells stay unknown instead of becoming estimates presented as quotes.

## Listen to the Waterbar research call

<audio controls preload="metadata" src="/static/blog/sf-private-dining-waterbar.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-waterbar.mp3">listen to the Waterbar call</a></audio>

<details>
<summary>Read the Waterbar transcript</summary>

Names and private identifiers are shown in brackets. Original timing is preserved.

**0:05** Waterbar virtual concierge: Hello. Thank you for calling Waterbar. This is [name removed], the virtual concierge. I'm taking notes on this call and sharing with the team. How can I help you?

**0:15** Call4me: Hi, I'm [names removed], assistant. We're just doing some general private dining research. No event details or booking in mind. I was wondering, are the Bridge Tower Room and Looking Glass actually fully enclosed or are they open to the main bar, and how private do they feel?

**0:34** Waterbar virtual concierge: The Bridge Tower Room is a private dining room with wall to wall windows and its own private terrace, so it feels the most enclosed and private. The Looking Glass is a more flexible indoor outdoor space overlooking the main bar, so it feels more open rather than fully closed off. If you'd like, I can also share the guest capacities for each space.

**0:53** Call4me: Yeah, please. Are the published capacities, say 60 seated, 75 reception for Bridge Tower, firm limits or layout dependent? And same question for Looking Glass, 24 seated, 50 reception. Are those numbers fixed or do they flex a bit?

**1:11** Waterbar virtual concierge: The published capacities are 60 seated or 75 standing for the Bridge Tower Room and 24 seated or 50 standing for the Looking Glass. I only have those listed capacities, so I can't confirm whether they flex by layout, but I can pass your message to the host if you'd like.

**1:29** Call4me: That's okay. Do you have any general info on how food and beverage minimums vary by room or like day of the week or lunch versus dinner? Even just a sense of the ranges, if that's possible.

**1:43** Waterbar virtual concierge: It looks like I don't have enough information to help with that, but I can pass your message to the host.

**1:48** Call4me: No worries. Is there typically a separate room fee, and if so, is that applied toward the food and beverage minimum, or is it additional?

**1:59** Waterbar virtual concierge: It looks like I don't have enough information to help with that, but I can pass your message to the host.

**2:05** Call4me: Okay, thanks. And beyond the published service charge and tax, are there any other mandatory fees or things that don't count toward the minimum besides what's already on your FAQ?

**2:19** Waterbar virtual concierge: I only have that a 7% SF mandate is added to all checks, along with tax and any applicable gratuity. I don't have anything more specific about private dining minimums or event only fees, but I can pass your message to the host if you'd like.

**2:33** Call4me: That's all right. Finally, if someone just has general questions like these, what's the best general route to ask without having event details yet?

**2:44** Waterbar virtual concierge: You can email the team with your general private dining questions, and they'll be able to help even if you don't have event details yet. If you'd like, I can text you the email address once we get off the phone.

**2:57** Call4me: No need. That's helpful. Thanks. Bye.

**3:03** Waterbar virtual concierge: Thank you for the feedback. We look forward to helping you again soon. Goodbye.

</details>

The useful distinction came when the concierge said it only had the listed capacities and could not confirm whether they changed with the layout. That gives the events team a precise followup question. It does not settle the room's maximum capacity for a particular floor plan.

At **1:11**, it states the limit of its capacity information. At **1:43** and **1:59**, it cannot answer the minimum spend and room fee questions. At **2:44**, it says the team can answer general questions by email even without event details.

## Listen to the EPIC Steak research call

<audio controls preload="metadata" src="/static/blog/sf-private-dining-epic-steak.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-epic-steak.mp3">listen to the EPIC Steak call</a></audio>

<details>
<summary>Read the EPIC Steak transcript</summary>

Names and private identifiers are shown in brackets. Original timing is preserved.

**0:05** EPIC AI concierge: Hello, thanks for calling EPIC Steak. I am your AI concierge, [name removed]. We accept reservations one month in advance. To ensure a good experience, this call is recorded. How may I assist you today?

**0:20** Call4me: Hi, hello.

**0:23** EPIC AI concierge: Hello, how can I help?

**0:25** Call4me: Hi, I'm [names removed] assistant. I'm helping with some general private dining research on...

**0:31** EPIC AI concierge: I'm sorry, I didn't understand you, but I can answer lots of questions about this business. So let's try again. How can I help?

**0:37** Call4me: Sure, I'm just calling for a private dining researcher doing general comparison research. No event specifics yet.

**0:45** EPIC AI concierge: Happy to help. To get started, can you let me know about how many people will be in your party?

**0:50** Call4me: We don't have any event details decided. This is just general info gathering.

**0:55** EPIC AI concierge: Apologies, I'm hoping you can tell me the number of guests, even if it's just an estimate.

**1:02** Call4me: Yeah, we really don't have that. It's just for general comparison.

**1:04** EPIC AI concierge: I'm sorry, I didn't hear a number. I'm hoping you can tell me the number of guests, even if it's just an estimate.

**1:11** Call4me: Hmm, okay, let me check.

**1:14** EPIC AI concierge: Apologies, I didn't catch a number that time either. One more time. How many people in your party?

**1:21** Call4me: Yeah, let me check on that. There's no number set.

**1:24** EPIC AI concierge: We usually take calls about speaking with a human by phone, but no one is available to take your call at this time. The best way to get a hold of us is by email at [email removed]. Is there anything else?

**1:40** EPIC AI concierge: I'm not confident I understood. Let's try again. Is there anything else I can help you with?

**1:48** EPIC AI concierge: I still didn't catch that. Let's try one more time. What else can I do for you?

**1:55** EPIC AI concierge: I'm sorry, I still can't process this. If there's anything else you need, it will work better if you hang up and call back. I'll go ahead and end this call.

</details>

The concierge repeatedly asked for a number of guests. Our caller did not supply a made up count. That preserved the research boundary, but it also meant this route could not answer the general comparison questions.

At **0:45**, it asks for the guest count. At **1:24**, it says no human is available and gives the email route. At **1:55**, it announces it will end the call.

## Listen to the Foreign Cinema attempt from Claude Code

<audio controls preload="metadata" src="/static/blog/sf-private-dining-foreign-cinema.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-foreign-cinema.mp3">listen to the Foreign Cinema attempt</a></audio>

<details>
<summary>Read the Foreign Cinema transcript</summary>

Names and private identifiers are shown in brackets. Original timing is preserved.

**0:00** Phone system: Hello, and thank you for calling Foreign Cinema.

**0:04** Phone system: To reach our main line or make a reservation, press 1.

**0:08** Phone system: For private dining, press 2.

**0:11** Phone system: Please leave a voicemail so we may return your call as we may be assisting another guest.

**0:17** Phone system: Dinner is served 7 days a week beginning at 5pm.

**0:21** Phone system: Weekend brunch begins at 10.30am.

**0:24** Phone system: Films begin at sunset in our outdoor courtyard and play continuously until closing.

**0:31** Phone system: Reservations are encouraged and walk ins are warmly accepted.

**0:36** Phone system: Laszlo, our classic cocktail bar, is open daily, features the Foreign Cinema menu with weekend brunch service starting at 11am.

**0:44** Phone system: No cover charge or reservations required.

**0:48** Phone system: Street parking is available, as is the Mission Bartlett parking garage at [street location removed].

**0:58** Call4me: Okay, I'm on it.

**1:12** Phone system: [ringing]

**1:30** Phone system: Hello, and thank you for calling Foreign Cinema Private Dining.

**1:34** Phone system: You have reached voicemail for Events Director [name removed].

**1:37** Phone system: Please listen to this message.

**1:40** Phone system: I'm happy to return your phone call with as many details as possible.

**1:44** Phone system: But first, I need some information from you, please.

**1:47** Phone system: One, please leave your phone number two times.

**1:51** Phone system: Two, please share the date of your event.

**1:53** Phone system: And three, please share your estimated guest count.

**1:56** Phone system: This will help me greatly to provide you with useful information upon my return call.

**2:01** Phone system: It is often faster to email me.

**2:04** Phone system: My email address is [email removed].

**2:12** Phone system: This email address can also be found on our website under the Private Dining tab,

**2:16** Phone system: and there is also a form there that can be filled out for information.

**2:20** Phone system: I am at work Monday through Friday and look forward to being in touch with you.

**2:25** Phone system: Thanks so much.

</details>

The private dining route reached voicemail. Its greeting said the events director works Monday through Friday; we called on Saturday while the restaurant itself was open. Restaurant hours were therefore insufficient to establish events staff availability. Claude Code checked the result and ended the call without leaving a message. There was no callback arranged and no live staff answer.

At **0:08**, the main menu offers private dining. At **1:30**, the private dining greeting starts. At **1:47**, it asks for the event details, and at **2:20**, it gives the events director's working days.

These recordings preserve the original voices and timing. Names and private identifiers are muted. The recordings document these attempts on October 3, rather than current availability or a completed booking.

## The comparison we can actually make

Waterbar is worth a closer inquiry if you are choosing between an enclosed room and a smaller space with a connection to the main bar. The privacy distinction was described on the call; a specific floor plan still needs confirmation.

EPIC's published Bay Room capacity supports considering it for a larger seated group. Its Piazza capacity needs clarification because the page describes different reception configurations. Our phone attempt did not resolve that discrepancy.

Foreign Cinema needs a followup through its private dining inquiry route. The voicemail identifies the information to prepare, and the official site provides a [private dining contact page](https://foreigncinema.com/private-dining-contact/).

A fair price or availability comparison needs the same date, approximate guest count, seated dinner versus reception format, and privacy requirement for all three. Ask each events team for a written proposal that separates the food and beverage minimum, room fee, service charge, tax, other surcharges, deposit and cancellation terms. Waterbar and EPIC publish [event FAQs](https://www.waterbarsf.com/faq/) and [event terms](https://www.epicsteak.com/faq/), but the proposal should identify the terms applying to your event.

## From research to a stock answer or a confirmed reservation

The October 3 private dining experiment ended with unanswered questions. Two separate customer calls published October 6 show more concrete outcomes: staff checked an exact product, and a restaurant confirmed a table. Their initiating clients are unknown. They do not establish new Codex or Claude Code sessions, or that either customer used web research before calling.

They do give you useful examples of the evidence to request when your own research reaches the phone step:

| Task | Research to prepare before your own call | What the recorded customer call established | What it did not establish |
|---|---|---|---|
| Check a shortlisted product | Exact product, required features, store location and published number | Macy's staff checked a black silk bow tie, reported 88 available at $33, and described the finish and adjustable strap | No purchase or hold. Price and stock apply to the October 6 conversation |
| Turn an evening plan into a reservation | Restaurant, complete date, guest count, acceptable times and booking terms to ask about | Staff confirmed a table for four on October 8 at 7:30 PM | No cancellation terms were confirmed, and no attendance is established |

Listen to the [Macy's inventory call and read its transcript](/blog/macys-bow-tie-stock-check), or the [dinner reservation call and transcript](/blog/book-dinner-reservation-by-phone). The recordings remain on their source pages so you can inspect the complete conversation and its limits.

### Stock research brief

> Read the official product page for [item] and confirm the exact model, required features and store location. List the questions the page does not answer. Call the store's published number to check local stock, price and those details. Do not buy, hold or accept a substitute. Return a table separating the website's claims from staff's answers, with the date checked and anything still unresolved.

The Macy's caller asked about the finish and fastening, not just whether a black bow tie existed. That distinction matters when a substitute would fail your original requirements. A staff stock answer also does not turn into a pickup reservation unless somebody actually agrees to hold the item.

### Research with permission to book

> Continue the evening plan using the restaurant we selected. Check its official booking instructions, then call if the requested table still needs confirmation. Book [party size] on [full date] at [preferred time], accepting only [allowed alternatives]. Use the name and callback details I supplied privately. Ask about deposits and cancellation terms, and ask me before agreeing to a charge. Return the date, time and party size staff confirmed, plus any missing terms, before building the rest of the plan around it.

Here the change from research to booking is explicit permission, a complete date and a defined party size. Our original private dining inquiry had none of those booking facts, so its unknown availability must stay unknown. For an appointment rather than dinner, use the [personal assistant booking brief and confirmation checklist](/blog/ai-personal-assistant-appointment-booking).

In the final answer, keep three columns: **website facts**, **phone confirmation** and **remaining action**. That lets your assistant carry a real answer back into the plan without turning availability into a booking or an unanswered question into a guess.

## What to check in your own agent's result

An MCP connection is useful when the evidence returns to the task you started. Check three things:

1. **Source:** did the agent dial the number published by the actual business, and identify whether a human, automated system or voicemail answered?
2. **Authority:** did the caller stay within your instructions, including leaving dates and headcounts unknown when you had not supplied them?
3. **Result:** does the final table distinguish online facts, phone statements, unanswered questions and the agent's conclusions?

Keep reading `call4me_get_call` while a call is active. If the caller posts an open question, answer through `call4me_answer_question` using what you know or ask the user. EPIC's call did post a question about whether a guest estimate existed. By the time Codex submitted the answer, the call had ended. The tool reported that rather than delivering the answer. This attempt demonstrates a late answer failure, rather than a successful conversation with the user in the loop.

Another observed limitation: both callers introduced themselves as the account owner's assistant using the saved profile name, despite the brief asking them not to share profile data. We muted that name in the public recordings. Keep the caller's identity separate from research facts, and check the actual introduction when disclosure matters to your task.

We tested Codex CLI 0.160.0 and Claude Code 2.1.288. The live calls used an existing account's OAuth connection at the supported legacy endpoint. Separate fresh sessions successfully ran an authenticated balance check at the current `https://call4.me/mcp` endpoint with the account's API key. Neither test establishes every desktop, cloud or T3 Code surface.

To reproduce the setup, use the [Codex phone calling guide](/blog/codex-phone-calls) or [Claude Code phone calling guide](/blog/claude-code-phone-calls). If you are choosing a service, our [calling MCP comparison](/blog/phone-calling-mcp-comparison) covers the documented setup and result loops. The [voice architecture article](/blog/cascaded-voice-stack-vs-gpt-live) explains what happens behind that interface.

You can [connect call4me to your existing agent](/mcp), then give it one real research gap to resolve. An honest unanswered question is a useful result when it identifies what you need to ask next.
