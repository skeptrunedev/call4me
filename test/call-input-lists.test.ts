import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { placeCallInput, scheduleCallInput, x402CallInput } from '../src/server/lib/call-schema';

// An agent on the REST API sent facts and details.questions as arrays of lines (Nov 25, 2026) and
// each of those calls was refused: "expected string, received array".
const call = {
  to: '+14155550123',
  business: 'Example Insurance',
  goal: 'Ask whether policy renewals can be paid by phone.',
  category: 'general',
  facts: ['the policy is under the client\'s business name', 'renewal is due next month'],
  details: { questions: ['can renewals be paid by phone?', 'is there a fee?'] },
};

test('the REST API and general server take facts and details as lists, joined one item per line', () => {
  for (const schema of [placeCallInput('agents'), scheduleCallInput('agents').omit({ call_at: true }), x402CallInput]) {
    const parsed = schema.safeParse(call);
    assert.ok(parsed.success, parsed.success ? '' : z.prettifyError(parsed.error));
    assert.equal(parsed.data.facts, 'the policy is under the client\'s business name\nrenewal is due next month');
    assert.deepEqual(parsed.data.details, { questions: 'can renewals be paid by phone?\nis there a fee?' });
  }
  const plain = placeCallInput('agents').parse({ ...call, facts: 'one fact', details: { questions: 'one question' } });
  assert.equal(plain.facts, 'one fact');
  assert.deepEqual(plain.details, { questions: 'one question' });
});

test('a list still counts against the field\'s length limit, and anything but strings is refused', () => {
  const long = placeCallInput('agents').safeParse({ ...call, facts: Array(40).fill('x'.repeat(99)) });
  assert.ok(!long.success);
  assert.match(z.prettifyError(long.error), /<=3000 characters[\s\S]*at facts/);
  assert.ok(!placeCallInput('agents').safeParse({ ...call, facts: [1, 2] }).success);
});

test('the general server advertises the list; the directory servers keep the plain string they were reviewed with', () => {
  const props = (schema: z.ZodType) => (z.toJSONSchema(schema, { io: 'input' }) as { properties: Record<string, Record<string, unknown>> }).properties;
  const agents = props(placeCallInput('agents'));
  assert.deepEqual(agents.facts.anyOf, [{ type: 'string', maxLength: 3000 }, { type: 'array', items: { type: 'string' } }]);
  assert.match(String(agents.facts.description), /one per line or as a list/);
  for (const surface of ['chatgpt', 'claude'] as const) {
    const p = props(placeCallInput(surface));
    assert.equal(p.facts.type, 'string');
    assert.doesNotMatch(String(p.facts.description), /list/);
    assert.deepEqual(p.details.additionalProperties, { type: 'string', maxLength: 1000 });
    assert.ok(!placeCallInput(surface).safeParse(call).success);
  }
});
