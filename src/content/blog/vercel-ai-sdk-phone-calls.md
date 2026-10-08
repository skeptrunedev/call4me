---
title: "Phone calls for Vercel AI SDK agents: the call4me tools package"
seoTitle: "Vercel AI SDK phone call tools: call4me"
subtitle: call4me-ai-sdk gives an AI SDK agent a phone. It calls a business, has the conversation, waits on hold, and hands the outcome and transcript back to your code. Here is the setup, the tools, how mid-call questions work, and what happened when we ran it.
description: "Add phone calls to a Vercel AI SDK agent with the call4me-ai-sdk tools package: install, API key, a working generateText example, and a real test call."
date: 2026-10-08
tags: vercel ai sdk, ai sdk tools, phone calls, agents, mcp
authors: nick
imageAlt: A Vercel AI SDK agent calls a business with call4me and gets the outcome back
---

**The short answer:** install `call4me-ai-sdk`, set `CALL4ME_API_KEY`, and pass `call4meTools()` to `generateText` or `streamText`. Your model gets a `makePhoneCall` tool that calls a business, has a natural conversation (booking, rescheduling, cancelling, asking, waiting on hold, getting through phone menus), and returns the outcome and transcript when the call ends.

```bash
npm install call4me-ai-sdk ai zod @ai-sdk/openai
```

```ts
import { generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { call4meTools } from 'call4me-ai-sdk';

const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt:
    'Call Pottery Barn customer service at 1-888-779-5176 and ask how long furniture delivery ' +
    'usually takes and whether returns have a shipping fee. General questions only, no order.',
  tools: call4meTools(),
  stopWhen: isStepCount(8),
});

console.log(text);
```

The package has no runtime dependencies of its own. Every tool is a thin call to the [call4me MCP server](/mcp), so an AI SDK agent and a Claude Code or Codex session get the same caller, the same phone numbers and the same account.

## Get an API key

1. Sign in at [call4.me](/) and add credits. Calls cost **$0.25 per minute of talk time**, held up front and settled when the call ends. Unanswered calls are free.
2. Copy your key (it starts with `cb_live_`) from your [account page](/login?next=/account).
3. Set it as `CALL4ME_API_KEY`, or pass it directly: `call4meTools({ apiKey })`.

Keep the key on your server. It can place calls billed to your balance.

## The tools

`call4meTools()` returns an object you can pass straight to `tools`, or pick from:

| Tool | What it does |
|---|---|
| `makePhoneCall` | Places a call and waits for it to finish, then returns the outcome and transcript. Returns early if the business asks something only the user can answer. |
| `placeCall` | Places a call and returns its id right away, for apps that follow the call themselves. |
| `getCall` | Status, open questions, live transcript and (once finished) the outcome. Waits up to 50 seconds for something to change. |
| `answerQuestion` | Answers a question the business is waiting on mid-call. The caller relays it on the line. |
| `hangUp` | Ends a call in progress. Talk time so far is billed. |
| `getBalance` | The prepaid balance, per-minute price and the account's phone numbers. |
| `getRequirements` | What a kind of call needs before it can dial. |

Every tool returns `{ text, isError, data }`: `text` is a readable summary the model can use directly, and `data` is the structured result (call id, status, outcome, open questions) when the server sends one.

Options:

```ts
call4meTools({
  apiKey: process.env.CALL4ME_API_KEY, // default
  maxWaitMinutes: 15, // how long makePhoneCall waits before handing back the call id
});
```

## How a call works inside one generateText run

Phone calls take minutes, not milliseconds. `makePhoneCall` places the call, then follows it with `getCall` (each request waits up to 50 seconds on the server) until one of three things happens:

1. **The call finishes.** The tool returns the outcome (`done`, `partial`, `not_possible`, `voicemail` and so on), a summary, structured details and the transcript.
2. **The business asks something only the user knows** (a date of birth, "does 8:15 work?"). The tool returns early with `open_questions`. The model answers with `answerQuestion`, then follows the call with `getCall`. The business is waiting on the line, so answer quickly.
3. **`maxWaitMinutes` passes.** The tool returns the call's current state and id, and the model can keep following it with `getCall`.

Give the run enough steps for that loop. `isStepCount(8)` covers a call plus a question or two.

**Before it dials**, call4me checks that it knows what the call needs. A restaurant booking needs a party size, a date and a time window. A general question needs the questions. If something is missing it does not dial: the tool result says exactly what to ask the user, and the model can ask and try again. `getRequirements` lists the fields for each kind of call.

## Following a call yourself

For a UI that shows the call as it happens, or a job queue, use `placeCall` and `getCall` instead of `makePhoneCall`:

```ts
import { createCall4meClient } from 'call4me-ai-sdk';

const call4me = createCall4meClient(); // reads CALL4ME_API_KEY

const placed = await call4me('call4me_place_call', {
  to: '+18887795176',
  business: 'Pottery Barn customer service',
  category: 'general',
  goal: 'Ask how long furniture delivery usually takes and whether returns have a shipping fee.',
  details: { questions: 'How long does furniture delivery usually take? Is there a return shipping fee?' },
});
const callId = placed.data?.id as string;

const view = await call4me('call4me_get_call', { call_id: callId, wait_seconds: 50 });
console.log(view.data?.status, view.data?.transcript);
```

Repeat the `call4me_get_call` request until `data.finished` is true, rendering `data.transcript` as it grows and answering anything in `data.open_questions` with `call4me_answer_question`.

## What we tested

We ran the package on October 8, 2026 with `ai` 7.0.135, `@ai-sdk/openai` 4.0.91, `gpt-5-mini` and `call4me-ai-sdk` 0.1.0, on our own account.

**Balance check.** Asked "How much call4me credit do I have left, and what number do my calls come from?", the model called `getBalance` and answered from the live result: the balance and the account's three numbers.

**A real call.** We asked it to call Hulu support at 877-824-4858 and ask whether Hulu has a student discount and how a student proves eligibility. The model called `makePhoneCall`, which placed the call and waited. A live representative answered and asked the question back, then the call ended after about 3 minutes: **Hulu's side hung up** before answering. The tool returned the outcome as `partial` with the transcript, and the model told us the question was not answered and offered to call again. That is the behavior you want from a tool: it reports what actually happened on the call, not what was supposed to happen.

## Pricing and limits

- $0.25 per minute of talk time in the US and Canada; some destinations cost more (see [the FAQ](/#faq)).
- Two calls can run at once per account.
- Set `max_minutes` in a call's input to cap its talk time and leave credits free for other calls.

## Use it from Claude Code or Codex instead

The same calls work from coding agents without any code: see [Claude Code phone calls](/blog/claude-code-phone-calls) and [Codex phone calls](/blog/codex-phone-calls), or the [MCP setup page](/mcp).

The package source is MIT licensed, in the [call4me repository](https://github.com/skeptrunedev/call4me/tree/main/packages/ai-sdk).
