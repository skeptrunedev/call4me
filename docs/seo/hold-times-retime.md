# Re-timing the hold-times dataset each month

`/hold-times` is the page we pitch to press, so its numbers should stay current. Re-time it once a month, around the 12th. The first full set was called September 30 to October 9, 2026.

## What a re-time is

One new informational call per company, using the same number and the same route as the published call (the "What got us through" column). Time it the same way: from the moment the call connects to the first live person.

## Steps

1. Place the calls through the call4me API from the test account, at most 2 at a time, with `max_minutes: 240` (the server's maximum). Marketing calls never get a shorter cap: a long hold is the finding, and a capped call that hangs up before a person answers is wasted. Use the same general-inquiry brief as the original post, never claim to be a customer, and set the callback number to the call4me line. See the call pipeline notes in memory or `docs/audio-review.md`.
2. Review each recording with `scripts/review-call-audio.ts` and find the transcript line where the first live person speaks. Mute staff names.
3. A call only replaces the published time if it reached a live person. A company that walled us this time keeps its old row and gets a note in its post.
4. Update, in one commit:
   - the company's post: add the new call's date, time to a person and transcript line next to the earlier one
   - `public/static/blog/how-long-to-reach-a-human.csv` and the table in `src/content/blog/how-long-to-reach-a-human.md`
   - `src/content/companies.ts` (`timeToHuman`, `calls`) and `HOLD_EVIDENCE` plus `HOLD_UPDATED` in `src/content/hold-times.ts`
5. Check that every quote and time matches across these files, then run `npm test`.
6. Push, then email reporters who covered the data only if a number moved a lot (for example, a new longest wait).

## New companies

A new company joins the dataset only after its own customer service guide is published from a call that reached a person. Add it to the same four places in step 4.
