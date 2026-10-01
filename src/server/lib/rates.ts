/**
 * Per-minute prices for destinations the carrier charges far more to reach than the standard
 * rate (PRICE_PER_MINUTE_CENTS). A call there is held and billed at this price instead.
 * Each is about 1.5x our cost to reach a mobile there: the carrier's outbound rate
 * (telnyx.com/pricing/elastic-sip/<cc>, checked 2026-10-01: AE 0.22, PH 0.192, PA 0.295,
 * GH 0.335, BO 0.357, UA 0.393, JP 0.207 $/min) plus $0.002 Call Control and $0.05 GPT-Live.
 */
export const DESTINATION_PRICE_CENTS: Readonly<Record<string, number>> = { AE: 40, JP: 40, PH: 40, PA: 50, GH: 60, BO: 60, UA: 65 };

const perMinute = (cents: number) => `$${(cents / 100).toFixed(2)}/min`;

/** For agent instructions: the UAE and Japan are reachable from the US number, each at its own price. */
export const ABROAD_CALLING = `UAE and Japanese businesses too, from the account's US number (the business sees a US caller ID), at ${perMinute(DESTINATION_PRICE_CENTS.AE)} and ${perMinute(DESTINATION_PRICE_CENTS.JP)}`;
