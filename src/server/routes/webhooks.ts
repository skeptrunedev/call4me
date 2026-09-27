import { Hono } from 'hono';
import type Stripe from 'stripe';
import { stripeFor, type AppEnv } from '../lib/context';
import { now } from '../lib/ids';
import { readClientState, verifyTelnyxSignature } from '../lib/telnyx';
import { calls, type Brief, type CallStatus, type TranscriptLine } from '../services/calls';
import { summarizeCall, summaryPrompt } from '../services/summary';
import { answerInbound, pricePerMinute } from '../services/dialer';
import { topups, verifyWebhook } from '../services/topups';
import { sessionFor } from '../voice/session';

export const webhooks = new Hono<AppEnv>();

/** The written outcome of an answered call, from its final transcript. */
async function writeRecap(env: Env, callId: string): Promise<void> {
  const db = calls(env.DB);
  const row = await db.byId(callId);
  if (!row || row.outcome) return;
  const transcript = row.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [];
  try {
    await db.saveOutcome(callId, await summarizeCall(env, summaryPrompt(row, JSON.parse(row.brief) as Brief, transcript)));
  } catch (err) {
    console.error('recap failed', callId, err);
    await env.DB.prepare(`UPDATE calls SET error = COALESCE(error, ?) WHERE id = ?`).bind(`recap failed: ${String(err).slice(0, 300)}`, callId).run();
  }
}

// ---- Stripe: card top-ups

async function seen(db: D1Database, event: Stripe.Event): Promise<boolean> {
  const r = await db.prepare(`INSERT OR IGNORE INTO stripe_events (id, type, received_at) VALUES (?, ?, ?)`).bind(event.id, event.type, now()).run();
  return (r.meta.changes ?? 0) === 0;
}

webhooks.post('/stripe', async (c) => {
  const sig = c.req.header('stripe-signature');
  if (!sig) return c.text('missing signature', 400);
  let event: Stripe.Event;
  try {
    event = await verifyWebhook(stripeFor(c), await c.req.text(), sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('stripe webhook rejected', String(err));
    return c.text('bad signature', 400);
  }
  if (await seen(c.env.DB, event)) return c.text('duplicate', 200);
  const t = topups(c.env.DB, stripeFor(c));
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await t.fulfill(event.data.object.id);
      break;
    case 'invoice.paid':
      await t.invoicePaid(event.data.object);
      break;
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await t.syncSubscription(event.data.object);
      break;
    case 'charge.refunded': {
      const ch = event.data.object;
      if (ch.refunded && typeof ch.payment_intent === 'string') await t.refunded(ch.payment_intent);
      break;
    }
  }
  return c.text('ok', 200);
});

// ---- Telnyx: call progress

interface TelnyxWebhook {
  data?: {
    event_type?: string;
    payload?: { call_control_id?: string; client_state?: string | null; direction?: string; from?: string; to?: string; hangup_cause?: string };
  };
}

/** How an unanswered call ended, from Telnyx's hangup_cause. */
function unansweredStatus(cause: string | undefined): CallStatus {
  switch (cause) {
    case 'user_busy':
      return 'busy';
    case 'unallocated_number':
    case 'call_rejected':
    case 'destination_out_of_order':
    case 'invalid_number_format':
      return 'failed';
    default:
      return 'no_answer';
  }
}

webhooks.post('/telnyx', async (c) => {
  const body = await c.req.text();
  const ok = await verifyTelnyxSignature({
    publicKeyB64: c.env.TELNYX_PUBLIC_KEY,
    signatureB64: c.req.header('telnyx-signature-ed25519'),
    timestamp: c.req.header('telnyx-timestamp'),
    body,
  });
  if (!ok) return c.text('bad signature', 400);
  const hook = JSON.parse(body) as TelnyxWebhook;
  const type = hook.data?.event_type;
  const p = hook.data?.payload ?? {};
  const origin = new URL(c.req.url).origin;
  const db = calls(c.env.DB);

  if (type === 'call.initiated' && p.direction === 'incoming' && p.call_control_id && p.from && p.to) {
    await answerInbound(c.env, origin, { controlId: p.call_control_id, from: p.from, to: p.to });
    return c.text('ok');
  }

  const callId = readClientState(p.client_state) ?? (p.call_control_id ? (await db.byControlId(p.call_control_id))?.id : null);
  if (!callId) return c.text('ok'); // not ours, or already gone

  switch (type) {
    case 'call.answered':
      await db.answered(callId);
      await sessionFor(c.env, callId).fetch('https://session/answered', { method: 'POST' });
      break;
    case 'call.hangup': {
      const row = await db.byId(callId);
      const status: CallStatus = row?.answered_at ? 'completed' : unansweredStatus(p.hangup_cause);
      await db.finish(callId, { status, hangupCause: p.hangup_cause ?? null, pricePerMinuteCents: pricePerMinute(c.env) });
      // Returns once the session has written the final transcript.
      await sessionFor(c.env, callId).fetch('https://session/ended', { method: 'POST' });
      if (row?.answered_at) c.executionCtx.waitUntil(writeRecap(c.env, callId));
      break;
    }
    case 'streaming.failed':
      console.warn('telnyx media stream failed', callId, body.slice(0, 500));
      break;
  }
  return c.text('ok');
});
