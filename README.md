# call4me

https://call4.me

Your coding agent (Claude Code, Codex, Claude Desktop, ChatGPT) gets one new tool: make a phone call.
Prepaid credits from $10 via Stripe Checkout, reloading monthly by default; one MCP URL with the key in it.

## How a call works

```
agent ──MCP──▶ worker ──POST /v2/calls──▶ Telnyx ──PSTN──▶ business
                  ▲                          │ media stream (PCMU, bidirectional RTP)
                  │ webhooks                 ▼
                  └──────────────── VoiceSession (Durable Object) ◀──WS──▶ GPT-Live (gpt-live-1, audio/pcmu 8k)
                                                                           └─ back office (Responses model):
                                                                              end_call · ask_user · press_digits
```

- `src/server/voice/prompt.ts`: what the caller is told. The product lives here: no opening disclosure,
  no recording notice, no end-of-call read-back; honest if sincerely asked whether it's an AI.
- `src/server/voice/session.ts`: the audio relay and back-office functions.
- `src/server/services/dialer.ts`: placing calls, per-account numbers, answering callbacks.
- `src/server/services/numbers.ts`: the account's call4me numbers, and the user's own numbers
  verified to call from. Telnyx keeps one verified-number list for our whole carrier account, so
  `verified_numbers` ties each to the one call4me account that submitted a fresh code for it; a
  number Telnyx already lists as verified is never handed to another account. A call from an own
  number (`from`) only reaches businesses in its country, and still rings the user from a call4me number.
- `src/server/mcp/server.ts`: the MCP tools.

The app does not request recording when dialing or answering. Existing recordings stored by Telnyx
can be played or opened from the signed in call page after a call ends, or retrieved using `call4me_get_recordings({ call_id })` over MCP, or
`GET /api/calls/{call_id}/recordings` with a call4me API key or OAuth token in the Bearer header.
Both check account ownership before contacting Telnyx and return fresh download links without
storing them. Empty results can mean processing is pending or no recording was saved. Links may
expire and should only be shared with the account owner.

Trunk recordings use call leg IDs. A separate provider ID table receives these from verified
webhooks; existing calls resolve them from an exact control ID match in Telnyx webhook history.
The app never guesses a match from phone numbers or timestamps. If provider history has expired
and no mapping was saved, only recordings directly associated with the control ID can be found.

The recording lookup never contacts the voice session or changes prompts, live tools, audio,
or Telnyx recording settings. Existing call status and transcript responses are unchanged.

The recording API's OpenAPI document is served at `/api/openapi.json`. Run
`npm run openapi:generate` to regenerate `openapi.json` from the shared MCP and HTTP schemas.
CI checks the generated artifact for drift. Run `npm test`, `npm run check`, `npm run lint`,
and `npx wrangler deploy --dry-run` before deploying through git.

Menu recovery tracks fresh phone prompts separately from transcript timestamps and remembers
accepted keypad submissions. Repeated menus, invalid input, and recorded instruction dead ends
can restart the existing back office after the recording goes quiet. It waits for pending tools
and their continuations, avoids interrupting holds or a person answering, and asks the model to
choose a supported route from the heard options rather than blindly replaying digits.

`npm test` includes provider message replay tests for recovery and its timing races. To evaluate
the configured back office model against synthetic menu scenarios, run `npm run test:menu:live`
with `OPENAI_API_KEY` (or a local `.dev.vars`). This opt-in evaluation calls OpenAI, inspects
the proposed tool calls, and never executes a tool or places a phone call.

## Setup

1. Telnyx: a Call Control application (its id is `TELNYX_CONNECTION_ID`) with webhook URL
   `https://<host>/webhooks/telnyx`, an API key, and the account's webhook public key.
   Each account's number is bought on its first call and attached to that application.
2. OpenAI: an API key with GPT-Live access.
3. Stripe: webhook endpoint `https://<host>/webhooks/stripe` for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `charge.refunded`. The blog's supporter subscriptions arrive on
   the same endpoint, tagged `app=callbay, kind=supporter` (see `src/server/services/supporters.ts`).

