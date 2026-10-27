import assert from 'node:assert/strict';
import test from 'node:test';
import { messagingRegistrationClient, redactRegistration, runMessagingRegistration, validateRegistration } from '../scripts/messaging-registration.mjs';

const brand = {
  entityType: 'PRIVATE_PROFIT', displayName: 'Test Service', country: 'US', email: 'support@example.com',
  vertical: 'TECHNOLOGY', companyName: 'Test Company LLC', ein: '123456789', phone: '+12025550123',
  street: '100 Test Street', city: 'Test City', state: 'CA', postalCode: '90210', website: 'https://example.com',
};
const campaign = {
  brandId: 'brand', description: 'Service notifications', usecase: 'ACCOUNT_NOTIFICATION', referenceId: 'notifications-v1',
  messageFlow: 'Customers separately select an optional SMS consent checkbox on the settings page at https://example.com/sms.',
  sample1: 'Test Service: Your call needs attention. Reply STOP to opt out.',
  sample2: 'Test Service: Your renewal payment failed. Reply STOP to opt out.',
  sample3: 'Test Service: Your number will be released unless renewed. Reply STOP to opt out.',
  subscriberOptin: true, subscriberOptout: true, subscriberHelp: true, termsAndConditions: true,
  optinKeywords: 'START', optinMessage: 'Test Service: Message frequency varies. Msg and data rates apply. HELP for help, STOP to opt out.',
  optoutKeywords: 'STOP', optoutMessage: 'Test Service: You are unsubscribed. No further messages will be sent.',
  helpKeywords: 'HELP', helpMessage: 'Test Service: Contact support@example.com.',
  privacyPolicyLink: 'https://example.com/privacy', termsAndConditionsLink: 'https://example.com/terms',
  embeddedLink: false, embeddedPhone: false, ageGated: false, directLending: false, numberPool: false, autoRenewal: true,
};

function api(responses: unknown[]) {
  const requests: { path: string; method: string; body: unknown }[] = [];
  const client = messagingRegistrationClient('test-key', async (url: string, init: RequestInit) => {
    const parsed = new URL(url);
    requests.push({ path: parsed.pathname + parsed.search, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined });
    assert.ok(responses.length, 'unexpected provider request');
    return Response.json(responses.shift());
  });
  return { client, requests };
}

test('all creates default to local dry runs without requiring credentials or revealing EIN', async () => {
  const client = messagingRegistrationClient(undefined, () => { throw new Error('unexpected network request'); });
  for (const [kind, payload] of [['brand', brand], ['campaign', campaign], ['profile', { name: 'Test', whitelisted_destinations: ['US'] }]] as const) {
    const result = await client.create(kind, payload);
    assert.equal(result.dryRun, true);
    assert.equal(result.method, 'POST');
    assert.ok(!JSON.stringify(result).includes(brand.ein));
  }
});

test('brand submit checks detailed identifiers and refuses a duplicate legal entity under a different product', async () => {
  const { client, requests } = api([
    { records: [{ brandId: 'existing', displayName: 'Another Product' }], totalRecords: 1 },
    { ...brand, brandId: 'existing', displayName: 'Another Product' },
  ]);
  await assert.rejects(client.create('brand', brand, true), /Existing brand.*existing/);
  assert.deepEqual(requests.map(item => item.method), ['GET', 'GET']);
});

test('brand duplicate scan checks subsequent pages before allowing a paid registration', async () => {
  const records = Array.from({ length: 500 }, (_, index) => ({ brandId: `brand${index}`, companyName: `Other ${index}`, ein: `other${index}`, displayName: `Other ${index}` }));
  const { client, requests } = api([
    { records, totalRecords: 501 },
    { records: [{ ...brand, brandId: 'last-page' }], totalRecords: 501 },
  ]);
  await assert.rejects(client.create('brand', brand, true), /last-page/);
  assert.match(requests[1].path, /page=2/);
  assert.ok(requests.every(item => item.method === 'GET'));
});

test('brand submit sends the exact supplied business details after checking inventory', async () => {
  const { client, requests } = api([{ records: [], totalRecords: 0 }, { ...brand, brandId: 'created', identityStatus: 'PENDING' }]);
  const result = await client.create('brand', brand, true);
  assert.equal(result.brandId, 'created');
  assert.deepEqual(requests.map(item => item.method), ['GET', 'POST']);
  assert.deepEqual(requests[1].body, brand);
  assert.equal(result.identityStatus, 'PENDING');
});

test('campaign submission refuses missing or false consent and missing live evidence fields without a network call', async () => {
  const { client, requests } = api([]);
  for (const field of ['subscriberOptin', 'subscriberOptout', 'subscriberHelp', 'termsAndConditions']) {
    await assert.rejects(client.create('campaign', { ...campaign, [field]: false }, true), new RegExp(field));
  }
  await assert.rejects(client.create('campaign', { ...campaign, messageFlow: '' }, true), /messageFlow/);
  await assert.rejects(client.create('campaign', { ...campaign, privacyPolicyLink: 'not a URL' }, true), /privacyPolicyLink/);
  assert.equal(requests.length, 0);
});

test('campaign reference prevents a duplicate submission', async () => {
  const { client, requests } = api([{ records: [{ ...campaign, campaignId: 'existing' }], totalRecords: 1 }]);
  await assert.rejects(client.create('campaign', campaign, true), /Existing campaign/);
  assert.equal(requests.length, 1);
  assert.match(requests[0].path, /brandId=brand/);
});

