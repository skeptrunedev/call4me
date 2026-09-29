import { Hono } from 'hono';
import { bearerAccount } from '../lib/auth';
import { origin, type AppEnv } from '../lib/context';
import { openApiDocument } from '../lib/openapi';
import { recordingInput, recordingPath } from '../lib/recording-schema';
import { CallError } from '../services/calls';
import { getCallRecordings } from '../services/recordings';

export const recordings = new Hono<AppEnv>();

recordings.get('/api/openapi.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(openApiDocument(origin(c)));
});

recordings.get(recordingPath.replace('{call_id}', ':call_id'), async (c) => {
  c.header('cache-control', 'private, no-store');
  const account = await bearerAccount(c);
  if (!account) {
    c.header('www-authenticate', `Bearer resource_metadata="${origin(c)}/.well-known/oauth-protected-resource"`);
    return c.json({ error: 'sign in with a callbay API key or OAuth access token' }, 401);
  }
  const input = recordingInput.safeParse({ call_id: c.req.param('call_id') });
  if (!input.success) return c.json({ error: 'invalid call id' }, 400);
  try {
    return c.json(await getCallRecordings(c.env, account.id, input.data.call_id));
  } catch (err) {
    if (err instanceof CallError) return c.json({ error: err.message }, err.status === 404 ? 404 : 409);
    console.error('recording lookup failed', err instanceof Error ? err.name : 'unknown error');
    return c.json({ error: 'recordings could not be retrieved; try again later' }, 502);
  }
});
