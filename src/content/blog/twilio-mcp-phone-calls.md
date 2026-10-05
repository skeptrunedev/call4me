---
title: "Can Twilio MCP make phone calls for your Claude Code or Codex assistant?"
seoTitle: Twilio MCP phone calls for Claude Code or Codex, what works
subtitle: We connected to Twilio's public MCP, searched for an outbound call, and retrieved its actual API schema. Here is the difference between documentation tools, an operational MCP, and a voice agent that can finish a conversation.
description: Set up Twilio MCP in Claude Code or Codex, see our actual search and schema retrieval test, and compare building a conversational voice application with connecting a hosted calling MCP.
date: 2026-10-04
tags: twilio, mcp, claude code, codex, ai phone assistant
authors: nick
imageAlt: Twilio documentation MCP helps your agent build a voice application, while a calling MCP runs the conversation and returns the result
---

**Twilio's public documentation MCP helps Claude Code and Codex build calling applications. It does not place calls itself.** An operational Twilio MCP can expose authenticated API actions, but creating a call is still different from giving your coding agent a caller that listens, answers questions, and brings back a usable result.

If you already use that agent as a personal assistant, the goal may be to resolve a subscription question, arrange an appointment or ask a business for a missing fact. Evaluate the connection against that task: does it run the conversation and return the answer or confirmation your assistant needs?

On October 4, 2026, we connected to `https://mcp.twilio.com/docs` without a Twilio account or credentials. We discovered its tools, searched for outbound calling, and retrieved the call creation schema. This is an actual MCP test. We did not place a Twilio call or run a conversational Twilio application.

We make [call4me](/), a hosted calling MCP. If you are deciding whether to build with Twilio or connect a calling service to the agent you already use, the useful question is which parts you want to own.

For existing calling tools, start with our [phone calling MCP comparison](/blog/phone-calling-mcp-comparison). It covers account setup and the results returned to the original agent, with actual Call4me, Vapi Agent Phone and Bland calls. The implementation details below help when you choose to build the voice application yourself.

## Which Twilio MCP do you mean?

| Connection | What it gives your agent | What it needs to make a conversational call |
|---|---|---|
| Twilio's public documentation MCP | API and documentation search, followed by schema retrieval | A separate authenticated execution path and voice application |
| Twilio Labs alpha MCP or an operational community implementation | The API tools that implementation exposes, using your Twilio credentials | Call instructions, a conversational runtime, and a result workflow |
| Your own calling MCP built on Twilio | Whatever task and result tools you implement | Your hosted voice application and Twilio account |
| A hosted calling MCP such as call4me | A calling task, call status, questions, and results | A service account and calling credits |

Twilio's [public MCP reference](https://www.twilio.com/docs/ai/mcp) documents the hosted service as read only and lists execution tools as a planned addition. That description applies to this endpoint, not to everything called a Twilio MCP.

