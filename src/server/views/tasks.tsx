import type { FC } from 'hono/jsx';
import { dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { PAGES, SITE } from '../lib/pages';
import { ORG_ID } from '../lib/entity';
import { HOLD_PATH } from '../../content/hold-times';
import type { Task } from '../../content/tasks';
import { CopyBlock, Layout } from './layout';
import { assistantApp } from './ai-call-assistant';

/** The page, citing the posts it is built on, and the call4me app with its live price (schema.org). */
const taskLd = (task: Task, pricePerMinuteCents: number) => {
  const url = `${SITE}${PAGES[task.key].path}`;
  const app = assistantApp(pricePerMinuteCents);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: task.title, description: PAGES[task.key].description, publisher: { '@id': ORG_ID },
        about: { '@id': app['@id'] }, citation: task.posts.map((p) => `${SITE}/blog/${p.slug}`) },
      app,
    ],
  };
};

/** A page answering one "AI that calls X for me" question: what call4me does, then the recorded calls that show it. */
export const TaskPage: FC<{ task: Task; signedIn: boolean; pricePerMinuteCents: number; agentPrompt: string }> = ({ task, signedIn, pricePerMinuteCents, agentPrompt }) => (
  <Layout title={task.title} page={task.key} signedIn={signedIn} meta={{ jsonLd: taskLd(task, pricePerMinuteCents) }}>
    <main>
      <h1>{task.title}</h1>
      {task.answer(`${dollars(pricePerMinuteCents)}/min`).map((p) => <p>{p}</p>)}

      <h2>How the call works</h2>
      {task.how.map((p) => <p>{p}</p>)}

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
      <p>
        everything else the <a href="/ai-call-assistant">AI call assistant</a> does on a call, from voices to the free US number, is on its own page.
        if you keep putting calls off because they make you anxious, our guide to <a href="/blog/phone-anxiety">phone anxiety</a> covers which calls
        are worth practicing and which are fine to hand off.
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
