import { EXAMPLES, type CallExample } from './examples';
import { HOLD_TIMES, holdSummary, type HoldTime } from './hold-times';

/**
 * One page per errand people ask an AI to phone for ("an AI that waits on hold for me"),
 * each answering that question first and then showing the recorded calls behind the answer.
 * Every fact here is stated by the linked post, the example call, or the hold-time data, and
 * the price comes from the live per-minute rate. Keep each sentence true to its source.
 */
export type TaskKey = 'holdForMe' | 'doctorAppointment' | 'cancelSubscription' | 'restaurantReservation' | 'customerService' | 'negotiateBills' | 'disputeCharge';

export interface TaskPost {
  slug: string;
  /** Link text for the post. */
  label: string;
  /** What the post's recorded call established, in the post's own facts. */
  fact: string;
}

export interface Task {
  key: TaskKey;
  /** The page's h1 and title: the question, answered. */
  title: string;
  /** The opening paragraphs: what call4me does for this errand, how, and what it costs. */
  answer: (perMinute: string) => string[];
  how: string[];
  examples: CallExample[];
  holdHeading?: string;
  holds: HoldTime[];
  posts: TaskPost[];
  /** First step of the setup prompt: what the assistant asks the user for this errand. */
  ask: string;
}

const examples = (...slugs: string[]) => slugs.map((slug) => {
  const example = EXAMPLES.find((e) => e.slug === slug);
  if (!example) throw new Error(`task example ${slug} is missing`);
  return example;
});
const holds = (...slugs: string[]) => slugs.map((slug) => {
  const row = HOLD_TIMES.find((r) => r.id === slug);
  if (!row) throw new Error(`task hold time ${slug} is missing`);
  return row;
});

