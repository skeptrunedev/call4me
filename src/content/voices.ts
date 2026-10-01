import { VOICES, type Voice } from '../server/services/dialer';

/**
 * The five most spoken languages (Ethnologue 2025, total speakers) and the line each sample
 * says in them, worded so it doesn't depend on the voice's gender. Recorded by
 * scripts/record-voice-samples.mjs; keep the lines in sync with its LANGUAGES.
 */
export const SAMPLE_LANGUAGES: { code: string; name: string; line: string; english: string }[] = [
  { code: 'en', name: 'English', line: "Hi! This is Alex's assistant. I was hoping to get a table for four tonight, around seven. Do you have anything open?", english: "Hi! This is Alex's assistant. I was hoping to get a table for four tonight, around seven. Do you have anything open?" },
  { code: 'zh', name: 'Mandarin Chinese', line: '您好！我是Alex的助理。我想订今晚七点左右四个人的位子，请问还有空位吗？', english: "Hello! I'm Alex's assistant. I'd like to book a table for four tonight around seven. Is there still space?" },
  { code: 'hi', name: 'Hindi', line: 'नमस्ते! Alex की तरफ़ से कॉल है। आज रात करीब सात बजे चार लोगों के लिए टेबल मिल सकती है क्या?', english: 'Hello! Calling for Alex. Could we get a table for four people tonight around seven?' },
  { code: 'es', name: 'Spanish', line: '¡Hola! Llamo de parte de Alex. Quería reservar una mesa para cuatro esta noche, alrededor de las siete. ¿Tienen algo disponible?', english: "Hi! I'm calling for Alex. I wanted to book a table for four tonight, around seven. Do you have anything available?" },
  { code: 'ar', name: 'Arabic', line: 'مرحباً! أتصل من طرف أليكس. أودّ حجز طاولة لأربعة أشخاص الليلة حوالي الساعة السابعة. هل لديكم شيء متاح؟', english: "Hello! I'm calling for Alex. I'd like to book a table for four tonight around seven. Do you have anything available?" },
];

/** The English line, the one every voice is compared on first. */
export const SAMPLE_LINE = SAMPLE_LANGUAGES[0]!.line;

/** Where a voice's sample in a language lives: English at <voice>.mp3, the rest at <voice>-<code>.mp3. */
export const sampleAudio = (voice: Voice, code: string) => `/static/voices/${code === 'en' ? voice : `${voice}-${code}`}.mp3`;

/**
 * One sample per caller voice per language, recorded straight from GPT-Live at the phone
 * format real calls use (8 kHz μ-law), so each sounds the way the business hears it.
 */
export const VOICE_SAMPLES: { voice: Voice; audio: string; isDefault: boolean }[] = VOICES.map((voice) => ({
  voice,
  audio: sampleAudio(voice, 'en'),
  isDefault: voice === 'marin',
}));
