/**
 * Social preview metadata for every page: the sentence shown under a shared link
 * and the 1200x630 card at /og/<card>.png. Read by the layout (tags) and the
 * /og route (images), so a page and its card never drift apart.
 */
import type { OgCard } from './og-card';

export const SITE = 'https://call4.me';

/** Go straight to the page an anonymous visitor can open, keeping the destination after sign-in. */
export const accountPath = (signedIn: boolean) => signedIn ? '/account' : '/login?next=/account';
export const SITE_TITLE = 'call4me: Phone calls for your personal AI assistant';
export const SITE_DESCRIPTION = 'Give your AI assistant phone calls through MCP. Connect Claude Code, Codex or another agent to call businesses, book appointments and get answers.';

export interface PageMeta {
  /** Sentence shown under the link on Slack, Discord, X, Signal, iMessage, LinkedIn. */
  description: string;
  /** Card file under /og/, e.g. "mcp" for /og/mcp.png. */
  card: string;
  /** The page's canonical path (pages with an id pass their own to the layout). */
  path: string;
  /** Private or transactional pages should be followed but not shown in search results. */
  noindex?: boolean;
}

/**
 * Per-render overrides for pages whose preview depends on their content (blog posts): the
 * description, a site-relative preview image, and the article tags and structured data.
 */
export interface PageOverride {
  description?: string;
  /** Site-relative preview image, e.g. /og/blog/<slug>.png; defaults to the page's card. */
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  /** ISO timestamps for article:published_time / modified_time. */
  published?: string;
  modified?: string;
  /** schema.org structured data, serialized as application/ld+json. */
  jsonLd?: Record<string, unknown>;
}

export const PAGES = {
  home: { description: SITE_DESCRIPTION, card: 'site', path: '/' },
  examples: { description: 'listen to real call4me calls: dinner reservations, a dentist reschedule, a junk removal quote, and more. original voices and full transcripts.', card: 'examples', path: '/examples' },
  students: { description: 'free call4me credits for students: an AI assistant that makes phone calls for you, built for students the phone gets in the way of. approved by hand.', card: 'students', path: '/students' },
  companies: { description: 'customer service phone numbers for delta, paypal, verizon, hulu and 25 more, each with a real recorded call, the phone tree, and how long it took to reach a person.', card: 'companies', path: '/companies' },
  superintelligenceCalling: { description: 'Compare personal superintelligence phone calling tools: Muse, Grok Bot, Instinct and Pine. Recorded calls, source evidence and a free CSV and JSON dataset.', card: 'superintelligence', path: '/superintelligence-calling-index' },
  voices: { description: 'hear every call4me caller voice (marin, cedar, gleam, meridian) saying the same line at phone quality, and how to pick one for your calls.', card: 'voices', path: '/voices' },
  mcp: { description: 'install call4me in claude code, codex, claude desktop, claude.ai, chatgpt, muse, or grok bot with one prompt. your agent gets a tool that makes phone calls.', card: 'mcp', path: '/mcp' },
  login: { description: 'sign in to call4me with google or x to load credits and connect your AI agent.', card: 'login', path: '/login', noindex: true },
  account: { description: 'your call4me balance, monthly reload, key, and every call with its transcript.', card: 'account', path: '/account', noindex: true },
  call: { description: 'the outcome and transcript of a call call4me made for you.', card: 'call', path: '/account', noindex: true },
  welcome: { description: 'credits loaded. copy the prompt into your agent and it installs call4me itself.', card: 'welcome', path: '/welcome', noindex: true },
  key: { description: 'a new call4me key and the prompt that installs it in your agent.', card: 'key', path: '/account', noindex: true },
  consent: { description: 'let an AI agent make phone calls from your call4me account.', card: 'connect', path: '/oauth/consent', noindex: true },
  rules: { description: 'what call4me will and will not call for: bookings, appointments, questions for a business. no telemarketing, no pretending to be you.', card: 'rules', path: '/rules' },
  privacy: { description: 'what call4me stores (your email, balance history, call briefs, outcomes, transcripts) and what it never records.', card: 'privacy', path: '/privacy' },
  support: { description: 'help with call4me: credits and the monthly reload, a call that went wrong, connecting your agent, and deleting your account. email me@call4.me.', card: 'support', path: '/support' },
  terms: { description: 'call4me terms: prepaid credits that never expire, call time includes menus and holds, unanswered calls free, monthly reload you can stop anytime.', card: 'terms', path: '/terms' },
  blog: { description: 'notes from call4me on AI agents that make phone calls for you: what they are good at, how they sound, and what changed.', card: 'blog', path: '/blog' },
  blogArchive: { description: 'every post on the call4me blog, by month: real recorded calls to businesses, phone trees, what to say, and what AI phone agents can do.', card: 'blog', path: '/blog/archive' },
  message: { description: SITE_DESCRIPTION, card: 'site', path: '/', noindex: true },
} satisfies Record<string, PageMeta>;

