import assert from 'node:assert/strict';
import test from 'node:test';
import { requirementsClient } from '../scripts/requirements.mjs';

const group = (fieldType = 'document', value = 'old') => ({
  id: 'group', status: 'unapproved',
  regulatory_requirements: [{ requirement_id: 'requirement', field_type: fieldType, field_value: value }],
});

function api(responses: unknown[]) {
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = requirementsClient('test-key', async (url: string, init: RequestInit) => {
    requests.push({ path: new URL(url).pathname, method: init.method!, body: init.body ? JSON.parse(init.body as string) : undefined });
    assert.ok(responses.length, 'unexpected API call');
    return Response.json({ data: responses.shift() });
  });
  return { client, requests };
}

test('document upload refuses a requirement outside the group before reading or uploading a file', async () => {
  const { client, requests } = api([group()]);
  await assert.rejects(client.replaceDocument('group', 'another', '/does/not/exist.pdf'), /does not belong/);
  assert.deepEqual(requests.map(item => item.method), ['GET']);
});

test('document upload refuses a textual field before reading or uploading a file', async () => {
  const { client, requests } = api([group('textual')]);
  await assert.rejects(client.replaceDocument('group', 'requirement', '/does/not/exist.pdf'), /expected document/);
  assert.deepEqual(requests.map(item => item.method), ['GET']);
});

test('setting text refuses a document field without patching', async () => {
  const { client, requests } = api([group()]);
  await assert.rejects(client.setText('group', 'requirement', 'new'), /expected textual/);
  assert.equal(requests.length, 1);
});

test('text changes patch only the requested field and reject a readback mismatch without retrying', async () => {
  const { client, requests } = api([group('textual'), group('textual', 'new'), group('textual')]);
  await assert.rejects(client.setText('group', 'requirement', 'new'), /Readback mismatch/);
  assert.deepEqual(requests.map(item => item.method), ['GET', 'PATCH', 'GET']);
  assert.deepEqual(requests[1].body, { regulatory_requirements: [{ requirement_id: 'requirement', field_value: 'new' }] });
});

test('submit verifies pending status and refuses a second submission', async () => {
  const pending = { ...group(), status: 'pending-approval' };
  const { client, requests } = api([group(), pending, pending, pending]);
  assert.equal((await client.submit('group')).status, 'pending-approval');
  await assert.rejects(client.submit('group'), /already pending-approval/);
  assert.deepEqual(requests.map(item => item.method), ['GET', 'POST', 'GET', 'GET']);
});

test('submit rejects a successful HTTP response with an unsubmitted readback', async () => {
  const { client, requests } = api([group(), group(), group()]);
  await assert.rejects(client.submit('group'), /Submission readback/);
  assert.deepEqual(requests.map(item => item.method), ['GET', 'POST', 'GET']);
});

test('Telnyx errors include the carrier explanation and are not retried', async () => {
  let count = 0;
  const client = requirementsClient('test-key', async () => {
    count++;
    return Response.json({ errors: [{ code: '10009', title: 'Authentication failed', detail: 'Invalid credentials' }] }, { status: 401 });
  });
  await assert.rejects(client.list(), /HTTP 401, 10009: Authentication failed: Invalid credentials/);
  assert.equal(count, 1);
});

const phoneOrder = (value = 'old') => ({ ...group('document', value), id: 'phone-order', status: 'pending' });
const document = { id: 'document', content_type: 'application/pdf', av_scan_status: 'scanned', status: 'pending' };

test('attaching an existing document patches only its order requirement without uploading it again', async () => {
  const { client, requests } = api([phoneOrder(), document, phoneOrder('document'), phoneOrder('document')]);
  assert.equal((await client.attachOrderDocument('phone-order', 'requirement', 'document')).id, 'phone-order');
  assert.deepEqual(requests.map(item => [item.method, item.path]), [
    ['GET', '/v2/number_order_phone_numbers/phone-order'], ['GET', '/v2/documents/document'],
    ['PATCH', '/v2/number_order_phone_numbers/phone-order'], ['GET', '/v2/number_order_phone_numbers/phone-order'],
  ]);
  assert.deepEqual(requests[2].body, { regulatory_requirements: [{ requirement_id: 'requirement', field_value: 'document' }] });
});

test('attaching an order document refuses wrong membership, a finished order, and an unscanned document', async () => {
  const wrong = api([phoneOrder()]);
  await assert.rejects(wrong.client.attachOrderDocument('phone-order', 'another', 'document'), /must belong/);
  assert.equal(wrong.requests.length, 1);
  const finished = api([{ ...phoneOrder(), status: 'success' }]);
  await assert.rejects(finished.client.attachOrderDocument('phone-order', 'requirement', 'document'), /must exist and be pending/);
  assert.equal(finished.requests.length, 1);
  const unscanned = api([phoneOrder(), { ...document, av_scan_status: 'pending' }]);
  await assert.rejects(unscanned.client.attachOrderDocument('phone-order', 'requirement', 'document'), /completed virus scan/);
  assert.equal(unscanned.requests.length, 2);
});

test('attaching an order document rejects readback mismatch without retrying a mutation', async () => {
  const { client, requests } = api([phoneOrder(), document, phoneOrder('document'), phoneOrder()]);
  await assert.rejects(client.attachOrderDocument('phone-order', 'requirement', 'document'), /Readback mismatch/);
  assert.deepEqual(requests.map(item => item.method), ['GET', 'GET', 'PATCH', 'GET']);
});
