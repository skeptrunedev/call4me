---
title: "How to give a LangChain agent phone calls with MCP"
seoTitle: "LangChain MCP phone calls: a tested agent guide"
subtitle: LangChain's new MCP adapter turns any MCP server into agent tools. Point it at call4me and a create_agent agent can call a business, wait on hold, and report what actually happened. Here is the script we ran and the real call it made.
description: "Give a LangChain agent a phone call tool with langchain[mcp] and MCPAdapter: install, auth, the exact script we ran, and a real call to Southwest Airlines."
date: 2026-10-13
tags: langchain, langchain mcp, mcp, phone calls, agents
authors: nick
imageAlt: A LangChain agent loads call4me tools through MCPAdapter and places a phone call
---

**The short answer:** install `langchain[mcp]`, wrap a fastmcp `Client` for `https://call4.me/mcp` in `MCPAdapter`, and pass `await adapter.list_tools()` to `create_agent`. The agent gets call4me's calling tools: it can place a call to a business, follow it until it ends, answer questions the business asks mid-call, and hand back the outcome and transcript.

```bash
pip install "langchain[mcp,openai]>=1.4.0"
export CALL4ME_API_KEY=...   # from your call4me account page
export OPENAI_API_KEY=...
```

```python
import asyncio, os, sys
from fastmcp import Client
from langchain.agents import create_agent
from langchain.mcp import MCPAdapter

async def main(prompt: str) -> None:
    client = Client("https://call4.me/mcp", auth=os.environ["CALL4ME_API_KEY"])
    async with MCPAdapter(client) as adapter:
        tools = await adapter.list_tools()
        print("tools:", ", ".join(t.name for t in tools))
        agent = create_agent("openai:gpt-5.1", tools)
        result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
        print(result["messages"][-1].content)

asyncio.run(main(sys.argv[1]))
```

```bash
python agent.py "How much call4me credit do I have left? Do not place a call."
```

That is the exact script we ran on October 13, 2026 with Python 3.14, `langchain` 1.4.5, `fastmcp` 4.1.0 and `langchain-openai`. Any chat model `create_agent` supports will work; we used `openai:gpt-5.1`.

## langchain[mcp] vs langchain-mcp-adapters

