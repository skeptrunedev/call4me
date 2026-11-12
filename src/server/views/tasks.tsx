import { raw } from 'hono/html';
import type { FC } from 'hono/jsx';
import { dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { PAGES, SITE } from '../lib/pages';
import { renderMarkdown } from '../lib/blog';
import { APP_ID, appLd, ref } from '../lib/entity';
import { HOLD_PATH } from '../../content/hold-times';
import { TASKS, type Task } from '../../content/tasks';
import { CopyBlock, Layout } from './layout';

/** The page, citing the posts it is built on, and the call4me app with its live price (schema.org). */
const taskLd = (task: Task, pricePerMinuteCents: number) => [
  { '@id': `${SITE}${PAGES[task.key].path}`, about: ref(APP_ID), citation: task.posts.map((p) => `${SITE}/blog/${p.slug}`) },
  appLd(pricePerMinuteCents),
];

/** A page answering one "AI that calls X for me" question: what call4me does, then the recorded calls that show it. */
export const TaskPage: FC<{ task: Task; signedIn: boolean; pricePerMinuteCents: number; agentPrompt: string }> = ({ task, signedIn, pricePerMinuteCents, agentPrompt }) => (
  <Layout title={task.title} page={task.key} signedIn={signedIn} meta={{ jsonLd: taskLd(task, pricePerMinuteCents) }}>
    <main>
      <h1>{task.title}</h1>
      {task.answer(`${dollars(pricePerMinuteCents)}/min`).map((p) => <p>{p}</p>)}

      <h2>How the call works</h2>
      {task.steps && (
        <ol class="steps">
          {task.steps.map((s) => <li>{s}</li>)}
        </ol>
      )}
      {task.how.map((p) => <p>{p}</p>)}

      {task.guide && <div class="post">{raw(renderMarkdown(task.guide))}</div>}

      {task.others && (
        <>
          <h2>{task.others.heading}</h2>
          <ul>
            {task.others.items.map((o) => (
              <li>
                <a href={o.url}>{o.name}</a>: {o.fact}
              </li>
            ))}
          </ul>
          <p>
            {task.others.after} more apps that call for you, compared from their own pages, are in{' '}
            <a href="/blog/ai-apps-that-make-calls-for-you">AI apps that make phone calls for you</a>.
          </p>
        </>
      )}

      {task.examples.length > 0 && (
        <>
          <h2>Real calls call4me made</h2>
          <p>recorded calls, each with what was asked, what happened and a transcript:</p>
          <ul>
            {task.examples.map((e) => (
              <li>
                <a href={`/examples#${e.slug}`}>{e.title}</a> ({e.business}): {e.outcome}
              </li>
            ))}
          </ul>
        </>
      )}

      {task.holds.length > 0 && (
        <>
          <h2>{task.holdHeading}</h2>
          <p class="small">Time is minutes:seconds from the start of the published recording to the first live person, so it includes the phone menu and the queue.</p>
          <table class="rows stats">
            <thead>
              <tr><th>Company</th><th class="n">Time to a person</th><th>What got us through</th></tr>
            </thead>
            <tbody>
              {task.holds.map((r) => (
                <tr>
                  <td><a href={`/blog/${r.slug}`}>{r.company}</a></td>
                  <td class="n" data-label="Time to a person">{r.timeToHuman ?? 'not stated'}</td>
                  <td data-label="What got us through">{r.path}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            every company we timed, with the transcript line behind each time, is on <a href={HOLD_PATH}>customer service hold times by company</a>.
          </p>
        </>
      )}

      <h2>The recordings behind this page</h2>
      <ul>
        {task.posts.map((p) => (
          <li>
            <a href={`/blog/${p.slug}`}>{p.label}</a>: {p.fact}
          </li>
        ))}
      </ul>
      <h2>Other calls it makes for you</h2>
      <ul>
        {TASKS.filter((t) => t.key !== task.key).map((t) => (
          <li><a href={PAGES[t.key].path}>{t.title}</a></li>
        ))}
      </ul>
      <p>
        everything else the <a href="/ai-call-assistant">AI call assistant</a> does on a call, from voices to the free US number, is on its own page.
        {!task.guide && <> if you keep putting calls off because they make you anxious, our guide to <a href="/phone-anxiety">phone anxiety</a> covers which calls
        are worth practicing and which are fine to hand off.</>}
      </p>

      <h2>How to start</h2>
      <ol class="steps">
        <li><a href="/#buy">load credits</a>, from {dollars(MIN_TOPUP_CENTS)}. no account needed first; sign in afterwards with the email you paid with.</li>
        <li>paste the setup prompt below into your assistant. the <a href="/mcp">install page</a> has the steps for Claude Code, Codex, Claude Desktop, claude.ai, ChatGPT and other apps.</li>
        <li>ask for the call in plain words, and it asks you for anything missing before it dials.</li>
      </ol>
      <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} />
    </main>
  </Layout>
);
