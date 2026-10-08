# Product Hunt launch drafts

Prepared October 7, 2026, Pacific time. Nick approved the tested email for all users at 08:15 Pacific on October 8, equivalent to 2026-10-08T15:15:00Z. All 120 messages are scheduled through Fastmail's native delayed submission support and independently verified pending for the exact requested time. The eligible audience audit found 120 registered accounts after existing opt outs, internal accounts and placeholder addresses were excluded. Following Nick's request for the missing blog link, the article is published at https://call4.me/blog/everything-we-have-improved-since-launch. The source is `src/content/blog/everything-we-have-improved-since-launch.md`; the copy in this directory preserves the reviewed draft.

## Timing and links

The original Twitter launch was September 30, 2026, at 08:34:00 Pacific. The post is https://x.com/skeptrune/status/2105320262938009690. Its metadata reports `created_timestamp: 1790782440`; `docs/seo-month-1.md` independently identifies September 30 as launch day. The exact post appears repeatedly in the sent outreach recorded in `docs/seo/postiz-link-exchange-drafts-2026-10-05.md`.

Nick's October 7 email, “Quick help enabling Thursday’s call4me launch,” identifies Thursday, October 8 as the intended Product Hunt date. Fastmail message `StmDpTr771cg` contains the request, and `StmDo2SyrqMR` confirms posting access worked. These establish intended timing and account access, not a scheduled listing. Nick confirmed midnight Pacific in this conversation, corresponding to October 8 at 07:00 UTC.

Nick supplied the launch URL: https://www.producthunt.com/products/call4me?launch=call4me. It is included in the email. The web fetch could not access the listing, so its live state is not independently verified. The email's P.S. now links to https://call4.me/blog/everything-we-have-improved-since-launch.

## Call count

Read only production D1 audit at October 7, 2026, 22:56:07 Pacific:

| Measure | Count |
| :--- | ---: |
| Placed customer outbound calls | 798 |
| Completed customer outbound calls | 743 |
| All customer outbound records | 816 |
| Customers with a placed call | 75 |
| Accounts with any outbound record | 77 |
| Customer inbound calls | 33 |

The email uses placed outbound calls. A provider call ID distinguishes an actual placed call from a request that failed before dialing. The 18 records without a provider ID are all failures. Internal accounts are excluded using the same list as the production dashboard. Customer calls testing another product remain customer usage. A completed phone connection is not proof of a successful task, so the draft does not call all 798 calls successful.

```sql
SELECT COUNT(*) AS placed_outbound_calls,
       COUNT(DISTINCT c.account_id) AS calling_customers
FROM calls c
JOIN accounts a ON a.id = c.account_id
WHERE c.direction = 'outbound'
  AND c.telnyx_call_control_id IS NOT NULL
  AND lower(a.email) NOT IN (
    'me@skeptrune.com',
    'nicholas.khami@gmail.com',
    'khamikeira@gmail.com',
    'chatgpt-review@call4.me',
    'claude-review@call4.me'
  );
```

Run with the existing CLI: `npx wrangler d1 execute callbay --remote --json --command '<SQL>'`. The approved email preserves the tested count of 798. Nick later expanded the audience to all users, so the scheduled campaign includes eligible registered accounts whether or not they have placed a call, while respecting account and blog opt outs, internal exclusions and invalid addresses.

The successful examples are already published with permission. The haircut call booked the preferred stylist, but not the earliest available appointment. The oil change call obtained a combined oil change and tire rotation estimate and a walk in plan, not a reserved appointment or completed service. The email preserves those distinctions and includes no prices.

Sources: `src/content/blog/book-haircut-appointment.md`, `src/content/blog/les-schwab-oil-change.md`, and the publication consent record in `docs/seo/customer-success-keywords-2026-10-05.md`.

## Feature evidence

Reviewed the original launch baseline and current main through `939c945`.

