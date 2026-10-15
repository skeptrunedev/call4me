import assert from "node:assert/strict";
import test from "node:test";
import { accounts } from "../src/server/services/accounts";
import {
  billedCents,
  calls,
  holdSecondsAt,
} from "../src/server/services/calls";
import { HoldMeter, isHoldLine } from "../src/server/voice/hold";
import { d1 } from "./sqlite-d1";

/** Seconds after an arbitrary, nonzero start (an answered_at of 0 reads as never answered). */
const s = (n: number) => 1_800_000_000_000 + n * 1000;

test('a queue recording starts a hold, and the caller acknowledging "please hold" does not end it', () => {
  const m = new HoldMeter();
  assert.equal(m.them("Thanks for calling. ", s(0)), null);
  assert.deepEqual(m.them("Please hold while I transfer you.", s(5)), {
    type: "start",
    at: s(5),
  });
  assert.equal(m.caller("Sure, no problem."), null);
  assert.equal(
    m.them("All of our representatives are currently busy. ", s(30)),
    null,
  );
  assert.equal(m.them("Your call is important to us.", s(40)), null);
  assert.ok(m.holding());
});

test("a person greeting us ends the hold at once", () => {
  const m = new HoldMeter();
  m.them("Please hold.", s(0));
  assert.deepEqual(m.them("Hi, my name is Maja, how can I help?", s(600)), {
    type: "end",
    at: s(600),
    seconds: 600,
  });
  assert.ok(!m.holding());
});

test("a person who speaks without a greeting ends the hold once our caller answers, back-dated to when they spoke", () => {
  const m = new HoldMeter();
  m.them("Let me check on that, one moment.", s(10));
  assert.equal(m.them("Okay, I see the booking here.", s(200)), null);
  assert.ok(m.holding(), "still on hold until our caller answers");
  assert.equal(
    m.caller("Great, thanks."),
    null,
    "a bare acknowledgment is not an answer",
  );
  assert.deepEqual(m.caller(" So is there a deposit?"), {
    type: "end",
    at: s(200),
    seconds: 190,
  });
});

test("recordings that thank us for holding do not end the hold", () => {
  const m = new HoldMeter();
  m.them("Please stay on the line.", s(0));
  assert.equal(
    m.them("Thank you for holding. Your call is important to us.", s(60)),
    null,
  );
  assert.ok(m.holding());
});

test("a hold resumes after the session object was reset", () => {
  const m = new HoldMeter(s(100));
  assert.ok(m.holding());
  assert.deepEqual(m.them("Hello, how can I help you?", s(400)), {
    type: "end",
    at: s(400),
    seconds: 300,
  });
});

test('a rep putting us on a "brief hold" to connect someone starts a hold, even run into "thank you for holding"', () => {
  // Fleming's, Oct 15: never counted as a hold, so the time limit cut the call off mid-transfer.
  const m = new HoldMeter();
  assert.equal(
    m.them("Yeah, that was a diff- North Scottsdale. Yes, of course. ", s(0)),
    null,
  );
  assert.deepEqual(
    m.them("Let me put you on brief hold while I connect you", s(4)),
    { type: "start", at: s(4) },
  );
  assert.equal(m.them(" Thank you so much for holding", s(6)), null);
  assert.equal(m.caller("Sure."), null);
  assert.ok(m.holding());
});

test('the usual ways of saying "I am putting you on hold" all start one', () => {
  for (const line of [
    "Let me put you on a quick hold",
    "I am going to place you on a short hold",
    "One sec, let me transfer you to events",
    "I'm connecting you with our coordinator now",
    "Bear with me on a brief hold",
  ])
    assert.ok(isHoldLine(line), line);
  for (const line of [
    "We can hold the room for you until Friday",
    "Would you like a table on the patio?",
    "I can connect you by email later",
  ])
    assert.ok(!isHoldLine(line), line);
});

test("wait requests reps actually said on our calls start a hold", () => {
  for (const line of [
    "Okay. All right. And just allow me a minute here to pull this up for you",
    "Hm Okay, give me just a brief moment. Let me take a look",
    "Okay. Lemme see what I can find real quick",
    "Let's take a look",
    "Hold while I try to connect you",
    "Um, I could check on that for you. Do you mind holding for a second",
    "Let me see for a second, the ticket. Hold the line",
    "Please wait",
    "Give me two minutes",
    "Alright. Let me get you to someone who can help",
    "allow me to transfer you to our main menu",
    "Okay Right here I'm just trying to find some options for you",
    "You are number 1",
    "At the present time, all representatives are assisting other callers. The current hold time is approximately two minutes",
    "Your call may be monitored or recorded for quality or training purposes",
    "moment",
    "hold",
  ])
    assert.ok(isHoldLine(line), line);
  for (const line of [
    "First available appointment is not until November the 3rd",
    "So the appointment has been scheduled for December 1st at 1:30 PM",
    "We have a private room that seats twenty",
    "Okay",
    "Thank you",
  ])
    assert.ok(!isHoldLine(line), line);
});

