/**
 * Every company we have published a recorded customer service call for, one row each, for the
 * /companies hub. Derived from public/static/blog/how-long-to-reach-a-human.csv (the dataset
 * behind the time-to-a-human post); test/companies.test.ts fails if the two disagree. The
 * number is the one dialed on the call that reached a person (else the first call); the time is
 * from the start of that published recording to the first live person.
 */
export interface Company {
  slug: string;
  name: string;
  industry: Industry;
  number: string | null;
  /** m:ss from the start of the recording, or null when no call reached a person (or the post does not say when). */
  timeToHuman: string | null;
  /** Whether an AI or virtual assistant answered first on that call; null when the post does not say. */
  aiFirst: boolean | null;
  reached: boolean;
  calls: number;
  /** ISO date of the first call. */
  called: string;
}

export const INDUSTRIES = ['airlines and travel', 'banking, payments and credit', 'insurance and health', 'phone, internet and tv', 'shipping', 'shopping and home', 'subscriptions', 'utilities'] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const COMPANIES: Company[] = [
  { slug: 'aaa-insurance-customer-service', name: 'AAA (Mountain West)', industry: 'insurance and health', number: '877-323-4222', timeToHuman: '1:24', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'allstate-customer-service-number', name: 'Allstate', industry: 'insurance and health', number: '800-726-6033', timeToHuman: '2:08', aiFirst: false, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'amazon-pharmacy-phone-number', name: 'Amazon Pharmacy', industry: 'insurance and health', number: '855-745-5725', timeToHuman: '3:40', aiFirst: true, reached: true, calls: 1, called: '2026-09-28' },
  { slug: 'american-airlines-flight-credit', name: 'American Airlines', industry: 'airlines and travel', number: '800-433-7300', timeToHuman: '1:40', aiFirst: false, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'aquasana-return-exception', name: 'Aquasana', industry: 'shopping and home', number: null, timeToHuman: '7:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-06' },
  { slug: 'cancel-audible', name: 'Audible', industry: 'subscriptions', number: '888-283-5051', timeToHuman: '2:00', aiFirst: false, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'delta-customer-service', name: 'Delta', industry: 'airlines and travel', number: '800-221-1212', timeToHuman: '16:15', aiFirst: true, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'directv-customer-service', name: 'DIRECTV', industry: 'phone, internet and tv', number: '800-531-5000', timeToHuman: '2:47', aiFirst: true, reached: true, calls: 2, called: '2026-10-08' },
  { slug: 'etihad-customer-service', name: 'Etihad', industry: 'airlines and travel', number: '+1 914-303-8393', timeToHuman: '2:21', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'experian-phone-number', name: 'Experian', industry: 'banking, payments and credit', number: '1-888-397-3742', timeToHuman: null, aiFirst: false, reached: false, calls: 1, called: '2026-09-30' },
  { slug: 'fabletics-customer-service', name: 'Fabletics', industry: 'shopping and home', number: '1-844-322-5384', timeToHuman: '1:08', aiFirst: true, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'cancel-factor', name: 'Factor', industry: 'subscriptions', number: '(888) 573 5727', timeToHuman: '2:00', aiFirst: false, reached: true, calls: 2, called: '2026-10-03' },
  { slug: 'fedex-customer-service-number', name: 'FedEx', industry: 'shipping', number: '1-800-463-3339', timeToHuman: null, aiFirst: true, reached: false, calls: 4, called: '2026-10-01' },
  { slug: 'fifth-third-bank-customer-service', name: 'Fifth Third Bank', industry: 'banking, payments and credit', number: '800-972-3030', timeToHuman: '1:44', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'fpl-phone-number', name: 'FPL', industry: 'utilities', number: '1-888-988-8249', timeToHuman: '3:07', aiFirst: false, reached: true, calls: 5, called: '2026-10-01' },
  { slug: 'cancel-fubo', name: 'Fubo', industry: 'subscriptions', number: '(844) 441 3826', timeToHuman: '1:59', aiFirst: true, reached: true, calls: 2, called: '2026-10-03' },
  { slug: 'cancel-hellofresh', name: 'HelloFresh', industry: 'subscriptions', number: '(646) 846 3663', timeToHuman: '1:40', aiFirst: false, reached: true, calls: 1, called: '2026-10-03' },
  { slug: 'hertz-customer-service-number', name: 'Hertz', industry: 'airlines and travel', number: '1-800-654-4173', timeToHuman: '3:07', aiFirst: true, reached: true, calls: 3, called: '2026-10-08' },
  { slug: 'hulu-customer-service-number', name: 'Hulu', industry: 'subscriptions', number: '877-824-4858', timeToHuman: '1:28', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'paypal-customer-service-number', name: 'PayPal', industry: 'banking, payments and credit', number: '1-888-221-1161', timeToHuman: '4:30', aiFirst: true, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'pottery-barn-customer-service', name: 'Pottery Barn', industry: 'shopping and home', number: '1-888-779-5176', timeToHuman: '0:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'how-to-cancel-siriusxm', name: 'SiriusXM', industry: 'subscriptions', number: '(866) 635 8641', timeToHuman: null, aiFirst: true, reached: true, calls: 1, called: '2026-10-07' },
  { slug: 'spectrum-retention-department', name: 'Spectrum', industry: 'phone, internet and tv', number: '(833) 267-6094', timeToHuman: '7:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'united-change-flight', name: 'United Airlines', industry: 'airlines and travel', number: '1-800-864-8331', timeToHuman: '19:09', aiFirst: true, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'unitedhealthcare-phone-number', name: 'UnitedHealthcare', industry: 'insurance and health', number: '1-888-585-0631', timeToHuman: '1:04', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'ups-contact-number', name: 'UPS', industry: 'shipping', number: '1-800-742-5877', timeToHuman: '5:57', aiFirst: false, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'usaa-phone-number', name: 'USAA', industry: 'insurance and health', number: '800-531-8722', timeToHuman: '3:28', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'verizon-customer-service', name: 'Verizon', industry: 'phone, internet and tv', number: '800-922-0204', timeToHuman: '5:52', aiFirst: true, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'wayfair-customer-service', name: 'Wayfair', industry: 'shopping and home', number: '844-403-5086', timeToHuman: '1:12', aiFirst: true, reached: true, calls: 2, called: '2026-09-30' },
  { slug: 'windstream-customer-service', name: 'Windstream (Kinetic)', industry: 'phone, internet and tv', number: '(866) 703-8175', timeToHuman: '0:55', aiFirst: false, reached: true, calls: 3, called: '2026-10-08' },
];
