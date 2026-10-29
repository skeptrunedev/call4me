import type { FC } from 'hono/jsx';
import { dollars } from '../services/accounts';
import { MIN_TOPUP_CENTS } from '../services/topups';
import { accountPath, PAGES, SITE } from '../lib/pages';
import { VOICES } from '../voice/voices';
import { SAMPLE_LANGUAGES } from '../../content/voices';
import { EXAMPLES } from '../../content/examples';
import { CopyBlock, Layout } from './layout';
import { pricierDestinations } from './public';
import { STUDENT_CREDIT_DOLLARS } from './students';

/** Recorded calls that show each part of the page: a booking, a reschedule, a hold and patch-in, a question, a stock check. */
const ASSISTANT_EXAMPLES = ['dinner-reservation', 'dentist-reschedule', 'spectrum-retention', 'internet-availability', 'costco-tire-order'].map((slug) => {
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) throw new Error(`ai call assistant example ${slug} is missing`);
  return example;
});

const list = (items: readonly string[]) => `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** What it is and what it costs, for search and answer engines (schema.org). The price is the live per-minute rate. Task pages reference the same node. */
export const assistantApp = (pricePerMinuteCents: number) => {
  const url = `${SITE}${PAGES.aiCallAssistant.path}`;
  const price = (pricePerMinuteCents / 100).toFixed(2);
  return {
    '@type': 'SoftwareApplication',
    '@id': `${url}#app`,
    name: 'call4me',
    url,
    description: PAGES.aiCallAssistant.description,
    applicationCategory: 'CommunicationApplication',
    operatingSystem: 'Web',
    publisher: { '@id': `${SITE}/#org` },
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'USD',
      priceSpecification: { '@type': 'UnitPriceSpecification', price, priceCurrency: 'USD', unitCode: 'MIN', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MIN' } },
    },
  };
};
const assistantLd = (pricePerMinuteCents: number) => ({ '@context': 'https://schema.org', ...assistantApp(pricePerMinuteCents) });

