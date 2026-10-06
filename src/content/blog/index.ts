import type { PostSource } from '../../server/lib/blog';
import macysBowTieStockCheck from './macys-bow-tie-stock-check.md';
import bookDinnerReservationByPhone from './book-dinner-reservation-by-phone.md';
import rescheduleDoctorAppointment from './reschedule-doctor-appointment.md';
import runningLateToBarber from './running-late-to-barber.md';
import mandarinPhoneCallScheduling from './mandarin-phone-call-scheduling.md';
import veterinaryBehaviorConsultationCall from './veterinary-behavior-consultation-call.md';
import aquasanaReturnException from './aquasana-return-exception.md';
import runningLateToAppointment from './running-late-to-appointment.md';
import wyomingRegisteredAgentConsent from './wyoming-registered-agent-consent-form.md';
import ohioWorkersCompensation from './ohio-workers-compensation-insurance.md';
import dropOffVetAppointment from './drop-off-vet-appointment.md';
import bookHaircutAppointment from './book-haircut-appointment.md';
import lesSchwabOilChange from './les-schwab-oil-change.md';
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
import cancelFactor from './cancel-factor.md';
import cancelFubo from './cancel-fubo.md';
import cancelHelloFresh from './cancel-hellofresh.md';
import claudeCodePhoneCalls from './claude-code-phone-calls.md';
import codexPhoneCalls from './codex-phone-calls.md';
import agentResearchPhoneCalls from './agent-web-research-phone-calls-sf-private-dining.md';
import phoneCallingMcpComparison from './phone-calling-mcp-comparison.md';
import cascadedVoiceStack from './cascaded-voice-stack-vs-gpt-live.md';
import instinctPhoneCalls from './instinct-ai-phone-calls.md';
import t3CodePhoneCalls from './t3-code-phone-calls.md';
import schedulePhoneCalls from './schedule-phone-calls-claude-code-codex.md';
import aiPhoneTreeNavigation from './ai-phone-tree-navigation.md';
import twilioMcpPhoneCalls from './twilio-mcp-phone-calls.md';
import grokBotTemplates from './grok-bot-templates.md';
import grokBotReusableSkills from './grok-bot-reusable-skills.md';
import grokBotTemplateTroubleshooting from './grok-bot-template-troubleshooting.md';
import metaMuseFirstTask from './meta-muse-first-task.md';
import museCodeMcpPhoneCalls from './muse-code-mcp-phone-calls.md';
import grokBotVsMetaMuse from './grok-bot-vs-meta-muse.md';
import metaMuseSupplierQuotes from './meta-muse-supplier-quotes.md';

/**
 * Every post, in any order; the blog sorts by date. To publish, add a markdown file here
 * (`import launch from './call4me-is-open.md';`) and a line to the list. Its headline image
 * goes at public/static/blog/<slug>.svg.
 */
export const POST_SOURCES: PostSource[] = [
  { slug: 'macys-bow-tie-stock-check', markdown: macysBowTieStockCheck },
  { slug: 'book-dinner-reservation-by-phone', markdown: bookDinnerReservationByPhone },
  { slug: 'reschedule-doctor-appointment', markdown: rescheduleDoctorAppointment },
  { slug: 'running-late-to-barber', markdown: runningLateToBarber },
  { slug: 'mandarin-phone-call-scheduling', markdown: mandarinPhoneCallScheduling },
  { slug: 'veterinary-behavior-consultation-call', markdown: veterinaryBehaviorConsultationCall },
  { slug: 'aquasana-return-exception', markdown: aquasanaReturnException },
  { slug: 'running-late-to-appointment', markdown: runningLateToAppointment },
  { slug: 'grok-bot-templates', markdown: grokBotTemplates },
  { slug: 'grok-bot-reusable-skills', markdown: grokBotReusableSkills },
  { slug: 'grok-bot-template-troubleshooting', markdown: grokBotTemplateTroubleshooting },
  { slug: 'meta-muse-first-task', markdown: metaMuseFirstTask },
  { slug: 'muse-code-mcp-phone-calls', markdown: museCodeMcpPhoneCalls },
  { slug: 'grok-bot-vs-meta-muse', markdown: grokBotVsMetaMuse },
  { slug: 'meta-muse-supplier-quotes', markdown: metaMuseSupplierQuotes },
  { slug: 'wyoming-registered-agent-consent-form', markdown: wyomingRegisteredAgentConsent },
  { slug: 'ohio-workers-compensation-insurance', markdown: ohioWorkersCompensation },
  { slug: 'drop-off-vet-appointment', markdown: dropOffVetAppointment },
  { slug: 'book-haircut-appointment', markdown: bookHaircutAppointment },
  { slug: 'les-schwab-oil-change', markdown: lesSchwabOilChange },
  { slug: 't3-code-phone-calls', markdown: t3CodePhoneCalls },
  { slug: 'schedule-phone-calls-claude-code-codex', markdown: schedulePhoneCalls },
  { slug: 'ai-phone-tree-navigation', markdown: aiPhoneTreeNavigation },
  { slug: 'twilio-mcp-phone-calls', markdown: twilioMcpPhoneCalls },
  { slug: 'instinct-ai-phone-calls', markdown: instinctPhoneCalls },
  { slug: 'claude-code-phone-calls', markdown: claudeCodePhoneCalls },
  { slug: 'codex-phone-calls', markdown: codexPhoneCalls },
  { slug: 'agent-web-research-phone-calls-sf-private-dining', markdown: agentResearchPhoneCalls },
  { slug: 'phone-calling-mcp-comparison', markdown: phoneCallingMcpComparison },
  { slug: 'cascaded-voice-stack-vs-gpt-live', markdown: cascadedVoiceStack },
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
  { slug: 'cancel-factor', markdown: cancelFactor },
  { slug: 'cancel-fubo', markdown: cancelFubo },
  { slug: 'cancel-hellofresh', markdown: cancelHelloFresh },
];
