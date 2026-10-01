/**
 * Per-minute prices for destinations the carrier charges far more to reach than the standard
 * rate (PRICE_PER_MINUTE_CENTS). A call there is held and billed at this price instead.
 */
export const DESTINATION_PRICE_CENTS: Readonly<Record<string, number>> = { AE: 40 };

const perMinute = (cents: number) => `$${(cents / 100).toFixed(2)}/min`;

/** For agent instructions: the UAE is reachable from the US number, at its own price. */
export const UAE_CALLING = `UAE businesses too, from the account's US number (the business sees a US caller ID), at ${perMinute(DESTINATION_PRICE_CENTS.AE)}`;
