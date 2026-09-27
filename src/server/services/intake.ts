/**
 * What a caller must know before it dials, per kind of call. A person booking a doctor's
 * appointment has the patient's name, date of birth, phone, and insurance in front of them;
 * the caller can only share what it was given, so the agent collects all of it first.
 *
 * Fields that are the same on every call (name, DOB, phone, address, insurance) live in the
 * account's saved profile and are filled from it; per-call fields come with the call.
 */

export type ProfileKey =
  | 'full_name'
  | 'date_of_birth'
  | 'phone'
  | 'email'
  | 'address'
  | 'insurance_carrier'
  | 'insurance_member_id'
  | 'insurance_group_number'
  | 'dental_insurance_carrier'
  | 'dental_insurance_member_id'
  | 'vehicle'
  | 'vin';

export const PROFILE_FIELDS: Record<ProfileKey, { label: string; ask: string; check?: (v: string) => string | null }> = {
  full_name: { label: 'full name', ask: "What's your full legal name (as it appears on your ID/insurance card)?" },
  date_of_birth: { label: 'date of birth', ask: "What's your date of birth?", check: (v) => (parseDate(v) ? null : 'use a full date like 1990-03-14') },
  phone: { label: 'phone number', ask: "What's the best phone number for them to reach you?", check: (v) => (v.replace(/\D/g, '').length >= 10 ? null : 'use a 10-digit phone number') },
  email: { label: 'email', ask: 'What email should they use if they need one?' },
  address: { label: 'home address', ask: "What's your home address (street, city, state, ZIP)?" },
  insurance_carrier: { label: 'health insurance carrier', ask: 'Who is your health insurance with (carrier and plan), or are you self-pay?' },
  insurance_member_id: { label: 'health insurance member ID', ask: "What's the member ID on your health insurance card?" },
  insurance_group_number: { label: 'health insurance group number', ask: "What's the group number on your health insurance card?" },
  dental_insurance_carrier: { label: 'dental insurance carrier', ask: 'Who is your dental insurance with, or are you self-pay?' },
  dental_insurance_member_id: { label: 'dental insurance member ID', ask: "What's the member ID on your dental insurance card?" },
  vehicle: { label: 'vehicle (year, make, model, mileage)', ask: "What's your car's year, make, model, and roughly how many miles?" },
  vin: { label: 'VIN', ask: "What's your car's VIN (17 characters, on the registration or driver's door)?" },
};

export interface IntakeField {
  key: string;
  label: string;
  /** The question the agent should ask the user when this is missing. */
  ask: string;
  required: boolean;
  /** Filled from the saved profile when the call doesn't provide it. */
  profile?: ProfileKey;
  /** Skip this requirement when the call's details say so (e.g. self-pay needs no member ID). */
  unlessSelfPay?: boolean;
}

export interface Category {
  slug: string;
  name: string;
  examples: string;
  fields: IntakeField[];
}

const req = (key: string, label: string, ask: string, extra: Partial<IntakeField> = {}): IntakeField => ({ key, label, ask, required: true, ...extra });
const opt = (key: string, label: string, ask: string, extra: Partial<IntakeField> = {}): IntakeField => ({ key, label, ask, required: false, ...extra });
const fromProfile = (key: ProfileKey, required = true, extra: Partial<IntakeField> = {}): IntakeField => ({ key, label: PROFILE_FIELDS[key].label, ask: PROFILE_FIELDS[key].ask, required, profile: key, ...extra });

const WHEN = req('availability', 'when you can go', 'Which days and times work for you (e.g. "weekday mornings next week" or "Tue/Thu after 3pm")?');

