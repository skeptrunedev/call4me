---
title: "How to make phone calls from Codex with MCP"
seoTitle: "Codex MCP phone calls: OAuth setup and real test"
subtitle: Give Codex a calling tool, keep your credentials out of the prompt, and bring phone answers back into the research it is already doing.
description: "Connect Codex to call4me through MCP, follow our verified CLI setup, and fix 'MCP tool call requires approval, but approval policy is never' in codex exec."
date: 2026-10-03
updated: 2026-10-14
tags: codex, mcp, ai agents, ai phone assistant
authors: nick
imageAlt: Codex researching online, calling a business through MCP, and returning the answer to the task
---

**Codex can make phone calls through a calling MCP server.** Connect call4me once, then ask Codex to call a business with a goal and clear limits. A voice caller handles the conversation; Codex follows the transcript and uses the result in the task you already gave it.

If Codex is your personal assistant, that task might be reviewing subscriptions, planning an appointment or comparing businesses. Add the phone questions to that existing task, with the relevant context and permission for any change.

For business paperwork, see our [Wyoming registered agent consent example](/blog/wyoming-registered-agent-consent-form). It includes a real call that got the document emailed and a suggested Codex brief for requesting your own missing document.

We verified this with **Codex CLI 0.160.0 on October 3, 2026**. The practical test was private dining research: read the restaurants' official websites, identify missing or contradictory information, and call to clarify it. It was research only, with no invented event, reservation, or payment.

