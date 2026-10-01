import type { FC } from 'hono/jsx';
import type { NumberView } from '../services/numbers';

/** The same calling expectations on setup, payment welcome, and account pages. */
export const CallOnboarding: FC<{ numbers?: NumberView[] }> = ({ numbers = [] }) => (
  <section class="box" aria-label="when call4me calls you">
    <h2>when call4me calls you</h2>
    {numbers.length ? (
      <>
        <p>save {numbers.length === 1 ? 'this number' : 'these numbers'} as a contact named call4me so you recognize a call:</p>
        <ul>
          {numbers.map((n) => <li><strong>{n.number}</strong>{numbers.length > 1 && <> ({n.country_name})</>}</li>)}
        </ul>
      </>
    ) : (
      <p>your free us number is assigned on your first call. your agent will show you the number to save as a contact named call4me once the call starts.</p>
    )}
    <p>
      call4me may ring your personal phone if a business needs you to verify your account, or if you ask to join the call. your personal phone is the number you save
      in your calling profile, separate from your call4me number. your agent should give you a heads up before a call that may need you and before connecting you.
    </p>
    <p>answer and press 1 to join. press * or hang up to hand the call back to the assistant. voicemail cannot join the call.</p>
  </section>
);
