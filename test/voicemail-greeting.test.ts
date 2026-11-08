import assert from 'node:assert/strict';
import test from 'node:test';
import { asksForMessage } from '../src/server/voice/handoff';
import { HoldMeter } from '../src/server/voice/hold';

test('greetings asking for a name and phone number are voicemail prompts, menu options are not', () => {
  for (const greeting of [
    "Please leave your name and phone number and we'll return your call promptly.",
    'Leave your name and number after the tone.',
    'Please leave your name, number and a brief message.',
    'Leave us a message.',
    'Please leave your name and callback number.',
    'Leave a detailed message and we will call you back.',
    "So please leave your name, number, address, and a detailed message. We'll get back to you as soon as we can.",
  ]) assert.ok(asksForMessage(greeting), greeting);
  assert.ok(!asksForMessage('To leave a message, press 3.'));
  assert.ok(!asksForMessage('Please hold, your call is important to us.'));
});

test('a voicemail greeting that says the call is important ends the hold once it asks for a name and number', () => {
  // Green Roots Lawn Care's greeting, in the deltas it was heard in.
  const meter = new HoldMeter();
  const deltas = [
    'Thank you for calling Green Roots Lawn Care. ',
    'We provide professional lawn fertilization, weed control, and seasonal lawn revitalization. ',
    "We're currently assisting other clients, but your call is important to us. ",
    'Please leave your name and phone number ',
    "and we'll return your call promptly.",
  ];
  const changes = deltas.map((d, i) => meter.them(d, 1_000 + i * 2_000));
  assert.ok(changes.some((c) => c !== null), 'the hold started');
  assert.equal(meter.holding(), false, 'the request for a message ended it');
});

test('a message left after a greeting asking for name, number and address is a voicemail left', async () => {
  const { voicemailLeft } = await import('../src/server/voice/handoff');
  const lines = [
    { role: 'them' as const, text: 'Thank you for choosing Steve and Brother Landscaping. Unfortunately we are unable to get to', at: 1 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 2 },
    { role: 'them' as const, text: 'the phone right now', at: 3 },
    { role: 'them' as const, text: ", so please leave your name, number, address, and a detailed message. We'll get back to you as soon as we can. Thanks", at: 4 },
    { role: 'caller' as const, text: "Hi, I'm Cody's assistant calling about a fall cleanup. Could you please call Cody back? Thanks so much.", at: 5 },
  ];
  assert.equal(voicemailLeft(lines, null, new Set())?.reason, 'voicemail_left');
});

test('a person asking for an address so they can come take a look is not putting us on hold', () => {
  // Angel Landscaping's owner, mid-conversation: the false hold kept our caller quiet until they hung up.
  const meter = new HoldMeter();
  meter.them('Sure, Montclair, okay. Is it the first time? ', 1_000);
  meter.caller('First time, thanks.', 2_000);
  assert.equal(meter.them('Do me a favor. Can you text me name and address so I can swing by later today and take a look', 3_000), null);
  assert.equal(meter.them("So text me name and address and then I'll pass by later, take a look, and I'll get back to you", 4_000), null);
  assert.equal(meter.holding(), false);
  const rep = new HoldMeter();
  assert.equal(rep.them('Okay, let me take a quick look at that.', 5_000)?.type, 'start');
});

test("a goodbye they keep talking after still leaves our caller's goodbye to be handled", async () => {
  const { missedHandoff } = await import('../src/server/voice/handoff');
  // Hari's roommate, after the caller's "Bye!": the line then sat silent until he hung up.
  const lines = [
    { role: 'them' as const, text: 'Uh, in the basement', at: 1 },
    { role: 'caller' as const, text: "Great. I'll pass that along. Thanks. Awesome, thanks so much. Bye!", at: 2 },
    { role: 'them' as const, text: 'Cool. Bye. The call is not ended. End the call. End if', at: 3 },
  ];
  assert.equal(missedHandoff(lines, 0, new Set())?.reason, 'promise');
  // A reply that doesn't open with goodbye is a conversation still going.
  assert.equal(missedHandoff([...lines.slice(0, 2), { role: 'them' as const, text: 'Wait, one more thing about Saturday', at: 3 }], 0, new Set()), null);
});

