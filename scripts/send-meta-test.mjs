#!/usr/bin/env node
import { createHash } from 'node:crypto';

const pixelId = process.env.META_PIXEL_ID;
const token = process.env.META_CAPI_TOKEN;
const testCode = process.env.META_TEST_EVENT_CODE;
const runId = process.env.GITHUB_RUN_ID || String(Date.now());
if (!pixelId || !token || !/^TEST\d+$/.test(testCode || '')) throw new Error('META_PIXEL_ID, META_CAPI_TOKEN and a valid META_TEST_EVENT_CODE are required');

const eventId = `meta-test-complete-registration:${runId}`;
const externalId = createHash('sha256').update(`meta-test:${runId}`).digest('hex');
const body = {
  data: [
    {
      event_name: 'CompleteRegistration',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: 'https://call4.me/welcome',
      user_data: { external_id: [externalId] },
    },
  ],
  test_event_code: testCode,
};

const response = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await response.text();
console.log(JSON.stringify({ eventId, status: response.status, response: text.slice(0, 1000) }));
if (!response.ok) process.exitCode = 1;
