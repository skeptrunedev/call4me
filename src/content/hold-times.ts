import { COMPANIES, type Company } from './companies';

/**
 * Customer service hold times by company, ranked. Every number comes from COMPANIES (itself
 * derived from the time-to-a-human CSV); this file adds, per company, the line from the
 * published transcript that shows the first live person and the route that got us there, in
 * the words of the data post's table. Keep both quotes matching the post and its table.
 */
export const HOLD_UPDATED = '2026-10-24';
export const HOLD_PATH = '/hold-times';
export const HOLD_DATA_PATH = '/static/data/customer-service-hold-times';
export const HOLD_LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
export const HOLD_SOURCE_POST = 'how-long-to-reach-a-human';
export const HOLD_KEYWORDS = ['customer service hold times', 'customer service hold times by company', 'how long to reach a human', 'customer service wait times', 'customer service hold time dataset'];

/**
 * `evidence` is verbatim from the company's post (markdown emphasis removed): the transcript line
 * where the first live person speaks, or the sentence saying no person was reached. `path` is
 * verbatim from the "What got us through" column in the data post's table.
 */
const HOLD_EVIDENCE: Record<string, { evidence: string; path: string }> = {
  'aaa-insurance-customer-service': { evidence: '1:24 Representative: Thank you for calling AAA Insurance. My name is [name removed]. How can I help you?', path: 'Press 4 (membership or insurance quote), then a ZIP code' },
  'aaa-tow-reimbursement': { evidence: '1:08 Representative: AAA reimbursements, how can I help?', path: 'No menu; staying on the line after the recorded mailing instructions' },
  'afternic-domain-broker-phone-number': { evidence: '0:44 Representative: Hi, you\'re through to [broker\'s first name muted] at GoDaddy. How may I help?', path: 'Staying on the line through the greeting, which played twice' },
  'airbnb-customer-service-number': { evidence: '2:27 Representative: Thank you for calling Airbnb. [Name removed] is speaking. How may I help you today?', path: 'Press 2, say "agent", then press 0' },
  'alaska-airlines-customer-service': { evidence: '12:44 Agent: Hi, this is [name removed] in Boise. Can I get your name?', path: 'Telling the virtual assistant our question, then "yes" when it offered to connect us to reservations' },
  'allstate-customer-service-number': { evidence: '2:08 Agent: Welcome to Allstate. My name is [name removed], a licensed insurance agent in your state. How can I help you today?', path: 'Answering every question, even with "I\'m not sure"' },
  'amazon-pharmacy-phone-number': { evidence: '3:40 Representative: Clinical customer care. This is [name removed]. How can I help you?', path: 'Stating the request; the system transferred us' },
  'american-airlines-flight-credit': { evidence: '1:40 Representative: Thank you for calling American Airlines. This is [name removed]. I can see that you\'re calling from the United States to book a new reservation. How can I help you?', path: 'Saying "book a held reservation"' },
  'aquasana-return-exception': { evidence: '7:49 Representative: Good morning, customer service. [Name and adjacent words removed.]', path: 'Staying on hold instead of taking a callback' },
  'how-to-lower-att-bill': { evidence: '1:59 Representative: Thank you for calling AT&T. Who am I speaking with?', path: '"A billing question. My bill is too high.", then "I don\'t have it"' },
  'cancel-audible': { evidence: '2:00 Associate: Hi, thank you for contacting Audible. You are speaking with [name removed]. With who do I have the pleasure to speak to at the moment?', path: 'Typing the digits it reads out, then 2' },
  'bank-of-america-customer-service': { evidence: '2:05 Representative: Hello, thank you for calling Bank of America. This is [name removed] in Scranton, Pennsylvania. This call may be monitored and recorded. May I have your first and last name, please?', path: '"Agent" three times, then "open a new checking account"' },
  'best-buy-return-policy': { evidence: '4:19 Agent: Best Buy Primary Care. My name is [name]. How can I help you today?', path: 'Asking the AI assistant for a live agent about a return' },
  'blue-shield-of-california-dental-phone-number': { evidence: '2:49 Representative: Thank you for calling your Blue Shield of California Dental Plan. My name is [representative name muted]. Who do I have the pleasure of speaking with today?', path: 'Saying the request, then not giving a member ID' },
  'capital-one-customer-service': { evidence: '1:22 Representative: Hi, thank you for calling Capital One. This is [name removed]. May I have your first and last name, please?', path: '"Credit cards", then saying we had no card' },
  'cash-app-customer-service-number': { evidence: '1:35 Representative: Hi, thank you for calling Cash App support. This is [name removed]. How may I help you today?', path: 'Asking the virtual agent three times for a live representative' },
  'chase-dispute-charge': { evidence: '2:14 Specialist: [Name], Chase. Who am I speaking with?', path: 'No account number, "agent", then "0" for a specialist' },
  'chime-customer-service-number': { evidence: '1:21 Representative: We appreciate your business with Chime. This is [name removed]. May I please have your first and last name?', path: 'Press 9 (all other questions), then 0 for an agent' },
  'coinbase-customer-service-number': { evidence: '0:02 Coinbase: Thanks for reaching out to Coinbase. Please refer to our help center at help.coinbase.com for additional support as phone support is currently unavailable.', path: 'Nothing we tried' },
  'costco-return-policy': { evidence: '8:21 Representative: Thank you for calling Costco. This is [name]. How can I help you?', path: 'Press 3 (Costco.com orders and returns), then 2, 1 and 1' },
  'dell-customer-service-number': { evidence: '4:38 Sales agent: Welcome to Dell Sales Reception Desk. [word removed] How can I assist you?', path: 'Sales line: "make a purchase", then "something else"' },
  'delta-customer-service': { evidence: '16:15 Representative: Thank you for calling Delta. This is [name removed] speaking. How may I assist you today?', path: 'No confirmation number, "I need a representative", then hold' },
  'directv-customer-service': { evidence: '2:47 DIRECTV rep: Good evening, thank you for calling DIRECTV. My name is [name removed], who do I have the pleasure of speaking with today?', path: '"Cancel service", no account number, then satellite' },
  'discover-dispute-charge': { evidence: '2:03 Representative: Thank you for calling Discover. My name is [name removed]. I\'m in billing disputes. May I have your name?', path: 'Saying we didn\'t have the Social Security number digits' },
  'doordash-customer-service-number': { evidence: '2:08 Representative: Thank you for calling DoorDash. This is [name removed]. How can I assist?', path: 'Naming the problem ("missing item", then "refund") instead of asking for a representative' },
  'etihad-customer-service': { evidence: '2:21 Agent: Thank you for calling Etihad. My name is [name removed]. How may I assist you today? May I get your name, please?', path: 'Press 1, your cabin class, then 2' },
  'expedia-customer-service-number': { evidence: '3:24 Agent: Hi, thank you for calling. This is [name removed]. How can I help you today?', path: 'Press 1, 6, 2, then 0 at the itinerary prompt' },
  'experian-phone-number': { evidence: 'These routes did not reach a consumer support agent on September 30, 2026.', path: 'Nothing we tried' },
  'fabletics-customer-service': { evidence: '1:08 Consultant: Thank you for calling Fabletics. My name is [name removed]. How may I assist you today?', path: 'Saying we didn\'t have the account phone number' },
  'cancel-factor': { evidence: '2:00 Representative: Hello, thank you for calling Factor. This is [representative name removed]. How can I help?', path: 'Press 4 for account cancellation' },
  'fedex-customer-service-number': { evidence: 'None of the three reached a person, and none got a callback offer.', path: 'A tracking number, then the callback offer' },
  'fifth-third-bank-customer-service': { evidence: '1:44 Representative: Hello, good afternoon. We appreciate you for calling Fifth Third Bank. My name is [name removed]. Can you confirm with your account number or social security number?', path: 'Not entering an account number' },
  'fpl-phone-number': { evidence: '3:07 FPL: Good afternoon, thank you for calling FPL. My name is [name removed]. May I have your name?', path: '"Open a new account", then asking for a representative' },
  'cancel-fubo': { evidence: '1:59 Representative: Thank you for calling Fubo TV Support. My name is [representative name removed]. Who am I speaking with today, please?', path: 'Asking twice for a human, then "customer service"' },
  'geico-customer-service': { evidence: '2:35 GEICO agent: Thank you for calling GEICO. This is [name removed], your licensed professional. How may I help you today?', path: '"Get a new policy", then "auto", and answering every question' },
  'global-blue-customer-service-number': { evidence: '0:24 Representative: Global Blue [unclear word muted, possibly a staff first name], hi', path: 'No menu; a person answered' },
  'cancel-hellofresh': { evidence: '1:40 Representative: Hi, thank you so much for calling HelloFresh. This is [representative name removed]. How can I help?', path: 'The cancellation option' },
  'hertz-customer-service-number': { evidence: '3:07 Hertz representative: Hello, thank you for calling Hertz. My name is [name removed]. May I know your rental record number or your reservation ID number, please?', path: 'Asking for a representative six times' },
  'hulu-customer-service-number': { evidence: '1:28 Representative: Thank you for calling Hulu Support. My name is [name removed]. How can I help you?', path: 'Pressing nothing and staying on the line' },
  'instacart-customer-service-number': { evidence: '0:24 Agent: Thank you for calling Instacart. You\'re through to [name removed]. How can I assist you today?', path: 'Press 1 (English), then press 1 (customer account)' },
  'jetblue-customer-service': { evidence: '1:27 Crew member: Thank you for calling JetBlue. This is [name removed] speaking. Please note that all calls are recorded for quality and training purposes. How can I help?', path: 'Skipping the birthday prompt, then "booking a flight"' },
  'justworks-customer-service': { evidence: '1:03 Representative: Thank you for calling Justworks. My name is [name removed]. May I please have your first and last name?', path: 'Press 2 (administrator), then 1 (benefits)' },
  'lyft-customer-service-number': { evidence: 'Both numbers played a recording sending callers to the Help tab in the Lyft app, then hung up, on October 22, 2026.', path: 'Nothing we tried' },
  'metlife-pet-insurance-phone-number': { evidence: '2:02 Representative: Thank you for calling MetLife Pet. This is [staff name muted]. Who do I have the pleasure of speaking with?', path: 'Press 4 (another question about an existing policy)' },
  'paypal-customer-service-number': { evidence: '4:30 Representative: Hi, this is [name removed], and welcome to PayPal. Can I have your first and last name?', path: '"General question", "something else", then the keypad menu' },
  'peloton-customer-service-number': { evidence: '0:22 Representative: Hello, thank you so much for contacting Supervisor Support. This is [representative name muted].', path: 'The privacy line; no menu, staying on the line' },
  'piedmont-natural-gas-customer-service': { evidence: '2:06 Representative: Thank you for calling Piedmont Natural Gas. [Representative first name muted] speaking. How may I help you today?', path: 'No account number, "help with the website", then residential' },
  'pnc-dispute-charge': { evidence: '2:16 Representative: Hi, good evening. This is [name removed]. May I have your first and last name, please?', path: 'Saying we wanted to dispute a charge, then "other transaction"' },
  'pottery-barn-customer-service': { evidence: '0:49 Representative: Good afternoon, and thank you for calling Pottery Barn. This is [name removed]. How may I help you?', path: 'Saying "customer service"' },
  'priceline-customer-service': { evidence: '25:09 Representative: Thank you for contacting Travel Services. You are through to [representative]. Can I start by getting your first and last name?', path: 'Saying we had no trip number, again and again, then about 22 minutes of hold' },
  'progressive-customer-service': { evidence: '1:30 Agent: Thank you for calling Progressive. My name is [name removed]. How can I help today?', path: 'Asking for a quote on a new policy, then saying the state' },
  'simonmed-imaging-phone-number': { evidence: '0:13 Representative: [Unclear greeting, muted in case it included a staff name] How can I help you?', path: 'The cardiology scheduling line; a short hold, no menu' },
  'how-to-cancel-siriusxm': { evidence: 'Our caller explained that this was a general policy inquiry and asked for a person twice. The system then transferred the call to a human.', path: 'Calling it a general policy question and asking twice for a person' },
  'southwest-airlines-phone-number': { evidence: '4:10 Agent: Thank you for calling Southwest Airlines, [name removed]. Who [do] I have the pleasure of speaking with?', path: 'Saying "representative", then hold; or "existing reservation"' },
  'spectrum-retention-department': { evidence: '7:49 Rep: Thank you for calling Spectrum here in Austin, Texas. My name is [name removed]. Who do I have the pleasure of speaking with today?', path: '"Cancel my account", then "disconnect"' },
  't-mobile-customer-service-number': { evidence: '1:49 Representative: Hi, thank you for calling T-Mobile. This is [name removed]. How can I help?', path: '"I don\'t have one" twice, "representative", then "something else"' },
  'uber-customer-service-number': { evidence: '0:52 Uber: There have been too many invalid entries. For security reasons, we\'ll unfortunately need to end this call.', path: 'Nothing we tried' },
  'united-change-flight': { evidence: '19:09 United agent: Hi, thank you for calling reservations desk. This is [name removed]. How may I help you?', path: '"Flight change fee", then hold' },
  'unitedhealthcare-phone-number': { evidence: '1:04 UnitedHealthcare: Thank you for calling. My name is [name removed], and I\'m a licensed insurance agent. How may I help you today?', path: 'Press 1 (insurance for you or your family)' },
  'ups-contact-number': { evidence: '5:57 UPS agent: Hello, this is [name removed]. May I have your name, please?', path: '"Representative", twice, at the tracking number prompt' },
  'usaa-phone-number': { evidence: '3:28 Representative: Hi, thanks for calling USAA. My name is [name removed] with the eligibility department. How can I help you today?', path: 'Press 1 (not a member), press 2, say "membership" twice' },
  'vanguard-customer-service-number': { evidence: '1:30 Representative: Hi, thank you for calling Vanguard. This is [staff name muted], your Account Maintenance and Beneficiary Specialist on a recorded line. Can I have your first and last name?', path: 'Saying "I\'m just getting started", then no menu choice' },
  'venmo-customer-service-number': { evidence: '4:57 Venmo representative: Thanks for calling Venmo. This is [name removed]. May I have your name, please?', path: 'Press 4, 2, 1, 2 (a dispute by phone), then stay on the line when no account is found' },
  'verizon-customer-service': { evidence: '5:52 Verizon: Hi, you\'ve reached [one word muted: it sounds like "me", and may be the representative\'s name] at Verizon, and it\'s my pleasure to assist you.', path: 'Saying "an agent, please"' },
  'vitalant-phone-number': { evidence: '5:31 Representative: Thank you for calling Vitalant. My name is [name removed]. How can I help you today?', path: 'Staying on the line through the silence after the virtual assistant' },
  'vivint-customer-service-number': { evidence: '2:14 Representative: Thank you for calling Vivint, my name is [representative\'s first name muted]. I\'m from account services and our recorded line. How can I help you today?', path: 'The account phone number, then 6 (bill or account changes), then 4 (billing specialist)' },
  'walmart-customer-service-number': { evidence: '1:15 Representative: Hello, thank you for calling walmart.com. My name is [name removed], and I\'m here to assist. May I have your name, please?', path: 'Asking twice for a representative, with no order number; or describing the problem' },
  'wayfair-customer-service': { evidence: '1:12 Agent: This is your sales agent, [name removed]. How can I help you with your purchase?', path: 'Answering the assistant in one sentence' },
  'wells-fargo-customer-service': { evidence: '2:14 Representative: Thank you for calling Wells Fargo. This is [name removed]. May I have your bank account number or debit card number, please?', path: '"I don\'t have it", "agent", then "checking account question"' },
  'windstream-customer-service': { evidence: '0:55 Rep: Hello, thank you so much for calling Kinetic. My name is [name removed]. Who do I have the pleasure to stay with today?', path: 'The sales line, press 1 (new residential deals)' },
  'how-to-lower-xfinity-bill': { evidence: '6:29 Representative: Hello, thank you for calling Xfinity. My name is [name removed]. How may I assist you today?', path: 'Saying "billing" when the voice assistant asked what the call was about' },
};

