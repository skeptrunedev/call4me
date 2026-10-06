---
title: "Muse MCP: connect Meta Muse to phone calling tools"
seoTitle: "Muse MCP: Meta Muse connectors for phone calls"
subtitle: Connect Meta Muse to a phone calling service through a custom connector. Includes our tested setup, successful reuse in a fresh conversation and a recorded library inquiry.
description: "Use Muse MCP through a Meta Muse custom connector for phone calls. Tested setup, saved connector reuse and a recorded library call with staff answers."
date: 2026-10-01
updated: 2026-10-06
tags: meta muse, ai agents, mcp, ai phone assistant
authors: nick
imageAlt: Meta Muse AI agent connectors, with phone calls as the worked example
---

**Muse MCP setup uses a custom connector to reach Call4me's phone calling server.** In our October 1 Meta Muse account test, we asked Muse to build the integration, entered a key through its **Connect** card and received a live balance result. On October 6, a fresh conversation reused that connector to check access, call San Francisco's Main Library and retrieve the result. A staff member answered questions about laptop seating, outlets and WiFi. This guide gives you the tested connection steps and links to the [recorded library call](/blog/meta-muse-first-task#hear-the-actual-muse-library-call).

An early call4me user tried our general MCP setup prompt and Muse refused, saying its tools were fixed. Asking it to **build a custom connector** worked in our own account. This guide separates that observed result from Muse's descriptions of what its connector can do.

If Muse already manages your personal tasks, the reason to add calling is to finish the phone part in that conversation. Examples include asking a gym about cancellation requirements or a restaurant about availability. Our recorded [subscription inquiries](/blog/cancel-planet-fitness) provide questions to adapt after your connection check succeeds. The tested Muse setup, connector reuse and library calling workflow are detailed below.

## Start where your connection actually stands

Choose the next step from a tool result in the conversation you are using now. A previous successful setup is useful evidence, but it does not establish that a new conversation can run the connector.

| What you have now | Next step | Evidence to keep |
| :--- | :--- | :--- |
| No Call4me connector | Follow the custom connector setup below and enter the key through Connect | An authenticated balance result |
| A saved connector, but no result in this conversation | Run the read only reuse prompt below | The current tool response, or its exact failure |
| A fresh balance result and discovered calling tools | Prepare the [first informational call](/blog/meta-muse-first-task) | A specific destination, questions, caller identity and approved limit |
| A finished phone call | Read its transcript before accepting the task as done | Who answered, supported answers and unresolved questions |

Download the [connection and result worksheet](/static/blog/resources/meta-muse-first-task/connection-check.md) to record those checks. It starts empty and does not contain a new Muse test result.

For a saved connector, send:

> Find and read the existing Call4me connector and its saved instructions. In this conversation, use the saved credential to discover the current tools and execute call4me_get_balance once. Do not dial, schedule a call, change my profile or create a second connector. Do not print credentials. Report whether the request actually ran and show the returned balance, or the exact error without secrets. If the connector cannot be found, say so and stop.

On October 6, our access check in a fresh Muse conversation returned a successful balance result. Muse reported reading the saved skill and connector, discovering the current tools and executing `call4me_get_balance` once. That establishes successful reuse for this check, not reliable execution from every future conversation.

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

> Build a custom integration to call4me so you can place phone calls for me from any future conversation. It's a hosted remote MCP server (streamable HTTP) at https://call4.me/mcp. Use the official MCP SDK to connect. It authenticates with my call4me API key (I can get it from `https://call4.me/account`): ask me for it through your secure credential flow and store it in your Secure Credentials Store, never in chat, and send it as an Authorization: Bearer header. Then list the tools, test call4me_get_balance end to end, show me the result, and save the integration as a reusable skill.

Within about half a minute, Muse requested a Call4me key and presented a card labeled **Call4me**, **Connector**, with a **Connect** button. It linked to our account page and described the secure credential flow.

Here's the whole setup, start to finish:

1. **Get your call4me key.** Sign in at [call4.me](https://call4.me) and copy your key from [your account page](/login?next=/account).
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

This October 4 attempt did not establish that the saved connector failed or worked from a fresh conversation. Message delivery and connector execution are separate checks. We did not place a call during that attempt.

### Inspecting the saved connector on October 6

In the signed in Muse account, we opened **Settings**, then **Connectors**, then **Call4me**. The saved connector's detail page showed a **Disconnect** button and **Background sync** set to **Allow**. It did not display an explicit enabled toggle or the connector's tool names. We did not change any settings.

This establishes that the saved connector was visible in the account. It does not establish that its credential still authenticates, that a fresh conversation can execute it or that a phone call works. No new balance request or call was executed during this inspection.

### Reusing the connector in a fresh conversation on October 6

After the settings inspection, we opened a fresh Muse conversation and requested an access check without dialing. Muse returned a successful balance result and reported reading the existing Call4me skill and connector, discovering the current server tools and running `call4me_get_balance` exactly once. It also reported reading the general calling requirements and caller profile without changing the profile. No error was reported, and no call was placed or scheduled during this check.

This is a successful fresh conversation reuse result observed in Muse. It is not an independent audit of credential handling or a guarantee that later conversations will work. The October 4 delivery problem remains a separate historical result; it did not establish a connector failure.

| Check | What our evidence supports |
| :--- | :--- |
| October 1 setup | A Connect card, credential entry outside chat and a balance result matching our account |
| Saved skill claim | Muse reported saving the skill, and the old setup task history remained visible on October 4. That October 4 check did not inspect the saved skill itself |
| October 6 connector inspection | Call4me appeared under Settings and Connectors, with Disconnect and Background sync Allow visible. No tool execution was tested |
| October 4 balance request | Message delivery was not confirmed and no result returned |
| October 6 fresh conversation check | Muse returned a successful balance result and reported reading the saved skill and connector, discovering tools and executing the balance request once |
| October 6 library call | Muse placed one call through the saved connector, followed its status and retrieved the transcript and an available recording. Staff answered the informational questions |
| Native Muse phone calling | Not tested |

### The completed Muse library call

On October 6 at 4:22 pm Pacific, the fresh Muse conversation used its saved skill to execute `call4me_place_call` once for San Francisco's Main Library. The call record independently confirmed the four minute limit and completed status. Muse followed the same call with `call4me_get_call`, then used `call4me_get_recordings` and returned the transcript and an available WAV recording.

After an automated menu, a staff member confirmed that an adult can work quietly on a laptop in general seating, identified outlets on floors three, four and five, and said WiFi does not require a password or library card. Asked about restrictions, the staff member advised keeping the volume low. We did not measure WiFi speed, verify a particular network name or establish that a seat or outlet would be free on arrival. The interrupted library card question did not separately confirm the card policy for general seating.

Hear the [complete reviewed call and transcript](/blog/meta-muse-first-task#hear-the-actual-muse-library-call), or read the [dated result report](/static/blog/resources/meta-muse-first-task/executed-result-2026-10-06.md). This was an informational inquiry, with no reservation or purchase. It demonstrates one executed consumer Muse workflow through Call4me, not Muse's native calling service or every future task.

For other executed client workflows, see our [Claude Code test](/blog/claude-code-phone-calls), [Codex test](/blog/codex-phone-calls) and [Grok Bot test](/blog/grok-connectors-mcp-phone-calls).

## Troubleshooting Muse custom connectors

### Muse says it cannot install MCP servers

That was our initial refusal. Ask it to build a custom connector to the remote MCP endpoint using the official SDK, with credential entry through the secure Connect page. Do not interpret the refusal as proof that Muse cannot write an integration.

### Muse hits an SDK import error

Our October 1 setup hit an import error and Muse corrected it before returning a balance. Ask it to resolve the client error and repeat a balance check before attempting a paid call. A connector card appearing does not prove its generated client runs successfully.

### The agent says Connected but your message is not delivered

We saw both labels together on October 4. Check the message's own delivery state and whether a new task or tool result appears. Without a response, we could not attribute the problem to Call4me authentication, the generated client or Muse's message transport. Wait for a confirmed read only check before requesting a call.

### A later conversation does not discover the skill

Ask Muse to locate and read the existing `call4me` skill, then run `call4me_get_balance` with the saved credential. Do not rebuild the connector or paste a key into chat just because the agent cannot recall it. Our October 6 fresh conversation check succeeded through the saved connection. Recheck the actual response in your own conversation before dialing.

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

For a first phone task, use our [Muse library calling tutorial](/blog/meta-muse-first-task). For supplier calls, try the [supplier inquiry brief](/blog/meta-muse-supplier-quotes). The developer client has a separate [Muse Code MCP setup guide](/blog/muse-code-mcp-phone-calls), including a configuration mismatch found in our native client tests. Our [Grok Bot versus Meta Muse comparison](/blog/grok-bot-vs-meta-muse) explains the consumer workflow differences.

## Choose a useful task after the connection check

Our customer recordings show the kinds of outcomes to request once your calling connection works. These customers' assistant clients are unknown, so the examples below do not establish that Muse placed their calls.

| Task | Recorded result | What to ask Muse to return |
| :--- | :--- | :--- |
| [Check a store's stock](/blog/macys-bow-tie-stock-check) | Staff confirmed a matching bow tie and quoted a price. Nothing was held or purchased | Exact item match, quoted price, who checked and whether a hold exists |
| [Book a dinner table](/blog/book-dinner-reservation-by-phone) | Staff confirmed a table for four on October 8 at 7:30 pm. Cancellation terms were not established | Agreed date, local time, party size, booking name and any unresolved terms |
| [Replace an appointment](/blog/reschedule-doctor-appointment) | The old slot was already canceled; staff confirmed a replacement for October 8 at 1:30 pm | Old slot status, confirmed replacement and anything still needing your attention |

Each linked story contains its reviewed recording and transcript. For appointments, use the [personal assistant booking brief and confirmation checklist](/blog/ai-personal-assistant-appointment-booking) to define your acceptable times and permitted changes before calling. A suggested Muse brief is separate from proof that Muse executed it.

## Let your agent make the call

Once call4me is connected, paste this into Muse:

> Use Call4me to prepare one call to [business] for [task]. Verify its published phone number, run a fresh balance check and read the current requirements. Ask me for missing information in one message, then show the destination, caller identity, permitted actions and a four minute limit for approval. After approval, make one call using the live schema and max_minutes set to 4. Follow the returned call ID until it ends. If a status request fails, check that same ID before considering another call. Return who answered, what was confirmed, unresolved questions and the available transcript and recording. Ask me before expanding the task or agreeing to a cost.
