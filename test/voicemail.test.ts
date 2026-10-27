import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_MACHINE_STATE, MACHINE_GUIDANCE, machineEventOf, machineTransition, type MachineEvent, type MachineGuidance, type MachineState } from '../src/server/voice/voicemail';

const detection = 'call.machine.premium.detection.ended';
const greeting = 'call.machine.premium.greeting.ended';
const screening = 'call.machine.premium.call_screening.detected';
const at = (seconds: number) => new Date(seconds * 1000).toISOString();

function replay(events: [MachineEvent, number][], initial = INITIAL_MACHINE_STATE) {
  let state: MachineState = initial;
  const guidance: MachineGuidance[] = [];
  for (const [event, seconds] of events) {
    const transition = machineTransition(state, event, at(seconds));
    state = transition.state;
    if (transition.guidance) guidance.push(transition.guidance);
  }
  return { state, guidance };
}

test('carrier results preserve human, screening prompt, timeout and recording beep distinctions', () => {
  assert.equal(machineEventOf(detection, 'machine'), 'machine');
  for (const result of ['human_residence', 'human_business']) assert.equal(machineEventOf(detection, result), 'human');
  for (const result of ['silence', 'fax_detected', 'not_sure', undefined]) assert.equal(machineEventOf(detection, result), null);
  assert.equal(machineEventOf(greeting, 'beep_detected'), 'greeting_ended');
  assert.equal(machineEventOf(greeting, 'no_beep_detected'), 'greeting_timeout');
  assert.equal(machineEventOf(greeting, 'prompt_ended'), 'screening_prompt_ended');
  assert.equal(machineEventOf(greeting, 'not_sure'), null);
  assert.equal(machineEventOf(screening, 'screening'), 'screening');
  assert.equal(machineEventOf(screening, undefined), null);
  assert.equal(machineEventOf('call.hangup', undefined), null);
});

test('an unconfirmed greeting timeout never instructs the caller to leave voicemail', () => {
  assert.deepEqual(replay([['greeting_timeout', 1]]).guidance, []);
  assert.deepEqual(replay([['machine', 1], ['greeting_timeout', 2]]).guidance, ['machine', 'greeting_timeout']);
  assert.match(MACHINE_GUIDANCE.greeting_timeout, /does not mean voicemail is recording/);
});

test('an iOS prompt requests a screening introduction and continues to a human', () => {
  const result = replay([['machine', 1], ['screening_prompt_ended', 2], ['screening', 3], ['human', 4]]);
  assert.deepEqual(result.guidance, ['machine', 'screening', 'human']);
  assert.equal(result.state.phase, 'human');
  assert.match(MACHINE_GUIDANCE.screening, /Do not leave a voicemail or hang up/);
});

test('AMD restarted after screening can detect an actual machine and recording beep', () => {
  const result = replay([['machine', 1], ['screening_prompt_ended', 2], ['screening', 3], ['machine', 4], ['greeting_ended', 5]]);
  assert.deepEqual(result.guidance, ['machine', 'screening', 'machine', 'greeting_ended']);
  assert.equal(result.state.phase, 'voicemail');
});

test('a standalone beep can identify voicemail without a machine webhook', () => {
  assert.deepEqual(replay([['greeting_ended', 2]]).guidance, ['greeting_ended']);
  assert.match(MACHINE_GUIDANCE.greeting_ended, /If the audio confirms/);
  assert.match(MACHINE_GUIDANCE.greeting_ended, /If a live person is speaking, continue/);
});

test('confirmed human pickup suppresses subsequent voicemail and screening directions', () => {
  assert.deepEqual(replay([['human', 1], ['greeting_timeout', 2], ['screening_prompt_ended', 3], ['machine', 4], ['greeting_ended', 5]]).guidance, []);
  assert.deepEqual(replay([['machine', 1], ['human', 2], ['greeting_ended', 3]]).guidance, ['machine', 'human']);
});

test('human classification cancels a prior voicemail direction when it arrives later', () => {
  const result = replay([['greeting_ended', 1], ['human', 2]]);
  assert.deepEqual(result.guidance, ['greeting_ended', 'human']);
  assert.equal(result.state.phase, 'human');
});

test('a delayed human result still cancels voicemail instructions delivered ahead of it', () => {
  const result = replay([['greeting_ended', 3], ['human', 1], ['machine', 2]]);
  assert.deepEqual(result.guidance, ['greeting_ended', 'human']);
  assert.equal(result.state.phase, 'human');
  assert.equal(result.state.occurredAt, 3000);
});

test('delayed initial classification cannot silence a recording or restart screening', () => {
  assert.deepEqual(replay([['greeting_ended', 3], ['machine', 1]]).guidance, ['greeting_ended']);
  assert.deepEqual(replay([['screening_prompt_ended', 2], ['machine', 1], ['screening', 3], ['machine', 4], ['screening', 3], ['greeting_ended', 5]]).guidance, ['screening', 'machine', 'greeting_ended']);
  assert.deepEqual(replay([['human', 4], ['screening', 3], ['machine', 1]]).guidance, []);
});

test('duplicates remain suppressed after state is saved and restored', () => {
  for (const event of ['machine', 'greeting_ended', 'screening_prompt_ended', 'screening', 'greeting_timeout', 'human'] as const) {
    const original = replay([[event, 1]]);
    const restored = JSON.parse(JSON.stringify(original.state)) as MachineState;
    assert.deepEqual(replay([[event, 1]], restored).guidance, [], event);
  }
});

test('a no-beep timeout after a confirmed beep cannot undo voicemail', () => {
  const result = replay([['greeting_ended', 1], ['greeting_timeout', 2], ['machine', 3]]);
  assert.deepEqual(result.guidance, ['greeting_ended']);
  assert.equal(result.state.phase, 'voicemail');
});
