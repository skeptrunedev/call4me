import type { FC } from 'hono/jsx';
import { dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { MonthlyBox } from './account';
import { CopyBlock, Layout } from './layout';

/** No sign-in needed: signed out, Stripe asks for an email and the credits wait on that email's account. */
export const BuyForm: FC<{ signedIn: boolean; error?: string; amount?: string }> = ({ signedIn, error, amount = String(MIN_TOPUP_CENTS / 100) }) => (
  <form method="post" action="/buy" class="buy" id="buy">
    {error && <p class="err">{error}</p>}
    <label for="amount">amount in dollars (min ${MIN_TOPUP_CENTS / 100})</label>
    <input type="text" id="amount" name="amount" class="amount" inputmode="decimal" required value={amount} /> <button type="submit">pay with card</button>
    <MonthlyBox />
    {!signedIn && <p class="small">no account needed first. after paying, sign in with google or x using the email you paid with and the credits are yours.</p>}
  </form>
);

export const HomePage: FC<{ origin: string; pricePerMinuteCents: number; signedIn: boolean; installPrompt: string; error?: string; amount?: string }> = (p) => (
  <Layout page="home" signedIn={p.signedIn}>
    <p>
      your coding agent (claude code, codex, claude desktop, chatgpt) gets one new tool: <b>make a phone call</b>. it calls the restaurant, the doctor's office,
      the airline, the hotel, sounds like a normal person, gets it done, and tells your agent what happened.
    </p>
    <div class="cols">
      <div>
        <h3>how it works</h3>
        <ol class="steps">
          <li>
            load credits (<span class="price">from {dollars(MIN_TOPUP_CENTS)}</span>, reloads monthly unless you untick it). calls cost <span class="price">{dollars(p.pricePerMinuteCents)}/min</span> of talk time, held up front and settled when the call ends.
          </li>
          <li>you get a key and one prompt. paste the prompt into your agent. it installs callbay itself.</li>
          <li>
            ask for things like normal. <span class="sample">"book me a table for 4 at nopa tomorrow around 7."</span>
          </li>
        </ol>
        <h3>add credits</h3>
        <BuyForm signedIn={p.signedIn} error={p.error} amount={p.amount} />
        <p class="small">top up anytime from <a href="/account">my account</a> or ask your agent (callbay_add_funds).</p>
      </div>
      <div>
        <h3>what it's good at</h3>
        <ul>
          <li>dinner reservations, including "anything between 6:30 and 8"</li>
          <li>doctor, dentist, vet, and salon appointments</li>
          <li>asking a dealership about a car, price, or service slot</li>
          <li>home internet: new service, outages and credits, lowering the bill, moving, cancelling</li>
          <li>flight rebooking after a cancellation or delay, date changes, refunds</li>
          <li>store hours, stock checks, quotes, "do you do X"</li>
          <li>sitting through phone menus and hold music</li>
        </ul>
        <h3>how it sounds</h3>
        <ul>
          <li>short, casual turns. no "certainly!", no support-bot voice.</li>
          <li>no recap at the end. it says "perfect, thanks!" and hangs up. your agent gets the recap.</li>
          <li>asks your agent mid-call when the business needs something it wasn't given.</li>
          <li>
            it doesn't announce itself. if someone sincerely asks whether it's an AI, it says yes and carries on. see <a href="/rules">rules</a>.
          </li>
        </ul>
      </div>
    </div>
    <h3>the prompt</h3>
    <p class="small">this is what you paste into your agent after paying (your key goes where the placeholder is).</p>
    <CopyBlock id="install-prompt" text={p.installPrompt} rows={12} />
  </Layout>
);

export const WelcomePage: FC<{ apiKey: string | null; installPrompt: string; balanceCents: number; email: string; pending?: boolean; signedOut?: boolean; next?: string }> = (p) => (
  <Layout title="you're in" page="welcome" signedIn={!p.signedOut && !p.pending}>
    {p.pending ? (
      <>
        <h1>waiting for the payment to clear</h1>
        <p>refresh this page in a few seconds.</p>
      </>
    ) : p.signedOut ? (
      <>
        <h1>
          paid. <span class="price">{dollars(p.balanceCents)}</span> in credits for {p.email}
        </h1>
        <p>sign in to use them. with google, use {p.email} and they're already there. signing in any other way (x, or another email) brings you back here and moves them to that account.</p>
        <p>
          <a href={`/login?next=${encodeURIComponent(p.next ?? '/account')}`}>sign in with google or x</a>
        </p>
      </>
    ) : (
      <>
        <h1>
          paid. balance: <span class="price">{dollars(p.balanceCents)}</span>
        </h1>
        {p.apiKey ? (
          <>
            <p>
              your key (shown once, keep it somewhere safe): <span class="key">{p.apiKey}</span>
            </p>
            <p>copy this prompt into claude code, codex, claude desktop, or chatgpt. it installs callbay and tells your agent how to use it.</p>
            <CopyBlock id="install-prompt" text={p.installPrompt} rows={16} />
          </>
        ) : (
          <p>
            credits added. your existing key and connected agents keep working. need a new key? <a href="/account">my account</a>.
          </p>
        )}
        <p>
          <a href="/account">my account</a> shows your balance and every call with its transcript.
        </p>
      </>
    )}
  </Layout>
);

export const MessagePage: FC<{ title: string; message: string; signedIn?: boolean; status?: number }> = ({ title, message, signedIn }) => (
  <Layout title={title} signedIn={signedIn}>
    <h1>{title}</h1>
    <p>{message}</p>
    <p>
      <a href="/">back to callbay</a>
    </p>
  </Layout>
);

export const UnsubscribePage: FC<{ accountId: string; sig: string }> = ({ accountId, sig }) => (
  <Layout title="unsubscribe">
    <h1>unsubscribe</h1>
    <p>stop getting emails from nick about callbay? your account and credits stay as they are.</p>
    <form method="post" action="/unsubscribe" class="inline">
      <input type="hidden" name="a" value={accountId} />
      <input type="hidden" name="s" value={sig} />
      <button type="submit">unsubscribe</button>
    </form>
  </Layout>
);

export const RulesPage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="rules" page="rules" signedIn={signedIn}>
    <h1>rules</h1>
    <p>callbay places calls a person would make themselves: bookings, appointments, questions for a business. it is not for anything else.</p>
    <ul>
      <li>US and Canadian numbers only. no emergency numbers, no premium-rate numbers.</li>
      <li>no telemarketing, sales, surveys, debt collection, political calls, or calls to people who didn't expect to hear from you.</li>
      <li>no harassment, threats, pranks, or pretending to be someone else. the caller always calls <i>for</i> you; it never claims to be you.</li>
      <li>the same number can be called a few times a day, not more. anyone who asks not to be called again is never called by callbay again.</li>
      <li>the caller does not open by announcing it's an AI, the same way you don't open a call by explaining who you are. if someone sincerely asks, it tells the truth.</li>
      <li>calls are not recorded. a text transcript is kept on your account so your agent can tell you what happened.</li>
      <li>the caller never reads out card numbers, bank details, or passwords.</li>
    </ul>
    <p>break these and the account is closed without a refund of the remaining balance.</p>
  </Layout>
);

