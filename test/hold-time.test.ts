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
    .prepare(`INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, hold_cents, answered_at, audio_at, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Air Serbia', 'seat', '{}', 'in_progress', ?, ?, ?, ?)`)
    .bind(holdCents, s(0), s(0), s(0))
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


test('a call answered without its audio ever reaching us fails and is free', async () => {
  const db = d1();
  await answeredCall(db, 4 * 25);
  await db.prepare(`UPDATE calls SET audio_at = NULL WHERE id = 'call_1'`).run();
  // Telnyx couldn't connect the media stream; the business heard silence and hung up after 7s.
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(7) });
  assert.equal(row!.status, 'failed');
  assert.equal(row!.cost_cents, 0);
  assert.equal(row!.error, 'the call audio never connected');
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000);
});

test('audio reaching us makes an answered call billable', async () => {
  const db = d1();
  await answeredCall(db, 4 * 25);
  await db.prepare(`UPDATE calls SET audio_at = NULL WHERE id = 'call_1'`).run();
  await calls(db).audioArrived('call_1', s(1));
  await calls(db).audioArrived('call_1', s(30));
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(7) });
  assert.equal(row!.status, 'completed');
  assert.equal(row!.audio_at, s(1));
  assert.equal(row!.cost_cents, 25);
});

test('a call whose audio drops partway and never comes back fails and is free', async () => {
  const db = d1();
  await answeredCall(db, 4 * 25);
  // Talking for 40s, then the stream dropped; the business hung up on the silence 12s later.
  await calls(db).audioLost('call_1', s(40));
  await calls(db).audioLost('call_1', s(45));
  const row = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(52) });
  assert.equal(row!.status, 'failed');
  assert.equal(row!.cost_cents, 0);
  assert.equal(row!.error, 'lost the call audio and could not reconnect it');
  assert.equal(await accounts(db).balanceCents('acct_alice'), 10_000);
});

test('audio that comes back after a drop, or drops as they hang up, bills the call as usual', async () => {
  const db = d1();
  await answeredCall(db, 4 * 25);
  await calls(db).audioLost('call_1', s(40));
  await calls(db).audioArrived('call_1', s(48));
  const back = await calls(db).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(90) });
  assert.equal(back!.status, 'completed');
  assert.equal(back!.audio_lost_at, null);
  assert.equal(back!.audio_at, s(0));
  assert.equal(back!.cost_cents, 50);

  const hangup = d1();
  await answeredCall(hangup, 4 * 25);
  await calls(hangup).audioLost('call_1', s(89));
  const row = await calls(hangup).finish('call_1', { status: 'completed', pricePerMinuteCents: 25, at: s(90) });
  assert.equal(row!.status, 'completed');
  assert.equal(row!.cost_cents, 50);
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

test("a rep's return after minutes of silence ends the hold then, not at their last words before it", async () => {
  const { HoldMeter } = await import('../src/server/voice/hold');
  // Buck Mason: "is it okay if I put you a brief hold while I go look", then "Okay. Alright", five
  // minutes in the stockroom, and "Hello, still there" with no punctuation in between.
  const clerk = new HoldMeter();
  assert.equal(clerk.them('Okay, is it okay if I put you a brief hold while I go', s(26))?.type, 'start');
  assert.equal(clerk.caller('Sure, no problem.'), null);
  assert.equal(clerk.them(' look', s(28)), null);
  assert.equal(clerk.them(' Okay. Alright', s(31)), null);
  assert.deepEqual(clerk.them(' Hello, still there', s(340)), { type: 'end', at: s(340), seconds: 314 });
  // The same return answered by our caller instead of a "still there".
  const rep = new HoldMeter();
  assert.equal(rep.them('Let me check in the back.', s(0))?.type, 'start');
  assert.equal(rep.them(' Alright', s(3)), null);
  assert.equal(rep.them(' so we do have the black one in small', s(300)), null);
  assert.equal(rep.caller('Great, can you hold it for me?'), null);
  assert.deepEqual(rep.them(' Sure', s(310)), { type: 'end', at: s(300), seconds: 300 });
});
