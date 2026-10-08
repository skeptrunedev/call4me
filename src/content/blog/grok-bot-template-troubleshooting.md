---
title: "Grok Bot calling prompts: recipient setup checklist"
seoTitle: "Grok Bot recipient setup checklist for calls"
subtitle: Check the recipient's Call4Me tools, account and task inputs before sharing a calling workflow. Includes a setup manifest and acceptance checklist.
description: "A recipient checklist for Grok Bot calling workflows, based on xAI documentation. Download the manifest and check tools, account access and task inputs."
date: 2026-10-05
updated: 2026-10-07
tags: grok, templates, mcp, ai agents, ai phone assistant
authors: nick
imageAlt: Recipient checklist for Call4Me access, calling instructions and current task inputs
---

**Use this checklist to review the recipient's Call4Me setup before a call.** It covers tools, account ownership, task inputs and result checks for a shared Bot or instruction file.

xAI's [template guide](https://x.ai/bot/guides/templates-for-grok-bot) says a copy needs its own setup and explicitly calls out custom MCP servers, scripts and code that are not included. A successful owner run therefore does not establish that a recipient can run the same workflow.

Download the [setup manifest](/static/blog/resources/grok-bot-template-troubleshooting/setup-manifest.txt) and [recipient acceptance checklist](/static/blog/resources/grok-bot-template-troubleshooting/recipient-checklist.csv). These checks follow xAI documentation. We have not verified a template installation across two accounts for this guide.

## First decide what was shared

Three similar looking situations have different ownership and access rules:

| What you shared | What the other person uses | First question to ask |
| :--- | :--- | :--- |
| A product template link | Their own new copy of a Bot | Did their copy complete its required setup? |
| A Team Bot | A Bot maintained by its owner | Is this their account's access or a Bot credential? |
| A prompt or instruction file | The Bot they paste it into | Have they added the dependencies themselves? |