test('profile submission requires explicit destinations and checks existing names', async () => {
  assert.throws(() => validateRegistration('profile', { name: 'Notifications' }), /whitelisted_destinations/);
  const { client, requests } = api([{ data: [{ id: 'existing', name: 'Notifications' }], meta: { total_results: 1 } }]);
  await assert.rejects(client.create('profile', { name: 'Notifications', whitelisted_destinations: ['US'] }, true), /Existing profile.*existing/);
  assert.equal(requests.length, 1);
});

test('status inventories every brand campaign and profiles with tax identifiers redacted', async () => {
  const requests: string[] = [];
  const fetchApi = async (url: string) => {
    const path = new URL(url).pathname;
    requests.push(path);
    if (path === '/v2/10dlc/brand') return Response.json({ records: [{ ...brand, brandId: 'brand' }], totalRecords: 1 });
    if (path === '/v2/messaging_profiles') return Response.json({ data: [{ id: 'profile' }], meta: { total_results: 1 } });
    if (path === '/v2/10dlc/campaign') return Response.json({ records: [{ ...campaign, campaignId: 'campaign' }], totalRecords: 1 });
    throw new Error('Unexpected request');
  };
  const result = await runMessagingRegistration(['status'], 'test-key', fetchApi);
  assert.equal(result.brands[0].ein, '[redacted]');
  assert.equal(result.campaigns[0].campaignId, 'campaign');
  assert.equal(result.profiles[0].id, 'profile');
  assert.equal(requests.length, 3);
});

test('carrier rejection keeps structured explanations and validation details without retrying', async () => {
  let count = 0;
  const client = messagingRegistrationClient('test-key', async () => {
    count++;
    return Response.json({ detail: [{ loc: ['body', 'companyName'], msg: 'Legal name does not match IRS record', type: 'value_error' }] }, { status: 422 });
  });
  await assert.rejects(client.brands(), /HTTP 422.*companyName.*Legal name does not match IRS record/);
  assert.equal(count, 1);
});

test('unknown submission outcome requires inspection instead of retrying a paid POST', async () => {
  let count = 0;
  const client = messagingRegistrationClient('test-key', async () => {
    count++;
    if (count === 1) return Response.json({ records: [], totalRecords: 0 });
    throw new Error('connection lost');
  });
  await assert.rejects(client.create('brand', brand, true), /outcome is unknown; inspect status/);
  assert.equal(count, 2);
});

test('missing inventory records fail closed and CLI rejects misplaced mutation flags', async () => {
  const { client, requests } = api([{ unexpected: [] }]);
  await assert.rejects(client.create('brand', brand, true), /refusing incomplete inventory/);
  assert.equal(requests.length, 1);
  await assert.rejects(runMessagingRegistration(['status', '--submit']), /usage:/);
});

test('tax identifier redaction preserves status explanations and does not mutate source records', () => {
  const source = { ...brand, nested: { universalEin: 'US123456789' }, failureReasons: 'Please verify legal company name' };
  const result = redactRegistration(source);
  assert.equal(result.ein, '[redacted]');
  assert.equal(result.nested.universalEin, '[redacted]');
  assert.equal(result.failureReasons, source.failureReasons);
  assert.equal(source.ein, '123456789');
});

test('brand feedback and vetting diagnostics only read the documented endpoints', async () => {
  const requests: { url: string; method: string }[] = [];
  const fetchApi = async (url: string, init: RequestInit) => {
    requests.push({ url, method: init.method! });
    return Response.json({ brandId: 'brand/id', category: [{ id: 'TAX_ID', description: 'Name mismatch', fields: ['ein', 'companyName'] }] });
  };
  const feedback = await runMessagingRegistration(['brand', 'feedback', 'brand/id'], 'test-key', fetchApi);
  assert.equal(feedback.category[0].description, 'Name mismatch');
  await runMessagingRegistration(['brand', 'vettings', 'brand/id'], 'test-key', fetchApi);
  assert.deepEqual(requests, [
    { url: 'https://api.telnyx.com/v2/10dlc/brand/feedback/brand%2Fid', method: 'GET' },
    { url: 'https://api.telnyx.com/v2/10dlc/brand/brand%2Fid/externalVetting', method: 'GET' },
  ]);
  await assert.rejects(runMessagingRegistration(['brand', 'feedback', 'brand', '--submit']), /usage:/);
});

test('campaign fees use qualification instead of the unavailable standalone cost route', async () => {
  await assert.rejects(runMessagingRegistration(['campaign', 'fee', 'ACCOUNT_NOTIFICATION']), /Use campaign qualify/);
  let requestUrl = '';
  const result = await runMessagingRegistration(['campaign', 'qualify', 'brand', 'ACCOUNT_NOTIFICATION'], 'test-key', async (url: string) => {
    requestUrl = url;
    return Response.json({ monthlyFee: 10, quarterlyFee: 30, annualFee: 120, mnoMetadata: { test: { qualify: false } } });
  });
  assert.equal(requestUrl, 'https://api.telnyx.com/v2/10dlc/campaignBuilder/brand/brand/usecase/ACCOUNT_NOTIFICATION');
  assert.equal(result.monthlyFee, 10);
  assert.equal(result.mnoMetadata.test.qualify, false);
});
