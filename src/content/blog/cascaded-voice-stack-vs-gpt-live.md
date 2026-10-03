---
title: Cascaded voice stack vs GPT Live for phone calling agents
seoTitle: Cascaded voice stack vs GPT Live
subtitle: What changes when a phone agent hears and speaks directly, delegates work to a separate reasoner, and has to get through a real phone menu.
description: Compare STT, LLM and TTS pipelines with GPT Live for phone agents. See the reasoner setup, telephone playback, IVR support and a repeatable test method.
date: 2026-10-03
tags: ai voice, mcp, phone calls, claude code, codex
authors: nick
imageAlt: Cascaded voice stack and GPT Live compared for phone calling agents
---

**A cascaded voice stack gives you separate speech recognition, language model and speech synthesis components. GPT Live handles the audio conversation and delegates task work to a separate backend.** On a phone call, either design still needs playback control, keypad delivery and a way to check whether the task actually succeeded.

If you use Claude Code, Codex or T3 Code and want your existing agent to make phone calls, there are two decisions. One is how the phone conversation works. The other is how your agent starts the call, provides context, answers questions during it and receives the result. An MCP connection handles that second interface. It does not determine the voice architecture behind it.

We use native GPT Live audio with a separate Responses reasoner in call4me. This article explains that implementation and the tradeoffs we would test against a streaming cascade. We have not run a controlled comparison showing that our stack is faster, cheaper or more reliable than Vapi, Bland or a custom cascade.

## What a cascaded voice stack does

A cascade turns incoming speech into text, passes that text to a language model, then turns its reply back into speech:

```text
Phone audio → speech recognition → text model → speech synthesis → phone audio
                                     ↓
                                  tools
```