## Credits

Everything is prepaid. Loads start at $10 and, by default, the same amount reloads monthly (a Stripe
subscription; `invoice.paid` adds the credits). A call holds its maximum cost before it dials, in one
conditional insert so parallel calls can't overspend, and settles to the real talk time when it ends.
4. Secrets (`wrangler secret put`): see `src/server/env.d.ts`.

## Two Workers

Call sessions run in their own Worker, `call4me-voice` (`wrangler.voice.jsonc`, `src/server/voice/worker.ts`),
which also takes Telnyx's media streams on `voice.call4.me`. Deploying a Worker resets the durable objects it
defines, so with the sessions split out the site deploys freely without dropping a call. CI deploys the voice
Worker with `scripts/deploy-voice.sh`, which skips an unchanged bundle and otherwise waits until no call is up,
deploys, and holds new calls until the new version is serving plus a minute for Cloudflare to retire the old
one. Never deploy it or change its secrets any other way: either restarts every live call. The voice Worker's secrets are
`OPENAI_API_KEY`, `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID`, `RAINDROP_WRITE_KEY` and `STREAM_SECRET` (the same
value as the site's): `npx wrangler secret put <NAME> -c wrangler.voice.jsonc`.

## Blog

`/blog` is markdown files in `src/content/blog` (one per post, listed in `index.ts`, headline image at
`public/static/blog/<slug>.svg`), with an Atom feed, likes, comments, an email newsletter (sent from
`/admin/blog`, for the `ADMIN_EMAILS` accounts), and paid posts for monthly supporters.

## Self-hosting

Fork it, create your own D1 database (`wrangler d1 create callbay`) and put its id and your own hostname in `wrangler.jsonc`.

Local: `npm run db:migrate:local && npm run dev` with a `.dev.vars` holding the same secrets.

## AI monitoring

Raindrop monitors the live conversation (`callbay_voice_call`), back office model runs
(`callbay_back_office`), and the recap after hangup (`callbay_call_recap`). Each event uses
the account ID as its user ID and the call ID as its conversation ID. Model names, timing,
status, and back office tool spans are included. No phone audio or recording URLs are uploaded.

Add `RAINDROP_WRITE_KEY` to `.dev.vars` locally and configure the same key as a Cloudflare
Worker secret with `npx wrangler secret put RAINDROP_WRITE_KEY`. Optional
`RAINDROP_PROJECT_ID` selects a project slug; unset uses the write key's default project.
Without a write key, monitoring is disabled. `.dev.vars.example` lists these optional settings.

AI inputs and outputs use Raindrop's PII redaction, with Callbay's existing masking for
per call secrets applied first. Tool arguments and results appear in redacted back office
AI output. Tool spans contain names, timing, and generic failure status, keeping sensitive
payloads out of unredacted trace attributes. Account names and emails are not sent as user traits.
SDK PII redaction is pattern based and does not guarantee removal of every sensitive detail.

Monitoring runs separately from live audio and tools. Terminal events and queued tool spans
are flushed within the Worker or Durable Object lifetime. An unfinished back office run at
hangup is marked interrupted; later tool results do not reopen the closed monitoring client.

After a call, check the three event names in [Raindrop](https://app.raindrop.ai), with actual
inputs and outputs, the matching account and call IDs, and tool names and durations. A call
that never invokes a back office model has no back office event. Feedback signals, audio
attachments, and agent self diagnostics are not instrumented because the current call flow
has no corresponding feedback controls or diagnostics tools.

For investigation, connect the [Raindrop MCP server](https://mcp.raindrop.ai/mcp) and install
the investigation skill with `npx skills add raindrop-ai/skills --skill raindrop-investigate`.
Connect Slack in Raindrop for alerts. Create a [Raindrop account](https://app.raindrop.ai) if needed.

## License

MIT
