---
title: "How to use Meta Muse with custom connectors (and give it a phone)"
seoTitle: How to use Meta Muse custom connectors for phone calls
subtitle: Connect Meta Muse to a phone calling service through a custom connector. Here is our tested setup, what a live balance check proves, how native calling differs and what to check before dialing.
description: Set up a Meta Muse custom connector for call4me. Secure credential steps, MCP checks, native calling beta and troubleshooting from our account tests.
date: 2026-10-01
updated: 2026-10-04
tags: meta muse, ai agents, mcp, ai phone assistant
authors: nick
imageAlt: Meta Muse AI agent connectors, with phone calls as the worked example
---

**The short answer:** Muse can build a custom connector to call4me's hosted MCP server. In our October 1 account test, we asked Muse to build the integration, entered a key through its **Connect** card and received a live balance result. We did not find a native MCP server settings form in that tested web session.

An early call4me user tried our general MCP setup prompt and Muse refused, saying its tools were fixed. Asking it to **build a custom connector** worked in our own account. This guide separates that observed result from Muse's descriptions of what its connector can do.

If Muse already manages your personal tasks, the reason to add calling is to finish the phone part in that conversation. Examples include asking a gym about cancellation requirements or a restaurant about availability. Our recorded [subscription inquiries](/blog/cancel-planet-fitness) provide questions to adapt after your connection check succeeds. The verified Muse setup and the still unverified calling steps are detailed below.

## What is Meta Muse?

