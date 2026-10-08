import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { dollars } from '../services/accounts';
import type { CountryOffer, NumberView } from '../services/numbers';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { MonthlyBox } from './account';
import { accountPath, SITE, SITE_DESCRIPTION } from '../lib/pages';
import { DESTINATION_PRICE_CENTS } from '../lib/rates';
import { CopyBlock, Layout } from './layout';
import { CallOnboarding } from './onboarding';
import type { RedditPixelEvent } from '../lib/reddit';
import { EXAMPLES } from '../../content/examples';

/** Who runs the site and what it is, for search and answer engines (schema.org). */
const HOME_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'call4me', url: SITE, logo: `${SITE}/favicon.svg`, email: 'me@call4.me', founder: { '@type': 'Person', name: 'Nick Khami', url: 'https://x.com/skeptrune' }, sameAs: ['https://x.com/skeptrune'] },
    { '@type': 'WebSite', '@id': `${SITE}/#site`, name: 'call4me', url: SITE, description: SITE_DESCRIPTION, publisher: { '@id': `${SITE}/#org` } },
  ],
};

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

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

/** "the uae at $0.40/min": destinations billed above the standard rate (lib/rates.ts). */
const pricierDestinations = () =>
  Object.entries(DESTINATION_PRICE_CENTS)
    .map(([country, cents]) => `${country === 'AE' ? 'the uae' : (regionName.of(country) ?? country).toLowerCase()} at ${dollars(cents)}/min`)
    .join(', ');

/** Short, everyday calls that show the whole idea in a listen: what you asked, then the call. */
const HOME_EXAMPLES = ['dinner-reservation', 'dentist-reschedule', 'eye-exam-booking', 'wheel-alignment-cost'].map((slug) => {
  const example = EXAMPLES.find((e) => e.slug === slug && e.audio);
  if (!example) throw new Error(`home example ${slug} is missing or has no audio`);
  return example;
});

