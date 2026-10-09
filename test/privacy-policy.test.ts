import assert from 'node:assert/strict';
import test from 'node:test';
import { PrivacyPage } from '../src/server/views/public';

const page = () => String(PrivacyPage({ signedIn: false, agentPrompt: 'Review my saved calling details.' }));

test('public privacy policy covers the five required disclosure areas and ChatGPT data boundaries', () => {
  const html = page();
  for (const heading of [
    'What we collect and why', 'Data used by the ChatGPT plugin', 'Who receives information',
    'Analytics, advertising measurement, and cookies', 'How long information is kept', 'Your choices and deletion requests',
  ]) assert.ok(html.includes(heading), heading);
  assert.match(html, /not your entire ChatGPT conversation/);
  assert.match(html, /excludes medical and dental appointment categories/);
  assert.match(html, /mailto:me@call4\.me/);
  assert.match(html, /href="\/login\?next=\/account"/);
});

test('privacy policy discloses operational recipients as well as analytics and ad measurement', () => {
  const html = page();
  for (const provider of ['Cloudflare', 'Telnyx', 'OpenAI', 'Raindrop', 'Stripe', 'Fastmail', 'Google', 'Ahrefs', 'Meta', 'Reddit']) {
    assert.ok(html.includes(provider), provider);
  }
  assert.match(html, /pseudonymous, not anonymous/);
  assert.match(html, /not a guarantee that every personal detail is removed/);
});

test('retention disclosure distinguishes stored records, provider retention, and access or cookie expiry', () => {
  const html = page();
  assert.match(html, /no automatic age-based deletion/);
  assert.match(html, /does not delete that copy/);
  assert.match(html, /Unsubscribing stops the relevant emails but keeps the subscription record/);
  assert.match(html, /400 days/);
  assert.match(html, /seven days/);
  assert.match(html, /ten years/);
  assert.match(html, /up to 365 days/);
  assert.match(html, /up to 90 days/);
  assert.match(html, /up to ten minutes/);
  assert.match(html, /support\.telnyx\.com\/en\/articles\/5377454-call-recording/);
  assert.match(html, /not deletion of the underlying audio/);
  assert.match(html, /do not promise immediate erasure/);
});

test('privacy controls do not invent a complete analytics opt-out or imply disconnect deletes data', () => {
  const html = page();
  assert.match(html, /do not by themselves stop account-linked events sent from our servers/);
  assert.match(html, /no in-product account-wide analytics switch/);
  assert.match(html, /Disconnecting, signing out, and deleting an account are different actions/);
  assert.match(html, /handled by support, not by a plugin tool/);
});
