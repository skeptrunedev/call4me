import assert from 'node:assert/strict';
import test from 'node:test';
import { unansweredStatus } from '../src/server/routes/webhooks';
import { callView } from '../src/server/services/call-ops';
import { calls } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

// Telnyx reports 486 Busy Here, 603 Decline and 604 Does Not Exist all as hangup_cause 'user_busy'.
test('an unanswered call is busy only when the line was busy; a decline or a dead number is not', () => {
  assert.equal(unansweredStatus('user_busy', '486'), 'busy');
  assert.equal(unansweredStatus('user_busy', '603'), 'failed');
  assert.equal(unansweredStatus('user_busy', '604'), 'failed');
  assert.equal(unansweredStatus('user_busy', '608'), 'failed');
  // No SIP code, or one that says nothing: the hangup_cause decides, as before.
  assert.equal(unansweredStatus('user_busy', undefined), 'busy');
  assert.equal(unansweredStatus('timeout', 'unspecified'), 'no_answer');
  assert.equal(unansweredStatus('call_rejected', undefined), 'failed');
});

test('the agent reads why an unanswered call ended, and whether redialing can help', async () => {
  const db = d1();
  const store = calls(db);
  const insert = (id: string) => db.prepare(
    `INSERT INTO calls (id, account_id, direction, to_number, business, goal, brief, status, telnyx_call_control_id, created_at) VALUES (?, 'acct_alice', 'outbound', '+14155550123', 'Example Apartments', 'studio availability', '{}', 'dialing', ?, 0)`,
  ).bind(id, `provider-${id}`).run();
  const ended = async (id: string, sip: string | undefined) => {
    await insert(id);
    await store.finish(id, { status: unansweredStatus('user_busy', sip), hangupCause: 'user_busy', sipHangupCause: sip ?? null, pricePerMinuteCents: 20 });
    return callView((await store.byId(id))!, []);
  };

  const declined = await ended('declined', '603');
  assert.equal(declined.status, 'failed');
  assert.match(declined.ended!, /declined the call without answering \(SIP 603\).*redialing from the same call4me number will most likely be declined again/);
  assert.equal(declined.cost_cents, 0);

  const busy = await ended('busy', '486');
  assert.equal(busy.status, 'busy');
  assert.match(busy.ended!, /the line was busy \(SIP 486\); trying again later may get through/);

  assert.match((await ended('dead', '604')).ended!, /the number does not exist/);
  // Before the SIP code was kept, or when Telnyx sends none: the raw hangup_cause, as before.
  assert.equal((await ended('unknown', undefined)).ended, 'user_busy');
});
