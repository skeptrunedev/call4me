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
import { useStaticRender } from '../lib/static-render';

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

export type HomePageProps = { origin: string; pricePerMinuteCents: number; signedIn: boolean; installPrompt: string; countries: CountryOffer[]; error?: string; amount?: string };

export const HomeRecordings: FC = () => (
  <>
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
    <script>{raw(PLAYER_SCRIPT)}</script>
  </>
);

export const HomeActions: FC = () => (
  <>
    <p class="hero-links"><a href="#buy">add credits</a> <a href="/examples">more real calls</a> <a href="/mcp">works with any agent</a></p>
  </>
);

export const HomeCredits: FC<HomePageProps> = (p) => (
  <>
    <div class="cols">
      <div>
        <h3>how it works</h3>
        <ol class="steps">
          <li>
            <svg class="step-graphic" viewBox="0 0 320 190" width="320" height="190" aria-hidden="true" focusable="false">
              <rect x="35" y="24" width="250" height="142" rx="5" fill="#fff" stroke="#ddddd6" />
              <path d="M35 62h250" stroke="#e5e5df" />
              <rect x="53" y="39" width="25" height="14" rx="2" fill="none" stroke="#77776d" />
              <path d="M54 44h23" stroke="#77776d" />
              <text x="89" y="50" font-size="12" fill="#66665f">call4me credits</text>
              <text x="54" y="103" font-size="30" font-weight="600" fill="#151515">{dollars(MIN_TOPUP_CENTS)}</text>
              <rect x="54" y="126" width="84" height="5" rx="1" fill="#e5e5df" />
              <rect x="54" y="137" width="55" height="5" rx="1" fill="#eeeee9" />
              <rect x="198" y="112" width="68" height="34" rx="3" fill="#ffb000" />
              <path d="M222 129h19m-6-6 6 6-6 6" fill="none" stroke="#151515" stroke-width="1.5" />
            </svg>
            load credits (<span class="price">from {dollars(MIN_TOPUP_CENTS)}</span>, reloads monthly unless you untick it). calls cost <span class="price">{dollars(p.pricePerMinuteCents)}/min</span> from pickup, including phone menus and hold time. the maximum cost is held up front and settled when the call ends.
          </li>
          <li>
            <svg class="step-graphic" viewBox="0 0 320 190" width="320" height="190" aria-hidden="true" focusable="false">
              <rect x="28" y="15" width="264" height="160" rx="5" fill="#fff" stroke="#ddddd6" />
              <text x="46" y="41" font-size="13" font-weight="600" fill="#151515">ChatGPT</text>
              <path d="M28 54h264" stroke="#e5e5df" />
              <rect x="82" y="68" width="192" height="34" rx="8" fill="#f0f0eb" />
              <text x="96" y="89" font-size="12" fill="#55554e">Can you call for me?</text>
              <rect x="46" y="119" width="228" height="38" rx="4" fill="#fff" stroke="#ddddd6" />
              <text x="60" y="143" font-size="12" fill="#151515">call4me</text>
              <path d="m174 138 4 4 8-9" fill="none" stroke="#52864e" stroke-width="1.8" />
              <text x="194" y="143" font-size="11" fill="#52864e">connected</text>
            </svg>
            connect call4me to ChatGPT and sign in. tell ChatGPT what you need, and it can make the call for you.
          </li>
          <li>
            <svg class="step-graphic" viewBox="0 0 320 190" width="320" height="190" aria-hidden="true" focusable="false">
              <rect x="24" y="26" width="249" height="76" rx="5" fill="#fff" stroke="#ddddd6" />
              <text x="42" y="54" font-size="13" fill="#55554e">book me a table for 4 at nopa</text>
              <text x="42" y="74" font-size="13" fill="#55554e">tomorrow around 7</text>
              <path d="M146 103v26h30m-5-5 5 5-5 5" fill="none" stroke="#a5a59b" stroke-width="1.5" />
              <rect x="191" y="112" width="105" height="56" rx="4" fill="#fff" stroke="#ddddd6" />
              <path d="m211 127 5-2 5 8-4 3c3 5 5 7 10 10l3-4 8 5-2 5c-1 2-5 2-8 0-9-4-15-10-19-19-1-3 0-5 2-6Z" fill="#fff3cd" stroke="#b77900" stroke-width="1.4" />
              <path d="M246 132h30m-30 8h20m-20 8h25" stroke="#deded6" stroke-width="3" />
            </svg>
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
  </>
);

