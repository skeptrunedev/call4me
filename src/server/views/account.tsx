import type { FC } from 'hono/jsx';
import { formatPhone } from '../lib/phone';
import type { callView } from '../mcp/server';
import { dollars, type Account } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { CopyBlock, Layout } from './layout';

type CallView = ReturnType<typeof callView>;

export const LoginPage: FC<{ error?: string }> = ({ error }) => (
  <Layout title="my account">
    <h1>my account</h1>
    <form method="post" action="/login">
      {error && <p class="err">{error}</p>}
      <label for="key">your key</label>
      <input type="text" id="key" name="key" required autocomplete="off" spellcheck={false} style="width:420px" placeholder="cb_live_..." /> <button type="submit">open</button>
    </form>
    <p class="small">
      lost it? <a href="/key">get a new key by email</a>. no key yet? <a href="/#buy">add funds</a> to get one.
    </p>
  </Layout>
);

export const KeyRequestPage: FC<{ sent?: boolean; error?: string }> = ({ sent, error }) => (
  <Layout title="new key">
    <h1>get a new key</h1>
    {sent ? (
      <p>if that email has a callbay account, a link is on its way. it works once, for an hour. your old key stops working when you open it.</p>
    ) : (
      <form method="post" action="/key">
        {error && <p class="err">{error}</p>}
        <label for="email">the email you paid with</label>
        <input type="email" id="email" name="email" required autocomplete="email" /> <button type="submit">email me a link</button>
      </form>
    )}
  </Layout>
);

export const NewKeyPage: FC<{ key: string; installPrompt: string }> = ({ key, installPrompt }) => (
  <Layout title="new key" signedIn>
    <h1>your new key</h1>
    <p>
      shown once: <span class="key">{key}</span>
    </p>
    <p>the old key no longer works. paste this into your agent to reinstall with the new one:</p>
    <CopyBlock id="install-prompt" text={installPrompt} rows={16} />
  </Layout>
);

export const AccountPage: FC<{ account: Account; balanceCents: number; pricePerMinuteCents: number; phoneNumber: string | null; calls: CallView[]; error?: string }> = (p) => (
  <Layout title="my account" signedIn>
    <h1>
      balance: <span class="price">{dollars(p.balanceCents)}</span>
    </h1>
    <p class="small">
      {p.account.email} · {dollars(p.pricePerMinuteCents)}/min · about {Math.floor(p.balanceCents / p.pricePerMinuteCents)} minutes left · your number:{' '}
      {p.phoneNumber ? formatPhone(p.phoneNumber) : 'assigned on your first call'} · key {p.account.key_prefix}
    </p>
    <form method="post" action="/account/funds" class="buy">
      {p.error && <p class="err">{p.error}</p>}
      <label for="amount">add funds (dollars, min ${MIN_TOPUP_CENTS / 100})</label>
      <input type="text" id="amount" name="amount" class="amount" inputmode="decimal" value={String(MIN_TOPUP_CENTS / 100)} /> <button type="submit">pay with card</button>
    </form>
    <h2>calls</h2>
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
    <p class="small">
      <a href="/key">rotate key</a> · <a href="/logout">log out</a>
    </p>
  </Layout>
);

export const CallPage: FC<{ call: CallView }> = ({ call }) => (
  <Layout title={call.business} signedIn>
    <h1>
      {call.business} <span class="small muted">{call.number}</span>
    </h1>
    <p>
      <span class={`st st-${call.status}`}>{call.status.replace('_', ' ')}</span> · {call.direction} · {call.created_at.slice(0, 16).replace('T', ' ')} UTC · {call.talk_minutes} min · {call.cost}
    </p>
    <p>
      <b>goal:</b> {call.goal}
    </p>
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

export const McpPage: FC<{ signedIn: boolean; installPrompt: string }> = ({ signedIn, installPrompt }) => (
  <Layout title="install mcp" signedIn={signedIn}>
    <h1>install the callbay mcp</h1>
    <p>
      one URL with your key in it: <code>https://callbay…/mcp/&lt;your key&gt;</code>. the easiest way is to paste this prompt into your agent and let it do the setup:
    </p>
    <CopyBlock id="install-prompt" text={installPrompt} rows={14} />
    <h3>by hand</h3>
    <pre class="wrap">
      {`claude code:     claude mcp add --scope user --transport http callbay <URL>
codex:           codex mcp add callbay --url <URL>
claude desktop / claude.ai / chatgpt:  settings → connectors → add custom connector → <URL>
anything else:   streamable HTTP at <URL>, or POST /mcp with "Authorization: Bearer <key>"`}
    </pre>
    <h3>tools</h3>
    <ul>
      <li>
        <code>callbay_place_call</code> call a business with a goal, the facts it may share, and what it may accept
      </li>
      <li>
        <code>callbay_get_call</code> status, live transcript, open questions, outcome (long-polls with wait_seconds)
      </li>
      <li>
        <code>callbay_answer_question</code> answer something the business asked mid-call
      </li>
      <li>
        <code>callbay_list_calls</code> recent calls, including callbacks your number answered
      </li>
      <li>
        <code>callbay_get_balance</code>, <code>callbay_add_funds</code>
      </li>
    </ul>
  </Layout>
);
