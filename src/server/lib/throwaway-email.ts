import { THROWAWAY_DOMAINS } from './throwaway-domains.generated';

/**
 * Throwaway inbox services (guerrillamail, temp-mail and their thousands of rotating domains).
 * New accounts can't be opened with one: on Nov 27 one person scripted 25 accounts on four of
 * these domains for the free $5 each, and every one mailed Nick a signup notice and itself a
 * welcome email. No account that has ever paid uses one.
 */
let domains: Set<string> | undefined;

/** Whether an address is at a throwaway inbox service, or at a subdomain of one. */
export function throwawayEmail(email: string): boolean {
  domains ??= new Set(THROWAWAY_DOMAINS.split('\n'));
  const labels = email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 0; i < labels.length - 1; i++) if (domains.has(labels.slice(i).join('.'))) return true;
  return false;
}

/** What the sign-in page says when a new account is asked for with one. */
export const THROWAWAY_EMAIL_MESSAGE = "call4me can't open an account for a throwaway inbox. use your own email, or sign in with google or x.";
