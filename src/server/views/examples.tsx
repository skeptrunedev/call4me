import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { EXAMPLES } from '../../content/examples';
import { Layout } from './layout';

/** Keep one conversation audible at a time, including playback from native controls. */
const AUDIO_SCRIPT = `document.addEventListener('play', function (event) {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('.example audio').forEach(function (audio) {
    if (audio !== event.target) audio.pause();
  });
}, true);`;

export const ExamplesPage: FC<{ signedIn: boolean }> = ({ signedIn }) => (
  <Layout title="examples" page="examples" signedIn={signedIn}>
    <main class="examples">
      <h1>listen to real calls</h1>
      <p>hear the agent talk to a business, ask questions, and get an answer before you buy.</p>
      <p class="small">these are excerpts from real calls, using the original voices at normal speed. phone menus, holds, and personal details have been cut. transcripts follow the edited audio, with brief overlapping acknowledgments omitted.</p>
      <p class="small">jump to: {EXAMPLES.map((example, i) => <>{i > 0 && ' · '}<a href={`#${example.slug}`}>{example.title}</a></>)}</p>
      {EXAMPLES.map((example) => (
        <article class="example" id={example.slug} aria-labelledby={`${example.slug}-title`}>
          <h2 id={`${example.slug}-title`}>{example.title}</h2>
          <p class="small">{example.business} · {example.date} · {example.duration} excerpt</p>
          <p><b>the request:</b> {example.request}</p>
          <p><b>what happened:</b> {example.outcome}</p>
          <audio controls preload="metadata" aria-label={`listen: ${example.title}`} src={example.audio}>
            <a href={example.audio}>listen to the recording</a>
          </audio>
          <p class="small"><a href={example.audio}>open audio</a></p>
          <details>
            <summary>read the transcript</summary>
            <div class="example-transcript">
              {example.transcript.map((turn) => <p><b>{turn.speaker}:</b> {turn.text}</p>)}
            </div>
          </details>
        </article>
      ))}
      <h2>let your agent make the next call</h2>
      <p><a href="/#buy">add credits</a> · <a href="/mcp">see how to install it</a></p>
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
  </Layout>
);
