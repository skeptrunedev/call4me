---
title: "Instinct AI phone calls: Concierge or a phone for your existing agent?"
seoTitle: Instinct AI phone calls, Concierge and MCP
subtitle: Instinct offers phone calls through Concierge. If you already work in Claude Code or Codex, you can also add a calling tool to that session. Here is the difference, how Call4me signup works, and what we have actually tested.
description: Understand Instinct Concierge, custom MCP connection questions, and adding phone calls to Claude Code or Codex, with signup steps and a recorded research call.
date: 2026-10-04
tags: instinct ai, instinct concierge, mcp, claude code, codex, ai phone assistant
authors: nick
imageAlt: Instinct Concierge and an existing coding agent with a phone calling MCP tool
---

**If you already use Instinct as your personal assistant, check whether its announced Concierge phone calling feature is available in your account.** For a task already in Claude Code or Codex, a calling MCP server offers another route. The choice depends on where you want the task, context and result to live.

This guide covers Instinct's published calling offer, the Call4me signup and connection steps, and an actual recorded Codex research call. **We have not tested Instinct Concierge or connected Call4me inside Instinct.** The recording below demonstrates our existing Codex workflow.

## What is Instinct AI?

Instinct is a personal assistant you can reach by text or voice. Its [official homepage](https://instinct.com/) describes connections to applications and devices, including email and messaging, and an assistant that uses a phone and computer to handle everyday tasks.

There are two different phone interactions here: talking to your assistant, and asking that assistant to call a business for you. A product supporting the first does not, by itself, establish the second.

## Can Instinct make phone calls for you?

In his [September 16, 2026 announcement](https://x.com/noahrshinn/status/2100262985491231101), founder Noah Shinn described Instinct Concierge as handling phone calls and demanding bookings. His examples included restaurants without online reservations, dentist cancellation lists and cable bills. He described an initial rollout to early access users.

That is the maker's description of the feature. It does not establish whether your account has access today, how a particular call is handled, or whether it will succeed. Ask your Instinct whether Concierge is available before relying on it for a time sensitive task.

For a first inquiry, give it the business, the information you need and the actions you authorize. For example:

> Can you use Concierge to call this restaurant and ask whether its private dining room is fully enclosed? This is an information request. Do not reserve space, agree to a charge or arrange a callback. Tell me who answered and what remains unknown.

That prompt is a proposed task brief, not a transcript of a test we ran in Instinct.

## Instinct Concierge versus a calling MCP tool

| Question | Instinct Concierge | Claude Code or Codex with Call4me |
|---|---|---|
| Where does the request start? | In your Instinct conversation | In the coding agent session you already use |
| What are you choosing? | Calling within Instinct's personal assistant product | A calling tool added to your existing agent |
| How does the agent get the result? | We have not tested its reporting workflow | MCP tools return status, transcript, open questions and outcome |
| What is demonstrated here? | The founder's announcement | Our recorded Codex call and published setup tests |

If Instinct already holds your plans and preferences, its own calling feature is a natural place to start. If Claude Code or Codex is already researching the task, adding Call4me keeps the phone questions and answers in that session.

Call4me supplies the telephone conversation. Your existing agent chooses the questions, passes the relevant context, follows progress and evaluates the answer. This does not reproduce Instinct's wider personal assistant, memory or application integrations.

## How Call4me signup works

Connecting another agent involves three separate steps: creating your Call4me account, authenticating the connection, and confirming that the agent can actually use a tool.

1. Open [Call4me's sign in page](/login) yourself and continue with Google or X. Your first sign in creates the account. There is no separate agent registration form.
2. Open [your account](/account). For clients that support OAuth, complete the connection's browser sign in and consent. For clients using a key, get your personal API key here.
3. Configure the client for the remote MCP endpoint, `https://call4.me/mcp`. An API key works in an `Authorization: Bearer` header. Complete browser authentication or use a credential method your client actually supports.
4. Ask the agent to run `call4me_get_balance` without placing a call. A real tool response establishes account access. A message saying the integration is ready does not.
5. Before dialing, check your calling credits and give the agent a bounded task.

Have the person complete the Google or X sign in rather than asking an agent to create an independent identity. An existing account does not mean every client is connected to it.

## Can Instinct connect to a custom MCP server?

We did not find a public custom MCP setup guide on the Instinct pages checked for this article on October 4, 2026. That does not establish that the product cannot connect. It means we cannot give you a verified Instinct settings path or claim the integration works.

If you want Instinct to use Call4me, start with a capability check before sharing a credential:

> Can you connect to a remote MCP server using Streamable HTTP at https://call4.me/mcp? It supports browser OAuth or an Authorization Bearer header. Before I provide a key, explain which connection and credential method you can use. If you can connect, run call4me_get_balance and show the actual result without placing a call. If you cannot, tell me the missing capability rather than reporting that setup succeeded.

This is a proposed connection request. We have not executed it inside Instinct. Do not assume it has the same connector interface or credential storage as [Meta Muse](/blog/meta-muse-ai-agent-phone-calls).

Call4me's [authentication guide](/auth.md) describes the supported connection methods. Its [REST schema](/api/openapi.json) covers number management and retrieval of existing recordings. Placing calls is exposed through MCP; treating the REST schema as a generic dialing API would send an integration down the wrong path.

## Add phone calls to Claude Code or Codex

These clients have documented remote MCP support. We checked the commands against the installed CLIs and the [Claude Code reference](https://code.claude.com/docs/en/mcp) and [official OpenAI documentation](https://learn.chatgpt.com/docs/extend/mcp).

For Claude Code:

```bash
claude mcp add --scope user --transport http call4me https://call4.me/mcp
```

Open Claude Code, use `/mcp`, select Call4me and authenticate. Then request a balance check. Our [Claude Code calling guide](/blog/claude-code-phone-calls) includes the setup evidence and recorded voicemail attempt.

For Codex:

```bash
codex mcp add call4me --url https://call4.me/mcp
codex mcp login call4me
```

Complete the browser connection, start a fresh session and request a balance check. Our [Codex calling guide](/blog/codex-phone-calls) documents the tested CLI workflow and authentication details. These examples do not establish every desktop, extension or T3 Code configuration.

## A recorded example: Codex calls during restaurant research

On October 3, 2026, Codex researched Waterbar and EPIC Steak's official private dining pages, then called both to ask about missing information. A separate Claude Code session called Foreign Cinema. The full [research walkthrough](/blog/agent-web-research-phone-calls-sf-private-dining) includes the sources, prompts, recordings and unresolved questions.

Here is the reviewed Waterbar recording from that Codex session. Names and private identifiers are muted; the original timing is preserved.

<audio controls preload="metadata" src="/static/blog/sf-private-dining-waterbar.mp3" style="width:100%"><a href="/static/blog/sf-private-dining-waterbar.mp3">listen to the Codex Waterbar research call</a></audio>

<details>
<summary>Read selected moments from the Waterbar transcript</summary>

**0:34** **Waterbar virtual concierge:** The Bridge Tower Room is a private dining room with wall to wall windows and its own private terrace, so it feels the most enclosed and private. The Looking Glass is a more flexible indoor outdoor space overlooking the main bar, so it feels more open rather than fully closed off. If you'd like, I can also share the guest capacities for each space.

**1:11** **Waterbar virtual concierge:** The published capacities are 60 seated or 75 standing for the Bridge Tower Room and 24 seated or 50 standing for the Looking Glass. I only have those listed capacities, so I can't confirm whether they flex by layout, but I can pass your message to the host if you'd like.

**1:43** **Waterbar virtual concierge:** It looks like I don't have enough information to help with that, but I can pass your message to the host.

**2:44** **Waterbar virtual concierge:** You can email the team with your general private dining questions, and they'll be able to help even if you don't have event details yet. If you'd like, I can text you the email address once we get off the phone.

The linked research walkthrough contains the complete reviewed transcript and the questions preceding these answers.

</details>

The call added the virtual concierge's description of room privacy. It did not reach a human events coordinator or establish minimum spending, a room fee, flexible capacities or availability. A finished call was a partial research result.

The call used our supported legacy MCP connection. Separate tests verified the current `https://call4.me/mcp` endpoint with an API key, and fresh Codex browser OAuth followed by a balance read. The linked guides distinguish those tests; this recording is not a new Instinct or canonical endpoint dialing test.

## What should the agent return after a call?

Whether you use a personal assistant or your existing coding agent, ask for:

* Who answered: a staff member, automated concierge, menu or voicemail.
* The specific answers, separated from website facts and the agent's conclusions.
* What remains unknown and the next useful question.
* Any reservation, payment or followup actually arranged.
* The transcript or recording, if the service makes it available.

In Call4me, the agent uses `call4me_get_call` to follow progress. If the caller needs an answer, `call4me_answer_question` can relay one while the call is still active. In our EPIC Steak attempt, an answer arrived after the call had ended and was not delivered. Read the actual outcome before treating the task as resolved.

If you already use Claude Code or Codex as your assistant, our [MCP comparison](/blog/phone-calling-mcp-comparison) includes real Call4me, Vapi Agent Phone and Bland attempts. Our [voice architecture guide](/blog/cascaded-voice-stack-vs-gpt-live) explains the conversation layer behind the interface.

If your current Claude Code or Codex session needs one missing fact from a business, [connect Call4me](/mcp), check the balance tool, and make that fact the goal of your first call.