export const CATEGORIES: Category[] = [
  {
    slug: 'medical',
    name: 'Doctor, specialist, therapy, labs, urgent care',
    examples: 'book/reschedule/cancel a doctor visit, physical, specialist consult, therapy session, lab or imaging appointment',
    fields: [
      fromProfile('full_name', true, { key: 'patient_full_name', label: "patient's full name" }),
      fromProfile('date_of_birth', true, { key: 'patient_date_of_birth', label: "patient's date of birth" }),
      fromProfile('phone'),
      req('patient_status', 'new or existing patient', 'Have you been seen at this office before (new or existing patient)?'),
      req('reason', 'reason for the visit', 'What is the visit for (e.g. annual physical, follow-up, a specific symptom)?'),
      fromProfile('insurance_carrier'),
      fromProfile('insurance_member_id', true, { unlessSelfPay: true }),
      fromProfile('insurance_group_number', false),
      WHEN,
      opt('provider', 'preferred doctor', 'Do you want a specific doctor or provider?'),
      opt('referral', 'referral', 'Do you have a referral (from whom)?'),
      fromProfile('address', false),
    ],
  },
  {
    slug: 'dental',
    name: 'Dentist, orthodontist, oral surgeon',
    examples: 'cleaning, checkup, filling, tooth pain, ortho consult',
    fields: [
      fromProfile('full_name', true, { key: 'patient_full_name', label: "patient's full name" }),
      fromProfile('date_of_birth', true, { key: 'patient_date_of_birth', label: "patient's date of birth" }),
      fromProfile('phone'),
      req('patient_status', 'new or existing patient', 'Have you been to this dentist before (new or existing patient)?'),
      req('reason', 'reason for the visit', 'What is it for (cleaning, checkup, pain, a specific procedure)?'),
      fromProfile('dental_insurance_carrier'),
      fromProfile('dental_insurance_member_id', true, { unlessSelfPay: true }),
      WHEN,
      opt('provider', 'preferred dentist or hygienist', 'Do you want a specific dentist or hygienist?'),
    ],
  },
  {
    slug: 'restaurant',
    name: 'Restaurant reservation',
    examples: 'book, change, or cancel a table; ask about a private room or waitlist',
    fields: [
      fromProfile('full_name', true, { key: 'reservation_name', label: 'name for the reservation', ask: 'What name should the reservation be under?' }),
      req('party_size', 'party size', 'How many people?'),
      req('date', 'date', 'Which day?'),
      req('time_window', 'acceptable time window', 'What time, and what range is acceptable (e.g. 7pm, anything 6:30-8)?'),
      fromProfile('phone'),
      opt('seating', 'seating preference', 'Any seating preference (bar, patio, booth)?'),
      opt('occasion', 'occasion or dietary needs', 'Any occasion or dietary restrictions to mention?'),
    ],
  },
  {
    slug: 'veterinary',
    name: 'Vet, groomer, boarding',
    examples: 'vet visit, vaccines, grooming, boarding',
    fields: [
      fromProfile('full_name', true, { key: 'owner_full_name', label: "owner's full name", ask: "What's the pet owner's full name?" }),
      fromProfile('phone'),
      req('pet', 'pet name, species/breed, age', "What's your pet's name, species/breed, and age?"),
      req('client_status', 'new or existing client', 'Have you been to this clinic before?'),
      req('reason', 'reason for the visit', 'What is the visit for?'),
      WHEN,
    ],
  },
  {
    slug: 'auto_service',
    name: 'Car service, repair, parts counter',
    examples: 'oil change, repair, recall, parts price and availability, service appointment',
    fields: [
      fromProfile('full_name'),
      fromProfile('phone'),
      fromProfile('vehicle', true),
      req('request', 'what you need', 'What do you need done, or which part (and any symptoms)?'),
      fromProfile('vin', false),
      opt('availability', 'when you can drop off', 'When could you bring the car in?'),
    ],
  },
  {
    slug: 'auto_sales',
    name: 'Car dealership sales',
    examples: 'availability and price of a car, test drive, out-the-door quote, trade-in',
    fields: [
      fromProfile('full_name'),
      fromProfile('phone'),
      req('vehicle_interest', 'car you are asking about', 'Which car (year/make/model/trim, or the stock number or listing link)?'),
      req('questions', 'what to find out', 'What do you want to know (availability, out-the-door price, test drive time, financing)?'),
      opt('trade_in', 'trade-in', 'Do you have a trade-in (year/make/model/miles)?'),
      opt('budget', 'budget or target price', 'Is there a price you want to stay under?'),
    ],
  },
  {
    slug: 'home_service',
    name: 'Home services',
    examples: 'plumber, electrician, HVAC, cleaner, handyman, locksmith, movers',
    fields: [
      fromProfile('full_name'),
      fromProfile('phone'),
      fromProfile('address', true, { key: 'service_address', label: 'service address' }),
      req('issue', 'what needs doing', 'What needs doing, and how urgent is it?'),
      WHEN,
      opt('budget', 'budget', 'Any budget or price you want to stay under?'),
    ],
  },
  {
    slug: 'personal_care',
    name: 'Salon, barber, spa, fitness',
    examples: 'haircut, color, nails, massage, personal training',
    fields: [fromProfile('full_name', true, { ask: 'What name should the appointment be under?' }), fromProfile('phone'), req('service', 'service', 'Which service?'), WHEN, opt('provider', 'preferred stylist or provider', 'Anyone specific you want?')],
  },
  {
    slug: 'general',
    name: 'Questions for a business',
    examples: 'hours, stock checks, quotes, "do you do X", order status',
    fields: [req('questions', 'what to find out', 'What exactly should the caller find out?'), fromProfile('full_name', false, { ask: 'What name should the caller give if asked?' }), fromProfile('phone', false), opt('order_number', 'order or account number', 'Is there an order or account number?')],
  },
];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];
export const categoryBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

