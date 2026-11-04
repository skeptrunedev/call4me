/**
 * Per-minute prices for destinations the carrier charges far more to reach than the standard
 * rate (PRICE_PER_MINUTE_CENTS). A call there is held and billed at this price instead.
 * Each is about 1.5x our cost to reach a mobile there: the carrier's outbound rate
 * (telnyx.com/pricing/elastic-sip/<cc>, checked 2026-10-01: AE 0.22, PH 0.192, PA 0.295,
 * GH 0.335, BO 0.357, UA 0.393, JP 0.207 $/min) plus $0.002 Call Control and $0.05 GPT-Live.
 */
// TH needs no price of its own: $0.084/min to fixed and mobile lines (checked 2026-11-03), inside the
// standard rate. GR's published rate ($0.0325/min to mobiles) is for calls from a European caller ID;
// from a US one a Greek mobile costs $0.4611/min (the carrier's record of a call on 2026-11-03).
// BR's published rate ($0.015/min to mobiles) may likewise be for local caller IDs; until a call's
// record shows the rate from a US one, the standard price stands and MAX_DESTINATION_RATE caps it.
// NP has no published rate; it is in the same position as BR.
export const DESTINATION_PRICE_CENTS: Readonly<Record<string, number>> = { AE: 40, JP: 40, PH: 40, PA: 50, GH: 60, BO: 60, UA: 65, GR: 75 };

/** Calling coverage for descriptions; current prices are returned by the account tools. */
export const ABROAD_CALLING = "UAE and Japanese businesses too, from the account's US number (the business sees a US caller ID)";