test("isHoldLine knows queue language from conversation", () => {
  assert.ok(isHoldLine("All agents are currently busy"));
  assert.ok(isHoldLine("The estimated wait time is 10 minutes"));
  assert.ok(!isHoldLine("Your appointment is on Tuesday at 3pm"));
});

test("whole minutes on hold are half price; the rest is billed per started minute", () => {
  assert.equal(billedCents(150, 25), 75, "no hold: 3 started minutes");
  assert.equal(billedCents(600, 25, 600), 125, "10 min all on hold");
  assert.equal(
    billedCents(610, 25, 540),
    25 * 2 + Math.ceil((9 * 25) / 2),
    "11 started minutes, 9 whole ones on hold",
  );
  assert.equal(
    billedCents(120, 25, 90),
    25 + 13,
    "one whole hold minute, rounded up to the cent",
  );
  assert.equal(billedCents(60, 25, 999), 13, "hold never exceeds the call");
});

test("an open hold counts up to the end of the call", () => {
  assert.equal(
    holdSecondsAt({ hold_seconds: 30, hold_since: s(100) }, s(400)),
    330,
  );
  assert.equal(
    holdSecondsAt({ hold_seconds: 30, hold_since: null }, s(400)),
    30,
  );
});

async function answeredCall(db: D1Database, holdCents: number) {
  await accounts(db).post(
    "acct_alice",
    10_000,
    "adjustment",
    "seed",
    "credits",
  );
  await accounts(db).hold(
    "acct_alice",
    holdCents,
    "hold:call_1",
    "up to n min",
  );
  await db
    .prepare(
      `INSERT INTO calls (id, account_id, to_number, business, goal, brief, status, hold_cents, answered_at, created_at) VALUES ('call_1', 'acct_alice', '+15555550100', 'Air Serbia', 'seat', '{}', 'in_progress', ?, ?, ?)`,
    )
    .bind(holdCents, s(0), s(0))
    .run();
}

test("a call that spent most of its time on hold is billed at half price for those minutes", async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  const c = calls(db);
  await c.holdStarted("call_1", s(60));
  await c.holdEnded("call_1", s(60 + 600));
  const row = await c.finish("call_1", {
    status: "completed",
    pricePerMinuteCents: 25,
    at: s(720),
  });
  // 12 started minutes, 10 whole ones on hold: 2 x 25 + 10 x 12.5
  assert.equal(row!.cost_cents, 50 + 125);
  assert.equal(await accounts(db).balanceCents("acct_alice"), 10_000 - 175);
});

test("a hold still open at hangup is billed at half price up to the end", async () => {
  const db = d1();
  await answeredCall(db, 30 * 25);
  await calls(db).holdStarted("call_1", s(0));
  const row = await calls(db).finish("call_1", {
    status: "completed",
    pricePerMinuteCents: 25,
    at: s(600),
  });
  assert.equal(row!.cost_cents, 125);
});

test("extending a call on hold holds more credits, all released when it ends, and the bill never passes what was held", async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  const c = calls(db);
  const row = (await c.byId("call_1"))!;
  assert.ok(await c.extend(row, 15, 25, 1));
  assert.equal((await c.byId("call_1"))!.hold_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents("acct_alice"), 10_000 - 20 * 25);
  // Ran 40 minutes with no hold recorded: capped at the 20 minutes held.
  const done = await c.finish("call_1", {
    status: "completed",
    pricePerMinuteCents: 25,
    at: s(40 * 60),
  });
  assert.equal(done!.cost_cents, 20 * 25);
  assert.equal(await accounts(db).balanceCents("acct_alice"), 10_000 - 20 * 25);
});

test("an extension the balance cannot cover is refused and holds nothing", async () => {
  const db = d1();
  await answeredCall(db, 5 * 25);
  await accounts(db).post(
    "acct_alice",
    -(10_000 - 5 * 25 - 100),
    "adjustment",
    "drain",
    "leave $1",
  );
  const c = calls(db);
  assert.equal(await c.extend((await c.byId("call_1"))!, 15, 25, 1), false);
  assert.equal((await c.byId("call_1"))!.hold_cents, 5 * 25);
});

test('a hold request heard in fragments around our caller saying "sure" stays a hold (call_9xwa7me14baj5e8m)', () => {
  const m = new HoldMeter();
  m.them("Oh Keep me one second, I'll be right", s(155));
  assert.ok(m.holding());
  assert.equal(m.caller("Sure."), null);
  assert.equal(m.them("back I have to check with the", s(165)), null);
  assert.equal(m.caller("Sure."), null);
  assert.equal(m.them("manager", s(167)), null);
  assert.ok(m.holding(), "still waiting on the manager");
});

test('"let me check with the kitchen" and "I\'ll be right back" are holds', () => {
  assert.ok(isHoldLine("let me check with the kitchen"));
  assert.ok(isHoldLine("I'll be right back"));
  assert.ok(isHoldLine("I have to ask my manager"));
});
