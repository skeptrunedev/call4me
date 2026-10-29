/**
 * Every company we have published a recorded customer service call for, one row each, for the
 * /companies hub. Derived from public/static/blog/how-long-to-reach-a-human.csv (the dataset
 * behind the time-to-a-human post); keep the two in agreement. The
 * number is the one dialed on the call that reached a person (else the first call); the time is
 * from the start of that published recording to the first live person.
 */
export interface Company {
  /** The post with the recording. Several companies can share one post (the hospital bill guide). */
  slug: string;
  /** Unique row id when the post covers more than one company; defaults to slug. */
  id?: string;
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
  { slug: 'aaa-tow-reimbursement', name: 'AAA Northeast (reimbursements)', industry: 'insurance and health', number: '1-844-765-6428', timeToHuman: '1:08', aiFirst: false, reached: true, calls: 1, called: '2026-10-15' },
  { slug: 'how-to-negotiate-a-hospital-bill', id: 'advocate-health', name: 'Advocate Health', industry: 'insurance and health', number: '847-795-2300', timeToHuman: '5:18', aiFirst: false, reached: true, calls: 1, called: '2026-10-26' },
  { slug: 'afternic-domain-broker-phone-number', name: 'Afternic (GoDaddy)', industry: 'shopping and home', number: '+44 20 7255 0717', timeToHuman: '0:44', aiFirst: false, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'airbnb-customer-service-number', name: 'Airbnb', industry: 'airlines and travel', number: '1-844-234-2500', timeToHuman: '2:27', aiFirst: false, reached: true, calls: 2, called: '2026-10-16' },
  { slug: 'alaska-airlines-customer-service', name: 'Alaska Airlines', industry: 'airlines and travel', number: '1-800-252-7522', timeToHuman: '12:44', aiFirst: true, reached: true, calls: 1, called: '2026-10-22' },
  { slug: 'allstate-customer-service-number', name: 'Allstate', industry: 'insurance and health', number: '800-726-6033', timeToHuman: '2:08', aiFirst: false, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'amazon-customer-service-number', name: 'Amazon', industry: 'shopping and home', number: '1-888-280-4331', timeToHuman: '3:17', aiFirst: true, reached: true, calls: 2, called: '2026-10-13' },
  { slug: 'amazon-pharmacy-phone-number', name: 'Amazon Pharmacy', industry: 'insurance and health', number: '855-745-5725', timeToHuman: '3:40', aiFirst: true, reached: true, calls: 1, called: '2026-09-28' },
  { slug: 'american-airlines-flight-credit', name: 'American Airlines', industry: 'airlines and travel', number: '800-433-7300', timeToHuman: '1:40', aiFirst: false, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'aquasana-return-exception', name: 'Aquasana', industry: 'shopping and home', number: null, timeToHuman: '7:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-06' },
  { slug: 'att-customer-service-number', name: 'AT&T', industry: 'phone, internet and tv', number: '1-800-331-0500', timeToHuman: '44:30', aiFirst: false, reached: true, calls: 4, called: '2026-10-13' },
  { slug: 'cancel-audible', name: 'Audible', industry: 'subscriptions', number: '888-283-5051', timeToHuman: '2:00', aiFirst: false, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'bank-of-america-customer-service', name: 'Bank of America', industry: 'banking, payments and credit', number: '800.432.1000', timeToHuman: '2:05', aiFirst: false, reached: true, calls: 2, called: '2026-10-16' },
  { slug: 'best-buy-return-policy', name: 'Best Buy', industry: 'shopping and home', number: '1-888-237-8289', timeToHuman: '4:19', aiFirst: true, reached: true, calls: 2, called: '2026-10-24' },
  { slug: 'blue-shield-of-california-dental-phone-number', name: 'Blue Shield of California (dental)', industry: 'insurance and health', number: '1-877-885-0254', timeToHuman: '2:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'booking-com-customer-service-number', name: 'Booking.com', industry: 'airlines and travel', number: '+44 20 3320 2624', timeToHuman: '4:10', aiFirst: false, reached: true, calls: 1, called: '2026-10-29' },
  { slug: 'capital-one-customer-service', name: 'Capital One', industry: 'banking, payments and credit', number: '1-877-383-4802', timeToHuman: '1:22', aiFirst: false, reached: true, calls: 1, called: '2026-10-16' },
  { slug: 'cash-app-customer-service-number', name: 'Cash App', industry: 'banking, payments and credit', number: '1-800-969-1940', timeToHuman: '1:35', aiFirst: true, reached: true, calls: 2, called: '2026-10-16' },
  { slug: 'chase-dispute-charge', name: 'Chase', industry: 'banking, payments and credit', number: '1-800-432-3117', timeToHuman: '2:14', aiFirst: false, reached: true, calls: 1, called: '2026-10-24' },
  { slug: 'chime-customer-service-number', name: 'Chime', industry: 'banking, payments and credit', number: '(844) 244-6363', timeToHuman: '1:21', aiFirst: false, reached: true, calls: 1, called: '2026-10-22' },
  { slug: 'how-to-negotiate-a-hospital-bill', id: 'cleveland-clinic', name: 'Cleveland Clinic', industry: 'insurance and health', number: '866-621-6385', timeToHuman: '4:57', aiFirst: false, reached: true, calls: 1, called: '2026-10-26' },
  { slug: 'coinbase-customer-service-number', name: 'Coinbase', industry: 'banking, payments and credit', number: '1-888-908-7930', timeToHuman: null, aiFirst: false, reached: false, calls: 2, called: '2026-10-22' },
  { slug: 'costco-customer-service', name: 'Costco', industry: 'shopping and home', number: '1-800-774-2678', timeToHuman: '14:09', aiFirst: false, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'dell-customer-service-number', name: 'Dell', industry: 'shopping and home', number: '1-877-275-3355', timeToHuman: '4:38', aiFirst: false, reached: true, calls: 3, called: '2026-10-22' },
  { slug: 'delta-customer-service', name: 'Delta', industry: 'airlines and travel', number: '800-221-1212', timeToHuman: '16:15', aiFirst: true, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'directv-customer-service', name: 'DIRECTV', industry: 'phone, internet and tv', number: '800-531-5000', timeToHuman: '2:47', aiFirst: true, reached: true, calls: 2, called: '2026-10-08' },
  { slug: 'discover-dispute-charge', name: 'Discover', industry: 'banking, payments and credit', number: '1-800-347-2683', timeToHuman: '2:03', aiFirst: false, reached: true, calls: 1, called: '2026-10-24' },
  { slug: 'doordash-customer-service-number', name: 'DoorDash', industry: 'shopping and home', number: '855-431-0459', timeToHuman: '2:08', aiFirst: true, reached: true, calls: 1, called: '2026-10-09' },
  { slug: 'etihad-customer-service', name: 'Etihad', industry: 'airlines and travel', number: '+1 914-303-8393', timeToHuman: '2:21', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'expedia-customer-service-number', name: 'Expedia', industry: 'airlines and travel', number: '1-866-310-5768', timeToHuman: '3:24', aiFirst: false, reached: true, calls: 2, called: '2026-10-16' },
  { slug: 'experian-phone-number', name: 'Experian', industry: 'banking, payments and credit', number: '1-888-397-3742', timeToHuman: null, aiFirst: false, reached: false, calls: 2, called: '2026-09-30' },
  { slug: 'fabletics-customer-service', name: 'Fabletics', industry: 'shopping and home', number: '1-844-322-5384', timeToHuman: '1:08', aiFirst: true, reached: true, calls: 1, called: '2026-10-02' },
  { slug: 'cancel-factor', name: 'Factor', industry: 'subscriptions', number: '(888) 573 5727', timeToHuman: '2:00', aiFirst: false, reached: true, calls: 2, called: '2026-10-03' },
  { slug: 'fedex-customer-service-number', name: 'FedEx', industry: 'shipping', number: '1-800-463-3339', timeToHuman: null, aiFirst: true, reached: false, calls: 4, called: '2026-10-01' },
  { slug: 'fifth-third-bank-customer-service', name: 'Fifth Third Bank', industry: 'banking, payments and credit', number: '800-972-3030', timeToHuman: '1:44', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'fpl-phone-number', name: 'FPL', industry: 'utilities', number: '1-888-988-8249', timeToHuman: '3:07', aiFirst: false, reached: true, calls: 5, called: '2026-10-01' },
  { slug: 'cancel-fubo', name: 'Fubo', industry: 'subscriptions', number: '(844) 441 3826', timeToHuman: '1:59', aiFirst: true, reached: true, calls: 2, called: '2026-10-03' },
  { slug: 'geico-customer-service', name: 'GEICO', industry: 'insurance and health', number: '(800) 207-7847', timeToHuman: '2:35', aiFirst: true, reached: true, calls: 2, called: '2026-10-09' },
  { slug: 'global-blue-customer-service-number', name: 'Global Blue', industry: 'airlines and travel', number: '+46 8 545 284 40', timeToHuman: '0:24', aiFirst: false, reached: true, calls: 1, called: '2026-10-16' },
  { slug: 'how-to-negotiate-a-hospital-bill', id: 'hca-florida-northside-hospital', name: 'HCA Florida Northside Hospital', industry: 'insurance and health', number: '800-733-0483', timeToHuman: '2:41', aiFirst: true, reached: true, calls: 1, called: '2026-10-26' },
  { slug: 'cancel-hellofresh', name: 'HelloFresh', industry: 'subscriptions', number: '(646) 846 3663', timeToHuman: '1:40', aiFirst: false, reached: true, calls: 1, called: '2026-10-03' },
  { slug: 'hertz-customer-service-number', name: 'Hertz', industry: 'airlines and travel', number: '1-800-654-4173', timeToHuman: '3:07', aiFirst: true, reached: true, calls: 3, called: '2026-10-08' },
  { slug: 'home-depot-customer-service', name: 'Home Depot', industry: 'shopping and home', number: '1-800-430-3376', timeToHuman: '1:34', aiFirst: true, reached: true, calls: 2, called: '2026-10-13' },
  { slug: 'hulu-customer-service-number', name: 'Hulu', industry: 'subscriptions', number: '877-824-4858', timeToHuman: '1:28', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'instacart-customer-service-number', name: 'Instacart', industry: 'shopping and home', number: '1-888-246-7822', timeToHuman: '0:24', aiFirst: false, reached: true, calls: 1, called: '2026-10-22' },
  { slug: 'jetblue-customer-service', name: 'JetBlue', industry: 'airlines and travel', number: '1-800-538-2583', timeToHuman: '1:27', aiFirst: false, reached: true, calls: 1, called: '2026-10-16' },
  { slug: 'justworks-customer-service', name: 'Justworks', industry: 'insurance and health', number: '(888) 534-1711', timeToHuman: '1:03', aiFirst: false, reached: true, calls: 1, called: '2026-10-12' },
  { slug: 'lyft-customer-service-number', name: 'Lyft', industry: 'airlines and travel', number: '855-865-9553', timeToHuman: null, aiFirst: false, reached: false, calls: 2, called: '2026-10-22' },
  { slug: 'metlife-pet-insurance-phone-number', name: 'MetLife Pet Insurance', industry: 'insurance and health', number: '(855) 270-7387', timeToHuman: '2:02', aiFirst: false, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'netflix-customer-service-number', name: 'Netflix', industry: 'subscriptions', number: '1-844-569-7700', timeToHuman: '1:20', aiFirst: true, reached: true, calls: 1, called: '2026-10-29' },
  { slug: 'paypal-customer-service-number', name: 'PayPal', industry: 'banking, payments and credit', number: '1-888-221-1161', timeToHuman: '4:30', aiFirst: true, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'peloton-customer-service-number', name: 'Peloton', industry: 'subscriptions', number: '1-844-559-0051', timeToHuman: '0:22', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'piedmont-natural-gas-customer-service', name: 'Piedmont Natural Gas', industry: 'utilities', number: '800-752-7504', timeToHuman: '2:06', aiFirst: false, reached: true, calls: 1, called: '2026-10-12' },
  { slug: 'pnc-dispute-charge', name: 'PNC', industry: 'banking, payments and credit', number: '1-800-558-8472', timeToHuman: '2:16', aiFirst: false, reached: true, calls: 1, called: '2026-10-24' },
  { slug: 'pottery-barn-customer-service', name: 'Pottery Barn', industry: 'shopping and home', number: '1-888-779-5176', timeToHuman: '0:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-08' },
  { slug: 'priceline-customer-service', name: 'Priceline', industry: 'airlines and travel', number: '1-877-477-5807', timeToHuman: '25:09', aiFirst: true, reached: true, calls: 1, called: '2026-10-09' },
  { slug: 'progressive-customer-service', name: 'Progressive', industry: 'insurance and health', number: '1-888-671-4405', timeToHuman: '1:30', aiFirst: false, reached: true, calls: 1, called: '2026-10-16' },
  { slug: 'roku-customer-service-number', name: 'Roku', industry: 'phone, internet and tv', number: '816-272-8106', timeToHuman: '1:25', aiFirst: false, reached: true, calls: 1, called: '2026-10-29' },
  { slug: 'simonmed-imaging-phone-number', name: 'SimonMed Imaging', industry: 'insurance and health', number: '1-844-615-2957', timeToHuman: '0:13', aiFirst: false, reached: true, calls: 6, called: '2026-10-13' },
  { slug: 'how-to-cancel-siriusxm', name: 'SiriusXM', industry: 'subscriptions', number: '(866) 635 8641', timeToHuman: null, aiFirst: true, reached: true, calls: 1, called: '2026-10-07' },
  { slug: 'southwest-airlines-phone-number', name: 'Southwest Airlines', industry: 'airlines and travel', number: '1-800-435-9792', timeToHuman: '4:10', aiFirst: false, reached: true, calls: 2, called: '2026-10-13' },
  { slug: 'spectrum-retention-department', name: 'Spectrum', industry: 'phone, internet and tv', number: '(833) 267-6094', timeToHuman: '7:49', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 't-mobile-customer-service-number', name: 'T-Mobile', industry: 'phone, internet and tv', number: '1-800-937-8997', timeToHuman: '1:49', aiFirst: false, reached: true, calls: 4, called: '2026-10-02' },
  { slug: 'ticketmaster-customer-service-number', name: 'Ticketmaster', industry: 'shopping and home', number: '1-800-653-8000', timeToHuman: '1:48', aiFirst: true, reached: true, calls: 1, called: '2026-10-29' },
  { slug: 'uber-customer-service-number', name: 'Uber', industry: 'airlines and travel', number: '1-800-314-2308', timeToHuman: null, aiFirst: false, reached: false, calls: 2, called: '2026-10-22' },
  { slug: 'united-change-flight', name: 'United Airlines', industry: 'airlines and travel', number: '1-800-864-8331', timeToHuman: '19:09', aiFirst: true, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'unitedhealthcare-phone-number', name: 'UnitedHealthcare', industry: 'insurance and health', number: '1-888-585-0631', timeToHuman: '1:04', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'ups-contact-number', name: 'UPS', industry: 'shipping', number: '1-800-742-5877', timeToHuman: '5:57', aiFirst: false, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'usaa-phone-number', name: 'USAA', industry: 'insurance and health', number: '800-531-8722', timeToHuman: '3:28', aiFirst: false, reached: true, calls: 1, called: '2026-10-01' },
  { slug: 'usps-phone-number', name: 'USPS', industry: 'shipping', number: '1-800-275-8777', timeToHuman: '8:14', aiFirst: false, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'vanguard-customer-service-number', name: 'Vanguard', industry: 'banking, payments and credit', number: '800-205-6189', timeToHuman: '1:30', aiFirst: false, reached: true, calls: 1, called: '2026-10-14' },
  { slug: 'venmo-customer-service-number', name: 'Venmo', industry: 'banking, payments and credit', number: '(855) 812-4430', timeToHuman: '4:57', aiFirst: false, reached: true, calls: 2, called: '2026-10-09' },
  { slug: 'verizon-customer-service', name: 'Verizon', industry: 'phone, internet and tv', number: '800-922-0204', timeToHuman: '5:52', aiFirst: true, reached: true, calls: 2, called: '2026-10-01' },
  { slug: 'vitalant-phone-number', name: 'Vitalant', industry: 'insurance and health', number: '877-258-4825', timeToHuman: '5:31', aiFirst: true, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'vivint-customer-service-number', name: 'Vivint', industry: 'shopping and home', number: '1-800-216-5232', timeToHuman: '2:14', aiFirst: false, reached: true, calls: 1, called: '2026-10-13' },
  { slug: 'walmart-customer-service-number', name: 'Walmart', industry: 'shopping and home', number: '1-800-925-6278', timeToHuman: '1:15', aiFirst: true, reached: true, calls: 4, called: '2026-10-09' },
  { slug: 'wayfair-customer-service', name: 'Wayfair', industry: 'shopping and home', number: '844-403-5086', timeToHuman: '1:12', aiFirst: true, reached: true, calls: 2, called: '2026-09-30' },
  { slug: 'wells-fargo-customer-service', name: 'Wells Fargo', industry: 'banking, payments and credit', number: '1-800-869-3557', timeToHuman: '2:14', aiFirst: false, reached: true, calls: 2, called: '2026-10-16' },
  { slug: 'windstream-customer-service', name: 'Windstream (Kinetic)', industry: 'phone, internet and tv', number: '(866) 703-8175', timeToHuman: '0:55', aiFirst: false, reached: true, calls: 3, called: '2026-10-08' },
  { slug: 'xfinity-customer-service-number', name: 'Xfinity', industry: 'phone, internet and tv', number: '1-800-934-6489', timeToHuman: '3:27', aiFirst: true, reached: true, calls: 1, called: '2026-10-13' },
];
