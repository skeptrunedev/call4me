import { describe, expect, it } from 'vitest';
import { render, STEPS, unsubscribeUrl, validUnsubscribe } from '../src/server/services/drip';

const welcome = STEPS.find((s) => s.id === 'welcome')!.email({ origin: 'https://call4.me' });

describe('signup drip', () => {
  it('welcomes right after signup, pointing at the site', () => {
    expect(STEPS[0].after).toBe(0);
    expect(welcome.body).toContain('https://call4.me');
    expect(welcome.body + welcome.subject).not.toMatch(/—/);
  });

  it('renders the unsubscribe link as the single word in HTML, and the URL in plain text', () => {
    const url = 'https://call4.me/unsubscribe?a=acct_1&s=abc';
    const out = render(welcome, url);
    expect(out.text.endsWith(`unsubscribe: ${url}`)).toBe(true);
    expect(out.html).toContain(`<a href="${url.replace(/&/g, '&amp;')}" style="color:#888">unsubscribe</a>`);
    expect(out.html).toContain('<a href="https://call4.me">https://call4.me</a>');
    expect(out.html).toContain("doctors' appointments");
    expect(out.html.match(/<p>/g)!.length).toBe(2);
  });

  it('escapes HTML in the body', () => {
    expect(render({ subject: 's', body: 'a <b> & c' }, 'https://x/u').html).toContain('a &lt;b&gt; &amp; c');
  });

  it('signs unsubscribe links per account', async () => {
    const url = await unsubscribeUrl('https://call4.me', 'secret', 'acct_1');
    const sig = new URL(url).searchParams.get('s')!;
    expect(await validUnsubscribe('secret', 'acct_1', sig)).toBe(true);
    expect(await validUnsubscribe('secret', 'acct_2', sig)).toBe(false);
  });
});
