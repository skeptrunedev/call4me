// Fernand (getfernand.com) support workspace for support@call4.me, kept as code.
// `npm run fernand` pushes this to the workspace: tags are created when missing, snippets are
// matched by shortcut and rules by name, then created or overwritten. Anything made in the
// Fernand UI under another shortcut or name is left alone.
//
// Every fact in a reply below is quoted from the site (views/public.tsx faq, /support, /terms).
// Change the site and these together.

export const tags = [
  { name: 'billing', color: '#ffb000' },
  { name: 'call-issue', color: '#e9595b' },
  { name: 'setup', color: '#5f6dcf' },
  { name: 'numbers', color: '#51b684' },
  { name: 'unwanted-call', color: '#b9375e' },
  { name: 'privacy', color: '#65655f' },
];

const p = (...lines) => lines.map((l) => `<p>${l}</p>`).join('');

export const snippets = [
  {
    title: 'Ask for the call id',
    shortcut: 'call-id',
    reply: p(
      'sorry that call went sideways. can you send me its id? it starts with call_ and your agent has it, or open the call in <a href="https://call4.me/account">my account</a>.',
      "with the id i can read the transcript and see exactly what happened.",
    ),
  },
  {
    title: 'What a call costs',
    shortcut: 'pricing',
    tag: 'billing',
    reply: p(
      'calls are $0.25 per minute from pickup by a person or automated system, including phone menus, rounded up to the minute. time on hold is half price.',
      'each call reserves its maximum cost and returns unused credit when it ends. unanswered, busy, and failed calls are free.',
      'a few destinations cost more: uae, japan and the philippines $0.40, panama $0.50, ghana and bolivia $0.60, ukraine $0.65 per minute.',
    ),
  },
  {
    title: 'Stop the monthly reload',
    shortcut: 'stop-reload',
    tag: 'billing',
    reply: p(
      'monthly reload is on by default, so the amount you loaded gets charged and added as credits again each month.',
      'you can stop it anytime in <a href="https://call4.me/account">my account</a> with "stop reloading". credits already loaded stay and don\'t expire.',
    ),
  },
  {
    title: 'Refund issued',
    shortcut: 'refunded',
    tag: 'billing',
    reply: p(
      "done, i refunded the [amount] charge from [date]. it takes 5 to 10 business days to show up on your card, and the matching credits come off your balance.",
    ),
  },
  {
    title: 'Failed calls are free',
    shortcut: 'failed-free',
    tag: 'call-issue',
    reply: p(
      'unanswered, busy, and failed calls are free, so nothing was charged for that one.',
      'billing only starts when a person or automated system picks up, and covers phone menus and hold time (at half price).',
    ),
  },
  {
    title: 'Connect your agent',
    shortcut: 'setup',
    tag: 'setup',
    reply: p(
      'the <a href="https://call4.me/mcp">install page</a> has the steps for each app. in chatgpt, add call4me from the plugins directory and sign in when it asks.',
      'if sign-in keeps failing, create a key in <a href="https://call4.me/account">my account</a> and use https://call4.me/mcp/&lt;your key&gt; as the server url instead.',
    ),
  },
  {
    title: 'Credits on another account',
    shortcut: 'wrong-account',
    tag: 'billing',
    reply: p(
      'your credits belong to the email you paid with. sign in at <a href="https://call4.me/login">call4.me</a> with google or x using that same email and they show up on your account.',
    ),
  },
  {
    title: 'Countries and numbers',
    shortcut: 'countries',
    tag: 'numbers',
    reply: p(
      'the us, canada, the eu, the uk, iceland, liechtenstein, norway, switzerland, the uae, and japan work with your free us number.',
      'other supported destinations may need a local call4me number. your agent can buy one (call4me_buy_number), or check availability in <a href="https://call4.me/account">my account</a>.',
    ),
  },
  {
    title: 'Extra number renewals',
    shortcut: 'number-renewal',
    tag: 'numbers',
    reply: p(
      'a number costs exactly what our phone carrier charges us, no markup: its upfront cost plus the first month when you buy it, then the monthly cost every 30 days from your credits.',
      "if your credits can't cover a renewal, the number is released after 7 days. you can release a number anytime. the free number that came with your account stays.",
    ),
  },
  {
    title: 'Agent says not calling yet',
    shortcut: 'not-calling-yet',
    tag: 'call-issue',
    reply: p(
      "\"not calling yet\" means the call needs a few details from you before it dials, like who the call is for or an account number the business will ask for.",
      'answer what your agent lists in one message and it calls right away. saving your name with call4me_save_profile skips that question next time.',
    ),
  },
  {
    title: 'Recordings and transcripts',
    shortcut: 'recording',
    reply: p(
      'our phone carrier (telnyx) records calls. after a call ends, open it in <a href="https://call4.me/account">my account</a> to play or save its recording and read the transcript. you can also ask your agent for it.',
      'it can take a minute to appear after hangup.',
    ),
  },
  {
    title: 'Blocked an unwanted call',
    shortcut: 'blocked',
    tag: 'unwanted-call',
    reply: p(
      "really sorry about that call. i've blocked your number, so no call4me number will call it again.",
    ),
    close: true,
  },
  {
    title: 'Account deleted',
    shortcut: 'deleted',
    tag: 'privacy',
    reply: p(
      'done. i deleted your account, its calling profile and its call history.',
    ),
    close: true,
  },
  {
    title: 'Feature request thanks',
    shortcut: 'feature',
    tag: 'feature-request',
    reply: p(
      "thanks, that's a good one. i added it to the list and i'll reply here when it ships.",
    ),
  },
];

