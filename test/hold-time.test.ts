import assert from 'node:assert/strict';
import test from 'node:test';
import { accounts } from '../src/server/services/accounts';
import { calls } from '../src/server/services/calls';
import { d1 } from './sqlite-d1';

/** Seconds after an arbitrary, nonzero start (an answered_at of 0 reads as never answered). */
const s = (n: number) => 1_800_000_000_000 + n * 1000;

async function answeredCall(db: D1Database, holdCents: number) {
  await accounts(db).post('acct_alice', 10_000, 'adjustment', 'seed', 'credits');
  await accounts(db).hold('acct_alice', holdCents, 'hold:call_1', 'up to n min');
  await db
    .prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, hold_cents, answered_at, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Air Serbia', 'seat', '{}', 'in_progress', ?, ?, ?)`)
    .bind(holdCents, s(0), s(0))
    .run();
}

test('a call that spent most of its time on hold is billed at half price for those minutes', async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  const c = calls(db);
  await c.holdStarted('call_1', s(60));
  await c.holdEnded('call_1', s(60 + 600));
  const row = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(720) });
  // 12 started minutes, 10 whole ones on hold: 2 x 25 + 10 x 12.5
  assert.equal(row!.cost_cents, 50 + 125);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 175);
});

test('a hold still open at hangup is billed at half price up to the end', async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  await calls(db).holdStarted('call_1', s(0));
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(600) });
  assert.equal(row!.cost_cents, 125);
  // The open hold is closed on the row too, so usage and the account page count it.
  const after = await calls(db).byId('call_1');
  assert.equal(after!.hold_since, null);
  assert.ok(after!.hold_seconds > 0, 'the hold still open at hangup is saved');
});

test('extending a call on hold holds more credits, all released when it ends, and the bill never passes what was held', async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  const c = calls(db);
  const row = (await c.byId('call_1'))!;
  assert.equal(await c.extend(row, 15, 25, 1, s(5 * 60)), 15);
  assert.equal((await c.byId('call_1'))!.hold_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 20 * 25);
  // Ran 40 minutes with no hold recorded: capped at the 20 minutes held.
  const done = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(40 * 60) });
  assert.equal(done!.cost_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 20 * 25);
});

test('an extension the balance cannot cover a minute of is refused and holds nothing', async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  await accounts(db).post('acct_alice', -(10_000 - 5 * 25 - 20), 'adjustment', 'drain', 'leave 20 cents');
  const c = calls(db);
  assert.equal(await c.extend((await c.byId('call_1'))!, 15, 25, 1, s(5 * 60)), 0);
  assert.equal((await c.byId('call_1'))!.hold_cents, 5 * 25);
});

test('a call on hold at its limit pays for its extension with the credits its half-price hold left unused', async () => {
  const db = d1();
  // Delta: $7.75 in the account, 30 minutes held at full price, on hold from minute 2 on.
  await answeredCall(db, 30 * 25);
  await accounts(db).post('acct_alice', -(10_000 - 31 * 25), 'adjustment', 'drain', 'leave $7.75');
  const c = calls(db);
  await c.holdStarted('call_1', s(90));
  // 2 minutes talking and 28 on hold cost $4, so $3.50 of the hold is unused: 15 more minutes.
  assert.equal(await c.extend((await c.byId('call_1'))!, 15, 25, 1, s(30 * 60)), 15);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 0);
  const done = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(45 * 60) });
  // 45 minutes, 43 of them on hold.
  assert.equal(done!.cost_cents, 2 * 25 + Math.ceil((43 * 25) / 2));
});


test('time the user spends on a call after taking it over is not billed', async () => {
  const db = d1();
  await answeredCall(db, 40 * 25);
  const c = calls(db);
  // 2 minutes of the caller, then the user takes over for 30, then hands back for 1 more.
  await c.personJoined('call_1', s(120));
  await c.personLeft('call_1', s(120 + 1800));
  const row = await c.finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(120 + 1800 + 60) });
  assert.equal(row!.cost_cents, 3 * 25);
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000 - 3 * 25);
});

test('a take-over still going at hangup is free up to the end', async () => {
  const db = d1();
  await answeredCall(db, 40 * 25);
  await calls(db).personJoined('call_1', s(60));
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(60 + 1200) });
  assert.equal(row!.cost_cents, 25);
});

test('an Italian or French hold request starts a hold', async () => {
  const { HoldMeter } = await import('../src/server/voice/hold');
  const it = new HoldMeter();
  assert.equal(it.them("Eh... aspetti un attimo eh, signora, la metto un attimino in, in, in attesa un attimino solo eh", s(0))?.type, 'start');
  const fr = new HoldMeter();
  assert.equal(fr.them('Ne quittez pas, je vous mets en attente.', s(0))?.type, 'start');
  assert.equal(new HoldMeter().them('Allora, ho trovato un bilocale al terzo piano.', s(0)), null);
});

test('a queue of busy "reps" is a hold', async () => {
  const { HoldMeter } = await import('../src/server/voice/hold');
  // The Glaucoma Center of San Francisco queued the caller after it pressed 1 for appointments; the
  // hold went unseen, so the call was cut off at its 4 minute limit while waiting for a person.
  const queue = 'For any billing questions, please press three... to leave a non-urgent message, please press six. All of our reps are currently busy with a call. Please select one to stay on the call queue or select two to be sent to voicemail';
  assert.equal(new HoldMeter().them(queue, s(0))?.type, 'start');
  assert.equal(new HoldMeter().them('All reps are currently busy.', s(0))?.type, 'start');
  assert.equal(new HoldMeter().them('Please stay on the call queue.', s(0))?.type, 'start');
  assert.equal(new HoldMeter().them('Our reps can help you with billing, press three.', s(0)), null);
});
