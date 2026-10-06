---
title: "How to use Meta Muse: a first task with a useful result"
seoTitle: "How to use Meta Muse: your first useful task"
subtitle: Give Muse a small research job with a clear finish line. This library comparison includes the exact prompt, a sourced reference answer and a checklist for judging the result.
description: A practical first Meta Muse task with a complete prompt, official sources, downloadable reference report and clear checks for accuracy before adding phone calls.
date: 2026-10-05
tags: meta muse, ai agents, research, muse use cases
authors: nick
imageAlt: A Meta Muse first task moves from a clear request through official sources to a usable comparison
---

**Give Meta Muse one decision to help with, the facts it should use, and the result you want back.** For a first task, compare something you can verify without connecting your inbox or authorizing a purchase. A table with sources and open questions is a useful finish line.

Our example is concrete: compare three San Francisco libraries for an adult working on a personal laptop from 2 pm to 5 pm on Tuesday, October 6, 2026. We researched the official pages on October 5 and provide a reference answer below. This is an independently researched tutorial, not a completed Muse session or a record of a library visit.

Meta [describes Muse](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) as a personal agent with a dedicated cloud computer and browser. Public research is a sensible first use case because the sources are visible and the decision has a narrow scope. The consumer Muse app and Muse Code have different integration paths; this walkthrough concerns the consumer agent.

## Start with this exact request

Open Muse and send the following. The prompt is also available as a [complete text download](/static/blog/resources/meta-muse-first-task/first-task-prompt.txt).

> Compare Main Library, Chinatown/Him Mark Lai and Mission Bay in San Francisco for one adult working on a personal laptop Tuesday October 6, 2026, from 2 pm to 5 pm Pacific. Use current official SFPL pages for address, Tuesday hours, WiFi and any study room rules. Return a compact sourced table, unresolved questions, and a conditional recommendation based on hours, without inventing my starting location. Do not sign in, book, call, contact anyone, submit a form or spend money. Start with https://sfpl.org/locations/main-library, https://sfpl.org/locations/chinatown, https://sfpl.org/locations/mission-bay and https://sfpl.org/services/meeting-rooms/study-rooms. If a page cannot load, label it unavailable instead of assuming.

This request supplies the day, time, activity and comparison set. It leaves travel distance unknown because no starting location was supplied. It also defines what completion means: return the evidence and a conditional choice.

## The reference answer to compare against

These are regular published Tuesday hours, checked October 5. They establish that the requested window fits the schedule. They do not confirm a seat, a quiet room or an exceptional closure on the chosen date.

| Location | Address | Published Tuesday hours | Does 2 pm to 5 pm fit? |
| :--- | :--- | :--- | :--- |
| [Main Library](https://sfpl.org/locations/main-library) | 100 Larkin Street | 9 am to 8 pm | Yes, based on regular hours |
| [Chinatown/Him Mark Lai](https://sfpl.org/locations/chinatown) | 1135 Powell Street | 10 am to 8 pm | Yes, based on regular hours |
| [Mission Bay](https://sfpl.org/locations/mission-bay) | 960 4th Street | 10 am to 6 pm | Yes, based on regular hours |

All three cover the requested afternoon. Main and Chinatown have two more hours after Mission Bay closes. If you might continue past 6 pm, that is a reason to favor either of them. If you will finish at 5 pm, hours alone do not select a winner. Your starting location and the conditions you need would decide the next step.

### A study room is a separate question

SFPL's [study room policy](https://sfpl.org/services/meeting-rooms/study-rooms) says rooms are available in person when free, with no reservations accepted. It also says they are not intended for use lasting multiple hours. The page lists Main and Mission Bay among locations with rooms. Chinatown does not appear in that list; this alone does not prove it has no other seating options.

A three hour laptop session therefore should not assume exclusive use of a study room. Ask for general seating guidance or plan around open seating. Do not ask Muse to reserve a room through a form when the published policy rules out reservations.

### WiFi needs an honest gap

The [Main Library page](https://sfpl.org/locations/main-library) links to WiFi information. During our research, that [official FAQ](https://sfpl.libanswers.com/faq/88545) returned a rate limit response. SFPL's [membership page](https://sfpl.org/free) mentions WiFi, but that does not establish the guest login procedure, a guaranteed speed or an available outlet at every seat.

Those details remain unknown in the reference report. A sentence like “all locations have reliable video call WiFi and plentiful outlets” would go beyond our sources. The requested activity is quiet laptop work; permission to take a business call inside the library is a different question.

## Download the whole task, including its finish line

Use the [reference report](/static/blog/resources/meta-muse-first-task/reference-report.md) to check the returned table. The [structured reference data](/static/blog/resources/meta-muse-first-task/reference-data.json) preserves sources, observation date and unresolved fields for reuse. These files contain the researched example, not a transcript generated by Muse.

Before accepting an answer, check:

1. Every location matches the actual branch page, including its own hours rather than a different branch in the site's navigation.
2. The agent uses Tuesday hours and the Pacific time window supplied in the prompt.
3. Its recommendation follows from the cited facts. “Closest” requires a starting location; “quietest” needs evidence beyond opening hours.
4. Missing facts remain missing. A failed page fetch should not turn into a confident claim.
5. Research remains research. There should be no booking confirmation, outgoing message or call in this task.

If a result fails one of these checks, name the specific problem and ask for a corrected report. For example: “The Mission Bay row used Wednesday hours. Reopen its branch page and fix Tuesday, then update the recommendation.”

## Add a phone only when the missing fact matters

Suppose outlet access becomes essential. A precise followup would be to ask whether adults can use their own laptops in general seating and whether any areas have power outlets. That is a research gap worth considering for a call. It still does not authorize booking a room or sharing your contact details.

Meta's [connector documentation](https://www.meta.com/help/artificial-intelligence/1687253048996149/) explains supported connections and custom connectors. Our [Muse phone connection guide](/blog/meta-muse-ai-agent-phone-calls) records an authenticated balance check; it does not establish a completed Muse business call or dependable reuse in every later conversation. Check the current connection before assigning a call.

For an executed example of research plus calling, our [private dining comparison](/blog/agent-web-research-phone-calls-sf-private-dining) includes recordings from Codex and Claude Code and the questions those calls left unanswered. For business research, use the [Muse supplier comparison brief](/blog/meta-muse-supplier-quotes). For reusable task structures and client differences, see [Grok Bot templates](/blog/grok-bot-templates) and [Grok Bot versus Muse](/blog/grok-bot-vs-meta-muse).

The useful first result is a decision you can inspect: three options, sources for their published facts, and a short list of what still needs checking.
