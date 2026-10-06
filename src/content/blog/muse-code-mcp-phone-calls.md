---
title: "Connect Muse Code to phone calling tools with MCP"
seoTitle: "Muse Code MCP phone calls: configuration and checks"
subtitle: Configure the developer client, check the tools it actually loaded and keep an account read separate from a completed phone task.
description: "Connect Muse Code to Call4me using remote MCP. Includes configuration examples, an access check prompt, a bounded inquiry brief and troubleshooting steps."
date: 2026-10-05
tags: meta muse, muse code, mcp, ai phone assistant
authors: nick
imageAlt: Muse Code connects to Call4me through MCP, checks account access and returns evidence from an authorized task
---

**Muse Code can connect external tools through MCP.** To add phone calling, configure Call4me in the developer client's settings, authenticate the connection and inspect the actual tool result before assigning an inquiry.

This is the terminal client, not the consumer Muse app. Our [consumer Muse guide](/blog/meta-muse-ai-agent-phone-calls) describes a different custom connector workflow. Configuring one client does not configure the other.

We installed **Muse Code 1.4.3 (1.4.3-R5018.1)** on Linux on October 5, 2026 and checked its native commands and configuration behavior. A local MCP fixture successfully initialized and listed its tool through the native client. Production discovery identified Call4me's OAuth requirement. Meta sign in was approved, but the client then required a payment method and signed out. We have not completed a model driven account read or phone call in Muse Code.

## Start with the right client and settings

Check the installed client:

```bash
muse --version
muse mcp --help
```

Meta's [configuration reference](https://dev.meta.ai/docs/muse-code/configuration) places user settings at `~/.config/muse/settings.json`. When `XDG_CONFIG_HOME` is set, our test confirmed the selected path is `$XDG_CONFIG_HOME/muse/settings.json`. If you already have settings, merge the server entry into the existing object. Replacing the whole file could discard other connections and preferences.

