import assert from 'node:assert/strict';
import test from 'node:test';
import { asksForMessage, forcedHandoffMessage, greetingWaiting, voicemailLeft } from '../src/server/voice/handoff';
import { HoldMeter } from '../src/server/voice/hold';
import { voicemailGreeting } from '../src/server/voice/voicemail';

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

test('greetings asking for a voicemail, a name, or in Korean are voicemail prompts', () => {
  // Each greeting left our caller on the line 45s to 100s after its message, until the silence timer.
  for (const greeting of [
    "Hello, this is Jacob. Leave me a name or a number and I'll get back to you.",
    'If you could please leave your name and a number, I will return your call as soon as I can.',
    "I can't get to the phone right now, but leave me a voicemail or shoot me a text and I'll get back to you.",
    'Hi, you\'ve reached Ganim Tree Farm. Please leave us a voicemail or a text message. Thank you',
    "I'm sorry, this person is not available. If you would like to leave an additional message, please reply after the tone",
    'Please leave your name, date of birth, and reason for your call and we\'ll return it as soon as possible.',
    "Thank you for choosing Gastro Health. We apologize we missed your call. Please leave full name, date of birth, best contact number, and we'll call you back as soon as possible",
    '삐 소리후 메시지를 녹음 하고, 녹음이 끝나면 전화를 끊으십시오',
  ]) assert.ok(asksForMessage(greeting), greeting);
  assert.ok(!asksForMessage('To leave a voicemail, press 6.'));
  assert.ok(!asksForMessage('Sure, let me grab a pen. What was the name again?'));
});

test('a message left after a greeting split across fragments, or answered with a "Hmm", is a voicemail left', async () => {
  const { voicemailLeft } = await import('../src/server/voice/handoff');
  const fragments = [
    { role: 'them' as const, text: 'Greetings, you have reached Compass, please leave', at: 1 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 2 },
    { role: 'them' as const, text: 'a', at: 3 },
    { role: 'them' as const, text: 'message after the', at: 4 },
    { role: 'them' as const, text: 'tone. Thank you', at: 5 },
    { role: 'caller' as const, text: "Hi, I'm calling about the listing on Pine Street. Please call back at four one five, five five five, zero one two three.", at: 6 },
  ];
  assert.equal(voicemailLeft(fragments, null, new Set())?.reason, 'voicemail_left');
  // Lucere Vision: our caller's "Hmm." fell inside the greeting, before it asked for a message.
  const lucere = [
    { role: 'them' as const, text: "Thank you for calling Lucere Vision. We're sorry we missed", at: 1 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 2 },
    { role: 'them' as const, text: 'your call', at: 3 },
    { role: 'caller' as const, text: 'Hmm.', at: 4 },
    { role: 'them' as const, text: '. Please leave your name, date of birth, and reason for your call and we\'ll return it as soon as possible.', at: 5 },
    { role: 'caller' as const, text: 'Hi, calling about a self-pay chalazion evaluation. Could someone call back at two four eight, two six two, five two five six? Thanks.', at: 6 },
  ];
  assert.equal(voicemailLeft(lucere, null, new Set())?.reason, 'voicemail_left');
  // Only the "Hmm." came after the greeting began: no message yet.
  assert.equal(voicemailLeft(lucere.slice(0, 5), null, new Set()), null);
});

test("a request for a message counts from where it is complete, and a menu before it doesn't cancel it", async () => {
  const { voicemailLeft } = await import('../src/server/voice/handoff');
  // Dr Uzai's greeting ended "Thank" / "you" after our message had begun: it still counts.
  const tail = [
    { role: 'them' as const, text: "This is Dr Uzai. Please leave a message. And I'll", at: 1 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 2 },
    { role: 'them' as const, text: 'call you back. Thank', at: 3 },
    { role: 'caller' as const, text: "Hi Dr. Uzai, this is Alex's assistant asking about a follow-up visit next week. Please call back at four one five, five five five, zero one two three.", at: 4 },
    { role: 'them' as const, text: 'you', at: 5 },
    { role: 'caller' as const, text: 'Thanks so much, bye.', at: 6 },
  ];
  assert.equal(voicemailLeft(tail, null, new Set())?.reason, 'voicemail_left');
  // A school's menu ran just before the teacher's own greeting.
  const menu = [
    { role: 'them' as const, text: 'For middle school and high school, press four', at: 1 },
    { role: 'them' as const, text: 'Hello', at: 2 },
    { role: 'them' as const, text: "You have reached Rocky at extension six two one two. Please leave a message and I'll get back to you as soon as I can. Thank you", at: 3 },
    { role: 'caller' as const, text: "Hi Rocky, this is Jordan's assistant calling about the parent conference on Friday. Please call back at four one five, five five five, zero one two three.", at: 4 },
  ];
  assert.equal(voicemailLeft(menu, null, new Set())?.reason, 'voicemail_left');
});

