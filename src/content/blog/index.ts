import type { PostSource } from '../../server/lib/blog';
import cancelPlanetFitness from './cancel-planet-fitness.md';
import costcoTireAppointment from './costco-tire-appointment-cancel-refund.md';
import experianPhoneNumber from './experian-phone-number.md';
import junkRemovalCost from './junk-removal-cost.md';
import rescheduleDentist from './reschedule-dentist-appointment.md';
import wayfairCustomerService from './wayfair-customer-service.md';

/**
 * Every post, in any order; the blog sorts by date. To publish, add a markdown file here
 * (`import launch from './call4me-is-open.md';`) and a line to the list. Its headline image
 * goes at public/static/blog/<slug>.svg.
 */
export const POST_SOURCES: PostSource[] = [
  { slug: 'experian-phone-number', markdown: experianPhoneNumber },
  { slug: 'cancel-planet-fitness', markdown: cancelPlanetFitness },
  { slug: 'wayfair-customer-service', markdown: wayfairCustomerService },
  { slug: 'costco-tire-appointment-cancel-refund', markdown: costcoTireAppointment },
  { slug: 'reschedule-dentist-appointment', markdown: rescheduleDentist },
  { slug: 'junk-removal-cost', markdown: junkRemovalCost },
];