STT means speech to text. TTS means text to speech. Those text boundaries let you inspect what the recognizer heard, what the model generated and what the synthesizer was asked to say. They also let you replace a component independently. Vapi documents this design as its transcriber, model and voice pipeline. [Vapi core models](https://docs.vapi.ai/quickstart)

A competent cascade streams between stages. It can consume partial recognition results and begin speech synthesis before the entire reply has been generated. Comparing GPT Live against a pipeline that waits for every stage to finish would tell you little about a well configured alternative. [LiveKit's streaming pipeline explanation](https://livekit.com/blog/sequential-pipeline-architecture-voice-agents)

Choose a cascade when you need to control those separate components. For example, you may need a particular speech recognition vocabulary, a text filter before speech synthesis, or a voice provider that your customers already use. The additional interfaces become part of your debugging work: which text arrived, when it arrived, and whether a canceled reply was still waiting to play.

## What changes with GPT Live

GPT Live receives audio and produces speech directly. It can listen while speaking and keep the conversation going while a backend handles reasoning and tools. OpenAI distinguishes the live conversation instructions from the backend's task procedures. [OpenAI's GPT Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting)

Our configuration looks like this:

```text
Phone audio ⇄ GPT Live
                 ⇅
          Responses reasoner → call controls and questions
```

The distinction matters for a question like “Can a speech model do useful tool work?” In our implementation, GPT Live manages the voice conversation, and the separate text reasoner chooses tools. Speech quality and task reasoning are related parts of the system, but they are not the same model selection.

| Decision | Cascaded stack | GPT Live with a separate reasoner |
|---|---|---|
| How speech reaches the task model | A recognizer supplies text | The live session supplies context to the reasoner |
| How replies become audio | A separate synthesizer speaks generated text | GPT Live generates the spoken conversation |
| Which components you replace | Recognizer, text model and synthesizer | Voice model and backend configuration |
| What still belongs to the application | Tools, permissions, task state and playback | Tools, permissions, task state and playback |
| What proves success | The task's actual outcome | The task's actual outcome |

OpenAI supports both managed Responses delegation and client delegation. With client delegation, an application runs its own backend and supplies the results. call4me currently uses Responses delegation. That is our implementation choice, rather than a requirement that every GPT Live application use our backend arrangement. [OpenAI's delegation guide](https://developers.openai.com/api/docs/guides/live-delegation)

## The configuration call4me actually uses

Our voice service configures `gpt-live-1`, a `gpt-5.5` Responses backend, and G.711 μ law audio at 8 kHz. This is the relevant part of the session configuration, with the prompts and tool definitions omitted:

```json
{
  "model": "gpt-live-1",
  "audio": {
    "format": { "type": "audio/pcmu", "rate": 8000 },
    "output": { "voice": "marin" }
  },
  "delegation": {
    "type": "responses",
    "responses": {
      "model": "gpt-5.5",
      "tool_choice": "auto",
      "parallel_tool_calls": false,
      "reasoning": { "effort": "low" },
      "text": { "verbosity": "low" }
    }
  }
}
```

The reasoner has a small set of call tools: press keypad digits, ask the user a question, connect the user to the call and end the call. It talks to the business through GPT Live. It does not have a generic booking database tool; when it books something, the business on the other end performs the booking.

Your Claude Code or Codex session remains the agent that requests the task through MCP. Installing call4me does not make your existing agent process every audio frame or become our Responses reasoner. It supplies the brief and permitted flexibility, checks the call, handles questions and receives the outcome.

That boundary helps you decide what context to pass. If the agent knows your preferred appointment window, put it in the call brief. If it needs your answer before accepting a different time, tell it to ask. A phone service cannot use relevant information that stayed in another agent's context.

Our [voice samples](/blog/openai-realtime-voices-phone-calls) use the same 8 kHz format. Those samples demonstrate voice output at that format. They do not measure telephone network delay or compare architectures.

## An interruption changes speech, a correction changes work

Imagine a caller asking for a Friday appointment, then saying “Actually, Thursday” while an availability lookup is running. There are two things to get right. The voice agent needs to hear the correction, and the task needs to use the corrected date.

Stopping the spoken reply does not undo a tool request. A progress message to the speaker does not, by itself, cancel work in the Responses backend. OpenAI explicitly separates steering the live model from changing backend work. [OpenAI's delegation guide](https://developers.openai.com/api/docs/guides/live-delegation)

For a service that writes bookings directly, a useful design is to give the task a revision, check that revision before committing a change, and return the authoritative result. If the user corrects the date after the booking already happened, handle that as a new change request. This is an application design recommendation, not a claim that a voice model supplies a transaction system.

For call4me's outbound caller, the equivalent outcome is on the business side. If a receptionist repeats the wrong date, the caller needs to correct it and get the right confirmation. Our test should check what the receptionist actually entered. Hearing the assistant say “Thursday” once is insufficient.

The same rule applies to slow work. Measure the time to the first useful answer and the completed task separately from the first acknowledgment. “Let me check” may help the conversation, but it is not the result.

## Why the phone can keep playing after the model stops

Generated audio passes through more than the model. In call4me, GPT Live output is forwarded to Telnyx. Some audio may already be waiting to play when the other person interrupts.

Our session tracks an estimate of queued playback from the length of the audio chunks. When incoming transcript activity arrives and our queue conditions indicate stale output, we send a `clear` message to the phone stream. That is a separate operation from the model responding to the interruption.

There is an additional detail: GPT Live sends audio output that includes silence. We use the decoded audio level to distinguish audible output from silent frames for parts of our call handling. Receiving another audio packet does not necessarily mean the assistant is speaking.

OpenAI's session guide also distinguishes transcript timing from audio playback. Output audio events do not provide a playback completion event, and a transcript fragment is not an exact marker of what a remote listener has already heard. [Managing GPT Live sessions](https://developers.openai.com/api/docs/guides/live-conversations)

To publish an interruption measurement, record the receiving endpoint. Capture when the interruption begins and when the previous reply stops being audible there. The time we sent `clear` is useful diagnostic evidence, but it is not the listener's measured experience. Our queue handling code establishes what we attempt to do; a recording establishes how well it worked on a particular call.

## Phone menus need more than a good voice model

IVR means interactive voice response, the system that says “press one for appointments.” DTMF is the keypad signal it expects. Saying “one” aloud does not satisfy a menu that listens for keypad tones. A menu that explicitly accepts spoken choices is a different case.

Our backend's `press_digits` tool sends actual keypad input. For +1 destinations, we use Telnyx's DTMF action. For other destinations, our implementation generates the tones in the call's audio. Before playing those tones, it clears queued speech and temporarily prevents new model output from overlapping them.

This gives us two delivery paths to test. It does not establish that every carrier route preserves the tones or that every menu accepts them. Our tool result says the keypad input was submitted and tells the reasoner to wait for the next prompt. A successful API request is not proof that the menu advanced.

We also track recent menu input and submitted digits. A repeated menu, invalid entry, or recorded policy that leaves the task unfinished can trigger another backend decision. The reasoner is instructed to choose announced routes, use an offered back option when necessary, and avoid repeating an unsuccessful route unchanged.

Vapi's GPT Live support makes the connection distinction explicit: outgoing RTP DTMF is supported on SIP, while outgoing DTMF on native Twilio, browser and raw WebSocket connections is not supported in that integration. Incoming keypad collection is a separate unsupported feature. These are Vapi integration limits, not universal GPT Live limits. Check the current support table before choosing a connection. [Vapi GPT Live compatibility](https://docs.vapi.ai/gpt-live/configuration)

## How a call asks your existing agent for help

Suppose a receptionist offers an appointment outside the window you approved. In call4me, the phone reasoner can invoke `ask_user` with a question. That question is saved with the call.

Your agent reads it through `call4me_get_call`, then responds through `call4me_answer_question`. Our service sends that answer to the voice session as commentary for the caller to say aloud. The answer also resolves the pending backend question when it is still waiting.

This is a useful capability to test end to end. The question should arrive in the original harness, its answer should reach the live call, and the business should receive the correct information. If the answer arrives after the backend's wait ended, the later delivery path needs its own test. An API response saying “sent” is one part of that evidence.

We implement this bridge explicitly. An MCP label alone does not tell you whether a phone service has it, how the harness should keep checking for questions, or what happens when an answer is late.

## GPT Live vs Vapi or Bland is a different comparison

A model architecture and a voice platform answer different questions. Vapi supports a cascaded configuration and also offers GPT Live in private beta, which must be enabled for your organization. You can compare those configurations within a platform; the platform name alone does not identify the architecture. [Vapi GPT Live overview](https://docs.vapi.ai/gpt-live/overview)

Both [Vapi](https://docs.vapi.ai/sdk/mcp-server) and [Bland](https://docs.bland.ai/integrations/mcp/overview) expose calling tools through MCP. They can connect to an existing agent too. A fair product comparison should follow the actual task: setup, brief, call, unexpected question, user answer and returned outcome.

Use a platform when its assistant configuration, operations tools and supported connections fit what you are building. Use call4me when you want to give an existing agent our task calling interface, including the brief, questions and result. Compare the complete workflow on your own tasks rather than treating “supports MCP” as the deciding feature.

## A repeatable test that answers the useful questions

A useful test needs a known task and an endpoint you control. Give each configuration the same brief, the same initial state and the same menu or receptionist behavior. Record the received audio, capture tool requests and verify the final state.

These are the fixtures we would use for a controlled comparison:

| Fixture | What success requires | Evidence to keep |
|---|---|---|
| Appointment with a corrected date | The business confirms the latest requested date | Receiving audio and booking record |
| Real interruption during a reply | The previous reply stops and the new request is handled | Audio timeline and queue events |
| Cough or brief acknowledgment | The task continues without an unnecessary restart | Audio and task trace |
| Repeated menu or invalid input | A supported new route or corrected digits | Menu state and received DTMF |
| A question answered in the harness | The business gets the user's actual answer | MCP events and receiving audio |
| Slow or failed work | An accurate outcome without a false success claim | Tool events, audio and final state |

Sierra's tau voice benchmark already combines conversation behavior with task outcomes checked against backend state. It includes controlled acoustic and telephone effects. That is useful prior work; our additional question is how a complete outbound calling service works with a coding harness and a real menu endpoint. [Sierra's benchmark methodology](https://sierra.ai/blog/tau-voice-benchmarking-real-time-voice-agents-on-real-world-tasks)

For architecture results, hold the tools, instructions, reasoning model where supported and telephone route constant. Tune the streaming cascade and GPT Live configuration before the comparison, then keep those settings fixed. For product results, use each product's documented supported setup and disclose differences in models and carriers.

Keep the original audio and timing files, configurations, tool events, menu state and every failed attempt. Measure time to the first audible reply, time to the first substantive answer, interruption yield, unnecessary interruptions and completed tasks separately. Repeat the fixtures and report the number of trials alongside the results.

## What our current tests actually found

We ran the existing menu recovery and tone generation tests on October 3, 2026. All 14 local checks passed. They exercise the recovery code with simulated provider events and check the generated keypad tones. They do not run a phone call or ask a live model to choose a route.

We then ran our existing live backend evaluation against `gpt-5.5`, the reasoner configured for call4me. It submits text scenarios to the Responses API and inspects the first proposed tool call. It never executes that tool or places a phone call.

The first scenario asks the reasoner to reach a person to submit an authorized refund. Its menu offers returns on one and all other questions on five. The fixture expects `press_digits` with `5`, because reaching a representative is the required next step. In this run, the model chose `press_digits` with `1`, and the assertion failed.

The evaluation stops on the first failure, so its other four scenarios were not evaluated in that run. This is evidence of a decision error against that fixture's expected route. It does not prove what a real menu would have done after the first key, and it is not a measured telephone success rate.

The result also illustrates why both checks matter. Passing local recovery tests does not establish that the reasoner will choose the expected next action. A text evaluation can catch that disagreement before a call, while a controlled telephone trial still has to check the menu's actual response.

## Give your agent a complete phone task

For your first call, supply the task and the boundaries together:

> Call the office and ask for an appointment next Thursday afternoon. If they offer another day, ask me before accepting it. Keep checking for questions during the call, answer with what I tell you, and report the confirmed date or the reason it could not be booked.

You can [add call4me to your agent](/) and use that same task structure. For a custom stack, it also makes a useful acceptance test: can the caller hear the offer, get a decision from the original harness, and return the business's confirmed outcome?
