import type { FC } from 'hono/jsx';
import { HOLD_DATA_PATH, HOLD_KEYWORDS, HOLD_LICENSE, HOLD_PATH, HOLD_SOURCE_POST, HOLD_TIMES, HOLD_UPDATED, holdSummary } from '../../content/hold-times';
import { SITE } from '../lib/pages';
import { Layout } from './layout';

const url = `${SITE}${HOLD_PATH}`;
const summary = holdSummary();
const description = `Customer service hold times at ${summary.companies} companies, timed on real recorded calls. Longest: ${summary.longest.company} at ${summary.longest.timeToHuman}. Free CSV and JSON.`;
const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const measured = HOLD_TIMES.filter(r => r.status === 'measured');
const unranked = HOLD_TIMES.filter(r => r.status !== 'measured');
const topThreeAi = measured.slice(0, 3).every(r => r.firstAnswer === 'AI or virtual assistant');

export const HoldTimesPage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="Customer service hold times by company, measured" page="holdTimes" signedIn={signedIn}
    meta={{ description, jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': url, url, name: 'Customer service hold times by company, measured', description, datePublished: HOLD_UPDATED, dateModified: HOLD_UPDATED,
          mainEntity: { '@id': `${url}#dataset` }, author: { '@type': 'Person', name: 'Nicholas Khami', url: 'https://x.com/skeptrune' } },
        { '@type': 'Dataset', '@id': `${url}#dataset`, name: 'Customer service hold times by company', url, description,
          creator: { '@type': 'Organization', name: 'call4me', url: SITE }, license: HOLD_LICENSE, version: HOLD_UPDATED,
          datePublished: HOLD_UPDATED, dateModified: HOLD_UPDATED, keywords: HOLD_KEYWORDS, isAccessibleForFree: true,
          temporalCoverage: `${summary.firstCall}/${summary.lastCall}`,
          variableMeasured: ['Company', 'Industry', 'Time to a live person', 'What answered first', 'Number called', 'Call date', 'Calls placed', 'What got us through', 'Transcript evidence', 'Source URL'],
          measurementTechnique: 'Recorded outbound calls placed by the call4me AI phone agent. Time is read from the timestamped transcript, from the start of the published recording to the first live person.',
          isBasedOn: `${SITE}/blog/${HOLD_SOURCE_POST}`,
          distribution: ['csv', 'json'].map(format => ({ '@type': 'DataDownload', contentUrl: `${SITE}${HOLD_DATA_PATH}.${format}`, encodingFormat: format === 'csv' ? 'text/csv' : 'application/json' })),
        },
        { '@type': 'ItemList', name: 'Customer service hold times by company, longest first', itemListOrder: 'https://schema.org/ItemListOrderDescending',
          numberOfItems: measured.length, itemListElement: measured.map(r => ({ '@type': 'ListItem', position: r.rank, name: `${r.company}: ${r.timeToHuman}`, url: `${url}#evidence-${r.id}` })),
        },
      ],
    } }}>
    <main>
      <h1>Customer service hold times by company, measured</h1>
      <p class="small">Last updated <time datetime={HOLD_UPDATED}>{longDate(HOLD_UPDATED)}</time>. {summary.companies} companies, calls placed {longDate(summary.firstCall)} to {longDate(summary.lastCall)}.</p>

      <p>
        <strong>The longest hold we measured was {summary.longest.company}, at {summary.longest.timeToHuman}</strong> before a live person answered.
        The shortest was <strong>{summary.shortest.company}, at {summary.shortest.timeToHuman}</strong>.
        Across the {summary.measured} companies we timed, the median was <strong>{summary.median}</strong>.
        {' '}{summary.overFive} took more than 5 minutes and {summary.underTwo} took under 2.
      </p>
      <p>
        <strong>An AI or virtual assistant answered first at {summary.aiFirst} of {summary.companies} companies.</strong> Where one did, the median time to a person was {summary.aiMedian} ({summary.aiMeasured} companies).
        Where a phone menu answered, it was {summary.menuMedian} ({summary.menuMeasured} companies).{topThreeAi && ' The three longest holds all started with an AI assistant.'}
        {' '}No call we placed reached a person at {summary.neverReached.map(r => r.company).join(' or ')}.
      </p>
      <p>
        Every time below comes from a real call placed by call4me's AI phone agent, recorded and published on our blog with the full transcript.
        Each company below links to the transcript line where the first person speaks, and to the post with the recording.
      </p>

      <h2 id="ranking">Hold times by company, longest first</h2>
      <p class="small">Time is minutes:seconds from the start of the published recording to the first live person, so it includes the phone menu and the queue.</p>
      <table class="rows stats">
        <thead>
          <tr><th class="n">Rank</th><th>Company</th><th class="n">Time to a person</th><th>Answered first</th><th>Called</th><th>What got us through</th></tr>
        </thead>
        <tbody>
          {measured.map(r => (
            <tr id={r.id}>
              <td class="n" data-label="Rank">{r.rank}</td>
              <td><a href={`#evidence-${r.id}`}>{r.company}</a></td>
              <td class="n" data-label="Time to a person">{r.timeToHuman}</td>
              <td data-label="Answered first">{r.firstAnswer}</td>
              <td data-label="Called">{shortDate(r.called)}{r.calls > 1 ? ` (${r.calls} calls)` : ''}</td>
              <td data-label="What got us through">{r.path}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="not-ranked">Companies we called but could not time</h2>
      <table class="rows stats">
        <thead>
          <tr><th>Company</th><th>Result</th><th>Answered first</th><th>Called</th><th>What we tried</th></tr>
        </thead>
        <tbody>
          {unranked.map(r => (
            <tr id={r.id}>
              <td><a href={`#evidence-${r.id}`}>{r.company}</a></td>
              <td data-label="Result">{r.status === 'not measured' ? 'Reached a person; the post does not say when' : `Never reached a person (${r.calls} ${r.calls === 1 ? 'call' : 'calls'})`}</td>
              <td data-label="Answered first">{r.firstAnswer}</td>
              <td data-label="Called">{shortDate(r.called)}</td>
              <td data-label="What we tried">{r.path}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p class="small">FedEx's agent only came on when FedEx called us back, after we gave a tracking number. That callback is not a hold on FedEx's line, so it is not ranked.</p>

      <h2 id="evidence">The recorded line behind each time</h2>
      <p>For each company: the number we dialed, and the line in the published transcript where the first live person speaks, quoted as it appears in the post. Where no time was measured, the sentence from the post that says so.</p>
      <ul>
        {HOLD_TIMES.map(r => (
          <li id={`evidence-${r.id}`}>
            <strong>{r.company}{r.timeToHuman ? `, ${r.timeToHuman}` : ''}</strong>, called {r.number ? `${r.number} ` : ''}on {longDate(r.called)}{r.number ? '' : ' (the post does not state the number)'}.
            {' '}"{r.evidence}" <a href={`/blog/${r.slug}`}>Recording and transcript</a>
          </li>
        ))}
      </ul>

      <h2 id="methodology">Methodology</h2>
      <ul>
        <li><strong>Who called:</strong> call4me, an AI phone agent, placed every call between {longDate(summary.firstCall)} and {longDate(summary.lastCall)}. Most were our own general questions with no account. A few were call4me users' own errands or our own accounts, as each post says.</li>
        <li><strong>What the time measures:</strong> minutes and seconds from the start of the published recording to the first moment a live person speaks, read from the timestamped transcript in each post. It covers the phone menu and the hold. Some recordings shorten long silences, so on those the real wait was slightly longer.</li>
        <li><strong>Which call counts:</strong> one row per company. Where we called a company more than once, the time is from the first call that reached a person, and the table shows how many calls we placed.</li>
        <li><strong>What answered first:</strong> "AI or virtual assistant" when the post calls what answered an AI, virtual, voice or automated assistant. A speech or keypad menu counts as a phone menu.</li>
        <li><strong>What this is not:</strong> a ranking of service quality, or of typical wait times. Each company was called on a single day, mostly once, at whatever time we happened to call. A fast pickup says nothing about whether the person could help, and several fast answers were sales teams.</li>
      </ul>
      <p>
        The per-call data, including second and third calls, phone tree details and the gym clubs we left out here, is in <a href={`/blog/${HOLD_SOURCE_POST}`}>how long it takes to reach a human</a>.
        Every company's number, grouped by industry, is on the <a href="/companies">customer service numbers page</a>.
      </p>

      <h2 id="dataset">Download the hold time dataset</h2>
      <p>Every row above, with the transcript line behind each time and a link to its source post. No signup required.</p>
      <p><a href={`${HOLD_DATA_PATH}.csv`} download>Download CSV</a> / <a href={`${HOLD_DATA_PATH}.json`} download>Download JSON</a></p>
      <p class="small">
        <strong>Reuse:</strong> available under <a href={HOLD_LICENSE}>CC BY 4.0</a>. <strong>Cite:</strong> call4me. Customer service hold times by company, measured. Version {HOLD_UPDATED}. <a href={HOLD_PATH}>{url}</a>.
        {' '}For a correction, email <a href="mailto:me@call4.me?subject=Customer%20service%20hold%20times">me@call4.me</a>.
      </p>

      <h2 id="skip-the-hold">Skip the hold</h2>
      <p>
        call4me is a phone for your AI agent. Tell Claude Code, Codex or ChatGPT what you need from a company and it calls, gets through the menu,
        waits on hold and brings back the answer, or rings you when a person picks up: <a href="/hold-for-me">an AI that waits on hold for you</a>.
        {' '}<a href="/mcp">Install it</a> / <a href="/examples">listen to more calls</a>
      </p>
    </main>
  </Layout>
);
