# call4me-ai-sdk

Phone call tools for the [Vercel AI SDK](https://ai-sdk.dev). Your agent calls a business, has a natural conversation (book, reschedule, cancel, ask questions, wait on hold, get through phone menus), and gets the outcome and transcript back. Backed by the [call4me](https://call4.me) MCP server.

Full guide: https://call4.me/blog/vercel-ai-sdk-phone-calls

## Install

```bash
npm install call4me-ai-sdk ai zod @ai-sdk/openai
```

Get an API key at [call4.me](https://call4.me) (sign in, add credits, copy the `cb_live_` key from your account page) and set it as `CALL4ME_API_KEY`.

## Use

```ts
import { generateText, isStepCount } from 'ai';
import { openai } from '@ai-sdk/openai';
import { call4meTools } from 'call4me-ai-sdk';

const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt:
    'Call Pottery Barn customer service at 1-888-779-5176 and ask how long furniture delivery ' +
    'usually takes and whether returns have a shipping fee. General questions only, no order.',
  tools: call4meTools(),
  stopWhen: isStepCount(8),
});

console.log(text);
```

## Tools

| Tool | What it does |
|---|---|
| `makePhoneCall` | Places a call and waits for it to finish, then returns the outcome and transcript. Returns early with `open_questions` if the business asks something only the user can answer. |
| `placeCall` | Places a call and returns its id right away. |
| `getCall` | Status, open questions, live transcript and outcome. Waits up to 50 seconds for a change. |
| `answerQuestion` | Answers a question the business is waiting on mid-call. |
| `hangUp` | Ends a call in progress. |
| `getBalance` | Balance, per-minute price and the account's phone numbers. |
| `getRequirements` | What a kind of call needs before it can dial. |

Options: `call4meTools({ apiKey, baseUrl, maxWaitMinutes, fetch })`. `createCall4meClient()` gives you the raw `(toolName, args)` caller for following calls yourself.

Calls cost $0.25 per minute of talk time (US and Canada), billed from your prepaid call4me balance. Unanswered calls are free.

## License

MIT