export type PageKey = keyof typeof PAGES;

/** The card image behind each /og/<name>.png. */
export const CARDS: Record<string, OgCard> = {
  superintelligence: { title: 'Can your superintelligence make a phone call?', subtitle: 'Muse, Grok Bot, Instinct and Pine. Calling tools, recorded evidence and an open dataset.', footer: 'Superintelligence Calling Index · call4.me' },
  examples: { title: 'listen to real calls', subtitle: 'hear the agent ask questions and get things done before you buy', footer: 'original voices · edited excerpts · transcripts' },
  students: { title: "we'll make the call", subtitle: 'free call credits for students. appointments, pharmacies, customer service, waiting on hold.', footer: '$50 free for students · approved by hand' },
  companies: { title: 'customer service numbers we called', subtitle: 'a real recorded call to each one, and how long it took to reach a person', footer: 'airlines · banks · telecom · insurance · subscriptions' },
  voices: { title: 'hear every caller voice', subtitle: 'the same line in each voice, recorded at phone quality', footer: 'marin · cedar · gleam · meridian' },
  site: { title: 'book dinners, doctor appointments, call dealerships', subtitle: 'one prompt installs it in claude code, codex, claude desktop, or chatgpt', footer: 'prepaid credits from $10' },
  mcp: { title: 'install call4me in your agent', subtitle: 'one prompt for claude code, codex, claude desktop, claude.ai, chatgpt, muse, and grok bot', footer: 'your agent gets a make-a-phone-call tool' },
  login: { title: 'sign in', subtitle: 'with google or x, to load credits and connect your agent', footer: 'no passwords' },
  account: { title: 'my account', subtitle: 'balance, monthly reload, your key, and every call with its transcript', footer: 'private to you' },
  call: { title: 'a call call4me made', subtitle: 'the outcome and the full transcript', footer: 'private to the account that placed it' },
  welcome: { title: "you're in", subtitle: 'copy the prompt into your agent and it installs call4me itself', footer: 'credits never expire' },
  key: { title: 'a new key', subtitle: 'and the prompt that installs it in your agent', footer: 'shown once' },
  connect: { title: 'connect your agent', subtitle: 'let an AI agent make phone calls from your call4me account', footer: 'you approve each agent that connects' },
  rules: { title: 'rules', subtitle: 'bookings, appointments, questions for a business. nothing else.', footer: 'the caller calls for you; it never claims to be you' },
  privacy: { title: 'privacy', subtitle: 'what call4me stores, and why it never records call audio', footer: 'payments handled by stripe' },
  support: { title: 'support', subtitle: 'credits, calls that went wrong, connecting your agent, deleting your account', footer: 'email me@call4.me' },
  terms: { title: 'terms', subtitle: 'prepaid credits that never expire. unanswered calls are free.', footer: 'call time includes menus and holds' },
  blog: { title: 'call4me blog', subtitle: 'notes on AI agents that make phone calls for you', footer: 'by @skeptrune · new posts by email or atom feed' },
};