export const HomeSetup: FC<HomePageProps> = (p) => (
  <>
    <h3>the prompt</h3>
    <p class="small">{p.signedIn ? 'this is what you paste into your agent. your key is already in it.' : 'this is what you paste into your agent. it signs you in; sign in here first and your key comes in the prompt instead.'}</p>
    <CopyBlock id="install-prompt" text={p.installPrompt} rows={12} />
  </>
);

export const HomeAbout: FC = () => (
  <>
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
  </>
);

export const HomeStories: FC = () => (
  <>
    <section class="customer-stories" aria-labelledby="customer-stories">
      <h3 id="customer-stories">from people using call4me</h3>
      <figure>
        <p><b>$100 flight credit</b></p>
        <blockquote>“literally zero chance i was going to do that myself”</blockquote>
        <figcaption><a href="https://x.com/sheherenow_/status/2105785991839850786">@sheherenow_ on X</a><a class="customer-story-link" aria-label="Read the story about the $100 flight credit" href="/blog/customer-story-flight-credit">read the story <span aria-hidden="true">→</span></a></figcaption>
      </figure>
      <figure>
        <p><b>dinner reservation</b></p>
        <blockquote>“Booked a dinner reservation in one prompt. Only cost me 25 cents.”</blockquote>
        <figcaption><a href="https://x.com/rickmanelius/status/2105825199015030846">@rickmanelius on X</a><a class="customer-story-link" aria-label="Read the story about Rick’s dinner reservation" href="/blog/customer-story-rick-dinner-reservation">read the story <span aria-hidden="true">→</span></a></figcaption>
      </figure>
      <figure>
        <p><b>dental appointments that day</b></p>
        <blockquote>“Just got my mind blown by the call quality”</blockquote>
        <figcaption><a href="https://x.com/araa3185/status/2105740108926513203">@araa3185 on X</a><a class="customer-story-link" aria-label="Read the story about Araa’s dental appointments" href="/blog/customer-story-dental-appointments">read the story <span aria-hidden="true">→</span></a></figcaption>
      </figure>
      <figure>
        <p><b>found shoes at Men's Wearhouse</b></p>
        <blockquote>“this thing saved so much time.”</blockquote>
        <figcaption><a href="https://x.com/JoeFinberg/status/2105727961882398781">@JoeFinberg on X</a><a class="customer-story-link" aria-label="Read the story about Joe’s dress shoe search" href="/blog/customer-story-joe-dress-shoes">read the story <span aria-hidden="true">→</span></a></figcaption>
      </figure>
    </section>
  </>
);

export const HomePage: FC<HomePageProps> = (p) => (
  <Layout page="home" signedIn={p.signedIn} meta={{ jsonLd: HOME_LD }}>
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-copy">
        <h1 id="home-title">let your agents<br />make phone calls</h1>
        <p class="home-description">your AI agent makes phone calls for you</p>
        <HomeActions />
      </div>
      <div class="home-hero-media"><HomeRecordings /></div>
    </section>
    <section class="home-section home-about"><HomeAbout /></section>
    <section class="home-section home-credits"><HomeCredits {...p} /></section>
    <section class="home-stories"><div class="home-section"><HomeStories /></div></section>
    <section class="home-section home-setup"><HomeSetup {...p} /></section>
    <section class="home-section home-faq"><Faq {...p} /></section>
    <section class="home-section home-closing">
      <h2>let your agents make phone calls</h2>
      <a href="#buy" class="button">add credits <span aria-hidden="true">→</span></a>
    </section>
  </Layout>
);

