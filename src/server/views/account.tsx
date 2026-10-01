import type { FC } from 'hono/jsx';
import type { z } from 'zod';
import { mcpUrl } from '../lib/prompts';
import type { recordingOutput } from '../lib/recording-schema';
import type { callView } from '../mcp/server';
import { dollars, type Account } from '../services/accounts';
import type { CountryOffer, NumberView, OwnNumberView } from '../services/numbers';
import { DESTINATION_PRICE_CENTS } from '../lib/rates';
import { MIN_TOPUP_CENTS, type Reload } from '../services/topups';
import { CopyBlock, Layout } from './layout';
import { CallOnboarding } from './onboarding';

type CallView = ReturnType<typeof callView>;
type Recording = z.infer<typeof recordingOutput>['recordings'][number];

/** A call's recordings as its page shows them: none while it is live, then the carrier's, or a failed lookup. */
export type CallRecordings = { state: 'live' } | { state: 'ready'; recordings: Recording[] } | { state: 'failed' };

export const LoginPage: FC<{ next: string; error?: string; providers: { google: boolean; x: boolean }; agentPrompt?: string }> = ({ next, error, providers, agentPrompt }) => (
  <Layout title="sign in" page="login">
    <h1>sign in</h1>
    {agentPrompt && <CopyBlock id="agent-prompt" text={agentPrompt} label="[ or have your agent connect: copy prompt for your agent ]" rows={12} hidden />}
    {error && <p class="err">{error}</p>}
    {providers.google && (
      <form method="post" action="/login/google" class="inline">
        <input type="hidden" name="next" value={next} />
        <button type="submit">continue with google</button>
      </form>
    )}
    {providers.x && (
      <form method="post" action="/login/x" class="inline">
        <input type="hidden" name="next" value={next} />
        <button type="submit">continue with x</button>
      </form>
    )}
    {!providers.google && !providers.x && <p class="muted">sign-in is being set up. check back shortly.</p>}
    <details>
      <summary class="small">sign in with a password</summary>
      <form method="post" action="/login/password">
        <input type="hidden" name="next" value={next} />
        <input type="email" name="email" placeholder="email" autocomplete="username" required />{' '}
        <input type="password" name="password" placeholder="password" autocomplete="current-password" required />{' '}
        <button type="submit">sign in</button>
      </form>
    </details>
    <p class="small">your credits, calls, and calling profile belong to the account you sign in with. an account you paid for before sign-in existed is linked by its email.</p>
  </Layout>
);

export const ConsentPage: FC<{ client: string; query: string; error?: string }> = ({ client, query, error }) => (
  <Layout title="connect" page="consent" signedIn>
    <h1>connect {client} to call4me?</h1>
    {error && <p class="err">{error}</p>}
    <p>
      {client} will be able to place phone calls for you, read your calls and calling profile, and spend your call4me credits. you can reconnect or revoke it
      anytime by signing out of the client.
    </p>
    <form method="post" action="/oauth/consent" class="inline">
      <input type="hidden" name="oauth_query" value={query} />
      <button type="submit" name="decision" value="allow">
        allow
      </button>{' '}
      <button type="submit" name="decision" value="deny" class="linkbutton">
        deny
      </button>
    </form>
  </Layout>
);

export const NewKeyPage: FC<{ apiKey: string; installPrompt: string }> = ({ apiKey, installPrompt }) => (
  <Layout title="new key" page="key" signedIn>
    <h1>your new key</h1>
    <p>
      <span class="key">{apiKey}</span>
    </p>
    <p>the old key no longer works. the prompts on every page now carry this one. paste this into your agent to reinstall with it:</p>
    <CopyBlock id="install-prompt" text={installPrompt} rows={16} />
  </Layout>
);

