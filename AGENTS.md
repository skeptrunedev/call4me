# Agent instructions for call4me

## Outreach

Every call4me outreach message (press, creators, researchers, partners, link swaps, directories, accessibility offices) pitches Nick's credibility and the project's, not just the product. Just before the "nick" sign-off, include these lines verbatim. Don't refresh the numbers from other sources unless Nick provides new ones:

- "i'm nicholas khami, a y combinator founder. i've raised $3.5M in venture capital personally and was head of engineering at a series b a16z startup. i have 10k followers on linkedin and 18.5k on x, with over 75M impressions in the past 6 months."
- "here's our launch post, which got nearly 200k impressions and over 2k engagements: https://x.com/skeptrune/status/2105320262938009690"

Other outreach rules:

- Send from me@skeptrune.com or me@call4.me through Fastmail only, never Gmail (`npm run outreach -- email` / `email-reply`).
- Log every send and reply in the outreach tracker (`npm run outreach`).
- Lowercase casual voice, no em dashes, signed "nick".
- Only state numbers Nick gave or that our published posts and data support.

## Content

**New `/blog` posts are paused.** Every blog tier lost most of its Google impressions from November 1, 2026, cause unknown, while root pages held. Keep placing recorded calls and add the results to `/companies` and `/hold-times`. Don't delete, noindex or rewrite posts until the drop is diagnosed.

Write for the questions where call4me is the answer, not where someone else is the authority:

- We win "an AI that does X for me": a root task page in `src/content/tasks.ts`, using the words people search, backed by real calls. In the November 5 geo check ChatGPT cited an exact-match task page every time it retrieved one, and never cited a blog post.
- We lose questions about another company or product. Their own site or docs win "what is Progressive's number" and "can ChatGPT make a call". ChatGPT searches `site:help.openai.com` and GitHub for those, so reach them through listings, not new pages.
- Measure with `npm run geo:check -- --runs 2` and `npm run seo:conversions`, which splits signups by connected AI app and lists how-you-found-us answers.
- Don't start new cost posts ("how much does X cost") or "cancel X" posts. Put subscription cancellation details in that company's entry.
