import type { PostSource } from '../../server/lib/blog';
import cancelPlanetFitness from './cancel-planet-fitness.md';
import costcoTireAppointment from './costco-tire-appointment-cancel-refund.md';
import experianPhoneNumber from './experian-phone-number.md';
import junkRemovalCost from './junk-removal-cost.md';
import eyeExamCost from './eye-exam-cost-without-insurance.md';
import followUpTelehealth from './follow-up-appointment-telehealth.md';
import privateDiningRoomCost from './private-dining-room-cost.md';
import transferPrescription from './how-to-transfer-a-prescription.md';
import amazonPharmacyPhone from './amazon-pharmacy-phone-number.md';
import openaiRealtimeVoices from './openai-realtime-voices-phone-calls.md';
import rescheduleDentist from './reschedule-dentist-appointment.md';
import wayfairCustomerService from './wayfair-customer-service.md';
import grokConnectorsMcp from './grok-connectors-mcp-phone-calls.md';
import metaMuseAgent from './meta-muse-ai-agent-phone-calls.md';
import etihadCustomerService from './etihad-customer-service.md';
import lawyerConsultationFee from './lawyer-consultation-fee.md';
import americanAirlinesFlightCredit from './american-airlines-flight-credit.md';
import adderallShortage from './adderall-shortage.md';
import newPrimaryCareDoctor from './how-to-find-a-new-primary-care-doctor.md';
import usaaPhoneNumber from './usaa-phone-number.md';
import upsContactNumber from './ups-contact-number.md';
import verizonCustomerService from './verizon-customer-service.md';
import fplPhoneNumber from './fpl-phone-number.md';
import fedexCustomerServiceNumber from './fedex-customer-service-number.md';
import unitedChangeFlight from './united-change-flight.md';
import unitedhealthcarePhoneNumber from './unitedhealthcare-phone-number.md';
import needDressShoesToday from './need-dress-shoes-today.md';
import spectrumRetention from './spectrum-retention-department.md';
import allstateCustomerServiceNumber from './allstate-customer-service-number.md';
import cancelAudible from './cancel-audible.md';
import fableticsCustomerService from './fabletics-customer-service.md';

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
  { slug: 'openai-realtime-voices-phone-calls', markdown: openaiRealtimeVoices },
  { slug: 'eye-exam-cost-without-insurance', markdown: eyeExamCost },
  { slug: 'follow-up-appointment-telehealth', markdown: followUpTelehealth },
  { slug: 'private-dining-room-cost', markdown: privateDiningRoomCost },
  { slug: 'how-to-transfer-a-prescription', markdown: transferPrescription },
  { slug: 'amazon-pharmacy-phone-number', markdown: amazonPharmacyPhone },
  { slug: 'grok-connectors-mcp-phone-calls', markdown: grokConnectorsMcp },
  { slug: 'meta-muse-ai-agent-phone-calls', markdown: metaMuseAgent },
  { slug: 'etihad-customer-service', markdown: etihadCustomerService },
  { slug: 'lawyer-consultation-fee', markdown: lawyerConsultationFee },
  { slug: 'american-airlines-flight-credit', markdown: americanAirlinesFlightCredit },
  { slug: 'adderall-shortage', markdown: adderallShortage },
  { slug: 'how-to-find-a-new-primary-care-doctor', markdown: newPrimaryCareDoctor },
  { slug: 'usaa-phone-number', markdown: usaaPhoneNumber },
  { slug: 'ups-contact-number', markdown: upsContactNumber },
  { slug: 'verizon-customer-service', markdown: verizonCustomerService },
  { slug: 'fpl-phone-number', markdown: fplPhoneNumber },
  { slug: 'fedex-customer-service-number', markdown: fedexCustomerServiceNumber },
  { slug: 'united-change-flight', markdown: unitedChangeFlight },
  { slug: 'unitedhealthcare-phone-number', markdown: unitedhealthcarePhoneNumber },
  { slug: 'need-dress-shoes-today', markdown: needDressShoesToday },
  { slug: 'spectrum-retention-department', markdown: spectrumRetention },
  { slug: 'allstate-customer-service-number', markdown: allstateCustomerServiceNumber },
  { slug: 'cancel-audible', markdown: cancelAudible },
  { slug: 'fabletics-customer-service', markdown: fableticsCustomerService },
];
