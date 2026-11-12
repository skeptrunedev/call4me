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

test('a Japanese agent back from a hold ends it, and a hold request in Japanese starts one', async () => {
  const { HoldMeter } = await import('../src/server/voice/hold');
  // freee's company-setup desk: the opening "しばらくお待ち" started a hold that nothing in Japanese
  // could end, and 17 minutes of conversation were billed as hold, past the call's time limit.
  const desk = new HoldMeter();
  assert.equal(desk.them('順番におつなぎいたしますので、しばらくお待ち', s(0))?.type, 'start');
  assert.equal(desk.them(' お電話ありがとうございます、フリー会社設立サポート窓口の赤間と申します', s(2))?.type, 'end');
  // Asked to wait while the rep checks: our caller's polite yes keeps the hold, the rep's return ends it.
  assert.equal(desk.them('なるほどですね。少々確認いたしますので、お時間いただいてもよろしいでしょうか', s(60))?.type, 'start');
  assert.equal(desk.caller('はい、大丈夫です、お願いします。'), null);
  assert.equal(desk.them('ありがとうございます。', s(73)), null);
  assert.equal(desk.them('お客様お時間いただきありがとうございます', s(250)), null);
  const back = desk.caller('いえ、こちらこそ。') ?? desk.them('はい、で、こちらですね', s(255));
  assert.deepEqual(back, { type: 'end', at: s(250), seconds: 190 });
  // JTB: "確認をいたしますので少々お待ち…" then "お待たせいたしました".
  const jtb = new HoldMeter();
  assert.equal(jtb.them('はい。かしこまりました、ちょっと確認をいたしますので少々お待ちいただけますでしょうか', s(0))?.type, 'start');
  assert.equal(jtb.caller('はい、お願いします。'), null);
  jtb.them('おそれ入ります、お待たせいたしました', s(68));
  assert.equal((jtb.caller('はい。') ?? jtb.them('確認したところ、お申し込みについてなんですけれども', s(70))), null);
  assert.equal(jtb.caller('そうなんですね、他の方法はありますか?'), null);
  // Back-dated to the rep's return, which the rest of their sentence ran on from.
  assert.deepEqual(jtb.them('はい', s(80)), { type: 'end', at: s(68), seconds: 68 });
});

test("someone saying they'll stay on the line until we have the details is waiting on us, not holding us", async () => {
  const { HoldMeter } = await import('../src/server/voice/hold');
  // The Coronet's leasing bot, while our caller waited on an unanswered question.
  assert.equal(new HoldMeter().them("Thank you for the update. I'll stay on the line until you have those details from Nick. Hello? I wanna make sure I haven't lost you", s(0)), null);
  assert.equal(new HoldMeter().them("We'll stay on the line while you look that up.", s(0)), null);
  assert.equal(new HoldMeter().them('Please stay on the line, your call will be answered shortly.', s(0))?.type, 'start');
  assert.equal(new HoldMeter().them('Remain on the line for the next available agent.', s(0))?.type, 'start');
});