export type Profile = Partial<Record<ProfileKey, string>>;

export interface Resolved {
  /** Every known field, labelled, in intake order: what the caller may share. */
  known: { key: string; label: string; value: string }[];
  missing: IntakeField[];
  invalid: { field: IntakeField; problem: string }[];
}

const isSelfPay = (v: string | undefined) => Boolean(v && /self[\s-]?pay|no insurance|uninsured|cash/i.test(v));

/** Fill a category's fields from the call's details, then the profile; report what is missing or malformed. */
export function resolveIntake(category: Category, details: Record<string, string>, profile: Profile): Resolved {
  const out: Resolved = { known: [], missing: [], invalid: [] };
  const selfPay = isSelfPay(details.insurance_carrier ?? profile.insurance_carrier) || isSelfPay(details.dental_insurance_carrier ?? profile.dental_insurance_carrier);
  for (const f of category.fields) {
    const value = (details[f.key] ?? (f.profile ? (details[f.profile] ?? profile[f.profile]) : undefined))?.trim();
    if (!value) {
      if (f.required && !(f.unlessSelfPay && selfPay)) out.missing.push(f);
      continue;
    }
    const problem = f.profile ? PROFILE_FIELDS[f.profile].check?.(value) : null;
    if (problem) out.invalid.push({ field: f, problem });
    else out.known.push({ key: f.key, label: f.label, value });
  }
  return out;
}

/** The message an agent gets back when it tried to call too early: exactly what to ask. */
export function missingMessage(category: Category, r: Resolved): string {
  const lines = [`Not calling yet: a ${category.name.toLowerCase()} call needs more information from the user. Ask them (in one message), then call callbay_place_call again with the answers in "details":`];
  for (const f of r.missing) lines.push(`- ${f.key}: ${f.ask}`);
  for (const { field, problem } of r.invalid) lines.push(`- ${field.key}: ${problem}`);
  const profileKeys = [...r.missing, ...r.invalid.map((i) => i.field)].map((f) => f.profile).filter(Boolean);
  if (profileKeys.length) lines.push(`Save the ones that don't change (${[...new Set(profileKeys)].join(', ')}) with callbay_save_profile so you never have to ask again.`);
  return lines.join('\n');
}

function parseDate(v: string): Date | null {
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const year = d.getUTCFullYear();
  return year > 1900 && year <= new Date().getUTCFullYear() ? d : null;
}
