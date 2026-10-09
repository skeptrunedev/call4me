import type { FC } from 'hono/jsx';
import { CopyBlock, Layout } from './layout';

/** The grant a student gets once Nick approves the request (credited with `npm run grant`). */
export const STUDENT_CREDIT_DOLLARS = 50;

const CLAIM_SUBJECT = 'student credits';

/** Free credits for students, approved by hand: who it's for, what it does, and what it is not. */
export const StudentsPage: FC<{ signedIn: boolean; agentPrompt: string }> = ({ signedIn, agentPrompt }) => (
  <Layout title="free calls for students" page="students" signedIn={signedIn}>
    <main>
      <h1>we'll make the call</h1>
      <CopyBlock id="agent-prompt" text={agentPrompt} rows={10} hidden />
      <p>
        call4me is an AI assistant that phones businesses for you: it books and reschedules appointments, asks questions, waits on hold and gets
        through phone menus, then sends you back what happened and a full transcript. <b>students get ${STUDENT_CREDIT_DOLLARS} in free credits</b>{' '}
        (about {STUDENT_CREDIT_DOLLARS * 4} minutes of calls).
      </p>

      <h2>who it's for</h2>
      <p>
        any student. we especially built this for students the phone gets in the way of: deaf and hard of hearing students, students with speech
        differences, autistic students, and anyone with phone anxiety who keeps putting off a call. you don't need to tell us why or show any
        documentation.
      </p>

      <h2>how to get the free credits</h2>
      <ol class="steps">
        <li>sign in at <a href="/login">call4.me</a> with google or x. that creates your account.</li>
        <li>
          email <a href={`mailto:me@call4.me?subject=${encodeURIComponent(CLAIM_SUBJECT)}`}>me@call4.me</a> from your school email address (or
          tell us your GitHub Student Developer Pack username), and include the email you signed in with.
        </li>
        <li>we review every request by hand and add the ${STUDENT_CREDIT_DOLLARS} to your account. we'll email you when it's there.</li>
      </ol>

      <h2>what it can do for you</h2>
      <p>you ask your AI assistant in plain words, and it calls. some real calls we've published, with the recordings and transcripts:</p>
      <ul>
        <li>appointments: <a href="/blog/reschedule-dentist-appointment">rescheduling a dentist appointment</a>, <a href="/blog/book-haircut-appointment">booking a haircut</a>, <a href="/blog/follow-up-appointment-telehealth">switching a doctor's visit to telehealth</a></li>
        <li>pharmacy: <a href="/blog/how-to-transfer-a-prescription">transferring a prescription</a>, <a href="/blog/amazon-pharmacy-phone-number">calling amazon pharmacy</a></li>
        <li>customer service: waiting on hold and getting a person at <a href="/companies">33 companies</a>, from airlines to banks</li>
        <li>anything routine where a phone call is the only way to get an answer</li>
      </ul>

      <h2>how it works</h2>
      <ol class="steps">
        <li>connect call4me to an AI assistant that supports MCP (claude, chatgpt, codex and others). <a href="/mcp">setup takes one prompt</a>.</li>
        <li>ask: "call my dentist and move my cleaning to friday afternoon."</li>
        <li>it places the call from a call4me number and talks to the business for you. if they need something only you know, your assistant asks you mid-call.</li>
        <li>you get the outcome and the full transcript. the recording is in your account.</li>
      </ol>

      <h2>what it is not</h2>
      <ul>
        <li>not a relay service (711), a captioned phone or an interpreter. it doesn't connect you to a live conversation; it makes the call for you.</li>
        <li>not certified assistive technology, and not for emergencies. call 911 for emergencies.</li>
        <li>not for medical, legal or financial decisions. it's for routine errands: scheduling, questions, refills, waiting on hold.</li>
      </ul>

      <h2>good to know</h2>
      <ul>
        <li>the caller calls <i>for</i> you and never claims to be you. it doesn't open by announcing it's an AI; if someone sincerely asks, it says yes, and if they'd rather not talk to an AI it ends the call politely.</li>
        <li>calls are recorded by our phone carrier, and you can play or save them from your account. see <a href="/privacy">privacy</a>.</li>
        <li>it never reads out card numbers, bank details or passwords. what it will and won't call for is on the <a href="/rules">rules</a> page.</li>
        <li>the code is open source: <a href="https://github.com/skeptrunedev/call4me">github.com/skeptrunedev/call4me</a>.</li>
      </ul>

      <h2>for accessibility offices and AT specialists</h2>
      <p>
        if you support students who avoid phone calls, we'd love your critique: where it helps, where it falls short, and what would make it safer
        to recommend. email <a href="mailto:me@call4.me">me@call4.me</a> and we'll set up an account for your team to test.
      </p>
    </main>
  </Layout>
);
