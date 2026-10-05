---
title: "Can your AI assistant navigate phone trees? Vapi, Bland and Call4me evidence"
seoTitle: Phone trees for Claude Code and Codex, real call evidence
subtitle: A phone menu, a successful keypad press, and a completed task are different results. Here is how to configure, diagnose, and test each step.
description: Get your existing AI assistant through business phone menus. Claude Code and Codex calling workflows, keypad evidence, voicemail and real Vapi, Bland and Call4me recordings.
date: 2026-10-04
tags: ai phone assistant, ivr, dtmf, vapi, bland, mcp, claude code, codex
authors: nick
imageAlt: A phone menu routes through keypad input to either a person or voicemail, with separate checks for routing and task completion
---

**AI callers can navigate some phone trees. Reaching the right branch does not prove they handled what came next.** Our Vapi Agent Phone and Bland calls both reached Foreign Cinema's private dining voicemail. One spoke after the greeting despite instructions to exit silently. The other needed Codex to stop the call.

That distinction matters when your existing Claude Code, Codex or personal assistant session needs to cancel a subscription, change an appointment or confirm availability. Its calling service needs to choose the menu option, send a real keypad input, recognize the destination and follow the right instruction when nobody answers. Your original assistant needs the answer or confirmation back in its task.

We make Call4me. This guide separates current configuration documentation from our recorded calls on **October 3 and 4, 2026**. The calls are individual cases with different briefs and dates, rather than a controlled provider benchmark. They establish particular routing outcomes, not success rates or a winner.

For connection instructions and account requirements, use our [phone calling MCP comparison](/blog/phone-calling-mcp-comparison). This guide focuses on what to inspect after a calling tool connects.

## Choose the department for the task your assistant is doing

The right route depends on what you need to finish. In our [Fubo cancellation inquiry](/blog/cancel-fubo), asking for a human and choosing customer service reached a representative who explained cancellation and verification. We gathered information without changing an account. In our [private dining research](/blog/agent-web-research-phone-calls-sf-private-dining), reaching the events office mattered more than reaching the restaurant's main line, and restaurant opening hours did not establish events staff availability.

Give the caller the task, the information it can share, the changes you authorize and what to do at voicemail. A menu result should return to the same assistant with the department reached, who answered, the actual answer and the remaining steps. For cancellation briefs you can adapt, see our recorded [Audible inquiry](/blog/cancel-audible) and [Planet Fitness inquiries](/blog/cancel-planet-fitness).

### The business's IVR and your outbound caller

