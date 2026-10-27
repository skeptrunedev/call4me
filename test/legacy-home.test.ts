import assert from 'node:assert/strict';
import test from 'node:test';
import { pub } from '../src/server/routes/public';

test('the legacy /home URL permanently redirects to the canonical homepage', async () => {
  const response = await pub.request('https://call4.me/home');
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('location'), '/');
});