If `codex exec` stopped with `MCP tool call requires approval, but approval policy is never`, jump to [the fix](#fix-mcp-tool-call-requires-approval-but-approval-policy-is-never).

## Codex MCP setup for a phone calling server

This setup uses Codex as an MCP client. The calling server exposes the tools, and Codex chooses when to invoke them during your task.

You need Codex, a [call4me account](/login?next=/account), and calling credits for the phone part. Your Codex sign in and your call4me connection are separate accounts.

For browser OAuth:

```bash
codex mcp add call4me --url https://call4.me/mcp
codex mcp login call4me
```

Complete the call4me sign in in your browser. Then check the configuration:

```bash
codex mcp list
```

Start a fresh Codex session and use `/mcp` to inspect the active connection. Ask:

> Use call4me_get_balance to check the connection. Show whether it worked. Do not place a call.

OpenAI's [MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) confirms that Codex supports remote HTTP servers with OAuth or bearer authentication. It also documents the configuration file and `/mcp`. We completed a fresh browser OAuth connection to the canonical endpoint with Codex CLI 0.160.0, approved the call4me consent screen, then successfully ran `call4me_get_balance` in a new session. That verifies this sign in and account read. The restaurant calls below used an earlier bearer connection.

### Alternative: an API key in your environment

Copy your personal call4me API key from the account page into your own terminal, rather than into the agent's prompt. In Bash, this reads it without echoing it:

```bash
read -rsp 'call4me API key: ' CALL4ME_API_KEY
printf '\n'
export CALL4ME_API_KEY
codex mcp add call4me --url https://call4.me/mcp --bearer-token-env-var CALL4ME_API_KEY
codex
```

The environment variable must be available to the process that launches Codex. Opening a new terminal or launching a desktop app does not necessarily carry this variable over. Use your credential manager for persistence.

We checked `--url`, `--bearer-token-env-var`, and `mcp login` against the installed CLI help and OpenAI's [command reference](https://learn.chatgpt.com/docs/developer-commands). The flag stores the variable's name in configuration, rather than the key value. This keeps the key out of the setup command and prompt; it does not make the process environment a separate secret vault.

## Give the caller a bounded task

The most useful prompt describes what Codex already knows, what the phone call must add, and what it may agree to.

> Research Waterbar and EPIC Steak in San Francisco using their official private dining pages. List the published facts and anything missing or inconsistent. Then call each restaurant once to clarify those gaps. This is general research: we do not have an event date or group size, and you must not invent one. Do not book, hold space, give a card, or agree to a charge. Return a comparison that separates website information from phone answers and identifies anything still unresolved.

For your own task, name the intended businesses and phone numbers, and set any time or spending limits before dialing. If you want a reservation, provide the date, headcount, name, and acceptable alternatives. Research and booking need different authority.

### A cancellation inquiry from your existing task

This is a proposed brief you can adapt, separate from our recorded restaurant test:

> For the subscription we selected, check the business's official cancellation instructions first. Use call4me to call only about terms or steps we still cannot establish. Ask about the cancellation route for my plan, any deadline or fee, and how confirmation works. Do not cancel, change the plan or accept an offer. Return the answers and remaining steps to this task, including who answered and anything unresolved.

Our recorded [Planet Fitness inquiries](/blog/cancel-planet-fitness) show why location and plan details matter. If the relevant department is closed, use the [scheduled calling workflow](/blog/schedule-phone-calls-claude-code-codex) with the complete questions and limits saved in the brief.

## Follow the call back into the same task

| Tool | What Codex does with it |
|---|---|
| `call4me_get_requirements` | Checks which facts the type of call needs |
| `call4me_place_call` | Starts the authorized call and returns a call ID |
| `call4me_get_call` | Reads status, transcript, open questions, and final outcome; `wait_seconds` lets it wait for a change |
| `call4me_answer_question` | Sends an answer if the caller needs one during the conversation |
| `call4me_get_recordings` | Retrieves available recordings after the call |

These are call4me's [documented calling tools](https://call4.me/llms.txt). A call ID means the call was submitted. Codex should keep following it until it ends, or say clearly that it is still running. If a question falls outside your instructions, it should ask you rather than guess.

The final answer should distinguish what a website says, what the phone conversation established, and what remains unknown. A recording can be pending or unavailable; a missing recording does not justify inventing a transcript.

## What the CLI test established

We used a fresh session and kept the MCP connection separate from our normal configuration. A first run successfully checked the account but stopped before dialing because the call required approval and that run could not obtain it ([why, and the fix](#fix-mcp-tool-call-requires-approval-but-approval-policy-is-never)). The next run used the CLI's automatic approval review for the two explicitly authorized research calls.

The current endpoint at `https://call4.me/mcp` passed separate authenticated balance checks with both an existing account API key and fresh browser OAuth. The research calls ran through an existing connection on our older hostname. That establishes CLI calling through that connection and current endpoint authentication checks separately. We have not tested these steps in the Codex desktop app or IDE extension.

| Restaurant | Actual call result |
|---|---|
| Waterbar | Its virtual concierge explained that Bridge Tower was more enclosed and Looking Glass more open. Minimum spending, room fees, and capacity flexibility remained unresolved. |
| EPIC Steak | Its AI concierge repeatedly required a guest count. We kept that undecided, and it ended the call without answering the substantive private dining questions. |

EPIC's call also returned a question about the missing guest count. By the time Codex submitted an answer, the line had ended; the tool returned `the call has already ended`. A documented answer tool does not guarantee that a live question will be resolved in time.

There was another limitation: the voice caller used a saved profile name in its introduction despite the research instruction against disclosing profile data. Codex identified this in its trace. Review which identity details a caller will use before delegating a call; this test does not establish that every prompt constraint was honored.

The complete website findings, call outcomes, and recordings belong in our [web research plus phone calls walkthrough](/blog/agent-web-research-phone-calls-sf-private-dining). That page carries the result evidence; this page explains the Codex setup and workflow.

Listen to the two calls: [Waterbar recording](/static/blog/sf-private-dining-waterbar.mp3) and [EPIC Steak recording](/static/blog/sf-private-dining-epic-steak.mp3). Both reached automated concierges, so their answers are not human staff confirmations.

## Fix "MCP tool call requires approval, but approval policy is never"

```text
MCP tool call requires approval, but approval policy is never
```

Codex rejected the tool call itself, before anything reached the MCP server. If the tool was `call4me_place_call`, nothing was dialed. Your credentials are fine, so don't reconnect.

**Why it happens.** Two Codex settings collide:

1. **`codex exec` turns approvals off.** Headless runs use the approval policy `never` by default, because nobody is there to answer a prompt. An interactive session started with `-a never`, or with `approval_policy = "never"` in your config, behaves the same way.
2. **Most MCP tools need approval.** Each MCP tool has an approval mode. The default, `auto`, requires approval for any tool the server does not mark read-only.

When a tool needs approval and approvals are off, Codex refuses the call with this message. call4me marks lookups like `call4me_get_balance` read-only, so they run. Placing a call dials a real phone, so it is not read-only. That is why the balance check works and the call does not.

We traced the message to Codex's source (`codex-rs/core/src/mcp_tool_call.rs`) and reproduced it with Codex CLI 0.162.1 on October 14, 2026. Under `codex exec`, a read-only call4me tool completed and a non-read-only one failed with exactly this text.

### Fix 1: approve only the tool you need

This is the right fix for scripts and scheduled jobs. Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.call4me.tools.call4me_place_call]
approval_mode = "approve"

[mcp_servers.call4me.tools.call4me_answer_question]
approval_mode = "approve"
```

The second entry matters too. If the business asks something during the call, Codex answers through `call4me_answer_question`, which is not read-only either. Without it, the call starts and then Codex hits the same error halfway through. Add `call4me_schedule_call` the same way if your job schedules calls for later.

Or set it for a single run (repeat `-c` for each tool):

```bash
codex exec -c 'mcp_servers.call4me.tools.call4me_place_call.approval_mode="approve"' "your task"
```

The modes are `auto` (the default), `prompt` (always ask), `writes` (ask unless the tool is read-only) and `approve` (never ask). `default_tools_approval_mode` under `[mcp_servers.call4me]` changes the mode for every tool on the server. Prefer the per-tool setting: approving `call4me_place_call` does not also let an unattended run buy a phone number or add funds.

In our test, approving one tool this way got the request through to call4me while approvals stayed off for everything else. The tool still dials only what your task tells it to, so keep the recipients and limits in the brief.

### Fix 2: let Codex's automatic reviewer decide

```bash
codex exec --approve-for-me "your task"
```

`--approve-for-me` switches the approval policy to `on-request` and sends each approval to Codex's automatic reviewer instead of a person. It also runs shell commands in the `workspace-write` sandbox. The reviewer let our explicitly authorized test request through. It judges each request, so a call your prompt did not authorize can still be refused.

### Fix 3: run Codex interactively

Start `codex` without `-a never`. When the model wants to dial, Codex shows the tool call and asks you. Check the business and the task before you approve.

### What not to do

`--dangerously-bypass-approvals-and-sandbox` also makes the error go away, because Codex auto-approves every MCP tool when approvals are off and the sandbox is disabled. It also turns off the sandbox for every shell command in the session. Use Fix 1 instead.

## Other setup problems

**If tools do not appear**, check `codex mcp list`, start a fresh session, and inspect `/mcp`. Verify that you configured the provider environment you actually use. A connection on another machine is not this session's connection.

**If authentication fails**, use the canonical endpoint and reconnect with `codex mcp login call4me`, or check that the bearer variable exists in the launching process. Do not paste a key into the chat as a repair step.

During our fresh OAuth test, Codex initially reported `Authorization server issuer mismatch`. We traced this to a server discovery bug: a machine GET carrying `MCP-Protocol-Version` received the installation HTML instead of an authentication challenge. We fixed the route to return the challenge and its protected resource metadata, added regression tests, then completed browser sign in and an authenticated read on production. We kept issuer validation intact. If this error recurs, report the exact endpoint and CLI version rather than disabling validation.

**If a status check times out**, inspect the same call ID again before retrying the dial. A tool timeout does not establish that the phone call ended, and a second placement can create a duplicate call.

For the corresponding Claude Code workflow, see [Claude Code phone calls](/blog/claude-code-phone-calls). For other integrations, see our [calling MCP comparison](/blog/phone-calling-mcp-comparison). For how the voice conversation is handled, see [the voice stack explanation](/blog/cascaded-voice-stack-vs-gpt-live).

For calls after a business opens, see [scheduling a call and retrieving its result later](/blog/schedule-phone-calls-claude-code-codex). If Codex runs inside T3, use our [tested T3 provider workflow](/blog/t3-code-phone-calls). For developers deciding what to build themselves, the [Twilio MCP guide](/blog/twilio-mcp-phone-calls) distinguishes documentation tools from a conversational calling runtime.
