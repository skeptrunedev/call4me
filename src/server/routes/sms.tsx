import { Hono } from 'hono';
import { field, origin, type AppContext, type AppEnv } from '../lib/context';
import { numbers } from '../services/numbers';
import { smsConsent, SmsConsentError } from '../services/sms-consent';
import { SmsPage } from '../views/sms';

export const sms = new Hono<AppEnv>();

sms.use('/sms', async (c, next) => {
  c.header('cache-control', 'private, no-store');
  await next();
});
sms.use('/sms/*', async (c, next) => {
  c.header('cache-control', 'private, no-store');
  await next();
});

async function page(c: AppContext, error?: string) {
  const account = c.get('account');
  const [ownNumbers, consent] = account
    ? await Promise.all([numbers(c.env).ownViews(account.id), smsConsent(c.env.DB).current(account.id)])
    : [[], null];
  return c.html(<SmsPage signedIn={Boolean(account)} ownNumbers={ownNumbers} consent={consent} error={error} saved={c.req.query('saved') === '1'} />, error ? 400 : 200);
}

// A strict Origin check protects both form actions from cross-site consent changes.
function sameOrigin(c: AppContext): boolean {
  return c.req.header('origin') === origin(c) && c.req.header('sec-fetch-site') !== 'cross-site';
}

sms.get('/sms', (c) => page(c));
sms.post('/sms', async (c) => {
  if (!sameOrigin(c)) return c.text('request origin is not allowed', 403);
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/sms', 303);
  const form = await c.req.formData();
  if (form.get('consent') !== 'on') return page(c, 'check the consent box to sign up for text alerts.');
  try {
    await smsConsent(c.env.DB).subscribe(account.id, field(form, 'phone_number', 40));
    return c.redirect('/sms?saved=1', 303);
  } catch (err) {
    if (err instanceof SmsConsentError) return page(c, err.message);
    throw err;
  }
});
sms.post('/sms/stop', async (c) => {
  if (!sameOrigin(c)) return c.text('request origin is not allowed', 403);
  const account = c.get('account');
  if (!account) return c.redirect('/login?next=/sms', 303);
  await smsConsent(c.env.DB).revoke(account.id);
  return c.redirect('/sms', 303);
});