export const PrivacyPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="privacy" page="privacy" signedIn={signedIn}>
    <h1>privacy</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    <ul>
      <li>we store your email, your balance history, and for each call: the number, the brief your agent sent, the outcome, and a text transcript.</li>
      <li>if you save a calling profile (name, date of birth, phone, address, insurance, car), we store it so your agent doesn't have to ask before every call. the caller only shares it with the place it's calling, and only when asked. your agent can remove any of it with callbay_save_profile.</li>
      <li>we don't record call audio. audio passes through our phone carrier (Telnyx) and speech model provider (OpenAI) while the call is live.</li>
      <li>payments are handled by Stripe; we never see your card.</li>
      <li>email us to delete your account and its call history.</li>
    </ul>
  </Layout>
);

export const TermsPage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="terms" page="terms" signedIn={signedIn}>
    <h1>terms</h1>
    <ul>
      <li>credits are prepaid and don't expire. a call holds its maximum cost from your balance before it dials and settles when it ends: talk time from pickup, rounded up to the minute. the rest of the hold comes back.</li>
      <li>by default, what you load reloads every month: the same amount is charged to your card and added as credits. stop it anytime from your account or your agent (callbay_stop_reload); credits already loaded stay.</li>
      <li>unanswered, busy, and failed calls are free.</li>
      <li>you're responsible for the calls you ask for and must follow the <a href="/rules">rules</a>.</li>
      <li>the service is provided as is. a call can fail, get something wrong, or end without a result; check anything important.</li>
    </ul>
  </Layout>
);