Muse is Meta's personal agent, announced September 8, 2026. Meta's [launch page](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a US rollout on iOS, Android and muse.ai, with free access for many tasks and subscriptions for heavier use. It works on a dedicated cloud computer with a browser and can continue tasks after you close the app.

## What can the Muse AI agent do?

Muse can use connected services and its browser to work on tasks. A phone connector adds an explicit calling service to that workflow, useful when a website leaves questions unanswered or an errand requires a conversation.

Meta announced a US business calling beta on September 16, [according to TechCrunch](https://techcrunch.com/2026/09/17/rival-ai-agents-instinct-and-metas-muse-both-add-the-ability-to-make-calls/). It reproduces [Ryan Fox's announcement](https://x.com/wailord/status/2100342273854894533). We have not tested that native calling path. The setup below uses a separate Call4me account and its calling tools, and does not measure which service is better.

## How Muse connectors work

Meta's [technical safety description](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse) distinguishes built in connectors from custom connectors Muse can write for APIs or CLIs. Skills supply instructions for using those connections. Our setup asks Muse to build a client for Call4me's remote MCP endpoint and save instructions for using it.

### Where your keys go

Meta describes a credential store separated from Muse's runtime. Code receives a surrogate token; Sentinel authorizes network requests and inserts the real credential at the network boundary. Meta also says Muse can still make mistakes. This is Meta's documented architecture, not a security audit of our custom connector.

In our test, we entered the Call4me key in the **Connect** page and did not paste it into chat. That is the credential entry path this guide uses. A successful balance check proves that authentication worked for that request, not that we independently verified every credential protection.

## Does Muse support MCP?

We did not find a place to add an MCP server URL in the web session we tested. Muse initially refused our request to install a remote MCP server, then accepted a request to build a custom connector using the official MCP SDK.

MCP is a tool protocol, and a custom client can connect to an MCP server. That is different from a native MCP settings screen. [Claude Code](/blog/claude-code-phone-calls), [Codex](/blog/codex-phone-calls) and [Grok](/blog/grok-connectors-mcp-phone-calls) have their own setup paths.

## How to use Meta Muse with a custom connector: phone calls

This is the exact message we sent Muse on October 1:

> Build a custom integration to call4me so you can place phone calls for me from any future conversation. It's a hosted remote MCP server (streamable HTTP) at https://call4.me/mcp. Use the official MCP SDK to connect. It authenticates with my call4me API key (I can get it from https://call4.me/account): ask me for it through your secure credential flow and store it in your Secure Credentials Store, never in chat, and send it as an Authorization: Bearer header. Then list the tools, test call4me_get_balance end to end, show me the result, and save the integration as a reusable skill.

Within about half a minute, Muse requested a Call4me key and presented a card labeled **Call4me**, **Connector**, with a **Connect** button. It linked to our account page and described the secure credential flow.

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
- **Tool discovery reported.** Muse listed calling, status, transcript, recording, profile and account tools. We did not execute every tool in that setup test.
- **Key entered outside chat.** We used the connector's credential page. Muse described secure token substitution; our balance result does not independently prove that implementation.
- **Reusable skill reported.** Muse said it saved a skill named `call4me`. That statement alone does not establish that every future conversation will discover or execute it.

It also volunteered the one thing worth knowing before the first call: call4me may ring your own phone to verify you with a business or patch you in, so it said it would always give you a heads up first.

### Rechecking the saved connector on October 4

We reopened muse.ai in the same signed in account to test reuse before attempting a business call. It restored the October 1 main conversation and its connector setup task history. Opening the website did **not** create a fresh conversation.

The page first showed **Warming up**. Our message requested a balance check only, with no call authorized. Its delivery label changed from **Still sending** to **Delivery not confirmed**. The agent later showed **Connected**, but we did not receive a new balance result or a new connector task.

This attempt does not establish that the saved connector failed. It also does not prove that it works from a fresh conversation. Message delivery and connector execution are separate checks. We did not place a Muse business call, so there is no Muse call recording to publish here.

| Check | What our evidence supports |
| :--- | :--- |
| October 1 setup | A Connect card, credential entry outside chat and a balance result matching our account |
| Saved skill claim | Muse reported saving the skill, and the old setup task history remained visible on October 4. We did not inspect the saved skill itself |
| New balance check | Requested on October 4, but message delivery was not confirmed and no result returned |
| Calling from a fresh conversation | Still unverified |
| Native Muse phone calling | Not tested |

For an executed phone workflow with recordings, see our [Claude Code test](/blog/claude-code-phone-calls), [Codex test](/blog/codex-phone-calls) and [Grok Bot test](/blog/grok-connectors-mcp-phone-calls). Those results establish the named client paths, not Muse's behavior.

## Troubleshooting Muse custom connectors

### Muse says it cannot install MCP servers

That was our initial refusal. Ask it to build a custom connector to the remote MCP endpoint using the official SDK, with credential entry through the secure Connect page. Do not interpret the refusal as proof that Muse cannot write an integration.

### Muse hits an SDK import error

Our October 1 setup hit an import error and Muse corrected it before returning a balance. Ask it to resolve the client error and repeat a balance check before attempting a paid call. A connector card appearing does not prove its generated client runs successfully.

### The agent says Connected but your message is not delivered

We saw both labels together on October 4. Check the message's own delivery state and whether a new task or tool result appears. Without a response, we could not attribute the problem to Call4me authentication, the generated client or Muse's message transport. Wait for a confirmed read only check before requesting a call.

### A later conversation does not discover the skill

Ask Muse to locate and read the existing `call4me` skill, then run `call4me_get_balance` with the saved credential. Do not rebuild the connector or paste a key into chat just because the agent cannot recall it. This is a diagnostic step to try, not a future conversation path we have verified.

### The call is completed but the question is unanswered

Read the outcome and transcript. A recorded menu may state general policy without confirming availability for your group. Voicemail is a destination, not a booking. Ask for separate lists of confirmed answers and open questions before deciding what to do next.

## Prepare a first informational call from Muse

For a first test, ask a general question that does not require a reservation or payment. The following is an illustrative tool request, not a recording of a call from our October 1 setup:

```json
{
  "name": "call4me_place_call",
  "arguments": {
    "to": "+15550100199",
    "business": "Example Restaurant",
    "category": "general",
    "goal": "Ask whether four people can walk in for dinner tonight and what arrival time is recommended. Do not reserve, hold a table, purchase, leave a message or share callback details.",
    "details": {"questions": "Walk in policy for four and recommended arrival time"},
    "max_minutes": 4
  }
}
```

Replace the example number with the business's published number, and check its local hours. Ask Muse to run `call4me_get_requirements` for category `general` before dialing and use the live tool schema for required fields. For a real reservation, use the appropriate category and supply the actual date, party size and name.

Call4me exposes status and transcripts through `call4me_get_call`. A finished call can still have an unresolved goal. Ask Muse to distinguish answers from a human, recorded menu information and unanswered questions. If a caller question comes back, `call4me_answer_question` can relay an answer. We did not exercise that live question path in the October 1 test.

## Why not just paste the key into the chat?

A personal Call4me MCP URL contains a credential. Pasting it into chat exposes that credential to the conversation and can carry it into generated code or shared screenshots. Use the **Connect** card and the canonical endpoint, `https://call4.me/mcp`, for this setup.

That follows Meta's documented credential entry path. We did not audit the custom connector's storage, generated code or logs, and a balance check should not be presented as that audit.

## Let your agent make the call

Once call4me is connected, paste this into Muse:

> Use call4me for phone calls. Call [business] at [phone number] and [what you want done]. Before dialing, check call4me_get_requirements and ask me for anything missing in one message. Ask me before agreeing to anything that costs money, and tell me the result in one or two lines.