/** Product page for "AI call assistant" searches: what call4me does on a call, what it costs, and how to start. */
export const AiCallAssistantPage: FC<{ signedIn: boolean; pricePerMinuteCents: number; agentPrompt: string }> = ({ signedIn, pricePerMinuteCents, agentPrompt }) => {
  const perMinute = `${dollars(pricePerMinuteCents)}/min`;
  return (
    <Layout title="AI call assistant that makes phone calls for you" page="aiCallAssistant" signedIn={signedIn} meta={{ jsonLd: assistantLd(pricePerMinuteCents) }}>
      <main>
        <h1>an AI call assistant that makes phone calls for you</h1>
        <p>
          call4me is an AI call assistant: an AI agent that places real phone calls to businesses for you. it books and reschedules appointments,
          makes reservations, asks businesses the questions a website can't answer, gets through phone menus and waits on hold. when a person
          picks up, it can ring your phone and patch you in. you get back the outcome, the transcript and the recording.
        </p>
        <p>
          it's for anyone who already asks an AI assistant like ChatGPT, Claude or Codex for help and wants it to handle the phone part too.
          calls cost <b>{perMinute}</b> from pickup, half that on hold, with prepaid credits from {dollars(MIN_TOPUP_CENTS)}. unanswered calls are free.
          to start, <a href="/#buy">load credits</a>, paste one setup prompt into your assistant, and ask it to make the call.
        </p>

        <h2>what the AI phone agent does on a call</h2>
        <p>
          you tell your assistant what you want in plain words, like "move my thursday 3:30 dentist appointment to friday after 3." before it dials,
          call4me checks that it has everything that kind of call needs, and your assistant asks you for anything missing in one message. then the AI
          phone agent calls the business from a call4me number with your goal, the facts it may share, and what it may accept. it works through the
          phone menu and the hold, then has a normal conversation with whoever answers. if the business asks something only you know, the question
          comes back to your assistant mid-call, and the caller relays your answer on the line within a second or two. when the call ends, your assistant
          gets the outcome and the full transcript, and the recording is in <a href={accountPath(signedIn)}>your account</a>.
        </p>

        <h2>you can listen in or take over the call</h2>
        <p>
          call4me can ring your own phone. ask your assistant to connect you "as soon as a person picks up" and you skip the hold music; hold time is
          still billed, at half the normal rate. you're on the call as soon as you answer. the AI caller goes quiet while you
          talk, and when you press * or hang up, it takes the call back and carries on with the task. if you'd rather just hear how it's going, ask to
          listen in: nobody on the call hears you, the caller keeps working, and you can press 1 anytime to take over. if calls make you anxious, our
          guide to <a href="/blog/phone-anxiety">phone anxiety</a> has scripts for the common ones and is honest about when to hand a call off.
        </p>
        <p>
          this matters when a business wants the account holder. on a <a href="/examples#spectrum-retention">call to spectrum</a>, the caller got through
          the menu and about 5 minutes of hold, the rep wouldn't change the account for an assistant, so the caller patched in the user, who got $55 a
          month for a year instead of $85.
        </p>

        <h2>AI voice calls that sound like a person</h2>
        <p>
          there are {VOICES.length} caller voices: {list(VOICES)}. you can hear each one at phone quality on the <a href="/voices">voices page</a> and
          tell your assistant which to use. every voice speaks {list(SAMPLE_LANGUAGES.map((l) => l.name.toLowerCase()))}, and you can ask it to start
          in another language: on real calls to montreal businesses, the caller held the whole call in french.
        </p>
        <p>
          the caller calls <i>for</i> you and never claims to be you. it doesn't open by announcing it's an AI, the same way you don't open a call by
          explaining who you are. if someone sincerely asks, it tells the truth. it never reads out card numbers, bank details or passwords.
        </p>

        <h2>your AI phone number is free</h2>
        <p>
          every account gets a free US number, assigned on your first call. businesses see it as the caller ID, and when they call it back, call4me
          answers: a callback about an unfinished task tries to finish it, and anything else takes a message. your assistant lists those callbacks
          with your other calls. it isn't a hotline you dial to chat with an AI; you start every call by asking your assistant.
        </p>
        <p>
          you can verify your own phone number as the caller ID instead, and then callbacks go straight to your phone. for other supported destinations
          you can add a local call4me number. it costs exactly what our phone carrier charges us, no markup: its upfront cost plus the first month, then
          the monthly cost every 30 days from your credits. you can release a number anytime.
        </p>

        <h2>what call4me costs</h2>
        <table>
          <thead>
            <tr><th scope="col">what</th><th scope="col">price</th></tr>
          </thead>
          <tbody>
            <tr><td>a call, from pickup by a person or automated system</td><td>{perMinute}, rounded up to the minute. phone menus cost the same; hold time is half price.</td></tr>
            <tr><td>higher-rate destinations</td><td>{pricierDestinations()}</td></tr>
            <tr><td>unanswered, busy and failed calls</td><td>free</td></tr>
            <tr><td>your call4me US number</td><td>free</td></tr>
            <tr><td>extra numbers</td><td>our carrier's cost, no markup</td></tr>
            <tr><td>prepaid credits</td><td>from {dollars(MIN_TOPUP_CENTS)}. credits don't expire.</td></tr>
          </tbody>
        </table>
        <p>
          each call reserves its maximum cost up front and returns unused credit when it ends. ask your assistant to set a maximum call length to cap
          the cost. what you load reloads every month by default; untick it before paying or stop it anytime in <a href={accountPath(signedIn)}>your account</a>.
          students can ask for <a href="/students">${STUDENT_CREDIT_DOLLARS} in free credits</a>, approved by hand.
        </p>

        <h2>AI outbound calling for your own errands, not campaigns</h2>
        <p>
          call4me makes the outbound calls a person would make themselves: bookings, appointments and questions for a business. it is not an AI call
          bot for telemarketing, sales, surveys, debt collection or political calls, and it won't call people who didn't expect to hear from you. the
          same number can be called a few times a day, not more, and anyone who asks not to be called again is never called by call4me again. no
          emergency, premium-rate or shared-cost numbers. the full list is on the <a href="/rules">rules</a> page.
        </p>
        <p>
          if you want to build and run your own voice agents, with pathways, versions and analytics, a broader platform fits better. our{' '}
          <a href="/blog/bland-ai-alternatives">Bland AI comparison</a> covers where each one fits.
        </p>

        <h2>schedule calls for when the business is open</h2>
        <p>
          if the business is closed, or you want the call made at a set time, your assistant can schedule it up to 60 days ahead, and call4me dials
          within a minute of that time. the brief is checked when you schedule it, so anything missing gets asked while you're still there, and
          credits are held only when it dials. nobody may be following a scheduled call, so give it every fact and everything it may accept up front:
          if a question comes up that nobody answers, the caller says you'll call back. you can check on a scheduled call or cancel it before it
          dials. the <a href="/blog/schedule-phone-calls-claude-code-codex">scheduling walkthrough</a> shows it from Claude Code and Codex.
        </p>

        <h2>real calls you can listen to</h2>
        <p>these are recorded calls call4me made, each with what was asked, what happened and a transcript:</p>
        <ul>
          {ASSISTANT_EXAMPLES.map((e) => (
            <li>
              <a href={`/examples#${e.slug}`}>{e.title}</a> ({e.business}): {e.outcome}
            </li>
          ))}
        </ul>
        <p>
          for longer reads, see <a href="/blog/ai-agent-that-makes-phone-calls">how an AI agent makes calls and gets tasks done for you</a> and{' '}
          <a href="/blog/how-long-to-reach-a-human">how long it takes to reach a human at 81 companies</a>.
        </p>

        <h2>how to start</h2>
        <ol class="steps">
          <li><a href="/#buy">load credits</a>, from {dollars(MIN_TOPUP_CENTS)}. no account needed first; sign in afterwards with the email you paid with.</li>
          <li>
            paste the setup prompt into your assistant. it works with Claude Code, Codex, Claude Desktop, claude.ai, ChatGPT, Grok Bot and other MCP
            clients, and Muse can build its own integration. the <a href="/mcp">install page</a> has the steps for each app.
          </li>
          <li>ask for a call like normal: "book me a table for 4 at nopa tomorrow around 7."</li>
        </ol>
        <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} />
      </main>
    </Layout>
  );
};
