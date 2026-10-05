import { Hono } from 'hono';
import type Stripe from 'stripe';
import { stripeFor, type AppEnv } from '../lib/context';
import { now } from '../lib/ids';
import { readClientState, telnyx, verifyTelnyxSignature } from '../lib/telnyx';
import { calls, type Brief, type CallStatus, type TranscriptLine } from '../services/calls';
import { summarizeCall, summaryPrompt } from '../services/summary';
import { answerInbound, callPrice, pricePerMinute } from '../services/dialer';
import { isSupporterObject, supporters } from '../services/supporters';
import { topups, verifyWebhook } from '../services/topups';
import { sessionFor } from '../voice/stub';
import { machineEventOf } from '../voice/voicemail';
import { accounts } from '../services/accounts';
import { analytics } from '../services/analytics';
import { decodeFirstTouch } from '../lib/first-touch';

export const webhooks = new Hono<AppEnv>();

/** The written outcome of an answered call, from its final transcript. */
async function writeRecap(env: Env, callId: string): Promise<void> {
  const db = calls(env.DB);
  const row = await db.byId(callId);
  if (!row || row.outcome) return;
  const transcript = row.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [];
  const startedAt = Date.now();
  let prompt = '';
  const log = (status: 'completed' | 'error', output: string) =>
    env.RECAP_LOG.record({ accountId: row.account_id, callId, model: env.BACK_OFFICE_MODEL || 'gpt-5.5', input: prompt, output, status, durationMs: Date.now() - startedAt }).catch(() => console.warn('raindrop recap delivery failed', callId));
  try {
    prompt = summaryPrompt(row, JSON.parse(row.brief) as Brief, transcript);
    const outcome = await summarizeCall(env, prompt);
    await db.saveOutcome(callId, outcome);
    await log('completed', JSON.stringify(outcome));
  } catch (err) {
    console.error('recap failed', callId, err);
    await env.DB.prepare(`UPDATE calls SET error = COALESCE(error, ?) WHERE id = ?`).bind(`recap failed: ${String(err).slice(0, 300)}`, callId).run();
    if (prompt) await log('error', String(err));
  }
}

/** How the call ended, for GA (services/analytics.ts; Meta does not get it). No numbers, names or transcript. */
async function reportCallEnded(env: Env, callId: string): Promise<void> {
  const row = await calls(env.DB).byId(callId);
  const account = row && (await accounts(env.DB).byId(row.account_id));
  if (!row || !account) return;
  const params = { status: row.status, direction: row.direction, talk_seconds: row.billed_seconds ?? 0, currency: 'USD', value: (row.cost_cents ?? 0) / 100 };
  await analytics(env).track(account, [{ name: 'call_ended', params }]);
}

// ---- Stripe: card top-ups and the blog's supporter tier

