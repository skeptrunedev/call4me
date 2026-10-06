---
title: "How to use Meta Muse for your first informational phone call"
seoTitle: "How to use Meta Muse for a first phone call"
subtitle: Hear Muse use Call4me to ask a library about laptop seating, outlets and guest WiFi. Includes the actual recording, a bounded call brief and the limits of the answers.
description: Hear our actual Meta Muse phone call to a library through Call4me. Includes saved connector reuse, the recording, transcript and a reusable call brief.
date: 2026-10-05
updated: 2026-10-06
tags: meta muse, ai agents, phone calls, muse use cases
authors: nick
imageAlt: A first Muse phone task moves from a verified branch number through one approved call to sourced answers
---

**Use Meta Muse for one small informational phone call: ask a library whether its general seating fits your laptop session.** Published hours establish when it opens. A conversation can clarify where adults can work, where to find outlets and how guests access WiFi. The result should identify who answered and what they could actually confirm.

On October 6, 2026, we ran this task in consumer Muse through the saved Call4me connector. A fresh conversation returned a successful balance check, placed one Main Library call, followed its status and retrieved its transcript and recording metadata. A staff member answered the laptop, outlet and WiFi questions. You can hear the complete call below.

This establishes the tested Muse conversation's calling workflow. It does not test Muse's native calling feature or establish reliability in every future conversation. The [connection guide](/blog/meta-muse-ai-agent-phone-calls) separates the original setup, an earlier delivery problem and this successful reuse.

Use the [one call brief](/static/blog/resources/meta-muse-first-task/call-brief.md) to choose a branch and record its answers. It contains the exact questions, approval boundary and empty outcome fields.

## What the actual Muse call established

We checked the Main Library's [published number and Tuesday hours](https://sfpl.org/locations/main-library), then approved one informational call to (415) 557 4400 with a four minute limit. It began at 4:22 pm Pacific on October 6. No visit date, reservation, purchase, voicemail or callback was requested.

Muse returned call ID `call_pk4x8psku92xtb48`. We independently matched that ID to the completed Call4me record and its exact provider recording. The saved request retained the four minute cap. Muse used `call4me_get_call` to follow the same call and `call4me_get_recordings` to retrieve the available recording metadata.

| Question | What the staff member said | What remains unverified |
| :--- | :--- | :--- |
| Can an adult quietly use a personal laptop in general seating? | Yes | A particular seat or a future visit's conditions |
| Where is seating with outlets? | Floors three, four and five | Whether an outlet will be free when you arrive |
| Does guest WiFi need a password or library card? | No password; anyone can use the WiFi | Device login screens, signal quality and speed were not tested |
| Are there noise rules or seating time limits? | The response was no, followed by “Just keep volume low” | This brief answer is not a complete review of library policy |

The caller began asking whether a card was needed for WiFi “or for just” before being interrupted. The staff member's clear followup concerned WiFi. **The automated recap extended that answer to seating; we do not treat the recording as separate confirmation of the seating card rule.** The spoken network name was transcribed as SFPL Library WiFi, with one letter differing between transcriptions. We did not verify an exact network label on a device.

Download the [dated execution report](/static/blog/resources/meta-muse-first-task/executed-result-2026-10-06.md) or [structured result](/static/blog/resources/meta-muse-first-task/executed-result-2026-10-06.json). These contain the observed result; the blank brief and worksheets remain reusable preparation materials.

## Hear the actual Muse library call

The complete recording lasts about 1 minute 49 seconds. It includes the library menu, transfer, staff conversation and goodbyes. Original voices and timing are retained, with loudness normalization. No private identifying speech was found in the saved transcript and two independent source transcriptions, so no mute spans were applied. Two further transcriptions of the exported recording and decoded duration checks were reviewed. This is a transcription based review, not a claim of human listening verification.

<audio controls preload="metadata" src="/static/blog/muse-main-library-laptop-seating.mp3" style="width:100%"><a href="/static/blog/muse-main-library-laptop-seating.mp3">Listen to the complete Muse library call</a></audio>

<details>
<summary>Recording transcript</summary>

This transcript combines independent speech transcriptions with the saved call text. Short overlapping acknowledgments and uncertain words are marked. The recording is the primary evidence.

**0:00** Library recording: Thank you for calling the San Francisco Public Library. Please listen carefully to the following options so we can direct your call to the appropriate department. For the hours and location of the main library, press one. For main library reference desk, press two. To speak to library staff, press three. For information about community meeting rooms, press four. To renew library materials by phone or get help with your account, press five. To speak with staff in community programs and partnerships, including public affairs, press six. To repeat, press nine. To go back, press star.

