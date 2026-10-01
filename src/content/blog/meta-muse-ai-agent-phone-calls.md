---
title: "Meta Muse AI agent: what it is, how its connectors work, and how to give it a phone"
seoTitle: Meta Muse AI agent and connectors, explained
subtitle: Muse is Meta's personal AI agent, and it can't install an MCP server the way Claude Code can. It builds its own connectors instead. Here's what Muse is, how it connects to other services, and the exact message that gets it making phone calls.
description: What Meta's Muse AI agent is, how Muse connectors and custom connectors work, and how to set Muse up to make phone calls with call4me, keeping your key out of the chat.
date: 2026-10-01
tags: meta muse, ai agents, mcp, ai phone assistant
authors: nick
imageAlt: Meta Muse AI agent connectors, with phone calls as the worked example
---

**The short answer:** Muse is Meta's personal AI agent, announced on September 8, 2026 and rolling out in the US on iOS, Android, and muse.ai. Each Muse runs on its own cloud computer, comes with built-in connectors, and can write its own connector to any other service that has an API. There's no form where you paste an MCP server URL. Instead, you ask Muse in chat to build the integration, and it stores your key in its secure credential store, where even Muse itself never sees it. That's how you give Muse a phone: ask it to build a connector to call4me, then enter your call4me key on Muse's secure page.

We found this out the hard way. An early call4me user pasted our setup prompt into Muse, and Muse answered that it couldn't install MCP servers and its tools were fixed. It was right about the first part. So we rewrote the setup for Muse, tried it today, and this is what happened.

## What is Meta Muse?