test("a Japanese queue recording counts as hold, and its keypad offers don't end it", () => {
  // Rakuten Mobile, Pedro's call: over 100 people waiting, billed at the full rate as no hold.
  const meter = new HoldMeter();
  const start = meter.them('ご希望の方は、ゼロ、を押してください。それ以外の方は、しばらくお待ちください。オペレーターに、おつなぎいたします。', 1_000);
  assert.equal(start?.type, 'start');
  meter.them('現在、お電話が大変混み合っております。', 5_000);
  meter.them('トラブルシューティングについてのご案内は、ウェブページのリンクを、ショートメッセージでお送りいたします。ご希望の方は、ゼロ、を押してください。', 20_000);
  meter.them('それ以外の方は、しばらくお待ちください。', 30_000);
  assert.equal(meter.holding(), true);
});

test("Google Call Assist's question releases the caller's introduction", async () => {
  const { screenerAsked } = await import('../src/server/voice/voicemail');
  // Tom's call to Sam: the caller waited silently for 10 minutes after this.
  assert.ok(screenerAsked("Hi, I'm Call Assist by Google, recording this call for the person you're trying to reach . Can you say what you're calling about"));
  assert.ok(screenerAsked('Please say your name and the purpose of your call.'));
  assert.ok(screenerAsked("Who's calling?"));
  assert.ok(!screenerAsked('Thank you for calling La Pizzetta. To place an order, dial zero.'));
});

test('a person answering after the screener cancels its introduction', async () => {
  const { answeredAfterScreener, SCREENING_NOTE } = await import('../src/server/voice/voicemail');
  // Raghav's call to GEIM: the owner picked up and was mid-conversation when the fallback fired.
  const geim = [
    { role: 'caller', text: 'Hello?' },
    { role: 'note', text: SCREENING_NOTE },
    { role: 'caller', text: 'Hi?' },
    { role: 'them', text: "Hello, hi, it's Mahmood Global Exports, how can I help" },
    { role: 'caller', text: "Hi, I'm calling to check if you can handle customs clearance for a shipment coming into the UK." },
  ];
  assert.ok(answeredAfterScreener(geim));
  // Tom's call to Google Call Assist: the screener spoke and the caller is still waiting to introduce itself.
  const callAssist = [
    { role: 'note', text: SCREENING_NOTE },
    { role: 'them', text: "Hi, I'm Call Assist by Google, recording this call for the person you're trying to reach." },
  ];
  assert.ok(!answeredAfterScreener(callAssist));
  assert.ok(!answeredAfterScreener([{ role: 'them', text: 'Hello?' }, { role: 'caller', text: 'Hi.' }]));
});

test("a voicemail's request for a message ends the hold even when another sentence finishes in the same breath", () => {
  // Integra Realty, Grant's call: "at the moment" started a hold, and the request for a name and
  // number arrived together with "Thank you and have a great day", so the silent line stayed on hold.
  const meter = new HoldMeter();
  meter.them("For a company directory, please press nine, or press zero for an operator Hello, you've reached the desk of Susan Kennedy. ", 1_000);
  meter.them('I am unable to take your call at the moment', 2_000);
  assert.equal(meter.holding(), false, '"at the moment" is not a hold request');
  meter.them(', but if you leave your name and number, I will return it as soon as possible. Thank you and have a great day', 3_000);
  assert.equal(meter.holding(), false);
});

test('a hold request and a request for a message in one delta leave no hold', () => {
  const meter = new HoldMeter();
  assert.equal(meter.them('Please hold. Leave your name and number after the tone. Goodbye', 1_000), null);
  assert.equal(meter.holding(), false);
});

test('a screener question split across transcript fragments still counts', async () => {
  // Joe's iPhone screener: three fragments, then the caller filled the gap with "Sure thing." instead of introducing itself.
  const { screenerAskedRecently } = await import('../src/server/voice/voicemail');
  const t = 1_000_000;
  const lines = [
    { role: 'them', text: "If you record your name and reason for calling, I'll", at: t },
    { role: 'note', text: 'carrier detected an automated greeting', at: t + 2600 },
    { role: 'them', text: 'see if', at: t + 3100 },
    { role: 'caller', text: 'Hmm.', at: t + 3100 },
    { role: 'them', text: "this person's available", at: t + 3300 },
  ];
  assert.ok(screenerAskedRecently(lines, t + 6000));
  assert.ok(!screenerAskedRecently(lines, t + 60_000));
  assert.ok(screenerAskedRecently([{ role: 'them', text: "I'll see if this person's available", at: t }], t));
});