**About 0:37** Caller: [Brief interjection rendered as “Hmm” in the saved call text; omitted by both full recording transcriptions.]

**0:37** Library recording: Thank you for calling the San Francisco [remaining words unclear]. Wait while I transfer your call.

**0:48** Staff: Library information.

**0:51** Caller: Hi, I have a quick question about visiting the main library. Can an adult quietly use their own laptop in general seating during open hours?

Staff: [Brief acknowledgment.] Yeah, of course.

**1:02** Caller: Perfect. And do you know where the seating with power outlets is in the main branch?

**1:07** Staff: Upper floor, three, four and five.

**1:11** Caller: Great, thanks. How does the guest WiFi [overlap and unfinished question].

Staff: [Overlapping acknowledgment, rendered “Sure, you're welcome” in the saved call text.] There's no password.

**1:18** Caller: Okay, is a library card needed for WiFi or for just [interrupted]?

Staff: No.

Caller: Okay.

**1:23** Staff: No, anyone can use our WiFi. [Network name spoken as SFPL Library WiFi; one letter is uncertain between transcriptions.]

**1:27** Caller: Got it. Are there any current restrictions I should know about, like noise rules or time limits on seating?

Staff: [Brief acknowledgment.] No. Just keep volume low.

**1:38** Caller: That's helpful. Thank you. That's all I needed. Thanks so much.

Staff: Sure. You're welcome.

**1:44** Caller and staff: [Exchanged and overlapping goodbyes through about 1:47.]

</details>

The menu transferred to a person, but the recording alone does not prove which keypad digit was sent. Nothing was booked or held, and no seat or future WiFi conditions were guaranteed. Muse also reported saving the findings in its memory; we did not independently audit that storage or future recall.

## Choose the branch and the question before dialing

Supply your branch, visit date, local time window and the facts that matter. The preparation assets preserve an illustrative Tuesday, October 6 window from 2 pm to 5 pm Pacific. Replace that historical example with your actual upcoming visit date and check that day's current schedule. Do not ask the caller to invent your location, guarantee a seat or reserve a room.

| Branch and official number source | Published phone | Regular Tuesday hours |
| :--- | :--- | :--- |
| [Main Library](https://sfpl.org/locations/main-library) | (415) 557 4400 | 9 am to 8 pm |
| [Chinatown/Him Mark Lai](https://sfpl.org/locations/chinatown) | (415) 355 2888 | 10 am to 8 pm |
| [Mission Bay](https://sfpl.org/locations/mission-bay) | (415) 355 2838 | 10 am to 6 pm |

These are the numbers on the respective official pages. Recheck the selected branch's own page before the call. Regular opening hours do not confirm staffing, special closures or seating availability for a particular visit.

SFPL's [study room policy](https://sfpl.org/services/meeting-rooms/study-rooms) already answers one question: rooms cannot be reserved, require signing in in person when available, and are not intended for use lasting multiple hours. Main and Mission Bay appear on its room list. A three hour session should therefore ask about general seating, without requesting an exclusive room.

The Main page links to an [official WiFi FAQ](https://sfpl.libanswers.com/faq/88545) that returned a rate limit response during our research. Guest access steps and outlet locations remained unanswered. Those are specific questions for the call, rather than claims to fill in from memory.

## Check Muse's phone connection with a harmless read

Meta [documents](https://www.meta.com/help/artificial-intelligence/1687253048996149/) supported connectors and asking Muse to create custom connections. Use the [consumer Muse setup guide](/blog/meta-muse-ai-agent-phone-calls) if Call4me is not connected. Enter credentials through its connection flow, then ask for `call4me_get_balance` without placing a call.

Continue only when that request returns an authenticated result and Muse can discover the current calling tools. A connector card or a saved skill claim is insufficient. If the message itself is not delivered, solve that separately before asking for a call. The consumer Muse integration described here differs from [Muse Code's native MCP path](/blog/muse-code-mcp-phone-calls).

Use the [connection and result worksheet](/static/blog/resources/meta-muse-first-task/connection-check.md) in the conversation where you intend to call. Record whether the balance request ran there, rather than copying the result from an earlier chat. If delivery is unconfirmed or the connector errors, leave the call ID empty and stop before dialing.

## Send the task, then approve one specific call

This [complete prompt](/static/blog/resources/meta-muse-first-task/first-task-prompt.txt) includes preparation, access checks and the approval boundary. Replace the bracketed inputs before using it:

> I want one informational library call through Call4me. My chosen branch is [branch], my visit date is [date], and my quiet laptop work window is [local start and end time with timezone]. Read that branch's official SFPL page to verify its number and hours, and read the study room policy. Check Call4me access with a balance request, without dialing. Prepare questions about adult general seating for a personal laptop, outlet locations and guest WiFi login. Do not ask for a guaranteed seat, a room reservation or permission to take a business call inside the library. Show me the selected branch, published number and source, exact questions, caller identity from my profile and a four minute call limit. Ask for approval of that single call and wait. After I approve, check the current general category requirements, use the live tool schema and call once with call4me_place_call.max_minutes set to 4. Do not reserve, buy, leave voicemail, arrange a callback or share contact details beyond the identity I approved. Follow the same returned call ID with call4me_get_call until the call ends, collect its transcript and retrieve available evidence with call4me_get_recordings, and return who answered, each answer, unresolved questions and the result links. If access or call delivery fails, report that failure without claiming an answer.

The caller identity matters because an account may have a saved calling profile. Inspect it before approval. Our [recorded research calls](/blog/agent-web-research-phone-calls-sf-private-dining) showed callers introducing the profile owner's name even when a brief sought to avoid sharing it. A prompt alone should not be treated as a verified privacy control.

Download the [prepared call brief](/static/blog/resources/meta-muse-first-task/call-brief.md) to keep the questions and scope next to your result. After you approve the branch, identity, questions and limit, the intended sequence is:

```text
call4me_get_balance, with no call authorized
Read the selected branch's official number and hours
Show the call plan and wait for approval
call4me_get_requirements(category: "general")
call4me_place_call using the current schema and max_minutes: 4
call4me_get_call until the call has ended
Retrieve the available transcript and recording
Return confirmed answers and open questions
```

This is the reusable workflow. The dated test above records our actual execution. Your requirements check may reveal missing information. Resolve that before dialing, without silently expanding the authorized task.

## Judge the answers, not just the completed status

The useful final report separates three kinds of information:

| Evidence | What it establishes | What it does not establish |
| :--- | :--- | :--- |
| Official branch page | Published number and regular hours | A seat or outlet available at your arrival |
| Human or automated phone answer | What that respondent said about the questions | A reservation or a guaranteed future condition |
| Voicemail or unanswered call | Which route was reached | An answer to the laptop questions |

Ask for the transcript evidence supporting each phone answer and a recording link if available. A general statement about outlets should identify where the respondent said to look. A WiFi answer should distinguish a login instruction from a measured speed. If someone cannot answer, keep that question open.

The [reference report](/static/blog/resources/meta-muse-first-task/reference-report.md) and [structured preparation data](/static/blog/resources/meta-muse-first-task/reference-data.json) preserve the earlier official source baseline and empty template outcome fields. The separate [October 6 execution report](/static/blog/resources/meta-muse-first-task/executed-result-2026-10-06.md) contains the actual call findings.

Use this result prompt after the attempt:

> Inspect the same Call4me call ID we started. Separate call status from task outcome. For each library question, give the answer, who supplied it and the supporting transcript passage, or mark it unanswered. Link the available recording. Do not treat a menu, voicemail or completed status as a staff confirmation. If the call is still active, say so. If a tool timed out, check that ID again without placing another call.

## Move from an informational call to an authorized task

A successful access check is one step. An answered library question is another. Neither authorizes booking something later. Before asking Muse to take action, define the acceptable alternatives, the information it may share and the result you need.

Our [recorded dinner reservation](/blog/book-dinner-reservation-by-phone) shows a confirmed date, time and party size, with cancellation terms still unknown. The [doctor appointment replacement](/blog/reschedule-doctor-appointment) shows why checking the old slot matters: it was already canceled before the call. Those are approved customer examples with an unknown assistant client, not Muse tests.

Use the [appointment brief and confirmation checklist](/blog/ai-personal-assistant-appointment-booking) for that next task. Keep this library brief informational, and start a separate approved booking brief when you are ready to commit.

Before accepting a result, check that the caller reached the branch you approved, stayed within the questions and action limits, and returned a supported answer or an honest unanswered question. No booking confirmation should emerge from an informational seating inquiry.

For several business calls with a shared specification, use the [Muse supplier phone brief](/blog/meta-muse-supplier-quotes). For repeatable calling tasks, see [Grok Bot templates](/blog/grok-bot-templates), [reusable skills](/blog/grok-bot-reusable-skills) and [template troubleshooting](/blog/grok-bot-template-troubleshooting). The [Grok Bot versus Muse comparison](/blog/grok-bot-vs-meta-muse) explains the client differences.