For a public template, the recipient owns and maintains their copy separately. A Team Bot is maintained centrally by its owner. Do not troubleshoot one as if it were the other. [Official Team Bot comparison](https://docs.x.ai/grok-bot/team-bots#team-bots-personal-bots-and-public-templates).

If you shared our [five phone calling prompts](/blog/grok-bot-templates), those are instruction files. They do not install Call4Me or authorize calls.

<span id="trace-the-failure-from-instruction-to-evidence"></span>
<span id="symptom-the-bot-knows-the-workflow-but-cannot-find-a-tool"></span>

## Check the calling tools

Ask the Bot to check for `call4me_get_balance`, `call4me_get_requirements`, `call4me_place_call`, `call4me_get_call` and `call4me_get_recordings` in its actual available tools. Compare that with the setup manifest.

For Call4Me, use our [Grok connector setup instructions](/blog/grok-connectors-mcp-phone-calls#how-to-add-an-mcp-server-to-grok-bot). After the recipient adds their own connection, ask for `call4me_get_balance`. This is an access check, not a phone call. Review the returned account data before any calling workflow proceeds.

Do not transfer the owner's key or personal MCP URL as a fix. A template should describe where recipients get their own access, not embed the owner's account.

<span id="symptom-the-plugin-exists-but-requests-a-login"></span>

## Check authentication

Grok's [official troubleshooting instructions](https://docs.x.ai/grok-bot/troubleshooting#a-plugin-will-not-install-or-authenticate) direct you to **Marketplace**, **Your plugins**, then the installed plugin's authentication action. Complete the browser authorization using the intended account and return to the Bot. Some connectors also need administrator configuration.

After authentication, repeat `call4me_get_balance` and confirm the result belongs to the recipient. A plugin card being visible does not prove that the right account is connected or that a call can be placed.

If the Bot is waiting rather than failing, inspect its conversation and computer for a login, question or approval prompt. Preserve the exact error text when there is one. [Grok troubleshooting](https://docs.x.ai/grok-bot/troubleshooting#a-bot-appears-stuck).

<span id="symptom-the-bot-uses-the-owner-39-s-account"></span>

## Check whose account the Bot uses

For a Team Bot, xAI distinguishes account sign in from key based configuration: signed in plugins use the person asking, while configured tokens can belong to the Bot. Custom remote MCP access depends on its authentication method. [Official Team Bot setup](https://docs.x.ai/grok-bot/team-bots#plugins).

Before publishing any calling workflow, decide explicitly whether you intend a shared account or separate recipient accounts. For a personal template copy, use the recipient's own account. Inspect the connection locally, but record only that ownership was checked. Keep keys, signed URLs and tokens out of screenshots and bug reports.

<span id="symptom-it-cannot-find-a-file-or-script"></span>

## Check required files

Ask for the exact referenced file and where the workflow expects it. Check whether it is actually available to the recipient Bot. Do not assume that an owner path, prior attachment or private document link will work in another account.

For workflows that can be expressed as instructions, prefer a [reusable method](/blog/grok-bot-reusable-skills) over undocumented scripts. This removes a dependency only when the method can really perform the same job.

<span id="symptom-it-runs-but-gives-the-wrong-answer"></span>

## Check inputs and supported answers

Give it a different business and date. Ask which facts came from the current request and which came from saved context. The Bot should collect missing inputs instead of inheriting the owner's party size, availability or permission to call.

Then check the evidence behind the answer. In our [October 4 Grok restaurant call](/blog/grok-connectors-mcp-phone-calls#an-actual-grok-bot-call-october-4), the recorded menu said walk ins were welcome. It did not establish room for four at our preferred time. A copy that reports guaranteed availability from that recording has a result validation problem, even if every connector works.

Patch the method to keep confirmed facts, recorded policy and unanswered questions separate. Recheck with a supplied transcript before placing another call.

<span id="symptom-an-error-appears-after-a-call-started"></span>

## Check an existing call before retrying

Ask Grok for the actual id returned by `call4me_place_call`, then use `call4me_get_call` for that id. Do not create another call just because the chat showed an error. If the call finished, review its outcome and transcript and retrieve recording metadata with `call4me_get_recordings`. If no id was returned, report that uncertainty instead of claiming the call never happened.

For a check without dialing:

> Check the Call4Me phone workflow without dialing. Check the actual available tools and run call4me_get_balance. Identify missing access or required inputs without showing credentials. If this task already returned a call id, inspect that same id with call4me_get_call and call4me_get_recordings. Return the observed state, confirmed answers, unanswered questions and the setup step needed next. Do not create a call, booking or callback.

## Give recipients a setup manifest

[Download the manifest](/static/blog/resources/grok-bot-template-troubleshooting/setup-manifest.txt) and fill in the required tools and files, credential owner, task inputs, call limits and expected output. Keep keys and personal MCP URLs out of the shared file.

<span id="a-recipient-test-that-actually-establishes-portability"></span>

## Review the recipient setup

Run this on a separate recipient account using the template or artifact you intend to share. A second Bot in the owner's account is useful for checking skill reuse, but may already have access the recipient lacks.

1. Review the template details before adding it. Compare the included method and integrations with the manifest.
2. Follow the manifest without private instructions from the owner. Record any missing dependency or unclear step.
3. Authenticate with the intended account and run `call4me_get_balance`.
4. Supply new task inputs and request a call brief only. Verify the required inputs and duration cap, with no dialing.
5. Remove a required input. Verify the Bot asks rather than inventing a value.
6. Supply a labelled simulated partial result. Verify the unanswered questions remain visible.
7. If needed, approve one call with a duration cap. Follow its actual id and compare the final answer with the transcript, recording and unresolved questions.

The [acceptance checklist](/static/blog/resources/grok-bot-template-troubleshooting/recipient-checklist.csv) leaves observed results blank so you can record what happened. Keep a failure visible until you fix its cause and rerun that check.
