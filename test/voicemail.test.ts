import assert from 'node:assert/strict';
import test from 'node:test';
import { MACHINE_GUIDANCE, machineEventOf } from '../src/server/voice/voicemail';

test('a machine answering, its greeting ending, and a call screener each reach the call; people and unsure results do not', () => {
  assert.equal(machineEventOf('call.machine.premium.detection.ended', 'machine'), 'machine');
  for (const result of ['human_residence', 'human_business', 'silence', 'fax_detected', 'not_sure', undefined]) {
    assert.equal(machineEventOf('call.machine.premium.detection.ended', result), null, String(result));
  }
  for (const result of ['beep_detected', 'no_beep_detected', 'prompt_ended']) {
    assert.equal(machineEventOf('call.machine.premium.greeting.ended', result), 'greeting_ended', result);
  }
  assert.equal(machineEventOf('call.machine.premium.greeting.ended', 'not_sure'), null);
  assert.equal(machineEventOf('call.machine.premium.call_screening.detected', 'screening'), 'screening');
  assert.equal(machineEventOf('call.hangup', undefined), null);
});

test('the caller is told to stay silent through a greeting and to leave its message when it ends', () => {
  assert.match(MACHINE_GUIDANCE.machine, /stay completely silent/);
  assert.match(MACHINE_GUIDANCE.machine, /not even hello/);
  assert.match(MACHINE_GUIDANCE.greeting_ended, /Leave your message/);
  assert.match(MACHINE_GUIDANCE.greeting_ended, /callback number/);
  assert.match(MACHINE_GUIDANCE.greeting_ended, /end_call/);
  assert.match(MACHINE_GUIDANCE.screening, /who you are and why you're calling/);
});
