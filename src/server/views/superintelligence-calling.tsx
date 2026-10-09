import type { FC } from 'hono/jsx';
import { EVIDENCE_LABELS, SI_CALLING, SI_DATA_PATH, SI_KEYWORDS, SI_LICENSE, SI_PATH, SI_SCENARIOS, SI_UPDATED } from '../../content/superintelligence-calling';
import { SITE } from '../lib/pages';
import { Layout } from './layout';

const url = `${SITE}${SI_PATH}`;
const description = 'Compare personal superintelligence phone calling tools: Muse, Grok Bot, Instinct and Pine. Recorded calls, source evidence and a free CSV and JSON dataset.';

export const SuperintelligenceCallingPage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="Superintelligence Calling Index: Tools & Evidence" page="superintelligenceCalling" signedIn={signedIn}
    meta={{ description, jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': url, url, name: 'Superintelligence Calling Index', description, datePublished: SI_UPDATED, dateModified: SI_UPDATED,
          mainEntity: { '@id': `${url}#dataset` }, author: { '@type': 'Person', name: 'Nicholas Khami', url: 'https://x.com/skeptrune' } },
        { '@type': 'Dataset', '@id': `${url}#dataset`, name: 'Superintelligence Calling Index', url, description,
          creator: { '@type': 'Organization', name: 'call4me', url: SITE }, license: SI_LICENSE, version: SI_UPDATED,
          datePublished: SI_UPDATED, dateModified: SI_UPDATED, keywords: SI_KEYWORDS, isAccessibleForFree: true,
          temporalCoverage: '2026-09-16/2026-10-09',
          variableMeasured: ['Assistant', 'Calling configuration', 'Connection route', 'Evidence type', 'Evidence date', 'Verification date', 'Finding', 'Limitation', 'Availability', 'Source URLs'],
          measurementTechnique: 'Review of linked public documentation, maker announcements and previously recorded workflows. Not a controlled performance benchmark.',
          distribution: ['csv', 'json'].map(format => ({ '@type': 'DataDownload', contentUrl: `${SITE}${SI_DATA_PATH}.${format}`, encodingFormat: format === 'csv' ? 'text/csv' : 'application/json' })),
        },
        { '@type': 'ItemList', name: 'Personal superintelligence phone calling configurations', itemListOrder: 'https://schema.org/ItemListUnordered',
          numberOfItems: SI_CALLING.length, itemListElement: SI_CALLING.map(r => ({ '@type': 'ListItem', name: r.configuration, url: `${url}#${r.id}` })),
        },
      ],
    } }}>
    <main class="si-index">
      <header class="si-hero">
        <p class="si-eyebrow">Superintelligence Calling Index / <time datetime={SI_UPDATED}>October 9, 2026</time></p>
        <h1>Can your superintelligence<br class="si-desktop-break" /> make a phone call?</h1>
        <p class="si-dek">Compare phone calling options for personal superintelligence, from recorded workflows to announced services. See the connection, the evidence, and what the call actually established.</p>
        <div class="si-actions"><a class="si-primary" href="#comparison">Compare calling tools ↓</a><a href="#dataset">Download the dataset</a><a href="#recordings">Hear the calls</a></div>
        <dl class="si-stats">
          <div><dt>Personal assistants</dt><dd>{new Set(SI_CALLING.map(r => r.assistant)).size}</dd></div>
          <div><dt>Calling configurations</dt><dd>{SI_CALLING.length}</dd></div>
          <div><dt>Recorded workflows</dt><dd>{SI_CALLING.filter(r => r.evidence === 'recorded').length}</dd></div>
        </dl>
      </header>

      <section class="si-intro" aria-labelledby="si-scope">
        <h2 id="si-scope">Personal superintelligence meets the phone.</h2>
        <p>A restaurant has no online booking. A store cannot confirm stock on its website. A question needs a person. Phone calling gives a personal assistant a way to continue the task.</p>
        <p><a href="https://www.meta.com/superintelligence/">Meta uses personal superintelligence</a> to describe its vision for assistants that help people achieve their goals. Here, that phrase frames a practical question about today’s personal assistants. Inclusion does not certify that a product has achieved artificial superintelligence.</p>
        <p class="small">Published by <a href="https://x.com/skeptrune">Nicholas Khami</a> at call4me. We build one of the calling tools in this index. Every row identifies its evidence and limitations.</p>
      </section>

      <section id="comparison" aria-labelledby="si-comparison-title">
        <h2 id="si-comparison-title">Superintelligence calling tools, compared</h2>
        <p class="si-measure">A voice conversation with an assistant does not establish that it can call a business. These entries concern outbound phone calls. They are ordered by assistant name, with each calling configuration kept separate.</p>
        <form class="si-filters" data-si-filters hidden role="search" aria-label="Filter calling evidence">
          <div><label for="si-search">Find an assistant or calling task</label><input id="si-search" type="search" placeholder="Try Muse, booking or hold" autocomplete="off" /></div>
          <div><label for="si-evidence">Evidence</label><select id="si-evidence"><option value="all">All evidence</option>{Object.entries(EVIDENCE_LABELS).map(([value, label]) => <option value={value}>{label}</option>)}</select></div>
          <button type="reset">Clear filters</button>
        </form>
        <p class="small" id="si-count" role="status" aria-live="polite">Showing {SI_CALLING.length} calling configurations.</p>
        <p class="small si-scroll-hint">On a small screen, scroll the comparison sideways. Open “Evidence and limits” for sources.</p>
        <div class="si-table-wrap" role="region" aria-label="Superintelligence calling comparison" tabindex={0}>
          <table class="si-table">
            <caption class="si-visually-hidden">Personal superintelligence phone calling evidence, checked October 9, 2026</caption>
            <thead><tr><th scope="col">Assistant and setup</th><th scope="col">Phone connection</th><th scope="col">Evidence</th><th scope="col">What we know</th></tr></thead>
            <tbody>{SI_CALLING.map(r => (
              <tr id={r.id} data-si-row data-evidence={r.evidence}>
                <th scope="row"><a href={`#${r.id}`}>{r.configuration}</a>{r.guide && <a class="si-setup" href={r.guide}>Connection guide ↗</a>}</th>
                <td>{r.route === 'integration' ? 'Through call4me' : 'Inside the product'}<span class="si-cell-note">{r.connection}</span></td>
                <td><span class={`si-badge si-badge-${r.evidence}`}>{EVIDENCE_LABELS[r.evidence]}</span><span class="si-cell-note">{r.evidenceDate ? `Evidence: ${r.evidenceDate}` : 'Publication date not stated'}</span></td>
                <td><p>{r.finding}</p><details><summary>Evidence and limits</summary><p><strong>Limit:</strong> {r.limitation}</p><p><strong>Access:</strong> {r.availability}</p><ul class="si-sources">{r.sources.map(s => <li><a href={s.url}>{s.label} ↗</a></li>)}</ul><p class="small">Source checked: <time datetime={r.checked}>{r.checked}</time></p></details></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p id="si-empty" class="box" hidden>No calling configurations match those filters. Clear the search or choose another evidence type.</p>
        <p class="small">Recorded workflow = a published call we ran. Vendor documented = an official product description. Maker announcement = a dated rollout statement. None is a comparable success score.</p>
      </section>

      <section id="recordings" aria-labelledby="si-recordings-title">
        <h2 id="si-recordings-title">Hear personal superintelligence making phone calls</h2>
        <p class="si-measure">The two recorded workflows used call4me, with different questions and destinations. Listen for what was answered and what stayed unresolved.</p>
        <div class="si-recordings">{SI_CALLING.filter(r => r.recording).map(r => (
          <article class="si-recording" aria-labelledby={`recording-${r.id}`}><span class="si-eyebrow">{r.evidenceDate}</span><h3 id={`recording-${r.id}`}>{r.configuration}</h3><p>{r.finding}</p><audio controls preload="none" aria-label={`${r.configuration} recorded call`} src={r.recording}><a href={r.recording}>Listen to the recorded call</a></audio><p class="small">{r.limitation}</p><a href={r.sources[0]!.url}>Read the reviewed transcript ↗</a></article>
        ))}</div>
      </section>

      <section id="choosing" class="si-measure" aria-labelledby="si-choosing-title">
        <h2 id="si-choosing-title">Which superintelligence is best for phone calls?</h2>
        <p>The evidence here supports choosing a calling route, rather than naming an overall winner. Muse and Grok Bot both used call4me in published workflows. Instinct and Muse have announced calling within their products, and Pine publishes a dedicated phone service.</p>
        <p>If your task already lives in Muse or Grok Bot, the linked connection guides show the route we tested. If you want calling inside Instinct, Pine or the Muse beta, verify account access and destination support with that provider.</p>
        <p>A completed connection is only the beginning. Check whether the assistant returned the requested answer, stayed within your instructions and clearly reported anything it could not finish.</p>
      </section>

      <section id="test-kit" aria-labelledby="si-kit-title">
        <h2 id="si-kit-title">A test kit for superintelligence calling</h2>
        <p class="si-measure">These {SI_SCENARIOS.length} proposed scenarios are included in the JSON download. They are a starting protocol for future comparisons, with no executed runs or scores attached. The older recordings above were not runs of this protocol.</p>
        <div class="si-scenarios">{SI_SCENARIOS.map((s, i) => <details><summary><span class="si-scenario-number">{String(i + 1).padStart(2, '0')}</span>{s.name}</summary><p><strong>Brief:</strong> {s.brief}</p><p><strong>Successful behavior:</strong> {s.success}</p></details>)}</div>
        <p class="small si-measure">Use controlled test lines for repeatable evaluation. Real business calls should serve an actual authorized errand. Keep the brief, destination conditions and time limit comparable; disclose each configuration’s calling tool and record all attempts, human help, unresolved questions and the final outcome.</p>
      </section>

      <section id="dataset" class="si-dataset" aria-labelledby="si-dataset-title">
        <div><p class="si-eyebrow">Open data / version {SI_UPDATED}</p><h2 id="si-dataset-title">The superintelligence calling dataset</h2><p>Download every configuration, evidence label, finding, limitation and source URL. The JSON also includes the proposed calling scenarios. No signup required.</p></div>
        <div class="si-downloads"><a class="si-primary" href={`${SI_DATA_PATH}.csv`} download>Download CSV ↓</a><a class="si-primary si-secondary" href={`${SI_DATA_PATH}.json`} download>Download JSON ↓</a></div>
        <div class="si-dataset-notes"><p><strong>Reuse:</strong> Our original annotations and proposed scenarios are available under <a href={SI_LICENSE}>CC BY 4.0</a>. Linked recordings, source documents and third party content retain their own rights.</p><p><strong>Cite:</strong> call4me. Superintelligence Calling Index. Version {SI_UPDATED}. <a href={SI_PATH}>{url}</a></p><p><strong>Changes:</strong> October 9, 2026: initial release, covering {SI_CALLING.length} calling configurations and {SI_SCENARIOS.length} proposed scenarios.</p></div>
      </section>

      <section id="methodology" class="si-measure" aria-labelledby="si-method-title">
        <h2 id="si-method-title">How we check superintelligence calling evidence</h2>
        <p>We read official product documentation and dated maker announcements, and link to the reviewed transcripts for our executed calls. Each configuration has its own evidence date and source check date. A source check does not mean we repeated the call.</p>
        <p>We keep native calling separate from an added calling tool, and distinguish a documented capability from an observed result. Unknown access, automation details and regional coverage stay unknown. A vendor demo or example conversation does not become a test result.</p>
        <p>This first edition is a selected comparison, not a complete inventory. It does not rank intelligence, voice quality or reliability. A fair performance ranking would require matched tasks, repeated attempts and disclosed outcomes for every configuration.</p>
        <p>For a correction or proposed entry, send a public source and the specific calling configuration to <a href="mailto:me@call4.me?subject=Superintelligence%20Calling%20Index%20evidence">me@call4.me</a>. Please omit private account details and unpublished call recordings.</p>
      </section>
      <aside class="si-cta" aria-labelledby="si-connect-title"><h2 id="si-connect-title">Give your personal superintelligence a phone.</h2><p>Connect call4me to your assistant, give it a real errand, and get the answer back where you started.</p><a class="si-primary" href="/mcp">Connect your assistant ↗</a></aside>
    </main>
    <script src="/static/superintelligence-calling.js" defer />
  </Layout>
);
