import type { FC } from 'hono/jsx';
import { COMPANIES, INDUSTRIES } from '../../content/companies';
import { SITE } from '../lib/pages';
import { CopyBlock, Layout } from './layout';

const DATA_POST = '/blog/how-long-to-reach-a-human';

/** "how long to a person" for one company, in the words the call post would use. */
const timeLabel = (c: (typeof COMPANIES)[number]) =>
  c.timeToHuman ? c.timeToHuman : c.reached ? 'reached, time not stated' : `no person on ${c.calls === 1 ? 'our call' : `${c.calls} calls`}`;

const aiLabel = (ai: boolean | null) => (ai === null ? 'not stated' : ai ? 'yes' : 'no');

/** Every company with a published recorded call, by industry: the hub that links each call post. */
export const CompaniesPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout
    title="customer service numbers we called"
    page="companies"
    signedIn={signedIn}
    meta={{
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Customer service numbers call4me called and recorded',
        itemListElement: COMPANIES.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, url: `${SITE}/blog/${c.slug}` })),
      },
    }}
  >
    <main>
      <h1>customer service numbers we called</h1>
      <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
      <p>
        every company here has a post with a real recorded call to its customer service line: the phone tree, what got us to a person, the full
        recording and transcript. times are from the start of the published recording to the first live person, on one call (or the call that got
        through). <a href={DATA_POST}>how long it takes to reach a human</a> compares them all, and the{' '}
        <a href="/static/blog/how-long-to-reach-a-human.csv">raw data is a csv</a>.
      </p>
      {INDUSTRIES.map((industry) => (
        <section aria-labelledby={`industry-${industry.replace(/\W+/g, '-')}`}>
          <h2 id={`industry-${industry.replace(/\W+/g, '-')}`}>{industry}</h2>
          <table class="rows stats">
            <thead>
              <tr>
                <th>company</th>
                <th>number we called</th>
                <th class="n">time to a person</th>
                <th>ai answered first</th>
                <th>called</th>
              </tr>
            </thead>
            <tbody>
              {COMPANIES.filter((c) => c.industry === industry).map((c) => (
                <tr>
                  <td><a href={`/blog/${c.slug}`}>{c.name}</a></td>
                  <td>{c.number ?? 'not published'}</td>
                  <td class="n">{timeLabel(c)}</td>
                  <td>{aiLabel(c.aiFirst)}</td>
                  <td>{c.called}{c.calls > 1 ? ` (${c.calls} calls)` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <h2>have your agent make the call</h2>
      <p>
        call4me is a phone for your AI agent. tell claude code, codex or chatgpt what you need from a company and it calls, gets through the menu,
        waits on hold and brings back the answer. <a href="/mcp">install it</a> · <a href="/examples">listen to more calls</a>
      </p>
    </main>
  </Layout>
);
