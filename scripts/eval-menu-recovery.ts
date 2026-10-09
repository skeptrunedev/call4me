import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { forcedHandoffMessage, MenuRecovery } from '../src/server/voice/handoff';
import { BACK_OFFICE_TOOLS, backOfficeInstructions, type CallBrief } from '../src/server/voice/prompt';

// Opt-in model evaluation. Tool calls are inspected, never executed; no phone call is placed.
if (!process.env.OPENAI_API_KEY && existsSync('.dev.vars')) loadEnvFile('.dev.vars');
assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required');
const configuredModel = readFileSync('wrangler.jsonc', 'utf8').match(/"BACK_OFFICE_MODEL"\s*:\s*"([^"]+)"/)?.[1];
assert.ok(configuredModel, 'BACK_OFFICE_MODEL must be configured in wrangler.jsonc');
const model = process.env.BACK_OFFICE_MODEL || configuredModel;

const brief: CallBrief = {
  onBehalfOf: 'Test Caller', owner: 'Test Caller', business: 'Test Store',
  goal: 'Reach a live representative to submit an authorized refund and obtain a confirmation. Recorded refund instructions do not accomplish the task.',
  facts: 'Order number: 1234567890. The item was not installed. No Social Security number was supplied and none may be shared.',
  flexibility: 'Submit the refund only after the representative verifies no refund is already pending. Do not make any purchases.',
  callbackNumber: '+12025550100', callbackRingsOwner: false, localTime: null, connectWhen: null, assistantName: null, callingAs: null,
};

type Scenario = { name: string; before?: { prompt: string; digits: string }[]; prompt: string; caller?: string; goal?: string; expected: { tool: string; digits?: string }[] };
const scenarios: Scenario[] = [
  {
    name: 'choose a person instead of the recorded refund policy',
    prompt: 'To process a return, press one. For information about returns, press two. For assistance replacing an item, press three. For technical support, press four. For all other questions, press five.',
    expected: [{ tool: 'press_digits', digits: '5' }],
  },
  {
    name: 'leave a recorded instruction dead end through its announced back option',
    before: [{ prompt: 'For returns, press one. For all other questions, press five.', digits: '1' }],
    prompt: 'For an immediate refund, return the order to any warehouse. If this has answered your question, you may hang up. No input was received. To return to the previous menu, press pound.',
    expected: [{ tool: 'press_digits', digits: '#' }],
  },
  {
    name: 'choose a different route after returning from recorded instructions',
    before: [
      { prompt: 'For returns, press one. For all other questions, press five.', digits: '1' },
      { prompt: 'For an immediate refund, return the order to any warehouse. If this has answered your question, you may hang up. To return to the previous menu, press pound.', digits: '#' },
    ],
    prompt: 'For returns, press one. For all other questions, press five.',
    expected: [{ tool: 'press_digits', digits: '5' }],
  },
  {
    name: 'correct invalid entry using supplied facts',
    goal: 'Reach a representative about order 1234567890. Give the order number only when requested.',
    before: [{ prompt: 'Please enter your ten digit order number now.', digits: '1234' }],
    prompt: 'Your entry is invalid. Please enter your ten digit order number followed by pound.',
    expected: [{ tool: 'press_digits', digits: '1234567890#' }],
  },
  {
    name: 'respect restrictions when required identifying information is unavailable',
    before: [{ prompt: 'For account services, press one.', digits: '1' }],
    prompt: 'Please enter your complete Social Security number using your phone keypad.',
    expected: [{ tool: 'ask_user' }, { tool: 'end_call' }],
  },
  {
    name: 'choose the no card option for a reward card that never arrived',
    goal: 'Find a reward card that never arrived and ask a representative to reissue it. The caller has no card or card number.',
    prompt: 'If you have your card handy, please press one. If you do not have your card handy, please press two.',
    expected: [{ tool: 'press_digits', digits: '2' }],
  },
  {
    name: 'retry the correct announced choice after rejected keypad input',
    goal: 'Find a reward card that never arrived and ask a representative to reissue it. The caller has no card or card number.',
    before: [{ prompt: 'If you have your card handy, please press one. If you do not have your card handy, please press two.', digits: '2' }],
    prompt: 'I am sorry, we did not understand your input, please try again. If you have your card handy, please press one. If you do not have your card handy, please press two.',
    expected: [{ tool: 'press_digits', digits: '2' }],
  },
  {
    name: 'answer a spoken security challenge using only the requested digits',
    prompt: 'Please listen to the following security challenge code and provide the requested response to continue. The security code is two, three, six, nine. Please enter the middle two digits of the security code followed by the pound key.',
    expected: [{ tool: 'press_digits', digits: '36#' }],
  },
  {
    name: 'submit an announced star action after two confirmed keypad inputs',
    goal: 'Test the automated keypad echo line. Send 5 and then 2, waiting for each remote confirmation. Then use its announced star option to replay the menu and its hash option to end. Do not repeat keys already confirmed.',
    before: [
      { prompt: 'You are now entering the DTMF echo test. Press any key on your keypad and you will hear it played back. Press the star key to hear this menu again. Press the hash key to end the call.', digits: '5' },
      { prompt: ' You pressed five.', digits: '2' },
    ],
    prompt: ' You pressed two.',
    caller: 'Nice. Now star to hear the menu again.',
    expected: [{ tool: 'press_digits', digits: '*' }],
  },
];

for (const scenario of scenarios) {
  const recovery = new MenuRecovery();
  for (const step of scenario.before ?? []) {
    recovery.observe(step.prompt, Date.now());
    recovery.submitted(step.digits, recovery.snapshot());
  }
  recovery.observe(scenario.prompt, Date.now());
  if (scenario.caller) recovery.observeCaller(scenario.caller, Date.now());
  const pending = recovery.pending();
  assert.ok(pending, `${scenario.name}: recovery should detect the menu`);
  const instructions = backOfficeInstructions({ ...brief, ...(scenario.goal ? { goal: scenario.goal } : {}) });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, instructions, input: forcedHandoffMessage(pending, [], recovery.history()),
      tools: BACK_OFFICE_TOOLS, tool_choice: 'auto', parallel_tool_calls: false,
      reasoning: { effort: 'low' }, text: { verbosity: 'low' }, store: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  assert.ok(response.ok, `${scenario.name}: OpenAI returned ${response.status}`);
  const body = await response.json() as { output?: { type: string; name?: string; arguments?: string }[] };
  const tool = body.output?.find((item) => item.type === 'function_call');
  assert.ok(tool, `${scenario.name}: model must take a supported next step`);
  const args = JSON.parse(tool.arguments || '{}') as { digits?: string };
  assert.ok(scenario.expected.some((expected) => tool.name === expected.tool && (!expected.digits || args.digits === expected.digits)), `${scenario.name}: unexpected ${tool.name} ${args.digits || ''}`);
  console.log(`PASS: ${scenario.name} (${tool.name}${args.digits ? ` ${args.digits}` : ''})`);
}
console.log(`Passed ${scenarios.length} live backend evaluations with ${model}. No tools were executed.`);
