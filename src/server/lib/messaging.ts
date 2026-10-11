/**
 * Outbound email over SMTP (Fastmail, via Cloudflare's TCP sockets). No
 * email-API provider in the loop.
 */

export interface Messenger {
  sendEmail(to: string, subject: string, text: string, html?: string): Promise<void>;
}

type MessagingEnv = Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS' | 'EMAIL_FROM'>;

/** "Nick K <me@call4.me>" or a bare address. */
function parseFrom(raw: string): { name?: string; email: string } {
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: m[1]?.trim() || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

export function makeMessenger(env: MessagingEnv): Messenger {
  return {
    async sendEmail(to, subject, text, html) {
      // Imported lazily: worker-mailer needs `cloudflare:sockets`, which does not exist when
      // the same modules are loaded under Node to generate the OpenAPI artifact.
      const { WorkerMailer } = await import('worker-mailer');
      const mailer = await WorkerMailer.connect({
        host: env.SMTP_HOST || 'smtp.fastmail.com',
        port: Number(env.SMTP_PORT || 465),
        secure: true,
        authType: 'plain',
        credentials: { username: env.SMTP_USER, password: env.SMTP_PASS },
      });
      try {
        await mailer.send({ from: parseFrom(env.EMAIL_FROM), to: { email: to }, subject, text, html });
      } finally {
        await mailer.close();
      }
    },
  };
}

/**
 * The mail server refused the address itself (an SMTP 5xx reply to RCPT TO, e.g. "550 5.1.1
 * user unknown"): sending again can only fail the same way. Anything else (a dropped connection,
 * a 4xx try-again-later) may succeed on a retry.
 */
export function isRecipientRejected(err: unknown): boolean {
  const message = String(err instanceof Error ? err.message : err);
  return /RCPT TO/i.test(message) && /\b5\d\d\b/.test(message);
}

/** Local dev: print instead of sending so no provider credentials are needed. */
export const consoleMessenger: Messenger = {
  async sendEmail(to, subject, text) {
    console.log(`[email] to=${to} subject=${subject}\n${text}`);
  },
};

/** SMTP when it is configured, the console otherwise (local dev without a password). */
export function messengerFor(env: MessagingEnv): Messenger {
  return env.SMTP_PASS ? makeMessenger(env) : consoleMessenger;
}