/** "1 minute 25 seconds" -> "1:25" */
const clock = (duration: string) => {
  const minutes = Number(/(\d+) minutes?/.exec(duration)?.[1] ?? 0);
  const seconds = Number(/(\d+) seconds?/.exec(duration)?.[1] ?? 0);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** One shared audio element behind the little players; tapping the bar seeks. */
const PLAYER_SCRIPT = `(function () {
  var audio = new Audio();
  audio.preload = 'none';
  var current = null;
  var clock = function (t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  var paint = function () {
    if (!current) return;
    var d = audio.duration || 0;
    current.querySelector('.bar span').style.width = (d ? audio.currentTime / d * 100 : 0) + '%';
    current.querySelector('.player-time').textContent = clock(audio.currentTime) + ' / ' + current.dataset.length;
  };
  var state = function (playing) {
    if (!current) return;
    current.classList.toggle('playing', playing);
    current.querySelector('.play').setAttribute('aria-label', (playing ? 'pause: ' : 'play: ') + current.dataset.title);
  };
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('play', function () { state(true); });
  audio.addEventListener('pause', function () { state(false); });
  audio.addEventListener('ended', function () { state(false); });
  document.querySelectorAll('.player').forEach(function (player) {
    var start = function (at) {
      if (current !== player) {
        if (current) { state(false); current.querySelector('.bar span').style.width = '0'; current.querySelector('.player-time').textContent = current.dataset.length; }
        current = player;
        audio.src = player.dataset.src;
      }
      if (at !== undefined) audio.currentTime = at;
      audio.play().catch(function (error) { if (error.name !== 'AbortError') throw error; });
    };
    player.querySelector('.play').addEventListener('click', function () {
      if (current === player && !audio.paused) audio.pause(); else start();
    });
    player.querySelector('.bar').addEventListener('click', function (event) {
      var rect = event.currentTarget.getBoundingClientRect();
      var ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      if (current === player && audio.duration) audio.currentTime = ratio * audio.duration;
      else { start(); audio.addEventListener('loadedmetadata', function once() { audio.removeEventListener('loadedmetadata', once); audio.currentTime = ratio * audio.duration; }); }
    });
  });
})();`;

export const HomePage: FC<{ origin: string; pricePerMinuteCents: number; signedIn: boolean; installPrompt: string; countries: CountryOffer[]; error?: string; amount?: string }> = (p) => {
  return (
  <Layout page="home" signedIn={p.signedIn} meta={{ jsonLd: HOME_LD }}>
    <h1>let your agents make phone calls</h1>
    <section class="players" aria-label="real calls made by call4me">
      {HOME_EXAMPLES.map((e) => (
        <div class="player" data-src={e.audio} data-length={clock(e.duration)} data-title={e.title}>
          <button type="button" class="play" aria-label={`play: ${e.title}`}></button>
          <div class="player-body">
            <div class="player-ask">“{e.request}”</div>
            <div class="bar"><span></span></div>
            <div class="player-meta small"><a href={`/examples#${e.slug}`}>{e.business}</a> <span class="player-time">{clock(e.duration)}</span></div>
          </div>
        </div>
      ))}
    </section>
    <p class="hero-links"><a href="#buy">add credits</a> · <a href="/examples">more real calls</a> · <a href="/mcp">works with claude code, codex and any MCP agent</a></p>
    <script>{raw(PLAYER_SCRIPT)}</script>
    <p class="product-hunt-badge">
      <a href="https://www.producthunt.com/products/call4me?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-call4me" target="_blank" rel="noopener noreferrer">
        <img
          alt="call4me - Give your AI agent one new tool: make a phone call | Product Hunt"
          width="250"
          height="54"
          src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1272895&amp;theme=light&amp;t=1791439678864"
        />
      </a>
    </p>
    <div class="cols">
      <div>
        <h3>how it works</h3>
        <ol class="steps">
          <li>
            load credits (<span class="price">from {dollars(MIN_TOPUP_CENTS)}</span>, reloads monthly unless you untick it). calls cost <span class="price">{dollars(p.pricePerMinuteCents)}/min</span> of talk time, held up front and settled when the call ends.
          </li>
          <li>you get a key and one prompt. paste the prompt into your agent. it installs call4me itself.</li>
          <li>
            ask for things like normal. <span class="sample">"book me a table for 4 at nopa tomorrow around 7."</span>
          </li>
        </ol>
      </div>
      <div>
        <h3>add credits</h3>
        <BuyForm signedIn={p.signedIn} error={p.error} amount={p.amount} />
        <p class="small">top up anytime from <a href={accountPath(p.signedIn)}>my account</a> or ask your agent (call4me_add_funds).</p>
      </div>
    </div>
    <h3>the prompt</h3>
    <p class="small">{p.signedIn ? 'this is what you paste into your agent. your key is already in it.' : 'this is what you paste into your agent. it signs you in; sign in here first and your key comes in the prompt instead.'}</p>
    <CopyBlock id="install-prompt" text={p.installPrompt} rows={12} />
    <h3>what it is</h3>
    <p>
      your personal AI assistant or coding agent gets one new ability: <b>make a phone call</b> through MCP.
      ask it to check cancellation rules, book an appointment or get an answer a website cannot give you.
      call4me calls the business, follows your brief, and brings the result back to the task your agent is already doing.
    </p>
    <p class="small">
      setup and calling guides: <a href="/blog/claude-code-phone-calls">claude code</a>, <a href="/blog/codex-phone-calls">codex</a>,
      {' '}<a href="/blog/meta-muse-ai-agent-phone-calls">muse</a>, <a href="/blog/instinct-ai-phone-calls">instinct</a>,
      {' '}<a href="/blog/t3-code-phone-calls">t3 code</a>.
      {' '}start with a task: <a href="/blog/ai-agent-that-makes-phone-calls">how an AI agent makes calls and gets things done for you</a>.
    </p>
    <section class="customer-stories" aria-labelledby="customer-stories">
      <h3 id="customer-stories">from people using call4me</h3>
      <figure>
        <p><b>$100 flight credit</b></p>
        <blockquote>“literally zero chance i was going to do that myself”</blockquote>
        <figcaption><a href="https://x.com/sheherenow_/status/2105785991839850786">@sheherenow_ on X</a></figcaption>
      </figure>
      <figure>
        <p><b>dinner reservation</b></p>
        <blockquote>“Booked a dinner reservation in one prompt. Only cost me 25 cents.”</blockquote>
        <figcaption><a href="https://x.com/rickmanelius/status/2105825199015030846">@rickmanelius on X</a></figcaption>
      </figure>
      <figure>
        <p><b>dental appointments that day</b></p>
        <blockquote>“Just got my mind blown by the call quality”</blockquote>
        <figcaption><a href="https://x.com/araa3185/status/2105740108926513203">@araa3185 on X</a></figcaption>
      </figure>
      <figure>
        <p><b>found shoes at Men's Wearhouse</b></p>
        <blockquote>“this thing saved so much time.”</blockquote>
        <figcaption><a href="https://x.com/JoeFinberg/status/2105727961882398781">@JoeFinberg on X</a></figcaption>
      </figure>
    </section>
    <Faq signedIn={p.signedIn} pricePerMinuteCents={p.pricePerMinuteCents} countries={p.countries} />
  </Layout>
  );
};

/** The faq on the home page and the rules page. */
const Faq: FC<{ signedIn: boolean; pricePerMinuteCents: number; countries: CountryOffer[] }> = ({ signedIn, pricePerMinuteCents, countries }) => {
  const live = countries.filter((c) => c.available);
  const extra = pricierDestinations();
  return (
  <>
    <h3 id="faq">faq</h3>
    <div class="faq">
      <details>
        <summary>which countries can it call?</summary>
        <p>
          the us, canada, the eu, the uk, iceland, liechtenstein, norway, switzerland, the uae, and japan work with your free us number.
          other supported destinations may need a local call4me number. check availability in <a href={accountPath(signedIn)}>my account</a>
          {live.length > 0 ? <> (numbers available in {live.length} countries)</> : null}.
        </p>
      </details>
      <details>
        <summary>what does it cost?</summary>
        <p>
          from {dollars(pricePerMinuteCents)} per minute from pickup, rounded up to the minute. prepaid credits start at {dollars(MIN_TOPUP_CENTS)}.
          each call reserves its maximum cost and returns unused credit when it ends. unanswered, busy, and failed calls are free.
        </p>
        {extra && <p>higher rates: {extra}.</p>}
        <p>monthly reload is on by default. untick it before paying or stop it in <a href={accountPath(signedIn)}>my account</a>.</p>
      </details>
      <details>
        <summary>do i need my own phone number?</summary>
        <p>
          no. call4me provides a free us number, and the agent answers callbacks to it.
          you can also verify your own number as caller ID; callbacks then go directly to your phone.
        </p>
      </details>
      <details>
        <summary>how do extra numbers work?</summary>
        <p>
          ask your agent (call4me_buy_number) or use <a href={accountPath(signedIn)}>my account</a>. a number costs exactly what our phone carrier charges us, no markup: its upfront
          cost plus the first month when you buy it, then the monthly cost every 30 days from your credits. your account page shows each country's price. if your credits
          can't cover a renewal, the number is released after 7 days. you can release a number anytime.
        </p>
      </details>
      <details>
        <summary>which agents does it work with?</summary>
        <p>
          claude code, codex, claude desktop, claude.ai, chatgpt, grok bot, and other MCP clients. muse can build its own integration.
          follow the <a href="/#install-prompt">setup prompt</a>; some apps need you to add the connector yourself.
          see the <a href="/blog/meta-muse-ai-agent-phone-calls">muse</a> and <a href="/blog/grok-connectors-mcp-phone-calls">grok</a> guides.
        </p>
      </details>
      <details>
        <summary>can i jump on the call myself?</summary>
        <p>
          yes. tell your agent to connect you "as soon as a person picks up" to skip the hold music, or ask during the call. call4me may also ring you if the business needs
          you to verify your account. your agent should tell you what number to expect. answer and press 1 to join (so your voicemail never ends up on it); press * or hang up to hand it back.
          or ask to just listen in: nobody on the call hears you, the agent keeps working, and you press 1 anytime to take over.
        </p>
      </details>
      <details>
        <summary>will they know it's an AI?</summary>
        <p>
          it doesn't announce itself. if asked whether it's an AI, it says yes. it calls for you and never claims to be you. see <a href="/rules">rules</a>.
        </p>
      </details>
      <details>
        <summary>are calls recorded? where can i listen?</summary>
        <p>yes. our phone carrier (Telnyx) records calls. after a call ends, open it in <a href={accountPath(signedIn)}>my account</a> to play or save its recording and read the transcript. you can also ask your agent for the recording. it can take a minute to appear after hangup.</p>
      </details>
      <details>
        <summary>who can it call?</summary>
        <p>businesses and services you want to reach. no telemarketing, no surveys, no calling people who don't expect it, no emergency or premium-rate numbers.</p>
      </details>
    </div>
  </>
  );
};

export const WelcomePage: FC<{ apiKey: string | null; installPrompt: string; balanceCents: number; email: string; pending?: boolean; signedOut?: boolean; next?: string; numbers?: NumberView[]; redditEvents?: RedditPixelEvent[] }> = (p) => (
  <Layout title="you're in" page="welcome" signedIn={!p.signedOut && !p.pending} redditEvents={p.redditEvents}>
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
        <CallOnboarding numbers={p.numbers} />
        {p.apiKey ? (
          <>
            <p>
              your key: <span class="key">{p.apiKey}</span>. it's already in the prompt below, and in the prompts on every page while you're signed in.
            </p>
            <p>copy this prompt into claude code, codex, claude desktop, or chatgpt. it installs call4me and tells your agent how to use it.</p>
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
      <a href="/">back to call4me</a>
    </p>
  </Layout>
);

/**
 * The welcome email's add-credits link. Opening it creates nothing: mail scanners open every
 * link in an email, so the checkout starts only when a browser posts the form (on its own,
 * via the script, or from the button).
 */
export const AddCreditsPage: FC<{ path: string }> = ({ path }) => (
  <Layout title="add credits">
    <h1>add credits</h1>
    <p>taking you to checkout. credits reload monthly, and you can stop that anytime from your account.</p>
    <form method="post" action={path} id="add-credits" class="inline">
      <button type="submit">continue to checkout</button>
    </form>
    <script>{raw("document.getElementById('add-credits').submit();")}</script>
  </Layout>
);

export const UnsubscribePage: FC<{ accountId: string; sig: string; token?: string }> = ({ accountId, sig, token }) => (
  <Layout title="unsubscribe">
    <h1>unsubscribe</h1>
    <p>stop getting emails from nick about call4me? your account and credits stay as they are.</p>
    <form method="post" action="/unsubscribe" class="inline">
      <input type="hidden" name="a" value={accountId} />
      <input type="hidden" name="s" value={sig} />
      {token && <input type="hidden" name="token" value={token} />}
      <button type="submit">unsubscribe</button>
    </form>
  </Layout>
);

export const RulesPage: FC<{ signedIn: boolean; pricePerMinuteCents: number; countries: CountryOffer[]; agentPrompt: string }> = ({ signedIn, agentPrompt, pricePerMinuteCents, countries }) => (
  <Layout title="rules" page="rules" signedIn={signedIn}>
    <h1>rules</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    <p>call4me places calls a person would make themselves: bookings, appointments, questions for a business. it is not for anything else.</p>
    <ul>
      <li>US, Canadian and European numbers, and numbers in other countries where your account holds a call4me number. no emergency numbers, no premium-rate or shared-cost numbers.</li>
      <li>no telemarketing, sales, surveys, debt collection, political calls, or calls to people who didn't expect to hear from you.</li>
      <li>no harassment, threats, pranks, or pretending to be someone else. the caller always calls <i>for</i> you; it never claims to be you.</li>
      <li>the same number can be called a few times a day, not more. anyone who asks not to be called again is never called by call4me again.</li>
      <li>the caller does not open by announcing it's an AI, the same way you don't open a call by explaining who you are. if someone sincerely asks, it tells the truth.</li>
      <li>calls are recorded by our phone carrier (Telnyx). after a call ends, open it in <a href={accountPath(signedIn)}>my account</a> to play or save the recording. a text transcript is kept there too.</li>
      <li>the caller never reads out card numbers, bank details, or passwords.</li>
    </ul>
    <p>break these and the account is closed without a refund of the remaining balance.</p>
    <Faq signedIn={signedIn} pricePerMinuteCents={pricePerMinuteCents} countries={countries} />
  </Layout>
);

export const PrivacyPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="privacy" page="privacy" signedIn={signedIn}>
    <h1>privacy</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    <ul>
      <li>we store your email, your balance history, and for each call: the number, the brief your agent sent, the outcome, and a text transcript.</li>
      <li>if you save a calling profile (name, date of birth, phone, address, insurance, car), we store it so your agent doesn't have to ask before every call. the caller only shares it with the place it's calling, and only when asked. your agent can remove any of it with call4me_save_profile.</li>
      <li>our phone carrier (Telnyx) records and stores call audio. audio also passes through our speech model provider (OpenAI) while the call is live. after a call ends, you can play or save available recordings from <a href={accountPath(signedIn)}>my account</a>, or ask your agent for them. recording links can expire and anyone you share a link with can use it.</li>
      <li>payments are handled by Stripe; we never see your card.</li>
      <li>we count visits to this site with Google Analytics and Ahrefs Web Analytics. Google Analytics sets a cookie to tell repeat visits apart. when you're signed in, Google Analytics also gets your account's internal id and a one-way hash of your email (never the email itself or your phone number) along with sign-ups, purchases, and when calls are placed and how they ended, without who was called or what was said. we also set our own cookie on your first visit that remembers where you came from (the referring site or link tag and the first page you saw), and keep that with your account so we know which channels bring people who use call4me.</li>
      <li>we measure our Facebook and Instagram ads with Meta's pixel, which sets a cookie to recognize your browser and the ad you clicked. Meta gets that cookie, your IP address and browser type, and, when you're signed in, a scrambled (hashed) copy of your account's internal id, along with sign-ups, purchases and amounts, and that a call was placed. never your email, phone number or name, who was called, or what was said.</li>
      <li>we measure Reddit ads with Reddit's pixel and server-side conversions. we keep the Reddit click and campaign labels from a paid visit with your account so later purchases and usage can be attributed. Reddit may receive the click id, browser identifiers, IP address and browser type, plus scrambled copies of your account id and email, purchase amounts, and milestones such as a first completed call, returning use, or a resolved task. Reddit never receives a phone number, destination, call category, brief, transcript, recording, or call outcome details.</li>
      <li>on the blog, a cookie remembers which posts you liked. a comment stores the name and email you give (the email is never shown), and the newsletter stores your email until you unsubscribe.</li>
      <li>
        email <a href="mailto:me@call4.me">me@call4.me</a> to delete your account and its call history.
      </li>
    </ul>
  </Layout>
);

export const SupportPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="support" page="support" signedIn={signedIn}>
    <h1>support</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    <p>
      email <a href="mailto:me@call4.me">me@call4.me</a> with what happened and, for a call, its id (call_...) from your agent or <a href={accountPath(signedIn)}>my account</a>. a person
      answers, usually the same day.
    </p>
    <ul>
      <li>a call went wrong: open it in <a href={accountPath(signedIn)}>my account</a> for the outcome and the full transcript, and send us the call id. talk time is billed from pickup; unanswered, busy and failed calls are free.</li>
      <li>credits and the monthly reload: your balance and reload are in <a href={accountPath(signedIn)}>my account</a>, where you can stop the reload anytime. credits already loaded stay and don't expire.</li>
      <li>connecting your agent: the <a href="/mcp">install page</a> has the steps for each app. in chatgpt, add call4me from the plugins directory and sign in when it asks.</li>
      <li>someone you don't know called from a call4me number: tell us the number and we stop calls to yours.</li>
      <li>deleting your account: email us from the address you signed in with, and we delete the account, its calling profile and its call history.</li>
    </ul>
  </Layout>
);

export const TermsPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="terms" page="terms" signedIn={signedIn}>
    <h1>terms</h1>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    <ul>
      <li>credits are prepaid and don't expire. a call holds its maximum cost from your balance before it dials and settles when it ends: talk time from pickup, rounded up to the minute. the rest of the hold comes back.</li>
      <li>by default, what you load reloads every month: the same amount is charged to your card and added as credits. stop it anytime from your account; credits already loaded stay.</li>
      <li>unanswered, busy, and failed calls are free.</li>
      <li>you're responsible for the calls you ask for and must follow the <a href="/rules">rules</a>.</li>
      <li>the service is provided as is. a call can fail, get something wrong, or end without a result; check anything important.</li>
    </ul>
  </Layout>
);
