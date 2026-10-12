import type { FC } from 'hono/jsx';
import { Layout } from './layout';
import type { OwnNumberView } from '../services/numbers';
import { SMS_CONSENT_TEXT, type SmsConsent } from '../services/sms-consent';

export const SmsPage: FC<{
  signedIn: boolean;
  ownNumbers: OwnNumberView[];
  consent: SmsConsent | null;
  error?: string;
  saved?: boolean;
}> = ({ signedIn, ownNumbers, consent, error, saved }) => {
  const choices = ownNumbers.filter(n => n.status === 'verified' && n.country === 'US');
  return (
    <Layout title="text alerts" page="sms" signedIn={signedIn}>
      <h1>text alerts</h1>
      <p>call4me alerts, operated by Skeptrune LLC, lets you know when a call needs your input or a purchased phone number needs credits to renew.</p>
      <p>SMS alerts are coming soon. You can save your preference now. No alert texts are being sent yet.</p>
      {error && <p class="err" role="alert">{error}</p>}
      {saved && <p role="status">Your preference has been saved.</p>}
      {consent?.active && (
        <div class="box">
          <p>You have signed up for alerts at {consent.phone_number}. Texts will begin when the service is available.</p>
          <form method="post" action="/sms/stop">
            <button type="submit">turn off text alerts</button>
          </form>
        </div>
      )}
      {!signedIn && <p><a href="/login?next=/sms">Sign in</a> to choose a verified personal number and save your preference.</p>}
      {signedIn && choices.length === 0 && <p><a href="/account">Verify your US personal number in your account</a>, then return here to sign up. Verifying a number for calls does not sign you up for texts.</p>}
      <form method="post" action="/sms" class="buy">
        <label for="sms-number">your verified US personal number</label>
        <select id="sms-number" name="phone_number" required disabled={!signedIn || choices.length === 0}>
          <option value="">choose a number</option>
          {choices.map(n => <option value={n.e164}>{n.number}</option>)}
        </select>
        <label class="check" for="sms-consent">
          <input id="sms-consent" type="checkbox" name="consent" required />{' '}{SMS_CONSENT_TEXT}
        </label>
        <p class="small">Read the <a href="/terms#sms">SMS terms</a> and <a href="/privacy#sms">privacy policy</a>. Text alerts are optional. You can use call4me without signing up.</p>
        <button type="submit" disabled={!signedIn || choices.length === 0}>save text alert preference</button>
      </form>
      <p class="small">Need help? Email <a href="mailto:me@call4.me">me@call4.me</a>. Once texting is available, reply HELP for help or STOP to unsubscribe. You can also turn off alerts on this page.</p>
    </Layout>
  );
};
