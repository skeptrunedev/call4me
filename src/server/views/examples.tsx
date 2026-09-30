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
      <p class="small">original recordings at normal speed, including greetings, phone menus, questions, and holds. private details are replaced with silence and marked in brackets in the transcript. the Amazon recording ends after the goodbye, before a repeating feedback survey. transcripts omit brief overlapping acknowledgments.</p>
      <p class="small">jump to: {EXAMPLES.map((example, i) => <>{i > 0 && ' · '}<a href={`#${example.slug}`}>{example.title}</a></>)}</p>
      {EXAMPLES.map((example) => (
        <article class="example" id={example.slug} aria-labelledby={`${example.slug}-title`}>
          <h2 id={`${example.slug}-title`}>{example.title}</h2>
          <p class="small">{example.business} · {example.date} · {example.duration}</p>
          <p><b>the request:</b> {example.request}</p>
          <p><b>what happened:</b> {example.outcome}</p>
          <audio controls preload="metadata" aria-label={`listen: ${example.title}`} src={example.audio}>
            <a href={example.audio}>listen to the recording</a>
          </audio>
          <p class="small"><a href={example.audio}>open audio</a></p>
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
      <h2>let your agent make the next call</h2>
      <p><a href="/#buy">add credits</a> · <a href="/mcp">see how to install it</a></p>
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
  </Layout>
);