| Blog claim | First relevant commits | Current implementation |
| :--- | :--- | :--- |
| Scheduling and cancellation | `753cf49` | `src/server/services/scheduled.ts`, `src/server/mcp/server.ts` |
| Silent listening and improved handoff | `a5d7521`, `ccd0578`, `3822103`, `c979cc9` | `src/server/mcp/server.ts`, `src/server/voice/session.ts` |
| Hang up a live call through the agent | `ccd0578` | `src/server/mcp/server.ts` |
| Verified personal caller ID | `107f47f` | `src/server/services/numbers.ts` |
| Optional caller name and company | `42ea267`, `2df5df0` | `src/server/voice/prompt.ts`, `src/server/services/dialer.ts` |
| Remove assigned default persona | `d53b612` | `src/server/voice/prompt.ts` |
| Additional numbers and expanded international routes | `f489c53`, `922e9d3`, `d890668`, `5bc6ce4` | `src/server/services/numbers.ts` |
| Shared numbers where available | `412f079` | `src/server/services/numbers.ts` |
| Pending and interrupted number orders | `5004091`, `aeb73cc` | `src/server/services/numbers.ts` |
| Longer calls and removal of two call concurrency cap | `42ea267`, `21ae114` | `src/server/services/calls.ts` |
| Menu recovery, language selection and keypad fixes | `a0eaefd`, `fe3ca44`, `2b614c7` | `src/server/voice/handoff.ts`, `src/server/voice/dtmf.ts`, `src/server/voice/prompt.ts` |
| Less unwanted speech and quiet waiting | `d7d4e46`, `3a77379`, `53ff5c3` | `src/server/voice/prompt.ts` |
| Voicemail and call screening | `ce732dd`, `2c78acf` | `src/server/voice/voicemail.ts` |
| Voice preview page and language samples | `18c03d4`, `60b73d1` | `src/server/views/voices.tsx` |
| Account recording player and downloads | `7227380`, `3dcd41d` | `src/server/views/account.tsx` |
| Transcript seeking and playback fixes | `1a8dfbf`, `5d964c3` | `src/server/lib/blog.ts`, `src/server/views/blog.tsx` |
| MCP Registry, setup and Codex authentication fixes | `3ac2202`, `a0df744`, `73b4a83`, `da24e3e` | `src/server/mcp/server.ts`, setup guides |
| Clearer key and call errors | `ea0bfc0`, `d602b21` | `src/server/lib/keys.ts`, `src/server/mcp/server.ts` |
| Promotion links apply before checkout | `365d770` | Credit checkout services and routes |
| Calls survive site deploys, improved recovery | `516b8d5`, `c1e2e65`, `57c14f6`, `2c78acf` | Separate voice worker and `src/server/voice/session.ts` |
| Release stale credit holds | `3304d76`, `444a1e7` | `src/server/services/dialer.ts` |

Existing callbacks, basic human handoff, saved profiles, live questions, transcripts, recaps, four voices, OAuth and MCP recording retrieval predate the Twitter launch. The blog describes the new improvements to those features, not their original introduction. Automatic silence check ins were removed on October 6 and are not advertised. No promise of automatic results in a closed agent thread, universal international availability, unlimited calling, or approved ChatGPT or Claude directory placement is made.

MCP Registry publication was separately confirmed by the successful October 1 [publication workflow](https://github.com/skeptrunedev/call4me/actions/runs/36888987633).

## Verification

The draft rendered successfully through the existing blog renderer. Email and blog prose were checked for dashes. All seven Call4me links returned HTTP 200. Type checking, linting, and the Worker deployment build passed. The existing test suite reported 260 passing tests and one skipped test, with no failures. A separate claim review found no remaining factual blockers. The blog was subsequently published and verified on the production site.

## Before distribution

Test delivery: Fastmail message `StmD5xeWYcwg`, submission `S3611`, sent to `me@skeptrune.com` with subject “Call4me is live on Product Hunt!” The sent copy was retrieved and verified to contain both actual HTML links, no draft flag, and the Sent mailbox. The reusable command is `npm run outreach -- mail-send <email> docs/product-hunt/launch-email.md`; add `--dry-run` to inspect the body and HTML without sending. This test is not approval to send to customers.

Nick subsequently approved the tested copy with “cool schedule that for all users at 8:15AM PT.” This supersedes the earlier midnight delivery time and the original callers only audience.

The campaign CLI prepares a private audience manifest, creates opaque unsubscribe links with only token hashes stored in D1, and schedules individual Fastmail submissions using HOLDUNTIL. It verifies the provider returned the exact intended sendAt and a pending state. Interrupted submissions are inspected before any retry, and a local lock prevents concurrent scheduling of the same manifest. No customer addresses or token URLs are committed.

The local development signing key does not match production. Campaign links therefore use their own persisted opaque tokens and the existing confirmation page and POST opt out flow. Existing signed drip links continue to work.

## Website footer

Nick separately requested the live aggregate call count in the website footer. The shared footer queries provider accepted outbound calls across all accounts from D1 for each rendered page and labels the result “calls placed.” Inbound calls and requests that never reached the phone provider are excluded. The email keeps its approved customer usage count, which excludes internal accounts.


## Final production verification

Release `d6a1291` passed [CI and deployment](https://github.com/skeptrunedev/call4me/actions/runs/37737903809). Local checks passed with 286 tests and one skipped test, plus type checking, linting and the Worker build.

Fastmail submissions `S3612` through `S3731` were verified at 2026-10-08T06:35:15Z. All 120 have `sendAt: 2026-10-08T15:15:00Z` and `undoStatus: pending`, with the expected sender, exactly one intended recipient and the saved email ID. There are zero remaining or skipped recipients. This verifies scheduled delivery, not inbox receipt. The private manifest is `scratch/product-hunt-2026-10-08.v2.json`; the earlier manifest uses invalid development signatures and was never submitted. Use `npm run campaign -- status --state scratch/product-hunt-2026-10-08.v2.json` before delivery to verify pending status.

Production browser checks passed on the homepage and launch blog at 375 and 1440 pixel widths, with all footer links present, no horizontal overflow and “962 calls placed,” matching the production SQL count. The footer reads fresh usage on each page render. Three campaign unsubscribe URLs returned valid confirmation pages, and the live browser confirmed the preserved token and POST confirmation form without opting out a customer. Real SQLite route tests verified that POST changes only the intended account and existing signed links remain valid.
