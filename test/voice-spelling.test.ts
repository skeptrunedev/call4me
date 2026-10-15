import assert from 'node:assert/strict';
import test from 'node:test';
import { callInstructions, spokenEmail, type CallBrief } from '../src/server/voice/prompt';

const brief: CallBrief = { onBehalfOf: 'Alex', owner: 'Alex', assistantName: null, callingAs: null, business: 'Nopa', goal: 'Book a table.', facts: '', flexibility: '', callbackNumber: '+14155550100', callbackRingsOwner: false, localTime: null, connectWhen: null, voice: 'marin' };

test('an email address is spelled letter by letter, with "at" and "dot" between the parts', () => {
  assert.equal(spokenEmail('Bhairav@CharacterQuilt.com'), 'B-H-A-I-R-A-V, at, C-H-A-R-A-C-T-E-R-Q-U-I-L-T, dot, com');
  assert.equal(spokenEmail('dinners@agents.characterquilt.com'), 'D-I-N-N-E-R-S, at, A-G-E-N-T-S, dot, C-H-A-R-A-C-T-E-R-Q-U-I-L-T, dot, com');
  assert.equal(spokenEmail('claudia@rebelfund.vc'), 'C-L-A-U-D-I-A, at, R-E-B-E-L-F-U-N-D, dot, V-C');
});

test('common mail domains are said as words, and separators in the name are spoken', () => {
  assert.equal(spokenEmail('jared.heyman@gmail.com'), 'J-A-R-E-D, dot, H-E-Y-M-A-N, at, gmail dot com');
  assert.equal(spokenEmail('a_b-c@icloud.com'), 'A, underscore, B, dash, C, at, icloud dot com');
});

test('every email in the task or facts comes pre-spelled, and a call without one gets no spelling rule', () => {
  const prompt = callInstructions({ ...brief, goal: 'Ask them to email the quote to bhairav@characterquilt.com.', facts: 'cc: dinners@agents.characterquilt.com\nalso bhairav@characterquilt.com' });
  assert.match(prompt, /- bhairav@characterquilt\.com: B-H-A-I-R-A-V, at, C-H-A-R-A-C-T-E-R-Q-U-I-L-T, dot, com\n/);
  assert.match(prompt, /- dinners@agents\.characterquilt\.com: D-I-N-N-E-R-S, at, A-G-E-N-T-S/);
  assert.equal(prompt.match(/- bhairav@characterquilt\.com:/g)?.length, 1);
  assert.doesNotMatch(callInstructions(brief), /When you spell an email address/);
});
