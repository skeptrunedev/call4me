/** Calls supported by the evidence in these articles. A guide to a blocked line is not a dialing invitation. */
export interface ArticleCall {
  business: string;
  chatgpt: boolean;
  description: string;
  ask: string;
}

export const ARTICLE_CALLS: Record<string, ArticleCall> = {
  'expedia-customer-service-number': {
    business: 'Expedia',
    chatgpt: true,
    description: 'Have your assistant call about your booking, wait for a representative, and bring back the answer. You can join if Expedia needs the account holder.',
    ask: 'Ask what I need Expedia to resolve and collect the booking details needed for that task. Use the guide for the phone menu, but never reuse its general research questions as my goal. Ask before accepting a booking change, cancellation or charge.',
  },
  'priceline-customer-service': {
    business: 'Priceline',
    chatgpt: true,
    description: 'Have your assistant get through the phone menu and hold for your booking question. You can join when a representative needs you.',
    ask: 'Ask what I need Priceline to resolve and whether I have a trip number. Read the guide for the route that fits my situation. Never claim I have no booking just because the recorded research call had none. Ask before accepting a booking change, cancellation or charge.',
  },
  'booking-com-customer-service-number': {
    business: 'Booking.com',
    chatgpt: true,
    description: 'Have your assistant ask about your reservation or a problem with the property. You can join if Booking.com needs to verify the guest.',
    ask: 'Ask what I need Booking.com to resolve and collect only the reservation details permitted by your calling tools. Never ask for a reservation PIN, password or account secret in chat; arrange for me to join and give it directly to the representative. Do not promise a relocation or refund based on the general answers in the article. Ask before accepting a booking change, cancellation or charge.',
  },
  'spectrum-retention-department': {
    business: 'Spectrum',
    chatgpt: false,
    description: 'Have your assistant ask about your bill and wait for retention. You can join to verify the account and decide whether an offer works for you.',
    ask: 'Ask what I want to change about my Spectrum bill and what I may accept. Do not request cancellation, add a mobile line or accept a contract without my explicit agreement. The offer in the article belongs to a different account and is not a promised result. Arrange for me to join if Spectrum requires the account holder.',
  },
};