The [MCP documentation](https://dev.meta.ai/docs/muse-code/extending#mcp-servers) describes remote HTTP servers, environment variable interpolation and the interactive `/mcp` inventory. Authentication to the model provider and authentication to an MCP service are separate. Completing `muse login` does not establish access to your Call4me account.

## Add the remote calling server

Sign in to your [Call4me account](/login?next=/account). The calling server URL is `https://call4.me/mcp`.

Our tested client accepted this [settings fragment](/static/blog/resources/muse-code-mcp-phone-calls/settings-fragment.json):

```json
{
  "schema_version": 1,
  "mcpServers": {
    "call4me": {
      "type": "streamable-http",
      "url": "https://call4.me/mcp",
      "enabled": true,
      "mode": "required"
    }
  }
}
```

Authenticate the calling service with the native command:

```bash
muse mcp login call4me
```

Complete the service's authorization in the browser. Then start Muse Code and use `/mcp` to inspect the connection. We verified that unauthenticated production startup recognized the OAuth requirement and requested this exact login command. We have not completed the browser authorization or an authenticated account read in Muse Code.

`mode: "required"` made our isolated run fail when its test server was unreachable. `mode: "optional"` allowed that run to continue without the server. Whichever you choose, inspect actual tool availability before a phone task.

### A configuration mismatch we caught

The current documentation uses `mcp_servers` and `transport: "streamable_http"`. That legacy combination worked in our isolated test. The installed client's help and migration instructions use `mcpServers` and `type: "streamable-http"`, which also worked and is the shape above. Do not mix both top level server blocks: our test then contacted neither server.

There is a more consequential difference. Although the documentation describes environment variable interpolation, our configured HTTP header `Bearer ${MUSE_CONFIG_PROBE_TOKEN}` was sent literally to the local fixture. Setting that synthetic environment variable did not substitute its value. A literal synthetic header did arrive correctly.

For this tested version, do not assume an HTTP header placeholder carries your API key. The OAuth configuration above avoids putting a key in that header or a shared settings file. If you choose key authentication, establish how your exact client version supplies the credential before relying on it. Do not paste a real key into a downloadable example.

## What our isolated test establishes

The fixture was an HTTP MCP server on localhost, with one harmless tool and no account credentials or dialer. Muse Code used its deterministic `echo` provider to start the connection without a paid model session. We recorded actual `initialize`, `notifications/initialized` and `tools/list` requests.

That establishes configuration loading and MCP discovery. It does not establish model reasoning, tool selection, access to your account or calling quality. The [configuration probe results](/static/blog/resources/muse-code-mcp-phone-calls/configuration-probes.json) publish the sanitized test cases and observations. No fixture result is presented as a live Call4me result.

## Check access without dialing

Open a fresh session and inspect `/mcp`. Then send this [access check prompt](/static/blog/resources/muse-code-mcp-phone-calls/access-check.txt):

> Use the actual call4me_get_balance tool to check my calling connection. Report whether the tool succeeded and whether calling tools are available. Do not place or schedule a call, buy a number, change my account or print private profile details. If the tool is absent or returns an error, report that exact limitation instead of describing a hypothetical success.

Look for a real tool invocation and a returned result. An agent saying “the connection is ready” from memory is insufficient. This check establishes access to the calling account; it does not establish a dialed call or an answered question.

| Check | Evidence to retain |
| :--- | :--- |
| Client | Installed Muse Code version |
| Configuration | Server loaded without a settings warning |
| Tool discovery | Calling tools appear in the live inventory |
| Account authentication | `call4me_get_balance` returns an actual result |
| Phone task | A separate authorized call produces a record and useful evidence |

## Give the caller a bounded inquiry

Use a specific gap in research you already did. Replace every bracketed field in this [inquiry brief](/static/blog/resources/muse-code-mcp-phone-calls/inquiry-brief.txt):

```text
We need to establish [one unresolved fact] about [business].
The business's official contact page is [source URL].
Our relevant task facts are [facts needed to answer the question].

Find the published phone number and show me the proposed question and
call duration. Wait for my permission for this specific attempt.
Check call4me_get_requirements and gather any missing required facts.

Once I approve, place one inquiry with call4me_place_call. Set max_minutes
to the duration I approved. Do not book, purchase, cancel, disclose other
personal details, request a callback or leave a message.
Follow the returned call id using call4me_get_call until it ends or needs
my input. Do not create a duplicate call when a status request is slow.

Return the actual outcome, source of the answer, unresolved questions
and available recording. A recording or voicemail may establish policy
without answering our specific question. Never fill in the missing answer.
```

Call4me's calling interface separates placing a call from following it. The first response can return while dialing is still underway. Retrieve that same call's result before deciding that the task is complete.

Our [recorded private dining research](/blog/agent-web-research-phone-calls-sf-private-dining) shows this distinction in executed Codex and Claude Code tasks. Automated concierges and unanswered questions are part of those actual results. They are not Muse Code performance evidence.

## Troubleshoot the stage that failed

**Settings warning:** check the configuration key and transport spelling for your installed version. Inspect the warning before retrying. `muse config validate` is for managed enterprise documents, not a general validator for your flat user settings file.

**Server missing:** inspect `/mcp` in the session doing the work. Confirm that the edited settings belong to this machine and user, and that `enabled` is true.

**Authentication failure:** inspect the current OAuth state and complete the named MCP login. If you chose a header with a literal `${VAR}` placeholder, exporting the variable again does not fix the behavior we observed in this version. Keep the credential out of the error report.

**Account read succeeds but no call happens:** check whether the current request supplies the required facts and authorizes that particular call. Account access and permission to act are separate requirements.

**Call ended but the question remains unanswered:** inspect the outcome and transcript. Return the missing answer as unresolved. The caller reaching a menu is a narrower result than a person confirming availability.

For reusable consumer workflows, use our [Grok Bot templates](/blog/grok-bot-templates) or [first Muse task](/blog/meta-muse-first-task). For the developer client, finish the configuration and access checks here before trying a bounded inquiry.