// AI triage: on a new conversation Fernand picks the single best-matching description
// (each under 250 characters) and runs that rule's actions.
const triage = [
  ['billing', 'Billing: a charge, the monthly reload, a refund, credits or balance, a promo code, or payment that did not show up.'],
  ['call-issue', 'A specific phone call went wrong: it failed, said or did something wrong, hung up, never connected, or the agent said "not calling yet".'],
  ['setup', 'Connecting an AI agent or app to call4me: MCP setup, ChatGPT plugin, Claude, Codex, Cursor, OAuth sign-in errors, or API keys.'],
  ['numbers', 'Phone numbers: buying, renewing or releasing a call4me number, calling another country, or using their own number as caller ID.'],
  ['unwanted-call', 'Someone received a call from a call4me number they did not ask for and wants it to stop, or reports harassment or abuse.'],
  ['privacy', 'Deleting their account or data, call recordings or transcripts privacy, or a data or privacy request.'],
  ['feature-request', 'A suggestion or request for a new feature, integration, country, or voice.'],
  ['bug-report', 'A bug on the call4.me website or account page, like a broken page, button or error message.'],
];

const draftPrompt = [
  'You are drafting a reply for Nick, who runs call4me (call4.me): an MCP server that lets AI agents place real phone calls. Write in lowercase casual voice, short, no em dashes, no sign-off.',
  'Only state facts from the knowledge base and this list: calls cost $0.25 per minute from pickup by a person or automated system, rounded up to the minute; hold time is half price; unanswered, busy and failed calls are free; credits are prepaid, start at $10 and never expire; monthly reload is on by default and can be stopped in my account (https://call4.me/account); setup steps are on https://call4.me/mcp.',
  'If the message is about a specific call and gives no id, ask for the call id (starts with call_). Never promise a refund, a credit, a feature or a date: say Nick will look into it. If unsure, ask one clarifying question.',
].join(' ');

export const rules = [
  ...triage.map(([tag, about]) => ({
    name: `Triage: ${tag}`,
    trigger: 'messages.intent_routing',
    trigger_data: about,
    actions: [
      { name: 'conversation.tag', data: tag },
      // Someone we called without asking: same day, every time.
      ...(tag === 'unwanted-call'
        ? [
            { name: 'conversation.tag', data: 'urgent' },
            { name: 'messages.note', data: '<p>block the number they gave: add it to blocked_numbers in D1, then reply with /blocked.</p>' },
          ]
        : []),
    ],
  })),
  {
    name: 'AI draft for every customer message',
    trigger: 'messages.incoming',
    actions: [{ name: 'messages.ai_draft', data: { title: 'call4me reply', prompt: draftPrompt } }],
  },
  {
    name: 'Close after 3 days without a customer reply',
    trigger: 'time.unanswered_by_client',
    trigger_data: '3 days',
    actions: [{ name: 'status.close', data: null }],
  },
];
