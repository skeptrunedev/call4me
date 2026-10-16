import assert from 'node:assert/strict';
import test from 'node:test';
import { inboundInstructions, type InboundBrief } from '../src/server/voice/prompt';

const alberto: InboundBrief = { owner: 'Alberto Garra', assistantName: 'Alberto', callingAs: null, callbackNumber: '+16504878857', tasks: [], likely: false, recent: [], localTime: null };

test("the owner's line answers as the owner, in the first person", () => {
  const p = inboundInstructions(alberto);
  assert.match(p, /You're Alberto Garra, picking up your own phone/);
  assert.match(p, /"I'm Alberto\."/);
  assert.doesNotMatch(p, /Alberto Garra's assistant|You are never Alberto Garra/);
});

test("without an assistant name the line answers as the owner's assistant, as before", () => {
  assert.match(inboundInstructions({ ...alberto, assistantName: null }), /You're Alberto Garra's assistant, answering the phone for them/);
});

test('a different assistant name answers as that name, never as an assistant', () => {
  const p = inboundInstructions({ ...alberto, assistantName: 'Jordan' });
  assert.match(p, /"I'm Jordan\."/);
  assert.match(p, /Alberto Garra will call back/);
  assert.doesNotMatch(p, /Jordan, Alberto Garra's assistant/);
});

test('asked for a callback number, the line reads out the digits', () => {
  assert.match(inboundInstructions(alberto), /read out the digits: 650-487-8857\. Never just say "this number"\./);
});

test('a company line still answers as the company', () => {
  const p = inboundInstructions({ ...alberto, assistantName: 'Jordan', callingAs: 'Acme', callbackNumber: '+14155550100' });
  assert.match(p, /You're Jordan at Acme/);
  assert.match(p, /You are never Alberto Garra/);
});
