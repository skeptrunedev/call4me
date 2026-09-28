/**
 * Social preview metadata for every page: the sentence shown under a shared link
 * and the 1200x630 card at /og/<card>.png. Read by the layout (tags) and the
 * /og route (images), so a page and its card never drift apart.
 */
import type { OgCard } from './og-card';

export const SITE = 'https://call4.me';
export const SITE_DESCRIPTION = 'your AI agent makes phone calls for you. book dinners, doctor appointments, call dealerships. one prompt to install, prepaid credits from $10.';

export interface PageMeta {
  /** Sentence shown under the link on Slack, Discord, X, Signal, iMessage, LinkedIn. */
  description: string;
  /** Card file under /og/, e.g. "mcp" for /og/mcp.png. */
  card: string;
  /** The page's canonical path (pages with an id pass their own to the layout). */
  path: string;
}

export const PAGES = {
  home: { description: SITE_DESCRIPTION, card: 'site', path: '/' },
  mcp: { description: 'install callbay in claude code, codex, claude desktop, claude.ai, or chatgpt with one prompt. your agent gets a tool that makes phone calls.', card: 'mcp', path: '/mcp' },
  login: { description: 'sign in to callbay with google or x to load credits and connect your AI agent.', card: 'login', path: '/login' },
  account: { description: 'your callbay balance, monthly reload, key, and every call with its transcript.', card: 'account', path: '/account' },
  call: { description: 'the outcome and transcript of a call callbay made for you.', card: 'call', path: '/account' },
  welcome: { description: 'credits loaded. copy the prompt into your agent and it installs callbay itself.', card: 'welcome', path: '/welcome' },
  key: { description: 'a new callbay key and the prompt that installs it in your agent.', card: 'key', path: '/account' },
  consent: { description: 'let an AI agent make phone calls from your callbay account.', card: 'connect', path: '/oauth/consent' },
  rules: { description: 'what callbay will and will not call for: bookings, appointments, questions for a business. no telemarketing, no pretending to be you.', card: 'rules', path: '/rules' },
  privacy: { description: 'what callbay stores (your email, balance history, call briefs, outcomes, transcripts) and what it never records.', card: 'privacy', path: '/privacy' },
  terms: { description: 'callbay terms: prepaid credits that never expire, talk time billed from pickup, unanswered calls free, monthly reload you can stop anytime.', card: 'terms', path: '/terms' },
  message: { description: SITE_DESCRIPTION, card: 'site', path: '/' },
} satisfies Record<string, PageMeta>;

export type PageKey = keyof typeof PAGES;

/** The card image behind each /og/<name>.png. */
export const CARDS: Record<string, OgCard> = {
  site: { title: 'book dinners, doctor appointments, call dealerships', subtitle: 'one prompt installs it in claude code, codex, claude desktop, or chatgpt', footer: 'prepaid credits from $10' },
  mcp: { title: 'install callbay in your agent', subtitle: 'one prompt for claude code, codex, claude desktop, claude.ai, and chatgpt', footer: 'your agent gets a make-a-phone-call tool' },
  login: { title: 'sign in', subtitle: 'with google or x, to load credits and connect your agent', footer: 'no passwords' },
  account: { title: 'my account', subtitle: 'balance, monthly reload, your key, and every call with its transcript', footer: 'private to you' },
  call: { title: 'a call callbay made', subtitle: 'the outcome and the full transcript', footer: 'private to the account that placed it' },
  welcome: { title: "you're in", subtitle: 'copy the prompt into your agent and it installs callbay itself', footer: 'credits never expire' },
  key: { title: 'a new key', subtitle: 'and the prompt that installs it in your agent', footer: 'shown once' },
  connect: { title: 'connect your agent', subtitle: 'let an AI agent make phone calls from your callbay account', footer: 'you approve each agent that connects' },
  rules: { title: 'rules', subtitle: 'bookings, appointments, questions for a business. nothing else.', footer: 'the caller calls for you; it never claims to be you' },
  privacy: { title: 'privacy', subtitle: 'what callbay stores, and why it never records call audio', footer: 'payments handled by stripe' },
  terms: { title: 'terms', subtitle: 'prepaid credits that never expire. unanswered calls are free.', footer: 'talk time billed from pickup' },
};