test("the recording's own controls after a request for a message aren't a menu, a key or word bound to leaving one is", async () => {
  const { messageAfterGreeting, voicemailLeft } = await import('../src/server/voice/handoff');
  // One Jackson Place: a forwarding menu, then the voicemail, all in one line. The line stayed open 46s.
  const forwarded = [
    { role: 'them' as const, text: 'Thank you for calling Brandon Management Company. Press', at: 0 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 3_202 },
    { role: 'them' as const, text: 'one for Brandon Management. Press two for engineering services. Press pound to repeat the menu. Press star to return to the main menu or hang up to end the call Please hold while I try to connect you Your call has been forwarded to the voicemail for Jessica Teglia. No one is available to take your call. At the tone, please record your message. When you have finished recording, you may hang up or press the pound key for more options', at: 3_517 },
    { role: 'caller' as const, text: "Hi, this is Nick's assistant calling about studio availability, rent and parking. You can call us back at two four eight, two six two, five two five six. Thanks so much!", at: 73_955 },
  ];
  assert.equal(voicemailLeft(forwarded, null, new Set())?.reason, 'voicemail_left');
  assert.equal(messageAfterGreeting(forwarded, new Set())?.reason, 'voicemail_left');
  for (const greeting of [
    'At the tone, please record your message. When you have finished recording, you may hang up or press one for more options',
    'Please record your message after the tone. Press star to discard the recording, or press any digit to end the recording',
    'Record your message at the tone. Press any key or stop talking to end the recording',
    'Please leave your message after the tone. When done, hang up or press the pound key',
    'Please provide your name and a brief message, and one of our leasing professionals will follow up with you',
  ]) assert.ok(asksForMessage(greeting), greeting);
  for (const option of [
    // A transcript cut the option in two at "press zero".
    'If you would like one of our leasing specialists to get in touch with you regarding our current pricing and availability, simply press zero. And leave us a message with the best way to reach you.',
    'You can say, office hours, directions, or for anything else, say contact to leave a message for our community team.',
    'To review or re-record your message, press one.',
  ]) assert.ok(!asksForMessage(option), option);
  // An AI receptionist asking how else it can help is answering, not recording.
  const receptionist = [
    { role: 'them' as const, text: "If you'd like a leasing specialist to reach you, leave us a message with the best way to reach you. How else can I help you?", at: 1 },
    { role: 'caller' as const, text: "Hi, this is Nick's assistant looking for a studio. Can you tell me what's available?", at: 2 },
  ];
  assert.equal(voicemailLeft(receptionist, null, new Set()), null);
});

test("a voicemail request run on from the menu before it with no full stop is still a request; a key's own option to leave one isn't", () => {
  // Episcopal Community Services: menu, transfer and voicemail in one unpunctuated run.
  assert.ok(asksForMessage('To reach housing administration, press nine. To repeat these options, press the star key. To return to the previous menu, press the pound key Please wait while your call is being transferred Please leave a message after the tone. When you have finished, please hang up or press the pound key for more options'));
  assert.ok(asksForMessage('For our general hours and location, please press 1. For customer service, please press 2 Record your message after the tone. Press any key or stop talking to end the recording'));
  assert.ok(!asksForMessage('Please hold for the next available agent. You may press the star key at any time to leave a voicemail. To request a callback, press zero.'));
  assert.ok(!asksForMessage('For sales, press 1, or to leave a message for our team press 2.'));
  assert.ok(!asksForMessage('Press 1 to leave a message.'));
});

test('French greetings asking for a message are voicemail prompts, French and Spanish menu options are not', () => {
  for (const greeting of [
    'Votre correspondant ne peut recevoir votre appel. Veuillez laisser un message après le signal sonore.',
    'Laissez-nous un message et nous vous rappellerons.',
    'Vous pouvez laisser votre nom et votre numéro de téléphone.',
    'Laissez vos coordonnées après le bip.',
    "Veuillez commencer l'enregistrement de votre message après le signal sonore",
    'Merci de nous laisser un bref message.',
  ]) assert.ok(asksForMessage(greeting), greeting);
  assert.ok(!asksForMessage('Pour laisser un message, appuyez sur le 3.'));
  assert.ok(!asksForMessage('Pour nous laisser un message, faites le 2.'));
  assert.ok(!asksForMessage('Para dejar un mensaje, oprima el 3.'));
  assert.ok(!asksForMessage('Votre appel est important pour nous, veuillez patienter.'));
});

// Shaped like Gamrat Lalonde's voicemail (business renamed): the carrier flagged a machine, no beep
// was ever reported, and the caller waited 50s for one before the voicemail gave up.
const frenchGreeting = [
  { role: 'them' as const, text: 'Bonjour et bienvenue chez Dubois Comptables. Hello and welcome to Dubois Comptables.', at: 2_000 },
  { role: 'note' as const, text: 'carrier detected an automated greeting', at: 4_800 },
  { role: 'caller' as const, text: 'Hmm.', at: 5_500 },
  { role: 'them' as const, text: "Votre correspondant... ne peut recevoir votre appel. Veuillez laisser un message après le signal sonore... Appuyez sur la touche carré à la fin de l'enregistrement", at: 6_000 },
];