/** The faq on the home page and the rules page. */
export const Faq: FC<{ signedIn: boolean; pricePerMinuteCents: number; countries: CountryOffer[] }> = ({ signedIn, pricePerMinuteCents, countries }) => {
  const staticConfig = useStaticRender();
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
          {staticConfig ? <span data-site-countries></span> : live.length > 0 ? <> (numbers available in {live.length} countries)</> : null}.
        </p>
      </details>
      <details>
        <summary>what does it cost?</summary>
        <p>
          from {dollars(pricePerMinuteCents)} per minute from pickup by a person or automated system, including phone menus and hold time, rounded up to the minute. prepaid credits start at {dollars(MIN_TOPUP_CENTS)}.
          each call reserves its maximum cost and returns unused credit when it ends. unanswered, busy, and failed calls are free.
        </p>
        {extra && <p>higher rates: {extra}.</p>}
        <p>monthly reload is on by default. untick it before paying or stop it in <a href={accountPath(signedIn)}>my account</a>.</p>
      </details>
      <details>
        <summary>can it wait on hold and ring me when someone answers?</summary>
        <p>
          yes. ask your agent to have call4me ring you as soon as a person picks up. it calls your saved phone, and you press 1 to join.
          phone menus and hold time cost the same per minute as the conversation. there is no discounted hold rate.
          ask your agent to set a maximum call length to cap the cost, or schedule the call for a quieter time.
        </p>
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
    <h1>privacy policy</h1>
    <p>updated October 8, 2026</p>
    <p>This policy covers call4me at call4.me, our phone-calling service, and our connected tools, including the call4me plugin in ChatGPT. Contact <a href="mailto:me@call4.me">me@call4.me</a> with privacy questions or requests.</p>

    <h2 id="data">What we collect and why</h2>
    <ul>
      <li><strong>Account and sign-in information.</strong> We store your email, account identifier, and information supplied by your sign-in provider, such as your name and profile image. We store sign-in sessions, authorization grants and tokens, and a password hash for accounts that use password sign-in. This lets us identify you, protect your account, and authorize the clients you connect. Security records can include IP addresses, browser information, and request times.</li>
      <li><strong>Call requests and history.</strong> We store the destination number, business and task details you or your agent provide, scheduling information, answers you give during a call, call status, timing and charges, outcomes, text transcripts, and recording references. If you join a call or receive a callback, we also process your phone number and your part of the conversation. We use this information to make and manage the requested calls, return results, maintain your history, resolve problems, and prevent abuse.</li>
      <li><strong>Saved calling profile.</strong> If you choose to save details, we store fields such as your name, date of birth, phone number, address, and vehicle details so they can be reused for relevant calls. Some integrations outside the ChatGPT plugin also support health or dental insurance fields. Saving a profile is separate from giving details for one call; you can remove saved fields.</li>
      <li><strong>Payments.</strong> We store your balance, purchases, charges, and payment-provider references for billing and reconciliation. Stripe handles card payments; call4me does not receive your full card number or security code.</li>
      <li><strong>Support and email.</strong> We process the messages and contact details you send us to answer requests, plus delivery and subscription records for account emails and newsletters. Blog comments store the name, email, comment, IP address and posting time; your name and comment are public, but your email is not displayed. Blog likes use a browser identifier.</li>
      <li><strong>Website and usage information.</strong> We process browser and device information, IP addresses, referring sites, landing pages, campaign and click identifiers, cookie identifiers, and account-linked usage events for site analytics and advertising measurement. The recipients and limits are described below.</li>
    </ul>

    <h2 id="chatgpt">Data used by the ChatGPT plugin</h2>
    <p>Connecting the plugin links it to your call4me account. We receive the inputs sent with a tool request, not your entire ChatGPT conversation. These inputs can include the business to call, the task, necessary contact or booking details, and answers you authorize your agent to pass along.</p>
    <p>The tools return information to your connected client, including the requested call status, outcome, transcript, recording links, saved profile fields, or balance. Your client processes those results under its own privacy settings and policy. Only send information needed for the task and information you have permission to share about another person.</p>
    <p>The ChatGPT plugin excludes medical and dental appointment categories and health-insurance profile fields. Do not send protected health information, government identifiers, payment-card details, passwords, API keys, or one-time authentication codes in call briefs, profiles, or tool inputs. Sign in through the dedicated authorization flow, not by putting credentials into a chat or call request.</p>

    <h2 id="recipients">Who receives information</h2>
    <ul>
      <li><strong>The people and businesses you call</strong> receive the information shared during the conversation to carry out your task. They may keep their own records. Anyone you share a recording link with may be able to use it while it remains valid.</li>
      <li><strong>Cloudflare</strong> hosts our application, databases, call-session state, and operational logs. <strong>Telnyx</strong> carries calls and processes phone numbers, call metadata, and recorded audio.</li>
      <li><strong>OpenAI</strong> processes call instructions, relevant calling details, live audio, transcripts, and generated responses for the voice agent, its supporting reasoning, and call summaries. This API processing is separate from your use of ChatGPT as the connected client.</li>
      <li><strong>Raindrop, when monitoring is enabled,</strong> receives diagnostic information about voice sessions and summaries, including account and call identifiers, model activity, and conversation content. We enable its personal-information redaction and apply additional redaction to supported fields; this is not a guarantee that every personal detail is removed.</li>
      <li><strong>Stripe</strong> processes payments. <strong>Google or X</strong> handles the sign-in method you choose. Our email service, normally <strong>Fastmail</strong>, processes message addresses and content to deliver account, support, and newsletter emails.</li>
      <li><strong>Your connected client</strong> receives tool results as described above. Our service providers may process information outside your country. Their separate retention and legal obligations can apply to information they receive.</li>
    </ul>

    <h2 id="analytics">Analytics, advertising measurement, and cookies</h2>
    <p>We use Google Analytics and Ahrefs Web Analytics to understand site visits, and Meta and Reddit to measure our ads. Website scripts receive visit and browser information. Some account events are also sent from our servers, including when a connected agent uses call4me without an open browser.</p>
    <ul>
      <li><strong>Google Analytics</strong> receives browser identifiers, our internal account identifier, a one-way hash of your email when available, acquisition information, and sign-up, purchase, and call-usage events. Our server-side events do not include call destinations, briefs, transcripts, or audio.</li>
      <li><strong>Meta</strong> receives browser and ad-click identifiers, IP address and browser type when available, a hashed account identifier, and sign-up, purchase and call-placement events. Our conversion payloads do not include your email, phone number, name, destination, or conversation content.</li>
      <li><strong>Reddit</strong> receives click and campaign information, available browser information, hashed account and email identifiers, purchase amounts, and milestones such as a first completed call, returning use, or a resolved task. Our conversion payloads exclude phone numbers, destinations, call categories, briefs, transcripts, recordings, and detailed outcomes.</li>
    </ul>
    <p>Hashed identifiers are pseudonymous, not anonymous: a recipient may match them to information it already holds. We keep first-visit attribution and paid Reddit visit records so we can connect later purchases and usage to their source.</p>

    <h2 id="retention">How long information is kept</h2>
    <ul>
      <li><strong>Account records and text call history:</strong> there is currently no automatic age-based deletion. Account details, call briefs, transcripts, outcomes, schedules, and balance history remain stored until removed through an account or data-deletion request. Disconnecting a plugin or not using the service does not delete these records.</li>
      <li><strong>Saved profiles:</strong> fields remain until you remove them or request account deletion. Removing a profile field does not erase a copy already used in an earlier call or shared with a business.</li>
      <li><strong>Call recordings:</strong> Telnyx stores the audio. Its <a href="https://support.telnyx.com/en/articles/5377454-call-recording">published recording policy</a> currently states that recordings are stored for one year unless deleted earlier, and that this maximum may change. We do not guarantee availability for that whole period. An expiring download link is not deletion of the underlying audio. Contact us to request earlier removal of a recording.</li>
      <li><strong>Sign-in and authorization:</strong> our browser sessions are configured for up to 400 days and renew with active use. OAuth access tokens last seven days; refresh tokens can last ten years and rotate when used. Tokens can be revoked before expiry. These are access lifetimes, not promises to erase the associated account, authorization records, or call history when a token expires.</li>
      <li><strong>Our cookies:</strong> first-visit attribution lasts up to 365 days, paid Reddit visitor and visit cookies up to 90 days, and the blog reader cookie up to 365 days. The blog database bookmark cookie lasts up to ten minutes. Browsers may remove cookies earlier. Attribution copied into our database has no automatic age-based expiry; deleting a cookie does not delete that copy.</li>
      <li><strong>Blog, email, support, and measurement records:</strong> stored comments, subscription and delivery records, support correspondence, attribution records, and conversion-delivery records do not currently have a fixed automatic deletion period. Unsubscribing stops the relevant emails but keeps the subscription record, including its unsubscribed status, so we can honor that choice. Ask us about removing these records.</li>
      <li><strong>Provider logs and copies:</strong> providers may retain security logs, backups, payment records, and diagnostic data on their own schedules. For example, OpenAI's <a href="https://developers.openai.com/api/docs/guides/your-data">API data controls</a> describe default abuse-monitoring retention of up to 30 days, with legal and safety exceptions and separate rules for stored application data. We do not promise immediate erasure of every provider copy when data is removed from call4me. Contact us for help with provider-held data related to your account.</li>
    </ul>

    <h2 id="controls">Your choices and deletion requests</h2>
    <ul>
      <li><strong>View and correct:</strong> use <a href={accountPath(signedIn)}>my account</a> or the connected tools to review your calls and available recordings. Use call4me_get_profile to inspect your saved profile and call4me_save_profile with an empty string for a field to remove it. Only save details you want reused.</li>
      <li><strong>Disconnect:</strong> remove the plugin or connection in your client's settings to stop using it there. Contact us if you also need help revoking access. Disconnecting, signing out, and deleting an account are different actions.</li>
      <li><strong>Email choices:</strong> use the unsubscribe link in the relevant newsletter or promotional email. This does not stop essential account or support messages, or automatically delete subscription records.</li>
      <li><strong>Browser controls:</strong> your browser can block or clear cookies and block third-party scripts. This can affect sign-in and preferences. These controls do not by themselves stop account-linked events sent from our servers or delete information already shared. Contact us about objecting to measurement or requesting removal of associated data; there is currently no in-product account-wide analytics switch.</li>
      <li><strong>Access, deletion, and other privacy requests:</strong> email <a href="mailto:me@call4.me">me@call4.me</a> from the address associated with your account. Say whether the request concerns your account, particular calls or recordings, profile, comments, newsletter, or measurement data. We may need to verify account ownership before acting. Account and call-history deletion is handled by support, not by a plugin tool.</li>
    </ul>
    <p>Some records may need to be retained for applicable legal, payment, fraud-prevention, or dispute obligations; ask us about the reason and applicable period for your request. Deletion from call4me does not recall information already shared with a business, exported by you, or stored in your connected client's conversation. Those recipients have their own controls.</p>
    <p>We may update this policy as the service changes; the date above identifies this version. Privacy questions and requests always go to <a href="mailto:me@call4.me">me@call4.me</a>.</p>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
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
      <li>a call went wrong: open it in <a href={accountPath(signedIn)}>my account</a> for the outcome and the full transcript, and send us the call id. time from pickup, including phone menus and hold time, is billed; unanswered, busy and failed calls are free.</li>
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
      <li>credits are prepaid and don't expire. a call holds its maximum cost from your balance before it dials and settles when it ends: time from pickup by a person or automated system, including phone menus and hold time at the same rate, rounded up to the minute. the rest of the hold comes back.</li>
      <li>by default, what you load reloads every month: the same amount is charged to your card and added as credits. stop it anytime from your account; credits already loaded stay.</li>
      <li>unanswered, busy, and failed calls are free.</li>
      <li>you're responsible for the calls you ask for and must follow the <a href="/rules">rules</a>.</li>
      <li>the service is provided as is. a call can fail, get something wrong, or end without a result; check anything important.</li>
    </ul>
  </Layout>
);
