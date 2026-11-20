import type { FC } from 'hono/jsx';
import { raw } from 'hono/html';
import { Layout } from './layout';

/**
 * The unlisted /angry-funny page: real calls where the other end got mad, suspicious or just done.
 * Its content holds real people's words and voices, so none of it lives in this public repository:
 * the sections are JSON at `angry-funny/content.json` and the reviewed clips are mp3s under
 * `angry-funny/clips/` in the private R2 bucket (PRIVATE_PAGES), uploaded with `wrangler r2 object put`.
 */

/** A line from the other side, verbatim from the saved transcript, with an English gloss when it isn't English. */
export type AngryQuote = string | { text: string; english: string };

export interface AngryCall {
  slug: string;
  title: string;
  who: string;
  date: string;
  setup: string;
  quotes: AngryQuote[];
  ending: string;
  /** Reviewed excerpts at /angry-funny/clips/<file>.mp3, in call order. Empty when no recording exists. */
  clips: string[];
}

export interface AngrySection {
  id: string;
  title: string;
  intro: string;
  calls: AngryCall[];
}

/** Keep one clip audible at a time, as on /examples. */
const AUDIO_SCRIPT = `document.addEventListener('play', function (event) {
  if (!(event.target instanceof HTMLAudioElement)) return;
  document.querySelectorAll('.angry audio').forEach(function (audio) {
    if (audio !== event.target) audio.pause();
  });
}, true);`;

const Call: FC<{ call: AngryCall }> = ({ call }) => (
  <article class="example" id={call.slug} aria-labelledby={`${call.slug}-title`}>
    <h3 id={`${call.slug}-title`}>{call.title}</h3>
    <p class="small">{call.who} / {call.date}</p>
    <p><b>the call:</b> {call.setup}</p>
    <div class="angry-quotes">
      {call.quotes.map((quote) => typeof quote === 'string'
        ? <p>“{quote}”</p>
        : <p>“{quote.text}” <span class="small">({quote.english})</span></p>)}
    </div>
    {call.clips.map((src, i) => (
      <audio controls preload="none" aria-label={`listen: ${call.title}${call.clips.length > 1 ? `, clip ${i + 1}` : ''}`} src={src}>
        <a href={src}>listen to the clip</a>
      </audio>
    ))}
    <p><b>how it ended:</b> {call.ending}</p>
  </article>
);

export const AngryFunnyPage: FC<{ signedIn: boolean; sections: AngrySection[] }> = ({ signedIn, sections }) => (
  <Layout title="people who were not having it" page="angryFunny" signedIn={signedIn}>
    <main class="examples angry">
      <h1>people who were not having it</h1>
      <p>{sections.reduce((n, s) => n + s.calls.length, 0)} real call4me calls where the other end got mad, suspicious, or just done. quotes are word for word from the saved transcripts, transcription quirks and all. clips are short excerpts of the recordings, with phone numbers muted.</p>
      <p class="small">unlisted: nothing links here and search engines are asked to skip it.</p>
      <nav class="angry-sections" aria-label="sections">
        {sections.map((section) => <a href={`#${section.id}`}>{section.title}</a>)}
      </nav>
      {sections.map((section) => (
        <section id={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          <p>{section.intro}</p>
          {section.calls.map((call) => <Call call={call} />)}
        </section>
      ))}
    </main>
    <script>{raw(AUDIO_SCRIPT)}</script>
  </Layout>
);
