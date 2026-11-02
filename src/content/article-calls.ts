/** Calls supported by the evidence in these articles. A guide to a blocked line is not a dialing invitation. */
export interface ArticleCall {
  business: string;
  chatgpt: boolean;
  description: string;
  ask: string;
}

export const ARTICLE_CALLS: Record<string, ArticleCall> = {
  'mediacom-customer-service-number': {
    business: 'Mediacom',
    chatgpt: false,
    description: 'Have your assistant explain your internet question and wait for a representative. You can join if Mediacom needs to verify the account holder.',
    ask: 'Ask what I need Mediacom to resolve and which service is affected. Use my actual issue and account information when choosing the menu route. Never claim I have no account because the recorded research call had none. Arrange for me to join if Mediacom needs to verify my identity. Ask before changing my plan, accepting a charge or scheduling a technician.',
  },
  'united-airlines-customer-service-number': {
    business: 'United Airlines',
    chatgpt: true,
    description: 'Have your assistant explain your flight question and wait for reservations. You can join if United needs the traveler to verify the booking.',
    ask: 'Ask what I need United to resolve and whether I have a booking. Use my actual issue and travel region when answering the menu. Never reuse the recorded research caller\'s lack of a trip as mine. Ask before changing or canceling a flight, buying a ticket, paying a fee or spending travel credit. Arrange for me to join if United needs the traveler.',
  },
  'hertz-customer-service-number': {
    business: 'Hertz',
    chatgpt: true,
    description: 'Have your assistant ask about your rental and bring back the answer. The right line depends on whether you need reservations or help with a completed rental.',
    ask: 'Ask what I need Hertz to resolve and whether the rental is booked, active or already returned. Check the current official contact route for that situation. Supply only my actual rental details and answer if the phone assistant speaks again after promising a transfer. Ask before making a booking, changing the rental or accepting a charge. Arrange for me to join if Hertz needs the renter.',
  },
  'hulu-customer-service-number': {
    business: 'Hulu',
    chatgpt: true,
    description: 'Have your assistant explain your Hulu question and ask for a person when needed. You can join if Hulu needs to verify the account holder.',
    ask: 'Ask what I need Hulu to resolve, which plan I use and how I pay for it. Choose the current menu route for my actual issue; do not assume I want to cancel because the recording asks about cancellation. Ask before canceling or pausing a subscription, changing a plan or accepting a charge. Arrange for me to join for account verification and never ask me to paste passwords or verification codes into chat.',
  },
  'alaska-airlines-customer-service': {
    business: 'Alaska Airlines',
    chatgpt: true,
    description: 'Have your assistant ask about your Alaska trip and wait for the right team. Reservations and questions after a trip use different contacts.',
    ask: 'Ask what I need Alaska Airlines to resolve and whether the issue concerns an upcoming trip or a completed flight. Verify the current official contact for that issue. Explain my actual request and accept a transfer to the right team when offered. Ask before changing or canceling a booking, paying a fare difference or accepting a credit. Arrange for me to join if Alaska needs the traveler.',
  },
  'best-buy-customer-service-number': {
    business: 'Best Buy',
    chatgpt: true,
    description: 'Have your assistant ask about your purchase and request a person when needed. You can join if Best Buy needs the account holder.',
    ask: 'Ask what I need Best Buy to resolve before calling. The guide tested return questions; choose the route for my actual issue. Do not promise an exception or assume the recorded wait applies to me. Ask before changing an order, starting a return, accepting store credit, buying a service or scheduling a repair.',
  },
  'enterprise-customer-service-number': {
    business: 'Enterprise',
    chatgpt: true,
    description: 'Have your assistant ask about your rental and bring back the next step. The right contact may be your rental branch or central customer service.',
    ask: 'Ask what I need Enterprise to resolve, whether I have picked up or returned the vehicle, and which location handled it. Follow the current official instructions for choosing the rental branch or central support. Never reuse the recorded call\'s hypothetical location as mine. Ask before extending the rental, changing the return location, accepting a charge or making a new reservation. Arrange for me to join if Enterprise needs the renter.',
  },
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
