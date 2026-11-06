# Claude directory submission pack

Prepared November 5, 2026 from [Submit a connector](https://claude.com/docs/connectors/building/submission.md)
and [Submit your plugin](https://claude.com/docs/plugins/submit.md). Nothing here has been submitted.

Why it matters: when ChatGPT answers "how can Claude make phone calls", it searches Anthropic's sites and
cites `claude.com/marketplace/connectors/twilio`. call4me has no page there.

Two submissions, both at [claude.ai/directory/manage](https://claude.ai/directory/manage) under **Submit new**,
from a paid Claude account. The docs say to submit the server as a connector as well as the plugin, so do the
connector first.

## Ready

- `claude plugin validate claude-plugin` passes. The directory also runs its own safety and policy scans.
- Every tool has a title and a read-only or destructive annotation (`titled`, `RO`, `OPEN`, `DIALS` in `src/server/mcp/server.ts`).
- OAuth is live on a Claude-specific path, `/claude/mcp`, in `DIRECTORY_SERVERS`.
- Icon: `https://call4.me/static/logo.png` (also `public/static/logo-400.png`).

## Submission 1: MCP connector

**Connection:** `https://call4.me/claude/mcp`

**Name:** call4me

**One-liner (200 max):** Claude makes real phone calls to businesses for you: bookings, appointments, quotes and questions. It waits on hold, talks to whoever answers, and reports back with a transcript.

**Description (2,000 max):**

call4me makes real phone calls to businesses for you. Tell Claude what you need, like a table for four on Saturday, a vet appointment next week, a quote from a plumber, or whether a store has something in stock, and call4me phones the business, gets through the phone menu and the hold, talks to whoever answers, and reports back with the outcome and a transcript.

Claude asks for anything the call needs in one message before it dials. If the business asks something only you know, the question comes back to Claude while the call is still going, and the caller relays your answer on the line. You can listen in without anyone hearing you, join any call from your own phone, or schedule a call for when the business opens.

The caller calls for you and never claims to be you. It only calls businesses and services you want to reach, never personal numbers, emergency services or premium-rate numbers.

Calls use prepaid credits from your call4me account, at $0.25 a minute from pickup and half that on hold. Unanswered calls are free, and every account gets a free US number. A call can fail or end without the result you wanted, so check anything important.

**Categories:** pick from the portal's list. Communication and productivity fit, if offered.

**Documentation:** https://call4.me/mcp
**Privacy policy:** https://call4.me/privacy
**Support:** me@call4.me (https://call4.me/support)
**Slug:** `call4me` (permanent once published)

**Use cases:** booking restaurants and appointments; rescheduling; getting quotes; asking a business a question its website doesn't answer; waiting on hold and calling customer service.

**What users need:** a call4me account (Google or X sign in) with prepaid credits, from $10, bought on call4.me.

**Reads or writes:** both. It reads calls, balance and profile, and it writes by placing calls and saving profile details.

**Company:** Skeptrune LLC, https://call4.me, primary contact me@call4.me.

**Authentication:** required, OAuth.

**Data handling:** the API is our own.

## Decisions only Nick can make

1. **Health data: answer yes.** The Claude surface allows doctor and dentist calls and insurance profile fields (`health = surface !== 'chatgpt'` in `src/server/mcp/server.ts`). The ChatGPT surface excludes them. Either declare it, or restrict the Claude surface the way ChatGPT's is, and accept the loss of those calls there.
2. **The seven compliance acknowledgments** cover directory guidelines, first-party API use, financial transactions, AI media generation, prompt injection, conversation data and public documentation. They are legal statements, so read them yourself. On the financial one: the purchase tools, including add funds, are not registered on directory servers (`registerPurchaseTools` runs only on the agents surface), so credits are bought on the website, never in the chat. Calls do spend credits.
3. **Anthropic's directory terms** bind Skeptrune LLC, including keeping the connector secure and working.

## Test account for reviewers

The portal asks for credentials to a fully populated account, entered there and shown only to reviewers.

`directory-review@call4.me` exists with password sign-in, but it has 0 calls, so it isn't populated yet. Before submitting: make sure it has credits, place a few real calls so history, transcripts and recordings exist, and put the password in the portal only, never in this repo.

Reviewer steps to paste:

1. In Claude, add the connector and sign in with the test account's email and password.
2. Ask: "What's my call4me balance?"
3. Ask: "List my recent calls and show the transcript of the latest one."
4. Ask Claude to call a test number you give in the portal and ask for its opening hours.

The docs ask you to confirm every tool has been run, through MCP Inspector or in Claude. Add the server as a custom connector and run them before ticking that box.

## Submission 2: plugin bundle

- **Repository:** `skeptrunedev/call4me`
- **Plugin path:** `claude-plugin`
- **Branch:** leave empty for the default branch
- Connect the GitHub account on claude.ai first. The portal checks it can push to the repo.
- A validation result applies to one commit, so validate again after any push.

If an earlier submission went through the Claude Console form, the docs cover [moving it to the portal](https://claude.com/docs/directory/publish.md#move-an-earlier-submission-to-the-developer-portal).

After submitting, Anthropic scans automatically and by default lists it as a Community connector. Escalations go to `mcp-review@anthropic.com`.