The [Twilio Labs MCP repository](https://github.com/twilio-labs/mcp) is a separate alpha project. Its [package README](https://github.com/twilio-labs/mcp/blob/main/packages/mcp/README.md) calls it a proof of concept, requires Twilio API credentials, and supports filtering the exposed API services and tags. Community servers are another implementation choice. Inspect the actual tools, credential handling, and maintained source before treating any of them as interchangeable.

## Add the public Twilio docs MCP to Claude Code or Codex

For Claude Code, Twilio documents this command:

```bash
claude mcp add --transport http twilio-docs https://mcp.twilio.com/docs
```

For Codex:

```bash
codex mcp add twilio-docs --url https://mcp.twilio.com/docs
```

These are the commands in [Twilio's setup guide](https://www.twilio.com/docs/ai/mcp). The server does not need an OAuth login or a Twilio API key. Our direct client connection also succeeded without either.

In Codex, `codex mcp list` checks configuration and `/mcp` shows the servers available to the active session. Open a fresh session if it predates the configuration change. See [OpenAI's MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) for client configuration.

Use a request that verifies tool execution:

> Use the Twilio documentation MCP to search for creating an outbound phone call. Retrieve the API operation using the exact ID returned by search. Show the method, endpoint, required fields, and how the call receives its instructions. Do not execute the API, purchase a number, or place a call.

A model explaining Twilio from memory is different from a successful tool invocation. Check that it actually called `twilio__search` and `twilio__retrieve`.

## Our actual Twilio MCP test

We used the installed TypeScript MCP client, version **2.1.0**, over Streamable HTTP. This test ran directly through the protocol client, rather than through a Claude Code or Codex model session. It establishes the endpoint's tools and responses, not every client's connection behavior.

| Step | Actual result |
|---|---|
| Connect without authentication | Succeeded |
| List available tools | `twilio__search` and `twilio__retrieve`, both annotated as read only |
| Search the core API for an outbound phone call | Returned `CreateCall` as the first result |
| Retrieve that returned operation ID | Returned the request body fields and response fields |
| Search documentation for an outbound Conversation Relay application | Returned the Conversation Relay guide among the results |
| Retrieve the documentation result's returned ID | Returned an error expecting an API operation ID |

The outbound search arguments were:

```json
{
  "query": "Create an outbound phone call",
  "source": "api",
  "product": "api_v2010",
  "limit": 3
}
```

The first result gave us this operation:

```text
ID: op::twilio_api_v2010::CreateCall
Method: POST
Path: /2010-04-01/Accounts/{AccountSid}/Calls.json
```

We passed that returned ID to `twilio__retrieve`. The response required `AccountSid` in the path and `To` and `From` in the request body. It also exposed fields including `Url`, `Twiml`, `StatusCallback`, `TimeLimit`, `Record`, `SendDigits`, and `MachineDetection`.

**This was schema retrieval, not a submitted call.** The result did not include a new call SID, a connected destination, or an audio recording. The public endpoint had no tool for creating the call.

The documentation lookup revealed a useful limitation. Search returned a Conversation Relay article with a `uri:` ID. Passing that exact ID to retrieve returned `unknown id prefix` and said it expected `op::`. API retrieval succeeded in the same batch. For this attempt, we used the documentation text and source URL returned by search, then opened the official guide directly. We did not invent an operation ID or treat the documentation retrieval as successful.

## Creating a call is one layer of the application

Twilio's [outbound calling guide](https://www.twilio.com/docs/voice/tutorials/how-to-make-outbound-phone-calls) explains how an authenticated request to the Calls resource starts a call and supplies its instructions. A simple TwiML greeting can speak to a recipient. A conversational assistant also needs a path for hearing a reply, deciding what to say, handling interruptions, and ending with a result your coding agent can use.

Two documented Twilio paths are relevant:

| Voice path | Twilio's role | Your application's role |
|---|---|---|
| [Conversation Relay](https://www.twilio.com/docs/voice/conversationrelay) | Handles speech recognition and speech generation, exchanging text and events over WebSocket | Generates responses, keeps the task state, invokes your business tools, and decides when to finish |
| [Bidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams) | Exchanges call audio with your WebSocket application | Connects the audio to your chosen voice runtime and handles the conversation and task logic |

These are documented architecture choices. We did not deploy either in this test, so we cannot compare their call quality, setup time, or reliability against call4me.

For a personal assistant checking cancellation terms, appointment availability or private dining details, a custom implementation needs more than a `CreateCall` wrapper. We would build these behaviors into the task interface:

1. Accept the destination, research questions, facts the caller may share, and limits on commitments.
2. Start one call and return a stable identifier the coding agent can follow.
3. Expose progress separately from the transcript and answered questions.
4. Pause for missing information or terminate when the caller lacks authority to proceed.
5. Return the answers, any actual confirmation, unresolved questions and available recording to the original assistant task.

These are our implementation criteria. They are not a claim that the public Twilio docs MCP supplies those behaviors.

## Plan keypad handling and voicemail together

One retrieved schema detail matters if the business has a phone menu. `SendDigits` sends a preset sequence after connection. The schema states that specifying it causes `MachineDetection` to be ignored. That is different from a caller listening to an unfamiliar menu and choosing the appropriate option during the conversation.

The media path matters too. Twilio's [Media Streams reference](https://www.twilio.com/docs/voice/media-streams) says bidirectional streams support DTMF events from Twilio to the media server, but do not support sending outbound DTMF from that server to Twilio. Do not assume your audio WebSocket can send a native keypad action just because it can play speech.

Conversation Relay provides a separate outbound `sendDigits` message in its [WebSocket protocol](https://www.twilio.com/docs/voice/conversationrelay/websocket-messages). After your application decides which key to press, the documented message shape can express that choice:

```json
{
  "type": "sendDigits",
  "digits": "2"
}
```

This is an illustrative message, not one we submitted to a live Twilio call. The distinction between the two media paths matters when designing menu navigation. Check the chosen path's controls and test the destination reached. A spoken promise to press a button is insufficient evidence.

Our [calling MCP comparison](/blog/phone-calling-mcp-comparison) includes real Vapi Agent Phone and Bland calls that reached a restaurant's private dining voicemail. It also shows why reaching the branch and ending without leaving a message are separate checks. Those recordings are evidence from those services, not a Twilio benchmark.

## When connecting a calling MCP makes more sense

Building on Twilio is useful when the voice application itself is part of your product, you need account and infrastructure control, or you want to design a specific conversation runtime. The docs MCP can help your coding agent find the current API fields while it builds that application.

If your immediate goal is to give the Claude Code or Codex session you already use a way to call a business, a hosted calling MCP provides that workflow directly. You can still use the Twilio docs MCP alongside it for development research.

For call4me, start with our [Claude Code setup and actual call](/blog/claude-code-phone-calls) or [Codex setup and research example](/blog/codex-phone-calls). The Claude Code example includes a Foreign Cinema recording and the exact tool sequence. It reached private dining voicemail, not a person, and did not obtain a quote.

For a concrete personal assistant brief, use the recorded [Fubo cancellation inquiry](/blog/cancel-fubo). If support is closed, the [scheduled calling guide](/blog/schedule-phone-calls-claude-code-codex) explains saving a complete brief now and retrieving its stored status later. That guide distinguishes verified schedule records from later call outcomes.

The practical test is the same for a custom Twilio application or a hosted service: can the agent carry out the allowed task, expose what happened, and report what remains unknown? A configured server proves setup. An API schema proves what a request accepts. The completed conversation and its evidence establish what the caller actually accomplished.
