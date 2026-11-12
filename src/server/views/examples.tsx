import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { EXAMPLES, type CallExample } from '../../content/examples';
import { PAGES, SITE } from '../lib/pages';
import { ref } from '../lib/entity';
import { CopyBlock, Layout } from './layout';

/** "4 minutes 10 seconds" -> "PT4M10S" (ISO 8601). */
const isoDuration = (duration: string) => {
  const minutes = /(\d+) minutes?/.exec(duration)?.[1];
  const seconds = /(\d+) seconds?/.exec(duration)?.[1];
  if (!minutes && !seconds) throw new Error(`example duration "${duration}" has no minutes or seconds`);
  return `PT${minutes ? `${minutes}M` : ''}${seconds ? `${seconds}S` : ''}`;
};

/** "October 10, 2026" -> "2026-10-10". */
const isoDate = (date: string) => {
  const parsed = new Date(`${date} 12:00 UTC`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`example date "${date}" does not parse`);
  return parsed.toISOString().slice(0, 10);
};

const url = `${SITE}${PAGES.examples.path}`;
const recorded = EXAMPLES.filter((e): e is CallExample & { audio: string } => e.audio !== null);

/** Every recorded call as audio, with what was asked and what happened (schema.org). */
const EXAMPLES_LD = [
  { '@id': url, '@type': 'CollectionPage', mainEntity: ref(`${url}#calls`) },
  {
    '@type': 'ItemList',
    '@id': `${url}#calls`,
    name: 'Real phone calls made by call4me, recorded',
    numberOfItems: recorded.length,
    itemListElement: recorded.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'AudioObject',
        '@id': `${url}#${e.slug}`,
        url: `${url}#${e.slug}`,
        name: e.title,
        description: `${e.business}: ${e.outcome}`,
        contentUrl: `${SITE}${e.audio}`,
        encodingFormat: 'audio/mpeg',
        duration: isoDuration(e.duration),
        uploadDate: isoDate(e.date),
      },
    })),
  },
];

/** Keep one conversation audible at a time, including playback from native controls. */
const AUDIO_SCRIPT = `document.addEventListener('play', function (event) {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('.example audio').forEach(function (audio) {
    if (audio !== event.target) audio.pause();
  });
}, true);
document.addEventListener('click', function (event) {
  var link = event.target instanceof Element && event.target.closest('a.example-highlight');
  if (!link) return;
  var audio = link.closest('.example').querySelector('audio');
  if (!audio) return;
  event.preventDefault();
  audio.currentTime = Number(link.dataset.t);
  audio.play().catch(function (error) {
    if (error.name !== 'AbortError') throw error;
  });
  audio.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});`;

export const ExamplesPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="examples" page="examples" signedIn={signedIn} meta={{ jsonLd: EXAMPLES_LD }}>
    <main class="examples">
      <h1>listen to real calls</h1>
      <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
      <p>hear the agent call businesses and personal contacts, ask questions, and get an answer before you buy. one callback is available as a saved transcript only.</p>
      <form class="inline-form" data-collection-search="examples" hidden>
        <input type="search" name="q" aria-label="search examples" aria-controls="examples-search-results" placeholder="search examples" maxlength={100} /> <button type="submit">search</button> <button type="button" data-search-clear hidden>clear</button>
      </form>
      <p id="examples-search-status" class="small muted" role="status" aria-live="polite" hidden></p>
      <div id="examples-search-results">
      {EXAMPLES.map((example) => (
        <article class="example" id={example.slug} aria-labelledby={`${example.slug}-title`}>
          <h2 id={`${example.slug}-title`}>{example.title}</h2>
          <p class="small">{example.business} / {example.date} / {example.duration}</p>
          <p><b>the request:</b> {example.request}</p>
          <p><b>what happened:</b> {example.outcome}</p>
          {example.guide && <p><a href={example.guide.href}>{example.guide.label}</a></p>}
          {example.audio ? <audio controls preload="none" aria-label={`listen: ${example.title}`} src={example.audio}>
            <a href={example.audio}>listen to the recording</a>
          </audio> : <p class="small">no recording is available for this call. the transcript below is saved call text with private details removed, rather than an audio verified transcript.</p>}
          {example.audio && example.highlight && <p class="small"><a class="example-highlight" href={`${example.audio}#t=${example.highlight.seconds}`} data-t={example.highlight.seconds}>{example.highlight.label}</a></p>}
          <details>
            <summary>read the transcript</summary>
            <div class="example-transcript">
              {example.transcript.map((line) => 'cut' in line
                ? <p class="example-cut"><span aria-hidden="true">[…]</span> <i>cut from the audio: {line.cut}</i></p>
                : 'note' in line
                  ? <p class="example-cut"><i>{line.note}</i></p>
                  : <p><b>{line.speaker}:</b> {line.text}</p>)}
            </div>
          </details>
        </article>
      ))}
      </div>
      <h2>let your agent make the next call</h2>
      <p><a href="/#buy">add credits</a> / <a href="/mcp">see how to install it</a> / <a href="/voices">hear every caller voice</a></p>
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
    <script src="/static/collection-search.js" defer></script>
  </Layout>
);