test('a greeting that asked for a message and went quiet is recording, beep or not, until our caller leaves one', () => {
  const miss = greetingWaiting(frenchGreeting, new Set());
  assert.equal(miss?.reason, 'greeting_waiting');
  assert.equal(miss?.line.at, 6_000);
  assert.match(forcedHandoffMessage(miss!, frenchGreeting), /recording now, even though no beep was reported\. Leave your message now, in the greeting's language/);
  // "J'attends le bip" is still waiting, not a message.
  const stalled = [...frenchGreeting, { role: 'caller' as const, text: "J'attends le bip.", at: 56_700 }];
  assert.equal(greetingWaiting(stalled, new Set())?.reason, 'greeting_waiting');
  // Asked once per greeting.
  assert.equal(greetingWaiting(frenchGreeting, new Set([6_000])), null);
  // Once the message is left, it is a voicemail left, not a greeting waiting.
  const left = [...frenchGreeting, { role: 'caller' as const, text: "Bonjour, ici l'assistante de Sam Martin. Nous aimerions prendre rendez-vous. Vous pouvez nous rappeler au cinq cinq cinq, zéro un deux trois. Merci, au revoir.", at: 11_000 }];
  assert.equal(greetingWaiting(left, new Set()), null);
  assert.equal(voicemailLeft(left, null, new Set())?.reason, 'voicemail_left');
});

test('a person picking up after the French greeting is not a recording waiting for a message', () => {
  const lines = [
    { role: 'them' as const, text: 'Veuillez laisser un message après le signal sonore.', at: 2_000 },
    { role: 'them' as const, text: 'Allô, cabinet Dubois, comment puis-je vous aider?', at: 6_000 },
  ];
  assert.equal(greetingWaiting(lines, new Set()), null);
});

test('a message left after a French greeting streamed in fragments is a voicemail left', () => {
  const lines = [
    { role: 'them' as const, text: "Le correspondant n'est pas joignable pour le moment. Veuillez", at: 1_600 },
    { role: 'note' as const, text: 'carrier detected an automated greeting', at: 4_400 },
    { role: 'them' as const, text: 'laisser un', at: 4_800 },
    { role: 'them' as const, text: 'message après le signal sonore. Après avoir laissé votre message, vous pouvez le modifier en appuyant sur le carré', at: 5_200 },
    { role: 'caller' as const, text: "Bonjour, je suis l'assistant de Sam Martin. Je vous appelle au sujet du mariage. Vous pouvez me rappeler au cinq cinq cinq, zéro un deux trois. Merci!", at: 12_800 },
  ];
  assert.equal(voicemailLeft(lines, null, new Set())?.reason, 'voicemail_left');
});

// A phone's call screener (business renamed): the person wasn't available, and the screener asked
// for a message after a hold request. The caller sat silent 30s until the user hung up.
const screened = [
  { role: 'them' as const, text: "Record your name and reason for calling. I'll see if this person is available", at: 1_800 },
  { role: 'note' as const, text: 'carrier detected a call screening prompt', at: 7_200 },
  { role: 'caller' as const, text: 'Hi, Alex from Example Co for Michael, about his website.', at: 7_700 },
  { role: 'them' as const, text: "Thanks, Michael. Please stay on the line I'm sorry, this person is not available. If you would like to leave an additional message, please reply after the tone", at: 18_600 },
];

test("a screener's request for a message after its hold request is waiting on the message; a queue offering one is not", () => {
  assert.equal(greetingWaiting(screened, new Set())?.reason, 'greeting_waiting');
  const queue = [{ role: 'them' as const, text: 'All of our agents are busy. Please leave a message after the tone, or stay on the line for the next available representative.', at: 2_000 }];
  assert.equal(greetingWaiting(queue, new Set()), null);
  const later = [{ role: 'them' as const, text: 'You can leave a message after the tone.', at: 2_000 }, { role: 'them' as const, text: 'Otherwise, please hold for the next available representative.', at: 5_000 }];
  assert.equal(greetingWaiting(later, new Set()), null);
});

test("a voicemail's greeting is told apart from a screener asking for an introduction", () => {
  const them = (text: string) => [{ role: 'them', text }];
  assert.ok(voicemailGreeting(them('The number you have reached, four one five, five five five, zero one nine nine, is not available')));
  assert.ok(voicemailGreeting(them("Hi, you've reached Sam. I can't take your call right now.")));
  assert.ok(!voicemailGreeting(them("Record your name and reason for calling. I'll see if this person is available")));
  assert.ok(!voicemailGreeting(them('The person you are calling is not available right now. Please say your name and reason for calling.')));
  assert.ok(!voicemailGreeting(them('Thanks for calling Example Market.')));
});
