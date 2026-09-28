# callbay

https://call4.me

Your coding agent (Claude Code, Codex, Claude Desktop, ChatGPT) gets one new tool: make a phone call.
Prepaid credits from $10 via Stripe Checkout, reloading monthly by default; one MCP URL with the key in it.

## How a call works

```
agent ──MCP──▶ worker ──POST /v2/calls──▶ Telnyx ──PSTN──▶ business
                  ▲                          │ media stream (PCMU, bidirectional RTP)
                  │ webhooks                 ▼
                  └──────────────── CallSession (Durable Object) ◀──WS──▶ GPT-Live (gpt-live-1, audio/pcmu 8k)
                                                                           └─ back office (Responses model):
                                                                              end_call · ask_user · press_digits
```

- `src/server/voice/prompt.ts`: what the caller is told. The product lives here: no opening disclosure,
  no recording notice, no end-of-call read-back; honest if sincerely asked whether it's an AI.
- `src/server/voice/session.ts`: the audio relay and back-office functions.
- `src/server/services/dialer.ts`: placing calls, per-account numbers, answering callbacks.
- `src/server/mcp/server.ts`: the MCP tools.

Audio is never recorded: Telnyx recording is off unless `record` is passed, and GPT-Live's `store` defaults to false.

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

## Blog

`/blog` is markdown files in `src/content/blog` (one per post, listed in `index.ts`, headline image at
`public/static/blog/<slug>.svg`), with an Atom feed, likes, comments, an email newsletter (sent from
`/admin/blog`, for the `ADMIN_EMAILS` accounts), and paid posts for monthly supporters.

## Self-hosting

Fork it, create your own D1 database (`wrangler d1 create callbay`) and put its id and your own hostname in `wrangler.jsonc`.

Local: `npm run db:migrate:local && npm run dev` with a `.dev.vars` holding the same secrets.

## License

MIT
