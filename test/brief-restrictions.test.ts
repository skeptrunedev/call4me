import assert from 'node:assert/strict';
import test from 'node:test';

// A batch of 22 calls (call_e8nul6tdxwu4sj3h, 2026-11-25) said "Do not disclose the customer's name
// ... Do not leave voicemail or request a callback", and the caller still introduced itself as the
// customer's assistant and left voicemails with the callback number. A brief that said "do not give
// a phone number" (call_450k4ikbygu1wp7c) got the callback number on voicemail too.
const call = {
  owner: 'Alex Kim', assistantName: null, callingAs: null, onBehalfOf: 'Alex Kim', business: 'Example Judaica',
  goal: 'Ask whether they carry a loose wick for a 30 day oil lamp.',
  facts: '', flexibility: "Do not disclose the customer's name. Do not leave voicemail or request a callback.",
  callbackNumber: '+14155550100', callbackRingsOwner: false, connectWhen: null, voice: 'marin',
  localTime: null, today: 'Wednesday, November 25, 2026',
} as const;

test("a brief that keeps the name private wins over every line that says it", async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  assert.match(callInstructions(call), /When the task, facts or what you can agree to say not to give out Alex Kim's name \(or "the customer's name", "my name"\), that wins over every line here that names them: never say Alex Kim's name, in your intro, on voicemail, when asked who's calling, who you work for or who's recording\. Say you're "an assistant calling for a client"/);
  // A call for someone other than the account holder keeps both names private.
  assert.match(callInstructions({ ...call, onBehalfOf: 'my boss Priya' }), /not to give out my boss Priya or Alex Kim's name/);
  // Calling as a company, the caller is from that company.
  assert.match(callInstructions({ ...call, callingAs: 'Acme' }), /Say you're calling from Acme for a client/);
});

test('a brief that says no voicemail hangs up at the greeting without a word', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const prompt = callInstructions(call);
  assert.match(prompt, /When the task, facts or what you can agree to say not to leave a voicemail or a message, leave nothing: hand off to hang up \(end_call\) without a word, even after the beep\. Otherwise leave one or two sentences/);
  assert.match(prompt, /you left a voicemail \(or reached one on a task that says not to leave one\)/);
});

test('a brief that says not to give a phone number gets none, on voicemail too', async () => {
  const { callInstructions } = await import('../src/server/voice/prompt');
  const prompt = callInstructions(call);
  assert.match(prompt, /When they say not to give out a phone number or ask for a callback, that wins everywhere, voicemail included: give no number, only another contact they give \(an email\), if any\./);
  assert.match(prompt, /what it's about, and the callback number, except what the task says not to give out: no name or no phone number then, as above\./);
  // The no-account rule still gives no number on file.
  assert.match(prompt, /When the task or facts say there's no account, that wins: give no number, and say there's no account\./);
});

test("the session's nudge at a quiet voicemail greeting leaves nothing when the task says no voicemail", async () => {
  const { forcedHandoffMessage } = await import('../src/server/voice/handoff');
  const line = { role: 'them' as const, text: 'Please leave a message.', at: 1 };
  const message = forcedHandoffMessage({ reason: 'greeting_waiting', line }, [line]);
  assert.match(message, /leaving out a name or phone number the task says not to give\. When the task says not to leave a voicemail or a message, say nothing and hand off end_call now\./);
});
