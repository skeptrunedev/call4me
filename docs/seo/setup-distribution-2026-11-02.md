# Setup instructions and distribution audit

Verified November 2, 2026. The audit compared the repository, live install page
and existing directory listings. Third party listing edits, reports and messages
have not been sent. This note contains proposed factual corrections, not outreach.

## Canonical setup

The [live install page](https://call4.me/mcp) directs ChatGPT users to the
[call4me plugin](https://chatgpt.com/plugins/plugin_asdk_app_6abdec89d46c81919cda058ca9f62cb8).
Its URL is defined by `CHATGPT_PLUGIN_URL` in `src/server/lib/pages.ts`.
Claude Desktop and claude.ai use a custom connector at `https://call4.me/mcp`.
Claude Code and Codex use the commands on the install page. The hosted MCP
endpoint uses Streamable HTTP and account authentication.

The ChatGPT plugin supports a narrower set of tasks than the general MCP server.
It does not handle medical or dental appointments, health insurance, government
ID numbers or account passwords. Its actual categories and fields come from
the ChatGPT tool surface, not from the general product description.

This change aligns `README.md` and the generated Agent Skill with the plugin
installation path. It also aligns the packaged ChatGPT onboarding skill with
the task first setup flow: collect only what the requested call needs and save
profile details only with the user's agreement.

## Existing listings

### Glama

URL: https://glama.ai/mcp/servers/skeptrunedev/call4me

The mirrored README currently includes:

> claude desktop / claude.ai / chatgpt: settings, connectors, add custom connector: https://call4.me/mcp

Proposed replacement: separate ChatGPT from that line. Direct ChatGPT users to
the plugin install link above and then to account sign in. Retain the custom
connector instruction for Claude Desktop and claude.ai.

The repository README is the correction source. Synchronization into Glama is
pending the git push and a subsequent live check. No synchronization timing or
automatic refresh guarantee has been established.

### AllMCPs

URL: https://allmcps.com/mcp/call4me

The generated “Setup and configuration” section currently says:

> Claude Desktop, Claude.ai, and ChatGPT can add the endpoint through settings and connectors.

Proposed replacement:

> Claude Desktop and claude.ai connect to https://call4.me/mcp through a custom connector. ChatGPT users install the call4me plugin and sign in to their call4me account. Current instructions: https://call4.me/mcp.

Its endpoint and Claude connector instructions are accurate. The ChatGPT
sentence needs a listing correction or a refresh from the updated README.
Ownership access was not exercised and no edit was submitted.

### Electra Index

URL: https://electraindex.com/mcp/call4me

The page labels its task matching automatic and low confidence. It associates
call4me with “answer support phone calls”, “screen job applicants” and
“make outbound sales calls”. These labels do not establish that call4me is a
general inbound support or recruiting service, or that ordinary accounts can
make sales calls. Sales calling requires explicit account approval in the
server; the general product is for requested calls to businesses.

Proposed replacement for the task summary:

> call4me lets a user's assistant call businesses for reservations, appointments, customer service questions and other requested errands. It navigates phone menus, waits on hold, returns the outcome and transcript, and can ring the user to join. It is not a general inbound support or recruiting service.

The page reports `https://call4.me/mcp` correctly and links the official MCP
Registry as its source. The issue is the directory's interpretation, not the
registry endpoint. Its page offers a feedback form. No feedback was submitted.

### MCP.so

URL attempted: https://mcp.so/servers/call4me

The request timed out. Current instructions and editing access remain
unverified; no stale content claim or correction has been inferred.

## Verification and followup

The generated Agent Skill and README were checked against the canonical plugin
URL, and all 12 directory surface tests passed. Those tests verify that ChatGPT
exposes its intended categories and tool set, including the restricted task
boundaries.

After push, verify the README on GitHub and the generated Agent Skill on the
live site, then check whether Glama has synchronized the README. AllMCPs and
Electra corrections remain proposed text until an authorized listing edit or
message is submitted and the resulting public page is checked.

## Update, November 5

Glama and AllMCPs picked up the corrected README without any request, so neither needs an edit. Electra still showed the wrong tasks, so its "Info is outdated" report was filed with the proposed summary. It re-checks the official source itself, so check the page again later.