IVR means interactive voice response. An AI IVR handles a business's incoming calls through conversation, routing or automated answers. [Bland's AI IVR explanation](https://www.bland.ai/blog/ai-powered-ivr) describes that receiving side of the phone system.

Our examples follow the caller's side: an outbound AI agent listens to the destination's menu, selects a route and checks what answered. A traditional menu may require keypad inputs; a conversational system may accept speech. Match the caller's action to what the destination actually requests. The recordings below show the menu and mailbox boundaries we observed.

## What counts as successful phone tree navigation?

A useful call report answers these questions separately:

| Question | Strong evidence | What does not establish it |
|---|---|---|
| Did the caller understand the menu? | The selected department matches an option actually announced | A plausible department guessed before listening |
| Did it send a keypad input? | A native action result, such as a recorded button press | Saying it will press two, or submitting a setting that permits DTMF |
| Did the destination accept the input? | The receiving menu logs acceptance, or the recording reaches an identifiable destination | A successful send action alone |
| Did it reach a person? | A live conversation at the intended department | A network status of answered, a greeting, or voicemail |
| Did it complete the original task? | A specific answer or confirmation supported by the conversation | Reaching the department or listening to recorded policy |
| Did it obey the voicemail policy? | The ending action and recording support the requested behavior | A setting named off, without checking the actual ending |

For a business menu you do not control, destination audio may be your best evidence of routing. For a test line you own, log both the caller's action and the receiver's accepted digit. Those records let you distinguish a model choosing the wrong option from the telephone route losing a correctly chosen input.

## DTMF is a telephone input, not spoken dialogue

DTMF means the keypad signaling a phone system recognizes. An agent saying “two” is different from sending the keypad input for two. Speech can work when a menu explicitly accepts spoken choices, but it does not demonstrate keypad navigation.

Keypad signals can also travel separately from ordinary voice audio. [RFC 4733](https://www.rfc-editor.org/rfc/rfc4733) defines telephone events carried in RTP packets. Consequently, the absence of an audible keypad tone in a recording does not by itself prove that no input was sent. Conversely, hearing a tone does not prove the destination accepted it.

When diagnosing a failed branch, keep three pieces of evidence: the option as announced, the submitted keypad action, and the next prompt or destination. If your hosted calling tool does not expose a native action log, report that missing evidence instead of filling it in from the transcript.

## Voicemail detection and IVR settings that change the result

Read the schema exposed by the integration you actually connected. A platform's developer API and its hosted agent product can offer different controls.

### Bland: IVR mode changes voicemail handling

Bland's [Send Call reference](https://docs.bland.ai/api-v1/post/calls) documents `ivr_mode: true` for menu calls. It changes conversational timing and makes the effective voicemail action `ignore`, even if the request asks for `hangup`.

**A menu can lead to voicemail.** Do not assume that enabling IVR mode and requesting voicemail hangup guarantees a silent exit after routing. Write the destination policy into the task and verify it in the recording. If the coding agent must intervene, record that intervention separately from automatic behavior.

These are the relevant fields from our October 4 request, not a complete request to dial:

```json
{
  "ivr_mode": true,
  "record": true,
  "max_duration": 3,
  "voicemail": { "action": "hangup" }
}
```

The reference also documents `precall_dtmf_sequence` for fixed digits, with `w` representing a half second pause. Our call omitted that field. The agent had to choose from what it heard. These are different tests: executing a supplied sequence versus selecting an announced option.

In our discovered Bland MCP schema, the compact `create_call` tool did not expose every setting. We used `call_bland_api` to submit the documented call body. Inspect the current tool schema before relying on recording or duration controls.

### Vapi Agent Phone: inspect its own call contract

Our October 4 Agent Phone request used `dtmf: "auto"` and `voicemail: "off"`. The recording still needs to establish what happened; the submitted fields are not completed transport actions.

The current [Agent Phone schema](https://phone.vapi.ai/openapi.json) permits automatic keypad selection or an exact digit sequence. An exact sequence constrains allowed inputs rather than scheduling them immediately on connection. It does not support the `w` or `W` pause characters used by some developer integrations. The schema describes voicemail off as a silent mailbox exit. We reviewed this contract on October 4; it is not proof that an earlier call complied.

### Vapi developer assistants: detection and ending are separate

Vapi's [IVR navigation guide](https://docs.vapi.ai/ivr-navigation) recommends waiting for menu options, avoiding overlapping speech, and testing digit spacing and the telephone transport. Those developer controls should not be copied into an Agent Phone request unless its schema supports them.

For a developer assistant, Vapi's [Voicemail tool](https://docs.vapi.ai/tools/voicemail-tool) separates assistant driven detection from automatic detection. Its silent ending mode uses an empty tool messages array and an empty assistant `voicemailMessage`. The assistant still has to recognize the mailbox and invoke the tool. Check both detection and termination when testing this configuration. Our recorded Agent Phone case did not test a custom developer assistant with this tool.

## Diagnose the stage that failed

Changing the entire prompt after every unsuccessful call makes it hard to discover the cause. First identify which stage lacks evidence.

| Observed behavior | What to inspect next |
|---|---|
| The menu repeats and no keypad action is returned | Whether the calling integration exposes and enables keypad control; do not assume spoken digits exercised it |
| A keypad action is recorded but the same menu repeats | Digit timing, terminators such as pound, and the receiver's accepted input if you own the line |
| The caller reaches a recorded policy instead of a person | Whether its chosen option matches the goal; a refund explanation is different from submitting a refund |
| The correct department's voicemail answers | Mailbox detection, the actual ending instruction, and any IVR setting that changes voicemail policy |
| The caller talks during the greeting or hold audio | Whether waiting is treated as silence or as a conversational turn; inspect idle speech as well as the main prompt |
| The tool reports unknown while the call is queued | Provider queue state and connection time; avoid creating another call just because artifacts are not ready |
| A call ends, but the task is unresolved | The last destination, unanswered question, and who ended the call; return an explicit incomplete result |

Avoid guessing an operator shortcut or repeatedly trying digits after a route fails. Listen for an announced alternative. Retrying the input within the same connection and redialing are different actions; give each an explicit limit when you authorize a task.

### A prompt for a bounded menu check

Use this after connecting your calling service and confirming the intended number. It is a task brief, not a guarantee of provider behavior:

> Make one informational call to the approved number. Listen to the menu and select the announced option for the requested department using the calling service's keypad capability. Do not assume an extension that was not supplied or announced. Stay silent during menu prompts and transfer pauses. Identify the destination from its actual greeting. If it is the requested department's voicemail, end immediately without speaking, leaving a message, or arranging a callback. If a person answers, identify yourself as an AI assistant and ask only the approved question. Do not book, buy, or change an account. Report the destination, any returned keypad action, whether a person answered, the answer if obtained, and anything unresolved. Do not redial automatically.

For a normal research task, change the ending rule to match what you want. A request to identify a branch should end upon identification. A request to obtain information should continue only with someone or something capable of supplying that information.

## What our real calls establish

Foreign Cinema's [official private dining page](https://foreigncinema.com/private-dining/) lists extension two. In the October 4 Vapi Agent Phone and Bland requests, we supplied the destination task without a preset digit sequence. Both were instructed to identify private dining and then exit immediately and silently, without asking business questions or leaving a message.

| Case | Keypad evidence | Destination evidence | Ending evidence |
|---|---|---|---|
| Vapi Agent Phone, October 4 | Automatic DTMF requested; no native keypad event returned | Private dining voicemail in the recording | Caller waited through the greeting and spoke afterward; silent exit failed, mailbox message outcome unknown |
| Bland, October 4 | Native log recorded `Pressed Button: 2` | Private dining voicemail in the recording | Codex explicitly invoked `stop_call`; final log recorded `call_ended_by: USER` |
| Call4me from Claude Code, October 3 | No native keypad action established in this published case | Private dining voicemail in the recording | The earlier research task remained unresolved; this different brief did not test immediate autonomous silent exit |

**Routing worked on these attempts. Autonomous silent exit is a separate requirement.** The table does not establish nested menu performance, hold behavior, or comparative reliability.

### Vapi Agent Phone: destination reached, ending instruction missed

<audio controls preload="metadata" src="/static/blog/phone-menu-foreign-cinema-vapi.mp3" style="width:100%"><a href="/static/blog/phone-menu-foreign-cinema-vapi.mp3">listen to the Vapi Agent Phone menu call</a></audio>

<details>
<summary>Read the Vapi Agent Phone evidence timestamps</summary>

These are selected points from the reviewed full 2:31 recording. Staff identifiers are muted in the export, with original timing preserved. The complete transcript is in the [MCP comparison](/blog/phone-calling-mcp-comparison).

**0:00** The main greeting announces main line and private dining choices, followed by restaurant information.

**0:59** Vapi through Agent Phone: Thanks. I'll stay quiet and wait for the private dining greeting.

**1:29** The destination greeting identifies Foreign Cinema Private Dining.

**1:36** The greeting identifies the events director's voicemail.

**2:27** Vapi through Agent Phone: Okay, I'll hang up now.

</details>

The destination establishes successful routing on this call despite the missing action trace. The spoken ending establishes that the caller did not exit silently. We did not hear a clear conventional voicemail beep, and we do not have the receiving mailbox record. Whether its final speech became a voicemail message is unknown.

### Bland: keypad action verified, Codex stopped the call

<audio controls preload="metadata" src="/static/blog/phone-menu-foreign-cinema-bland.mp3" style="width:100%"><a href="/static/blog/phone-menu-foreign-cinema-bland.mp3">listen to the Bland menu call</a></audio>

<details>
<summary>Read the Bland evidence timestamps</summary>

The full 1:08 export preserves the transfer pause and ends during the greeting. The staff name is muted. No caller speech is audible.

**0:00** The phone menu announces main line as option one and private dining as option two.

**0:44** The destination greeting identifies Foreign Cinema Private Dining, then the events director's voicemail.

The provider action record contains `Pressed Button: 2`. This is a keypad action, not a spoken line. Codex invoked `stop_call` while the greeting was playing.

</details>

The final log reports 68 seconds connected and `call_ended_by: USER`. That supports external stop control through MCP, rather than an automatic ending by the voice agent.

This request also spent roughly ten minutes queued before its reported start. An earlier request was canceled while still queued because our runner mistakenly applied its three minute deadline before connection. It returned no start time or transcript and is excluded from the routing result. Queue time and connected duration require separate clocks.

### Call4me: an earlier research call reached the same branch

<audio controls preload="metadata" src="/static/blog/sf-private-dining-foreign-cinema.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-foreign-cinema.mp3">listen to the Call4me menu call from Claude Code</a></audio>

<details>
<summary>Read the Call4me evidence timestamps</summary>

These are selected points from the reviewed October 3 recording, lasting 2:27. Names and private identifiers are muted, with original timing preserved. The [research walkthrough](/blog/agent-web-research-phone-calls-sf-private-dining) contains the full transcript and task context.

**0:08** The main menu announces private dining as option two.

**0:58** Call4me: Okay, I'm on it.

**1:30** The destination greeting identifies Foreign Cinema Private Dining.

**1:34** The greeting identifies the events director's voicemail.

**1:47** The voicemail requests a callback number.

**2:20** The greeting gives the events director's working days as Monday through Friday.

</details>

The Saturday call reached voicemail while the restaurant was open. General restaurant hours did not establish that the events team would answer. The desired room and price information remained unresolved. This different research brief and day cannot support a matched timing comparison with the October 4 calls, and the published evidence does not establish native keypad timing or mailbox receipt.

## A controlled test should include the receiver

These real cases expose a useful failure boundary, but they are insufficient for a reliability ranking. For a repeatable test, use an isolated line you control and preserve the same instructions across services.

| Fixture | What it isolates | Evidence to save |
|---|---|---|
| Two menu levels with changed announced option digits | Listening and branch selection rather than executing a memorized sequence | Prompt version, accepted digits and destination marker |
| A known transfer pause followed by hold audio | Silence while waiting and correct resumption | Receiver recording and timestamps for wait and response |
| The correct branch leading to a voicemail greeting and beep | Routing success followed by mailbox handling | Greeting start, beep, hangup, and any caller audio captured afterward |
| A deliberately repeated menu with an announced back option | Recovery from an unsuccessful route | Previous choices, recovery action and accepted destination |

Run repeated trials before reporting rates. Preserve submission time, connection time, destination time and ending time separately. Report absent action traces as absent. If the original task also requires an answer, use known synthetic facts at the destination and grade the answer separately from navigation.

**We have not completed this shared controlled benchmark.** Our separate [received voice experiment](/blog/openai-realtime-voices-phone-calls) used an isolated SIP fixture to score spoken dates and codes. It did not test public phone trees or compare these three calling products, so it cannot fill this evidence gap.

For your next call from [Claude Code](/blog/claude-code-phone-calls) or [Codex](/blog/codex-phone-calls), require an outcome with the destination, answer, and unresolved parts. A call reaching voicemail can still provide useful routing information. It should return as an incomplete research task when the needed answer was never obtained.