export type HoldStatus = 'measured' | 'not measured' | 'never reached a person';
export type FirstAnswer = 'AI or virtual assistant' | 'phone menu' | 'not stated';

export interface HoldTime {
  /** 1 is the longest measured hold; tied times share a rank. Null when there is no time to rank. */
  rank: number | null;
  slug: string;
  company: string;
  industry: Company['industry'];
  number: string | null;
  called: string;
  /** m:ss from the start of the published recording to the first live person. */
  timeToHuman: string | null;
  seconds: number | null;
  status: HoldStatus;
  firstAnswer: FirstAnswer;
  calls: number;
  path: string;
  evidence: string;
  source: string;
}

const toSeconds = (time: string) => {
  const [m, s] = time.split(':').map(Number);
  return m! * 60 + s!;
};
export const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

const STATUS_ORDER: HoldStatus[] = ['measured', 'not measured', 'never reached a person'];

/** Longest measured hold first, then companies we reached without a stated time, then companies we never reached. */
export const HOLD_TIMES: HoldTime[] = (() => {
  const rows = COMPANIES.map((c): Omit<HoldTime, 'rank'> => {
    const quoted = HOLD_EVIDENCE[c.slug];
    if (!quoted) throw new Error(`hold-times: no evidence for ${c.slug}`);
    return {
      slug: c.slug, company: c.name, industry: c.industry, number: c.number, called: c.called,
      timeToHuman: c.timeToHuman, seconds: c.timeToHuman ? toSeconds(c.timeToHuman) : null,
      status: c.timeToHuman ? 'measured' : c.reached ? 'not measured' : 'never reached a person',
      firstAnswer: c.aiFirst === null ? 'not stated' : c.aiFirst ? 'AI or virtual assistant' : 'phone menu',
      calls: c.calls, ...quoted, source: `https://call4.me/blog/${c.slug}`,
    };
  });
  const measured = rows.filter(r => r.seconds !== null).map(r => r.seconds!);
  return rows
    .map(r => ({ rank: r.seconds === null ? null : 1 + measured.filter(s => s > r.seconds!).length, ...r }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (b.seconds ?? 0) - (a.seconds ?? 0) || a.company.localeCompare(b.company));
})();

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** The headline numbers, derived from HOLD_TIMES so the summary can never disagree with the table. */
export function holdSummary() {
  const measured = HOLD_TIMES.filter(r => r.seconds !== null);
  const ai = measured.filter(r => r.firstAnswer === 'AI or virtual assistant');
  const menu = measured.filter(r => r.firstAnswer === 'phone menu');
  const dates = HOLD_TIMES.map(r => r.called).sort();
  return {
    companies: HOLD_TIMES.length,
    measured: measured.length,
    longest: measured[0]!,
    shortest: measured[measured.length - 1]!,
    median: formatSeconds(median(measured.map(r => r.seconds!))),
    aiFirst: HOLD_TIMES.filter(r => r.firstAnswer === 'AI or virtual assistant').length,
    aiMeasured: ai.length,
    aiMedian: formatSeconds(median(ai.map(r => r.seconds!))),
    menuMeasured: menu.length,
    menuMedian: formatSeconds(median(menu.map(r => r.seconds!))),
    overFive: measured.filter(r => r.seconds! > 300).length,
    underTwo: measured.filter(r => r.seconds! < 120).length,
    notMeasured: HOLD_TIMES.filter(r => r.status === 'not measured'),
    neverReached: HOLD_TIMES.filter(r => r.status === 'never reached a person'),
    firstCall: dates[0]!,
    lastCall: dates[dates.length - 1]!,
  };
}

export function holdDataset() {
  return {
    name: 'Customer service hold times by company', schemaVersion: '1.0', version: HOLD_UPDATED,
    url: `https://call4.me${HOLD_PATH}`, creator: 'call4me', license: HOLD_LICENSE,
    licenseScope: 'Measured times, rankings and annotations. Linked recordings and transcripts are published on call4.me with each source post.',
    description: 'Time from the start of a recorded call to the first live person, for customer service lines call4me called and published. One call per company, or the call that reached a person. Not a ranking of service quality.',
    measurement: 'm:ss from the start of the published recording to the first live person, read from the timestamped transcript. Includes the phone menu and the queue. Some recordings shorten silences, so on those the real wait was slightly longer.',
    keywords: HOLD_KEYWORDS,
    companies: HOLD_TIMES,
  };
}

export function holdCsv() {
  const columns = ['rank', 'company', 'industry', 'status', 'time_to_human', 'seconds', 'first_answer', 'number_called', 'call_date', 'calls_placed', 'what_got_through', 'evidence', 'source_url'];
  const quote = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = HOLD_TIMES.map(r => [r.rank, r.company, r.industry, r.status, r.timeToHuman, r.seconds, r.firstAnswer, r.number, r.called, r.calls, r.path, r.evidence, r.source]);
  return [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