/**
 * Supporter subscriptions (services/supporters.ts) are tagged app=callbay, kind=supporter and
 * go to the supporter tier; everything else is credits. Neither path touches the other's
 * rows, and events from skillbay (same Stripe account) match neither.
 */

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
  const s = () => supporters(c.env.DB, stripeFor(c), c.env);
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (isSupporterObject(session.metadata)) await s().completeSession(session.id);
      else {
        const done = await t.fulfill(session.id);
        // Reported here, once per Stripe event, never from the welcome page that also fulfills.
        if (done) {
          const { topup } = done;
          const ga = topup.ga_client_id ? { clientId: topup.ga_client_id, sessionId: topup.ga_session_id } : null;
          // The checkout's browser, which finishes the purchase on the welcome page.
          const meta = { fbp: topup.meta_fbp, fbc: topup.meta_fbc, ip: topup.meta_ip, userAgent: topup.meta_user_agent, url: `https://${c.env.CANONICAL_HOST}/welcome` };
          c.executionCtx.waitUntil(analytics(c.env).purchase(done.account, { transactionId: session.id, cents: topup.amount_cents, reload: false, from: { ga, meta, touch: decodeFirstTouch(topup.first_touch) } }));
        }
      }
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      // A supporter renewal buys no credits; the subscription events keep its status.
      if (isSupporterObject(invoice.parent?.subscription_details?.metadata)) break;
      const reload = await t.invoicePaid(invoice);
      const account = reload && (await accounts(c.env.DB).byId(reload.accountId));
      if (reload && account) c.executionCtx.waitUntil(analytics(c.env).purchase(account, { transactionId: invoice.id!, cents: reload.cents, reload: true }));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      if (isSupporterObject(sub.metadata)) await s().syncSubscription(sub);
      else if (event.type !== 'customer.subscription.created') await t.syncSubscription(sub);
      break;
    }
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
    payload?: { call_control_id?: string; call_leg_id?: string; client_state?: string | null; direction?: string; from?: string; to?: string; hangup_cause?: string; hangup_source?: string; digit?: string; digits?: string; status?: string; result?: string };
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

  const state = readClientState(p.client_state);
  const callId = state?.callId ?? (p.call_control_id ? (await db.byControlId(p.call_control_id))?.id : null);
  if (!callId) return c.text('ok'); // not ours, or already gone

  // The person's own phone patched into the call: its events move the call between them and
  // the caller, and never end or bill the call itself. Answering leaves them listening; 1 puts
  // them on the call, * hands it back, and once they are on, other keys go through to the business
  // (a supervisor leg carries their voice but not their keypad).
  if (state?.personLeg) {
    const session = sessionFor(c.env, callId);
    if (type === 'call.answered') await session.fetch('https://session/person-answered', { method: 'POST' });
    else if (type === 'call.hangup') await session.fetch('https://session/person-left', { method: 'POST', body: JSON.stringify({ cause: p.hangup_cause ?? null }) });
    else if (type === 'call.dtmf.received' && p.digit === '*' && p.call_control_id) await telnyx(c.env).hangup(p.call_control_id);
    else if (type === 'call.dtmf.received' && p.digit) await session.fetch('https://session/person-key', { method: 'POST', body: JSON.stringify({ digit: p.digit }) });
    return c.text('ok');
  }

  switch (type) {
    case 'call.answered':
      await db.answered(callId);
      await sessionFor(c.env, callId).fetch('https://session/answered', { method: 'POST' });
      break;
    case 'call.hangup': {
      const row = await db.byId(callId);
      const status: CallStatus = row?.answered_at ? 'completed' : unansweredStatus(p.hangup_cause);
      await db.finish(callId, { status, hangupCause: p.hangup_cause ?? null, hangupSource: p.hangup_source ?? null, pricePerMinuteCents: row ? callPrice(c.env, row) : pricePerMinute(c.env) });
      // Returns once the session has written the final transcript.
      await sessionFor(c.env, callId).fetch('https://session/ended', { method: 'POST' });
      // Store provider identity only after the voice session has ended. Person legs
      // returned above, and this separate table is never consumed by voice code.
      if (p.call_control_id && p.call_leg_id) {
        await c.env.DB.prepare(`INSERT OR IGNORE INTO call_provider_legs (call_control_id, call_leg_id)
          SELECT telnyx_call_control_id, ? FROM calls WHERE id = ? AND telnyx_call_control_id = ?`)
          .bind(p.call_leg_id, callId, p.call_control_id).run();
      }
      if (row?.answered_at) c.executionCtx.waitUntil(writeRecap(c.env, callId));
      c.executionCtx.waitUntil(reportCallEnded(c.env, callId));
      break;
    }
    case 'call.machine.premium.detection.ended':
    case 'call.machine.premium.greeting.ended':
    case 'call.machine.premium.call_screening.detected': {
      const event = machineEventOf(type, p.result);
      if (event) await sessionFor(c.env, callId).fetch('https://session/machine', { method: 'POST', body: JSON.stringify({ event }) });
      break;
    }
    case 'streaming.failed':
      console.warn('telnyx media stream failed', callId, body.slice(0, 500));
      break;
  }
  return c.text('ok');
});
