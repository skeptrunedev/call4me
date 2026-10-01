import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { SAMPLE_LINE, VOICE_SAMPLES } from '../../content/voices';
import { CopyBlock, Layout } from './layout';

/** Keep one sample audible at a time, including playback from native controls. */
const AUDIO_SCRIPT = `document.addEventListener('play', function (event) {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('.example audio').forEach(function (audio) {
    if (audio !== event.target) audio.pause();
  });
}, true);`;

export const VoicesPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="caller voices" page="voices" signedIn={signedIn}>
    <main class="examples">
      <h1>hear every caller voice</h1>
      <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
      <p>each sample is the same line, recorded at phone quality, so you hear what the business hears.</p>
      <p><b>the line:</b> "{SAMPLE_LINE}"</p>
      {VOICE_SAMPLES.map((s) => (
        <article class="example" id={s.voice} aria-labelledby={`${s.voice}-title`}>
          <h2 id={`${s.voice}-title`}>{s.voice}{s.isDefault && <span class="small"> (default)</span>}</h2>
          <audio controls preload="metadata" aria-label={`listen: the ${s.voice} voice`} src={s.audio}>
            <a href={s.audio}>listen to {s.voice}</a>
          </audio>
        </article>
      ))}
      <h2>pick a voice</h2>
      <p>tell your agent which voice to use when it places the call ("use the gleam voice"). it passes it to the call tool:</p>
      <pre>{`call4me_place_call({ ..., voice: "gleam" })`}</pre>
      <p>no voice means {VOICE_SAMPLES.find((s) => s.isDefault)!.voice}. every voice introduces itself as your assistant; none uses a name of its own.</p>
      <p><a href="/blog/openai-realtime-voices-phone-calls">why the voices work this way</a> · <a href="/examples">listen to real calls</a> · <a href="/mcp">install mcp</a></p>
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
  </Layout>
);