const summary = holdSummary();
const list = (items: readonly string[]) => `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
const costs = (perMinute: string) => `calls cost ${perMinute} from pickup and half that on hold, and unanswered calls are free.`;
const joinWhenAnswered = 'ask your assistant to connect you "as soon as a person picks up": your phone rings from your call4me number, you press 1 to join, and the AI caller goes quiet. press * or hang up to hand the call back to it.';

export const TASKS: Task[] = [
  {
    key: 'holdForMe',
    title: 'An AI that waits on hold for you',
    answer: (perMinute) => [
      `call4me is an AI that waits on hold for you. ask your AI assistant (ChatGPT, Claude or Codex) to call a company, and call4me dials it, gets through the phone menu, sits in the queue, and when a person picks up it either handles your request or rings your phone so you join right then. ${costs(perMinute)}`,
      `the waits are real: on our own recorded calls, the longest hold before a person answered was ${summary.longest.company} at ${summary.longest.timeToHuman}, and across the ${summary.measured} companies we timed, ${summary.overFive} took more than 5 minutes.`,
    ],
    how: [
      `tell your assistant who to call and what you need. to skip the hold music, ${joinWhenAnswered} hold time is still billed, at half the call rate.`,
      'if you would rather not join at all, give it everything the call needs and it talks to the person itself, then brings back the outcome and the transcript. a call still on hold when it reaches its time limit keeps waiting instead of hanging up, as long as your credits cover it.',
      'the route through the phone menu matters too. next to each hold time below is the route that got our call to a person, and your assistant can put that route in the call\'s brief.',
    ],
    examples: examples('spectrum-retention', 'sabai-eugene-reservations', 'wheel-alignment-cost'),
    holdHeading: 'The longest holds we sat through',
    holds: HOLD_TIMES.filter((r) => r.status === 'measured').slice(0, 6),
    posts: [
      { slug: 'how-long-to-reach-a-human', label: 'How long it takes to reach a human at 74 companies', fact: 'we timed 127 calls to 74 customer service lines. the slowest were Priceline at 25:09, United at 19:09, Delta at 16:15 and Alaska Airlines at 12:44, and on all four most of that was hold time after the menu had already put us in the queue.' },
      { slug: 'priceline-customer-service', label: 'Priceline customer service', fact: 'a live representative answered 25 minutes 9 seconds into the call, after about 22 minutes on hold, once we kept saying we had no trip number.' },
      { slug: 'united-change-flight', label: 'Changing a United flight by phone', fact: 'saying "flight change fee" got the call into the reservations queue, and an agent picked up 19:09 into the call.' },
      { slug: 'spectrum-retention-department', label: 'Calling Spectrum retention', fact: 'a call4me user\'s assistant got through the phone menu, about 5 minutes on hold and an identity check, then the user joined the call and the rep offered two deals.' },
    ],
    ask: 'Ask me which company to call, what I need from them, and whether I want to join when a person picks up.',
  },
  {
    key: 'doctorAppointment',
    title: 'An AI that calls your doctor or dentist to book an appointment',
    answer: (perMinute) => [
      `call4me is an AI that calls your doctor's or dentist's office and books the appointment for you. ask your AI assistant (ChatGPT, Claude or Codex) for a visit, it collects the patient details the office will ask for, and call4me phones the office, talks to the front desk and brings back the confirmed day and time with a transcript. ${costs(perMinute)}`,
    ],
    how: [
      'before it dials, call4me checks it has what a medical or dental call needs: the patient\'s full name and date of birth, a phone number, whether they are a new or existing patient, the reason for the visit, the insurance carrier and member ID (or self-pay), and the days and times that work. your assistant asks you for anything missing in one message.',
      'the days and times you give are what the caller may accept. if the office asks something only you know, the question comes back to your assistant mid-call, and the caller relays your answer on the line. it can also reschedule or cancel a visit, or switch it to a video visit.',
      'the caller calls for you and never claims to be you. it never reads out card numbers, bank details or passwords.',
    ],
    examples: examples('primary-care-new-patient', 'dentist-reschedule', 'doctor-telehealth-switch', 'eye-exam-booking'),
    holdHeading: 'Medical phone lines we timed',
    holds: holds('simonmed-imaging-phone-number', 'blue-shield-of-california-dental-phone-number'),
    posts: [
      { slug: 'reschedule-dentist-appointment', label: 'Rescheduling a dentist appointment', fact: 'a call4me user\'s assistant asked to move a Thursday 3:30 appointment to "Friday after three or anytime Monday" and got Monday, October 5 at noon with the same dentist, in a call under two minutes. the user wrote afterwards: "It works great! Got my first dentist appointment rescheduled :)"' },
      { slug: 'how-to-find-a-new-primary-care-doctor', label: 'Finding a new primary care doctor', fact: '15 recorded calls to 10 practices in and around Baltimore, each asked the same four questions, booked two new-patient visits, about 5 and 6 weeks out.' },
      { slug: 'follow-up-appointment-telehealth', label: 'Booking a follow-up, then switching it to telehealth', fact: 'a doctor\'s office in Manhattan booked an in-person follow-up for Tuesday, October 6 at 2 p.m., and a second call a few minutes later turned it into a Zoom visit at the same day and time.' },
      { slug: 'reschedule-doctor-appointment', label: 'Rescheduling a doctor appointment', fact: 'the office\'s virtual assistant confirmed an earlier Thursday appointment was already canceled, and after a transfer to scheduling a representative offered Thursday at 1:30 PM or Friday at 11:30 AM.' },
      { slug: 'same-day-eye-exam-brooklyn', label: 'A same day eye exam in Williamsburg', fact: 'an assistant called three eye practices at the same time for a new patient with a painful red eye, and Brooklyn Eye Center offered 10:00 or 11:30 AM the same morning.' },
      { slug: 'customer-story-dental-appointments', label: 'Araa\'s dental appointments', fact: 'Araa used Muse and call4me for dental scheduling, and a followup call checked insurance and confirmed the initial consultation was free. Araa\'s reaction on X: "Just got my mind blown by the call quality"' },
    ],
    ask: 'Ask me who the appointment is for, which office, what it is for, and which days and times work.',
  },
  {
    key: 'cancelSubscription',
    title: 'An AI that calls to cancel a subscription for you',
    answer: (perMinute) => [
      `call4me is an AI that calls a company to cancel a subscription for you. tell your AI assistant (ChatGPT, Claude or Codex) what to cancel and what it may accept instead, and call4me phones the company, gets through the menu and the hold, asks for the cancellation, and rings your phone if the company will only deal with the account holder. ${costs(perMinute)}`,
    ],
    how: [
      'give it the account details the company will ask for, and what it may agree to: a retention offer under a price you set, or go ahead and cancel. the caller calls for you and never claims to be you, so when a rep insists on the account holder, you join the call. ' + joinWhenAnswered,
      'companies verify you before they cancel. Audible sends an approval link to the phone number or email on the account. a Factor representative said phone cancellation needs the account holder\'s full name and email, and that cancelling the account does not itself cancel an upcoming order.',
      'not every company cancels by phone. the Planet Fitness clubs we called did not offer cancelling over the phone, Crunch\'s Polk Street club said a call gives instructions but does not itself complete the cancellation, and an LA Fitness club said in person only. a call still finds out the accepted route for your account and what you have left to do.',
      'most of the cancel calls below were our own general questions for a guide, with no subscription to cancel. the Spectrum call was a call4me user\'s own account.',
    ],
    examples: examples('spectrum-retention', 'siriusxm-cancellation-inquiry'),
    holdHeading: 'How long the cancel lines took to reach a person',
    holds: holds('spectrum-retention-department', 'directv-customer-service', 'cancel-audible', 'cancel-factor', 'cancel-fubo', 'cancel-hellofresh', 'how-to-cancel-siriusxm'),
    posts: [
      { slug: 'spectrum-retention-department', label: 'Calling Spectrum retention', fact: 'saying "cancel my account", then "disconnect", reached Spectrum\'s retention team after about 5 minutes on hold. the user joined the call and got $55 a month for a year instead of $85.' },
      { slug: 'cancel-audible', label: 'Cancelling Audible', fact: 'an associate answered 2 minutes after we dialed and said cancellation takes effect on the last day of the current billing cycle, with no further charges.' },
      { slug: 'cancel-factor', label: 'Cancelling Factor', fact: 'a keypad menu answers, not a person, and a representative answered about 2 minutes after we dialed on both of our calls.' },
      { slug: 'cancel-fubo', label: 'Cancelling Fubo', fact: 'Fubo\'s AI assistant answers. we asked for a human twice, chose customer service, and a representative answered 1 minute 59 seconds after we dialed.' },
      { slug: 'cancel-hellofresh', label: 'Cancelling HelloFresh', fact: 'HelloFresh\'s guide says to cancel by 11:59 pm PST, five days before your next delivery. by phone, a representative answered 1 minute 40 seconds after we dialed.' },
      { slug: 'how-to-cancel-siriusxm', label: 'Cancelling SiriusXM', fact: 'a virtual assistant answered. after we asked for a person twice it transferred us, and the representative confirmed direct subscribers can cancel by phone or online chat and get an email confirmation.' },
      { slug: 'cancel-planet-fitness', label: 'Cancelling Planet Fitness', fact: 'on the same evening, one San Francisco club said Classic has a 12 month commitment and a $58 fee to leave early, while the other described no commitment at all.' },
    ],
    ask: 'Ask me which subscription to cancel, the account details the company will need, and what the caller may accept instead of cancelling.',
  },
  {
    key: 'restaurantReservation',
    title: 'An AI that calls a restaurant to book a reservation for you',
    answer: (perMinute) => [
      `call4me is an AI that calls the restaurant and books the table for you. tell your AI assistant (ChatGPT, Claude or Codex) the restaurant, the date, the party size, the name and the times you would accept, and call4me phones the restaurant, talks to the host and brings back the confirmed booking with a transcript. ${costs(perMinute)}`,
    ],
    how: [
      'before it dials, call4me checks it has the name for the reservation, the party size, the date, the time and the range you would accept, and a phone number. seating and the occasion are optional. the time range is what the caller may agree to, and anything the restaurant asks that only you know comes back to your assistant mid-call.',
      'it can also change or cancel a booking, or ask about a private room or the waitlist.',
      'ask for the details that matter to you before it hangs up. on the call to Pin On Grand, the time and party size were confirmed, but indoor seating was not guaranteed.',
    ],
    examples: examples('dinner-reservation', 'pin-on-grand-reservations', 'sabai-eugene-reservations', 'private-dining-m-hansik', 'cancel-reservation'),
    holds: [],
    posts: [
      { slug: 'customer-story-rick-dinner-reservation', label: 'How Rick booked dinner with one prompt', fact: 'Rick Manelius\'s assistant used call4me to call Farmer\'s Grain, and staff confirmed a table for two on Saturday, October 3 at 5 pm. the call record shows 56 billed seconds and a charge of 25 cents. Rick on X: "Booked a dinner reservation in one prompt. Only cost me 25 cents."' },
      { slug: 'book-dinner-reservation-by-phone', label: 'Making a restaurant reservation by phone', fact: 'a call4me customer\'s assistant asked for a table for four on Thursday, October 8 at 7:30 PM, and staff explicitly confirmed the table for that date and time.' },
      { slug: 'equal-parts-sf-reservations', label: 'A same night table at Equal Parts SF', fact: 'the first offer was 8:30 PM. staff said they were fully committed between 5:45 and 8:15 PM, then offered a lounge table, and the call ended with "you\'re all set for 7 p.m."' },
      { slug: 'la-mar-san-francisco-reservations', label: 'A same night table at La Mar San Francisco', fact: 'a staff member picked up about 34 seconds into the recording, rode out a frozen computer and booked two people for 7:00 PM that night.' },
      { slug: 'ugly-baby-brooklyn-reservations', label: 'A table for 12 at Ugly Baby in Brooklyn', fact: 'for a birthday dinner for 12, the staff member offered 8 PM, and repeated "eight for twelve people" back.' },
    ],
    ask: 'Ask me the restaurant, the date, the party size, the name for the reservation, and the times I would accept.',
  },
  {
    key: 'customerService',
    title: 'An AI that calls customer service for you',
    answer: (perMinute) => [
      `call4me is an AI that calls customer service for you. ask your AI assistant (ChatGPT, Claude or Codex) to call a company about a refund, a bill, a booking or a stuck order, and call4me dials, gets through the phone tree and the hold, talks to the rep and brings back what they said with a transcript, or patches you in when they want the account holder. ${costs(perMinute)}`,
      `we have called the customer service lines of ${summary.companies} companies and published the recordings. across the ${summary.measured} where we timed the wait, the median time to a person was ${summary.median}. an AI or virtual assistant answered first at ${summary.aiFirst} of the ${summary.companies}, and no call we placed reached a person at ${list(summary.neverReached.map((r) => r.company))}.`,
    ],
    how: [
      'the route through the phone tree matters. next to each company below is the route that got our call to a person, and your assistant can put that route in the call\'s brief.',
      `give it the account details the company will ask for and what it may agree to. if the rep asks something only you know, the question comes back to your assistant mid-call. when a company will only deal with the account holder, ${joinWhenAnswered}`,
    ],
    examples: examples('expedite-review', 'etihad-complaint-follow-up', 'costco-tire-order'),
    holdHeading: 'What got us to a person',
    holds: holds('delta-customer-service', 'paypal-customer-service-number', 'venmo-customer-service-number', 'amazon-pharmacy-phone-number', 'airbnb-customer-service-number', 'bank-of-america-customer-service', 't-mobile-customer-service-number', 'cash-app-customer-service-number'),
    posts: [
      { slug: 'how-long-to-reach-a-human', label: 'How long it takes to reach a human at 74 companies', fact: 'we timed 127 calls to 74 customer service lines, and 38 of the 127 never reached a person.' },
      { slug: 'customer-story-flight-credit', label: 'A $100 JSX voucher by phone', fact: 'Grok Bot and call4me called JSX Reservations about a delayed flight and got Jem a $100 courtesy travel voucher, valid for one year. Jem on X: "literally zero chance i was going to do that myself"' },
      { slug: 'amazon-pharmacy-phone-number', label: 'Amazon Pharmacy customer care', fact: 'the representative said she would mark the stuck prescriptions as important, and the "ready to order" email arrived 48 minutes after we dialed.' },
      { slug: 'priceline-customer-service', label: 'Priceline customer service', fact: 'saying we had no trip number, again and again, reached a live representative 25 minutes 9 seconds into the call.' },
    ],
    ask: 'Ask me which company to call, what I need from them, the account details they will ask for, and whether I want to join when a person picks up.',
  },
  {
    key: 'negotiateBills',
    title: 'An AI that calls to negotiate your bills',
    answer: (perMinute) => [
      `call4me is an AI that calls to negotiate your bills. ask your AI assistant (ChatGPT, Claude or Codex) to call your hospital, internet, TV or phone company, and call4me gets through the phone tree and the hold, asks for the discounts, promotions and payment plans they offer, and rings your phone when they want the account holder on the line. ${costs(perMinute)}`,
      'on our recorded calls, the savings came from asking for specific things, not from haggling. Spectrum\'s retention team cut a call4me user\'s internet from $85 to $55 a month for a year. Advocate Health quoted a 50% discount for uninsured patients. and two of the three hospital billing offices we called said they don\'t settle balances.',
    ],
    how: [
      'give it what the company will ask for: the account or guarantor number and the name on the account, and for a hospital bill, your household size and income if you want it to ask about financial assistance. then say what it may accept: a promotion under a price you set, an interest-free payment plan, or nothing until you decide.',
      `most companies only change a bill for the account holder. Verizon, DIRECTV and Spectrum all said so on our calls. when they ask for you, ${joinWhenAnswered}`,
      'name the reason instead of asking for a person. "a billing question. My bill is too high." got AT&T\'s voice system to a representative in 1 minute 59 seconds, and asking for a "representative" with no reason got us hung up on.',
    ],
    examples: examples('spectrum-retention'),
    holdHeading: 'How long the billing lines took to reach a person',
    holds: holds('cleveland-clinic', 'advocate-health', 'hca-florida-northside-hospital', 'how-to-lower-att-bill', 'how-to-lower-xfinity-bill', 'spectrum-retention-department'),
    posts: [
      { slug: 'how-to-negotiate-a-hospital-bill', label: 'How to negotiate a hospital bill', fact: 'we called Cleveland Clinic, Advocate Health and HCA Florida Northside. Advocate quoted 50% off for uninsured patients and HCA a 20% prompt-pay discount offered by email in the first 72 hours. asked about settling a balance after insurance, Cleveland Clinic said "that\'s going to be the payment plan" and Advocate said "we don\'t do any settlement options."' },
      { slug: 'how-to-lower-spectrum-bill', label: 'How to lower a Spectrum bill', fact: 'saying "cancel my account," then "disconnect," reached Spectrum\'s retention team, and the call took a call4me user\'s internet bill from $85 a month to $55 a month for a year, with no contract.' },
      { slug: 'how-to-lower-verizon-bill', label: 'How to lower a Verizon bill', fact: 'on our own family account, a live agent said switching 3 lines to Unlimited Welcome would take the bill from $219.08 to $170.58 a month, surcharges and taxes included.' },
      { slug: 'how-to-lower-att-bill', label: 'How to lower an AT&T bill', fact: '"a billing question. My bill is too high." reached a representative 1 minute 59 seconds in, who described the "converged discount" for bundling internet and wireless and $5 off per line on four lines.' },
      { slug: 'how-to-lower-xfinity-bill', label: 'How to lower an Xfinity bill', fact: 'a billing representative said new promotions come from the billing department, gave 500 Mbps promotions of $65, $70 and $75 as examples depending on area and term, and a $10 AutoPay and paperless discount.' },
      { slug: 'how-to-lower-directv-bill', label: 'How to lower a DIRECTV bill', fact: 'a representative said there is no retention option in the phone menu: ask customer service or billing to speak with retention, and the account holder has to make the call.' },
    ],
    ask: 'Ask me which bill to call about, the account details they will ask for, what I would accept (a promotion under a price, a payment plan, financial assistance), and whether I want to join when they ask for the account holder.',
  },
  {
    key: 'disputeCharge',
    title: 'An AI that calls your bank to dispute a charge',
    answer: (perMinute) => [
      `call4me is an AI that calls your bank or card company to dispute a charge for you. tell your AI assistant (ChatGPT, Claude or Codex) the merchant, the date, the amount and what went wrong, and call4me dials the number on your card, gets through the phone tree to the disputes team, and rings your phone when they need the cardholder to verify. ${costs(perMinute)}`,
      'we called the card lines at Chase, Capital One, Discover, PNC and Wells Fargo on the same evening, and all five put us through to a person. the thing three of them left out matters most: for a credit card, federal law gives you 60 days from the statement that first showed the charge to send a written dispute, and a phone call alone may not protect you.',
    ],
    how: [
      'the bank will verify you before it opens a dispute: Chase asked for the card number and then the full Social Security number, Discover for the last four of the Social Security number, and PNC and Wells Fargo for the card or account number. the caller calls for you and never claims to be you, and it never reads out card numbers, bank details or passwords, so when the bank needs the cardholder, ' + joinWhenAnswered,
      'say "dispute" at the menu instead of asking for a representative. Chase has a "press three" option for disputes, PNC confirms "you\'d like to dispute a transaction," and Discover sends you to its billing disputes team.',
      'after the call, follow up in writing for a credit card dispute, at the card company\'s billing error address or web form, and keep the reference number. Discover\'s own cardmember agreement says: "You may call us, but if you do we are not necessarily required to investigate any potential errors."',
    ],
    examples: [],
    holdHeading: 'How long the dispute lines took to reach a person',
    holds: holds('chase-dispute-charge', 'discover-dispute-charge', 'pnc-dispute-charge'),
    posts: [
      { slug: 'how-to-dispute-a-charge', label: 'How to dispute a charge by phone: credit card vs debit card', fact: 'all five banks put us through to a person, Capital One fastest at 0:47 and Wells Fargo at 2:52. asked about a deadline, Wells Fargo said there was no time limit and Chase said "as long as it\'s not pending," while their own websites and federal law say 60 days.' },
      { slug: 'chase-dispute-charge', label: 'Disputing a Chase credit card charge', fact: 'after the card number, the menu offers "for an unrecognized purchase, or to file a dispute, press three." a specialist answered 2 minutes 14 seconds in and said the line is open 24/7.' },
      { slug: 'capital-one-dispute-charge', label: 'Disputing a Capital One charge', fact: 'saying "I don\'t have a Capital One card" got "let\'s get you to someone who can help," and a live representative 47 seconds in, who confirmed 1-800-CAPITAL is the right number for disputes.' },
      { slug: 'discover-dispute-charge', label: 'Disputing a Discover charge', fact: 'saying we wanted to dispute a charge got a request for the last four of the Social Security number, then a person in billing disputes 2 minutes 3 seconds in, who wouldn\'t give any information without an account.' },
      { slug: 'pnc-dispute-charge', label: 'Disputing a PNC credit card charge', fact: 'saying we wanted to dispute a charge reached a person 2 minutes 16 seconds in, who said a dispute takes "two to three billing cycles."' },
      { slug: 'wells-fargo-dispute-charge', label: 'Disputing a Wells Fargo credit card charge', fact: 'saying "I don\'t have it" at the card number prompt, then a short reason, reached a person 2 minutes 52 seconds in, who said a dispute takes "60 days." debit card claims use separate Wells Fargo numbers.' },
    ],
    ask: 'Ask me which card and bank, the merchant, date and amount of the charge, what went wrong, and whether I want to join when the bank needs the cardholder.',
  },
];
