import { describe, expect, it } from 'vitest';
import { a2aDispatch, agentCard, categoryInText } from '../src/server/lib/a2a';
import { CATEGORIES } from '../src/server/services/intake';

const SITE = 'https://call4.me';
const send = (parts: unknown[], id: number | string = 1) => a2aDispatch(JSON.stringify({ jsonrpc: '2.0', id, method: 'SendMessage', params: { message: { role: 'ROLE_USER', parts } } }), SITE);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const task = (r: { body: unknown }) => (r.body as any).result.task;

describe('agent card', () => {
  it('is an A2A 1.0 card with a JSON-RPC interface at /a2a', () => {
    const card = agentCard(SITE, '1.0.0');
    expect(card.supportedInterfaces).toEqual([{ url: `${SITE}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }]);
    expect(card.skills.map((s) => s.id)).toEqual(['list-call-types', 'get-requirements']);
  });
});

describe('SendMessage', () => {
  it('lists the kinds of calls for a general question', () => {
    const t = task(send([{ text: 'what can you do?' }]));
    expect(t.status.state).toBe('TASK_STATE_COMPLETED');
    expect(t.artifacts[0].parts[1].data.categories).toHaveLength(CATEGORIES.length);
    expect(t.artifacts[0].parts[0].text).toContain(`${SITE}/mcp`);
  });
  it('returns one category\'s requirements by data part or by name in the text', () => {
    const byData = task(send([{ data: { category: 'restaurant' } }]));
    expect(byData.artifacts[0].parts[1].data.category).toBe('restaurant');
    expect(byData.artifacts[0].parts[1].data.fields.length).toBeGreaterThan(0);
    expect(task(send([{ text: 'what does an auto service call need?' }])).artifacts[0].parts[1].data.category).toBe('auto_service');
  });
  it('fails an unknown category', () => {
    expect(task(send([{ data: { category: 'pizza' } }])).status.state).toBe('TASK_STATE_FAILED');
  });
});

describe('JSON-RPC errors', () => {
  it('rejects bad JSON, bad shapes, missing params, unknown methods, and task lookups', () => {
    expect(a2aDispatch('{', SITE).status).toBe(400);
    expect(a2aDispatch('[]', SITE).status).toBe(400);
    expect(a2aDispatch(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: {} }), SITE).status).toBe(400);
    expect(a2aDispatch(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'Nope' }), SITE).status).toBe(404);
    expect(a2aDispatch(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'GetTask', params: { id: 'x' } }), SITE).status).toBe(404);
  });
});

describe('categoryInText', () => {
  it('matches slugs with underscores or spaces, and nothing else', () => {
    expect(categoryInText('flight_change please')?.slug).toBe('flight_change');
    expect(categoryInText('HOME SERVICE quote')?.slug).toBe('home_service');
    expect(categoryInText('hello')).toBeNull();
  });
});