Muse is Meta's agent for everyday life. Meta's [launch post](https://about.fb.com/news/2026/09/introducing-muse/) calls it "The World's First Personal AI Agent Built for Everyone" and says it's "rolling out in the US on iOS, Android, and muse.ai, and coming soon to AI glasses." It's free for most things, with paid plans for heavier use.

When you open it, Muse introduces itself this way:

> Hey! I'm your personal agent, not just a regular assistant.

The difference from a chat assistant is where it works. Meta's [safety write-up](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) explains that "You and your Muse share your own dedicated computer in the cloud," an isolated Linux machine with a browser, storage, and enough power to run code it writes. So Muse doesn't just suggest steps; it can do them on that computer.

## What can the Muse AI agent do?

Anything that happens online: it has a browser and a computer, and it connects to your email and other services. What it can't do on its own is pick up the phone. A lot of errands still need a call: rescheduling a dentist, asking a restaurant about a private room, canceling a gym membership. That's the gap a phone connector fills, and it's what the rest of this post sets up.

## How Muse connectors work

Muse reaches other services through connectors. From Meta's write-up:

> We've built an initial set of connectors to third-party systems and to other Meta apps like Instagram and Facebook.

For anything not on that list, Muse writes its own:

> Muse can also write its own custom connectors for other services you care about if they have their own APIs or CLIs.

Meta also writes "SKILLs," detailed instructions that teach Muse how to get the most out of each connector. A custom connector Muse builds works the same way: code that talks to the service, plus instructions on when to use it.

### Where your keys go

This is the part we like. Connector credentials are stored on your Muse computer, not in the chat, and the agent never handles the real secret. Meta's write-up says code running for the agent "only ever sees a 'surrogate' token," and a separate gatekeeper called Sentinel swaps in the real credential at the network boundary, after the request is approved. So even if a web page tried to trick Muse into revealing your key, Muse doesn't have it to reveal.

That's why, for Muse, we don't put the call4me key in the setup message. Muse asks for it on a secure page instead.

## Does Muse support MCP?

Not as a setting. Claude Code, Codex, ChatGPT, and grok.com all have a place where you add an MCP server by URL. Muse doesn't, which is why our original instruction ("create a custom connector for a remote MCP server") got a polite refusal.

But MCP is just an API, and Muse can write a connector for any API. So the working approach is to ask Muse to build a connector to the MCP server, using the official MCP SDK, rather than to "install" one.

## How to make phone calls with Muse

This is the exact message we sent Muse today:

> Build a custom integration to call4me so you can place phone calls for me from any future conversation. It's a hosted remote MCP server (streamable HTTP) at https://call4.me/mcp. Use the official MCP SDK to connect. It authenticates with my call4me API key (I can get it from https://call4.me/account): ask me for it through your secure credential flow and store it in your Secure Credentials Store, never in chat, and send it as an Authorization: Bearer header. Then list the tools, test call4me_get_balance end to end, show me the result, and save the integration as a reusable skill.

Within about half a minute, Muse replied that it needed the key ("To place phone calls for you, I need your call4me API key"), pointed us to call4.me/account to get it, and said the key "goes straight to your Secure Credentials Store and never appears in our chat." Under the message it put a card labeled **Call4me**, **Connector**, with a **Connect** button.

Here's the whole setup, start to finish:

1. **Get your call4me key.** Sign in at [call4.me](https://call4.me) and copy your key from [your account page](https://call4.me/account).
2. **Send Muse the message above** in any chat.
3. **Click Connect** on the Call4me card and paste your key into Muse's secure page. Don't paste it into the chat itself.
4. **Let Muse test it.** It lists the call4me tools and runs `call4me_get_balance`. If it reports your balance, it's connected.

### What happened when we ran it

We ran exactly these steps in a fresh Muse chat on October 1, 2026. After the key went in through the Connect card, Muse worked on its own for about five minutes: it wrote a client with the official MCP SDK, hit an import error, fixed it, listed the server's tools, and saved the result. Then it came back with:

> All done. The call4me integration is live and tested end to end.

Its report, in short:

- **Balance check passed.** It called `call4me_get_balance` and read back the account's real balance, minutes left at $0.25/min, and the account's call4me phone numbers, all matching the account page.
- **All of call4me's tools available**: placing calls, checking status and transcripts, answering the caller's questions mid-call, patching you in or hanging up, listings, recordings, your calling profile, adding funds, and managing numbers.
- **The key never touched the chat.** Muse said the key went "straight into the Secure Vault via the connector page", and at call time a one-time stand-in is swapped for the real key on the way out, sent as an `Authorization: Bearer` header.
- **Saved as a reusable skill** named `call4me`, so any future Muse conversation can place calls.

It also volunteered the one thing worth knowing before the first call: call4me may ring your own phone to verify you with a business or patch you in, so it said it would always give you a heads up first.

### What a call looks like from Muse

Once the connector is in place, you ask in plain words and Muse calls `call4me_place_call` with something like:

```json
{
  "name": "call4me_place_call",
  "arguments": {
    "to": "+1 555 010 0199",
    "business": "Rosa's Kitchen",
    "category": "restaurant",
    "goal": "Book a table for 4 tonight (Thu Oct 1) around 7pm under Khami.",
    "flexibility": "anything between 6:30 and 8 is fine"
  }
}
```

A voice caller places the call, talks to the restaurant like a person would, and Muse follows along with `call4me_get_call` until it ends. If the restaurant asks something the caller doesn't know, the question comes back to Muse to answer while they wait.

## Why not just paste the key into the chat?

You could. call4me also gives you a personal server URL with your key in it, and Muse can build a connector from that. We don't recommend it for Muse:

- The key ends up in your chat history and in the connector's code, instead of in Muse's credential store.
- You lose Muse's protection that keeps the real key away from the agent.

The secure page takes one extra click and keeps the key out of everything Muse reads.

## Let your agent make the call

Once call4me is connected, paste this into Muse:

> Use call4me for phone calls. Call [business] at [phone number] and [what you want done]. Before dialing, check call4me_get_requirements and ask me for anything missing in one message. Ask me before agreeing to anything that costs money, and tell me the result in one or two lines.