If you searched "langchain mcp adapters", you probably found `MultiServerMCPClient` from the `langchain-mcp-adapters` package. That repository now says it is "no longer actively maintained", that "MCP support has moved into LangChain under the `langchain.mcp` namespace", and asks users to "migrate to `langchain[mcp]`". It was archived on September 17, 2026 ([repository](https://github.com/langchain-ai/langchain-mcp-adapters)).

The replacement is `MCPAdapter` in `langchain.mcp`. It needs `langchain[mcp]>=1.4.0`, which pulls in [fastmcp](https://gofastmcp.com) 4.x. Two things to know:

- **It is in beta.** Importing `langchain.mcp` emits a `LangChainBetaWarning` once per process saying the API may change. We saw it on every run. The module docstring shows how to silence it with `warnings.filterwarnings`.
- **The tools are async.** Each MCP tool becomes a LangChain `StructuredTool` with only a coroutine, so call the agent with `ainvoke` or `astream`, not `invoke`.

`MCPAdapter` accepts a URL string directly too (`MCPAdapter("https://call4.me/mcp")`), but call4me needs auth, so build a fastmcp `Client` first and pass that in.

## Authenticate: API key or OAuth

**API key (what we tested).** fastmcp's `Client(url, auth=...)` takes a plain string and sends it as `Authorization: Bearer <key>` on every request. That is the line in the script above. LangChain's [MCP authentication docs](https://docs.langchain.com/oss/python/langchain/mcp/auth) show the same pattern:

```python
client = Client("https://call4.me/mcp", auth=os.environ["CALL4ME_API_KEY"])
```

To get a key, sign in at [call4.me](/login?next=/account), add credits, and copy the key (it starts with `cb_live_`) from your account page. Keep it in the environment of the process that runs the agent, never in the prompt. It can place calls billed to your balance.

**OAuth (documented, not tested by us).** Pass the literal string `"oauth"` and fastmcp runs the OAuth 2.1 flow, including the browser sign in:

```python
client = Client("https://call4.me/mcp", auth="oauth")
```

Per the [LangChain docs](https://docs.langchain.com/oss/python/langchain/mcp/auth), tokens are held in memory by default, so each run repeats the browser step unless you pass a fastmcp `OAuth` provider with token storage. call4me's OAuth works with Claude Code and Codex (see the [MCP setup page](/mcp)), but we have not run this LangChain OAuth path ourselves. For a server-side agent, the API key is the simpler choice.

## The tools your agent gets

`list_tools()` returned 19 tools on our account. The ones a calling agent uses most:

| Tool | What it does |
|---|---|
| `call4me_get_requirements` | Lists what a kind of call needs before it can dial |
| `call4me_place_call` | Places a call and returns its id right away |
| `call4me_get_call` | Status, open questions, transcript and (once finished) the outcome. `wait_seconds` (up to 50) waits for something to change |
| `call4me_answer_question` | Answers a question the business is waiting on mid-call |
| `call4me_hang_up` | Ends a call in progress |
| `call4me_schedule_call` | Dials later, for when the business is closed now |
| `call4me_get_balance` | Prepaid balance, per-minute price and the account's numbers |
| `call4me_get_recordings` | Recording links after the call |

The rest cover profiles, phone numbers and funds. If you do not want the agent touching those, filter the list by `t.name` before passing it to `create_agent`.

## Calls take minutes: plan for the loop

`call4me_place_call` returns as soon as the call is placed. The agent then follows it by calling `call4me_get_call` with `wait_seconds` again and again until the call finishes. Each round trip is a model turn plus a tool run, and LangGraph counts those steps against the run's recursion limit. When a run hits the limit, it stops with `GraphRecursionError`.

Our Southwest run below, with `wait_seconds` 30 and about 6 minutes on the line, finished well within the default. If a call may sit on a long hold:

- Ask for `wait_seconds` 50, the maximum, so each poll covers more time.
- Raise the limit for that run, as LangGraph's [recursion limit page](https://docs.langchain.com/oss/python/langgraph/errors/GRAPH_RECURSION_LIMIT) shows: `await agent.ainvoke({"messages": [...]}, {"recursion_limit": 100})`. Check that page for the default in your version rather than assuming one.
- Or let the agent place the call, return the call id, and follow it from your own code with `call4me_get_call`. A job queue handles an hour on hold better than one agent run.

Set `max_minutes` on the call too. It caps billed time, including hold, and only holds credits for that cap.

**Before it dials**, call4me checks that it has what the call needs. A general question needs the questions; a restaurant booking needs a party size, a date and a time window. If something is missing, `call4me_place_call` does not dial and its result says exactly what to ask the user.

## What we tested

**Balance check.** We asked for the account balance and said "Do not place a call." The agent called `call4me_get_balance` once and answered from the live result with the balance and the account's numbers. No call was placed.

**A real call to Southwest Airlines.** We asked the agent to call Southwest's general questions line, 1-800-435-9792, for a consumer guide on reaching Southwest customer service. The prompt, trimmed:

> Use call4me to make one informational phone call to Southwest Airlines at 1-800-435-9792. This is research for a consumer guide on reaching Southwest customer service. It is a general inquiry, not about any booking or account.
>
> Questions: 1. What hours is this line answered by live people, and in what time zone? 2. When hold times are long, is there a callback option? 3. How long does a refund for a cancelled flight usually take to come back to a card? 4. What should someone have ready before calling about a booking?
>
> Limits: category "general" with these questions in details.questions, max_minutes 30. Never claim to be a customer, never give a confirmation number, card, address or personal details, and never agree to any change or purchase. Decline any callback and stay on hold.
>
> After placing it, follow the call with call4me_get_call (wait_seconds 30) until it ends. Then report the call ID, whether a live person was reached, how long it took to reach them, and the answers to each question. Do not place any other call.

The agent placed the call with `call4me_place_call` and followed it with `call4me_get_call` until it ended. Here is what happened on the line, from the call record and recording:

1. Southwest's automated system answered, played the recording notice and asked what the call was about. The caller said "Representative."
2. About 45 seconds in, the system said all representatives were assisting other callers. Hold music followed.
3. A live reservations agent picked up a little over 4 minutes after Southwest answered.
4. The caller explained it was asking general questions for a consumer guide. The agent said it was a reservations department and could not do a survey, then: "I have to answer phone lines for customers needing assistance, so I can't answer general questions."
5. The caller thanked them and ended the call.

call4me returned the outcome as `not_possible`: a live agent was reached, no questions were answered, and no callback, reservation or personal information was given. Billed time was 7 minutes, $1.75, including the phone menu and hold.

**What the agent reported.** It said a live reservations representative was reached, that all four questions went unanswered, and why: the line is for customers with reservations and the representative would not answer general questions. It did not fill in hours, refund times or a callback policy from its own knowledge. That is the behavior you want from a calling tool: it reports what happened on the call, not what was supposed to happen.

One miss worth knowing: the agent estimated the time to a live person at "approximately 5 to 7 minutes". The transcript `call4me_get_call` returns has no timestamps, so it guessed from the billed time. The recording shows a little over 4 minutes. If timing matters to your app, measure it from your own polling or from the recording, not from the model's summary.

The test also tells you something about Southwest: its reservations line will not answer general policy questions from a non-customer. For a general question there, the website is the better source; a phone call works when you have a reservation to ask about.

## Pricing and limits

- $0.25 per minute of talk time in the US and Canada, including hold; some destinations cost more (see [the FAQ](/#faq)). Unanswered calls are free.
- Two calls can run at once per account.
- `max_minutes` defaults to 30 and goes up to 240 for a long hold.

## Other ways to use the same calls

The same MCP server works from TypeScript with the [Vercel AI SDK tools package](/blog/vercel-ai-sdk-phone-calls), and from coding agents with no code at all: see [Claude Code phone calls](/blog/claude-code-phone-calls), [Codex phone calls](/blog/codex-phone-calls), or the [MCP setup page](/mcp). They share one account, one balance and the same phone numbers.

To compare calling services and setups for other AI apps, see our [phone calling MCP comparison](/blog/phone-calling-mcp-comparison).