export const AccountPage: FC<{
  account: Account;
  balanceCents: number;
  pricePerMinuteCents: number;
  numbers: NumberView[];
  ownNumbers: OwnNumberView[];
  offers: CountryOffer[];
  reload: Reload | null;
  calls: CallView[];
  apiKey: string;
  agentPrompt: string;
  error?: string;
  numberError?: string;
  ownNumberError?: string;
}> = (p) => (
  <Layout title="my account" page="account" signedIn>
    <h1>
      balance: <span class="price">{dollars(p.balanceCents)}</span>
    </h1>
    <p class="small">
      {p.account.email} · {dollars(p.pricePerMinuteCents)}/min · about {Math.floor(p.balanceCents / p.pricePerMinuteCents)} minutes left
    </p>
    <CopyBlock id="agent-prompt" text={p.agentPrompt} rows={12} hidden />
    {p.reload ? (
      <form method="post" action="/account/reload/stop" class="inline">
        reloads <span class="price">{dollars(p.reload.cents)}</span> every month
        {p.reload.renewsAt && <> (next {new Date(p.reload.renewsAt).toISOString().slice(0, 10)})</>}
        {p.reload.status !== 'active' && <span class="err"> · {p.reload.status.replace('_', ' ')}</span>} · <button type="submit" class="linkbutton">stop reloading</button>
      </form>
    ) : (
      <p class="small muted">no monthly reload.</p>
    )}
    <form method="post" action="/account/funds" class="buy">
      {p.error && <p class="err">{p.error}</p>}
      <label for="amount">add credits (dollars, min ${MIN_TOPUP_CENTS / 100})</label>
      <input type="text" id="amount" name="amount" class="amount" inputmode="decimal" value={String(p.reload ? p.reload.cents / 100 : MIN_TOPUP_CENTS / 100)} /> <button type="submit">pay with card</button>
      <MonthlyBox replacing={Boolean(p.reload)} />
    </form>
    <h2>numbers</h2>
    <p class="small">
      calls go out from a number in the country you're calling when you have one. us, canadian, and european businesses can always be called (europe from a european
      number if you have one, else your us number); anywhere else, a number in that country is what lets you call there. extra numbers
      cost exactly what the carrier charges: the upfront cost plus the first month now, then the monthly cost every 30 days from your balance. if your balance can't cover a renewal, the
      number is released after 7 days.
    </p>
    {p.numbers.length === 0 ? (
      <p class="muted">no numbers yet. your free us number is bought on your first call.</p>
    ) : (
      <table class="rows">
        <thead>
          <tr>
            <th>number</th>
            <th>country</th>
            <th class="n">monthly</th>
            <th>renews</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {p.numbers.map((n) => (
            <tr>
              <td>{n.number}</td>
              <td>
                {n.country_name} <span class="small muted">{n.type.replace('_', ' ')}</span>
              </td>
              <td class="n">{n.included ? 'free' : n.monthly}</td>
              <td class="small">{n.included ? '' : n.overdue ? <span class="err">overdue: released {n.release_after} unless you add credits</span> : n.renews}</td>
              <td>
                {!n.included && (
                  <form method="post" action="/account/numbers/release" class="inline-form">
                    <input type="hidden" name="number" value={n.e164} />
                    <button type="submit" class="linkbutton">release</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    <form method="post" action="/account/numbers" class="buy">
      {p.numberError && <p class="err">{p.numberError}</p>}
      <label for="country">add a number</label>
      <select id="country" name="country">
        {p.offers.map((o) => (
          <option value={o.country} disabled={!o.available}>
            {o.name} ({o.type.replace('_', ' ')}): {o.available ? `${o.price} now, then ${o.monthly}/month${DESTINATION_PRICE_CENTS[o.country] ? `; calls ${dollars(DESTINATION_PRICE_CENTS[o.country]!)}/min` : ''}` : o.reason}
          </option>
        ))}
      </select>{' '}
      <button type="submit">buy from balance</button>
    </form>
    <h2>your own number</h2>
    <p class="small">
      calls can show your own phone number instead of a call4me number, to businesses in its country. we text it a code (or call and read it out) to check it's
      yours. a call goes out from it only when you or your agent pick it; businesses call it back, so callbacks ring you instead of call4me.
    </p>
    {p.ownNumbers.length > 0 && (
      <table class="rows">
        <tbody>
          {p.ownNumbers.map((n) => (
            <tr>
              <td>{n.number}</td>
              <td>{n.country_name}</td>
              <td>
                {n.status === 'verified' ? (
                  'verified'
                ) : (
                  <form method="post" action="/account/numbers/own/verify" class="inline-form">
                    <input type="hidden" name="number" value={n.e164} />
                    <input type="text" name="code" class="amount" placeholder="code" inputmode="numeric" autocomplete="one-time-code" required /> <button type="submit">verify</button>
                  </form>
                )}
              </td>
              <td>
                <form method="post" action="/account/numbers/own/remove" class="inline-form">
                  <input type="hidden" name="number" value={n.e164} />
                  <button type="submit" class="linkbutton">remove</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    <form method="post" action="/account/numbers/own" class="buy">
      {p.ownNumberError && <p class="err">{p.ownNumberError}</p>}
      <label for="own-number">add your number</label>
      <input type="text" id="own-number" name="number" placeholder="(415) 555-0123" inputmode="tel" autocomplete="tel" required />{' '}
      <select name="method" aria-label="how to send the code">
        <option value="sms">text me a code</option>
        <option value="call">call me with a code</option>
      </select>{' '}
      <button type="submit">send code</button>
    </form>
    <h2>calls</h2>
    <p class="small">calls are recorded by our phone carrier (Telnyx). open a call to play or save its recording.</p>
    {p.calls.length === 0 ? (
      <p class="muted">no calls yet. ask your agent to call somewhere.</p>
    ) : (
      <table class="rows">
        <thead>
          <tr>
            <th>when</th>
            <th>who</th>
            <th>status</th>
            <th>result</th>
            <th class="n">cost</th>
          </tr>
        </thead>
        <tbody>
          {p.calls.map((c) => (
            <tr>
              <td class="d">{c.created_at.slice(0, 16).replace('T', ' ')}</td>
              <td>
                <a href={`/account/calls/${c.id}`}>{c.business}</a> <span class="small muted">{c.direction === 'inbound' ? `called you from ${c.number}` : c.number}</span>
              </td>
              <td>
                <span class={`st st-${c.status}`}>{c.status.replace('_', ' ')}</span>
              </td>
              <td class="small">{c.outcome?.summary ?? ''}</td>
              <td class="n">{c.cost}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    <h2>connect your agent</h2>
    <p class="small">
      your key is <span class="key">{p.apiKey}</span>. the copy prompts on every page include it while you're signed in, so your agent connects without signing in.
      clients that sign in through the browser (claude desktop, claude.ai, claude code via /mcp) can use plain <code>/mcp</code> instead.
    </p>
    <form method="post" action="/account/key" class="inline">
      <button type="submit">replace my key (the old one stops working)</button>
    </form>
    <form method="post" action="/logout" class="inline">
      <button type="submit" class="linkbutton">sign out</button>
    </form>
  </Layout>
);

/** Monthly reload is the default: whatever you load comes back every month until you stop it. */
export const MonthlyBox: FC<{ replacing?: boolean }> = ({ replacing }) => (
  <label class="check">
    <input type="checkbox" name="monthly" checked /> reload this amount every month{replacing ? ' (replaces your current reload)' : ''}. stop anytime.
  </label>
);

/** m:ss, for a recording's length. */
const clock = (millis: number) => {
  const secs = Math.round(millis / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
};

/**
 * The call's audio. Players and links point at our own route, which checks the account and
 * fetches a fresh carrier link on each request, so a page left open never holds a dead link.
 */
const RecordingSection: FC<{ callId: string; recordings: CallRecordings }> = ({ callId, recordings }) => (
  <>
    <h2>recording</h2>
    <p class="small">calls are recorded by our phone carrier (Telnyx). play or save available recordings here, or ask your agent for them. only share recording links with people you want to hear the call.</p>
    {recordings.state === 'live' && <p class="muted">the recording shows up here once the call ends.</p>}
    {recordings.state === 'failed' && (
      <p class="err">
        the recording could not be retrieved right now. <a href="">refresh</a> to try again.
      </p>
    )}
    {recordings.state === 'ready' && recordings.recordings.length === 0 && (
      <p class="muted">
        no recording for this call yet. the carrier can take a minute to save one after hangup. <a href="">refresh</a> to check again.
      </p>
    )}
    {recordings.state === 'ready' &&
      recordings.recordings.map((r, i) => {
        const base = `/account/calls/${callId}/recordings/${encodeURIComponent(r.id)}`;
        const formats = (['mp3', 'wav'] as const).filter((f) => r.download_urls[f]);
        return (
          <div class="recording">
            <audio controls preload="none" src={`${base}/${formats[0]}`} aria-label={`call recording${recordings.recordings.length > 1 ? ` ${i + 1}` : ''}`}>
              <a href={`${base}/${formats[0]}`}>listen to the recording</a>
            </audio>
            <p class="small">
              {recordings.recordings.length > 1 && <>part {i + 1} · </>}
              {r.duration_millis !== null && <>{clock(r.duration_millis)} · </>}
              {formats.map((f, j) => (
                <>
                  {j > 0 && ' · '}
                  <a href={`${base}/${f}`}>open {f}</a>
                </>
              ))}
            </p>
          </div>
        );
      })}
  </>
);

export const CallPage: FC<{ call: CallView; recordings: CallRecordings; agentPrompt: string }> = ({ call, recordings, agentPrompt }) => (
  <Layout title={call.business} page="call" path={`/account/calls/${call.id}`} signedIn>
    <h1>
      {call.business} <span class="small muted">{call.number}</span>
    </h1>
    <p>
      <span class={`st st-${call.status}`}>{call.status.replace('_', ' ')}</span> · {call.direction} · {call.created_at.slice(0, 16).replace('T', ' ')} UTC · {call.talk_minutes} min · {call.cost}
    </p>
    <p>
      <b>goal:</b> {call.goal}
    </p>
    <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
    {call.outcome && (
      <div class="box">
        <b>{call.outcome.result.replace(/_/g, ' ')}:</b> {call.outcome.summary}
        {call.outcome.details && <pre class="wrap">{JSON.stringify(call.outcome.details, null, 2)}</pre>}
      </div>
    )}
    {call.error && <p class="err">{call.error}</p>}
    {call.answered_questions.length > 0 && (
      <>
        <h2>questions asked mid-call</h2>
        {call.answered_questions.map((q) => (
          <p class="q">
            {q.question} → <b>{q.answer}</b>
          </p>
        ))}
      </>
    )}
    <RecordingSection callId={call.id} recordings={recordings} />
    <h2>transcript</h2>
    <div class="transcript">
      {call.transcript.length === 0 ? (
        <p class="muted">nothing yet.</p>
      ) : (
        call.transcript.map((line) => {
          const i = line.indexOf(': ');
          return (
            <p>
              <span class="who">{line.slice(0, i)}</span>
              {line.slice(i + 2)}
            </p>
          );
        })
      )}
    </div>
    {!call.finished && (
      <p class="small muted">
        in progress. <a href="">refresh</a>
      </p>
    )}
    <p>
      <a href="/account">back to my account</a>
    </p>
  </Layout>
);

export const McpPage: FC<{ signedIn: boolean; installPrompt: string; origin: string; apiKey: string | null; numbers?: NumberView[] }> = ({ signedIn, installPrompt, origin, apiKey, numbers }) => (
  <Layout title="install mcp" page="mcp" signedIn={signedIn}>
    <h1>install the call4me mcp</h1>
    {apiKey ? (
      <p>
        your server URL is <code class="server-url">{mcpUrl(origin, apiKey)}</code>. it carries your key, so your agent needs no sign-in. the easiest way is to paste this prompt into your agent:
      </p>
    ) : (
      <p>
        the server is <code class="server-url">{origin}/mcp</code>. your agent signs you in through the browser (google or x). the easiest way is to paste this prompt into your agent:
      </p>
    )}
    <CopyBlock id="install-prompt" text={installPrompt} rows={14} />
    <CallOnboarding numbers={numbers} />
    <h3>by hand</h3>
    <pre class="wrap">
      {apiKey
        ? `claude code:     claude mcp add --scope user --transport http call4me ${mcpUrl(origin, apiKey)}
codex:           codex mcp add call4me --url ${mcpUrl(origin, apiKey)}
claude desktop / claude.ai / chatgpt:  settings → connectors → add custom connector → ${mcpUrl(origin, apiKey)}
or send "Authorization: Bearer ${apiKey}" to ${origin}/mcp`
        : `claude code:     claude mcp add --scope user --transport http call4me ${origin}/mcp   then /mcp → call4me → authenticate
codex:           codex mcp add call4me --url ${origin}/mcp   then   codex mcp login call4me
claude desktop / claude.ai / chatgpt:  settings → connectors → add custom connector → ${origin}/mcp
can't sign in?   create a key at ${origin}/account and use ${origin}/mcp/<key>, or send "Authorization: Bearer <key>" to /mcp`}
    </pre>
    <h3>tools</h3>
    <ul>
      <li>
        <code>call4me_place_call</code> call a business with a goal, the facts it may share, and what it may accept
      </li>
      <li>
        <code>call4me_get_call</code> status, live transcript, open questions, outcome (long-polls with wait_seconds)
      </li>
      <li>
        <code>call4me_answer_question</code> answer something the business asked mid-call
      </li>
      <li>
        <code>call4me_list_calls</code> recent calls, including callbacks your number answered
      </li>
      <li>
        <code>call4me_get_balance</code> balance, price per minute, and your call4me phone numbers
      </li>
      <li>
        <code>call4me_add_funds</code> a checkout link that adds credits now and reloads the same amount every month
      </li>
    </ul>
  </Layout>
);
