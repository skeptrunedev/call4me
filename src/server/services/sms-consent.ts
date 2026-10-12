import { now } from '../lib/ids';

export const SMS_CONSENT_VERSION = '2026-10-11';
export const SMS_CONSENT_TEXT = 'I agree to receive automated Call4Me text messages at my selected verified number when a call needs my attention and before a purchased number is released after a failed renewal. Message frequency varies. Message and data rates may apply. Consent is optional and is not a condition of purchase. Reply STOP to unsubscribe or HELP for help.';

export interface SmsConsent {
  phone_number: string;
  consented_at: number;
  revoked_at: number | null;
  active: boolean;
}

export class SmsConsentError extends Error {}

export function smsConsent(db: D1Database) {
  return {
    /** Future delivery must use this check, including current verified ownership. */
    async current(accountId: string): Promise<SmsConsent | null> {
      const row = await db.prepare(`SELECT e.phone_number, e.consented_at, e.revoked_at,
        CASE WHEN e.action = 'subscribe' AND v.status = 'verified' AND v.country = 'US'
          AND v.account_id = e.account_id AND v.phone_number = e.phone_number THEN 1 ELSE 0 END AS active
        FROM sms_consent_events e LEFT JOIN verified_numbers v ON v.id = e.verified_number_id
        WHERE e.account_id = ? ORDER BY e.id DESC LIMIT 1`).bind(accountId).first<Omit<SmsConsent, 'active'> & { active: number }>();
      return row ? { ...row, active: Boolean(row.active) } : null;
    },

    async subscribe(accountId: string, phoneNumber: string): Promise<void> {
      const at = now();
      // Ownership validation and insertion are one statement, preventing a removal race.
      const result = await db.prepare(`INSERT INTO sms_consent_events
        (account_id, verified_number_id, phone_number, action, consented_at, revoked_at, disclosure_version, disclosure_text, created_at)
        SELECT account_id, id, phone_number, 'subscribe', ?, NULL, ?, ?, ?
        FROM verified_numbers WHERE account_id = ? AND phone_number = ? AND country = 'US' AND status = 'verified'`)
        .bind(at, SMS_CONSENT_VERSION, SMS_CONSENT_TEXT, at, accountId, phoneNumber).run();
      if (!result.meta.changes) throw new SmsConsentError('choose a US phone number you have verified on this account.');
    },

    async revoke(accountId: string): Promise<void> {
      const at = now();
      await db.prepare(`INSERT INTO sms_consent_events
        (account_id, verified_number_id, phone_number, action, consented_at, revoked_at, disclosure_version, disclosure_text, created_at)
        SELECT account_id, verified_number_id, phone_number, 'revoke', consented_at, ?, disclosure_version, disclosure_text, ?
        FROM sms_consent_events WHERE id = (SELECT id FROM sms_consent_events WHERE account_id = ? ORDER BY id DESC LIMIT 1)
        AND action = 'subscribe'`).bind(at, at, accountId).run();
    },
  };
}
