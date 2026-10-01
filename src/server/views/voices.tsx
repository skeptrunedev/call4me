import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { SAMPLE_LANGUAGES, sampleAudio, VOICE_SAMPLES } from '../../content/voices';
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
      <p>each sample is the same line, recorded at phone quality, so you hear what the business hears. every voice speaks the five most spoken languages: {SAMPLE_LANGUAGES.map((l) => l.name.toLowerCase()).join(', ')}.</p>
      <details>
        <summary>read the line in each language</summary>
        {SAMPLE_LANGUAGES.map((l) => (
          <p><b>{l.name.toLowerCase()}:</b> <span lang={l.code}>"{l.line}"</span>{l.code !== 'en' && <span class="small"> ({l.english})</span>}</p>
        ))}
      </details>
      {VOICE_SAMPLES.map((s) => (
        <article class="example" id={s.voice} aria-labelledby={`${s.voice}-title`}>
          <h2 id={`${s.voice}-title`}>{s.voice}{s.isDefault && <span class="small"> (default)</span>}</h2>
          {SAMPLE_LANGUAGES.map((l) => (
            <>
              <p class="small">{l.name.toLowerCase()}</p>
              <audio controls preload="none" aria-label={`listen: ${s.voice} in ${l.name}`} src={sampleAudio(s.voice, l.code)}>
                <a href={sampleAudio(s.voice, l.code)}>listen to {s.voice} in {l.name}</a>
              </audio>
            </>
          ))}
        </article>
      ))}
      <h2>calls in other languages</h2>
      <p>tell your agent which language to start in ("speak french first"). on real calls to montreal businesses, the caller held the whole call in french, and when one business answered in french without being asked, the caller replied in french on its own.</p>
      <h2>pick a voice</h2>
      <p>tell your agent which voice to use when it places the call ("use the gleam voice"). it passes it to the call tool:</p>
      <pre>{`call4me_place_call({ ..., voice: "gleam" })`}</pre>
      <p>no voice means {VOICE_SAMPLES.find((s) => s.isDefault)!.voice}. every voice introduces itself by first name as your assistant ("hi, I'm Sam, Alex's assistant"). Sam is the default; set assistant_name in your profile to change it.</p>
      <p><a href="/blog/openai-realtime-voices-phone-calls">why the voices work this way</a> · <a href="/examples">listen to real calls</a> · <a href="/mcp">install mcp</a></p>
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
  </Layout>
);
