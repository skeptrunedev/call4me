import { Hono } from 'hono';
import type { AppEnv } from '../lib/context';

/**
 * Replica phone menus that call4me's own caller is pointed at, so a menu-handling change can be
 * checked on a real phone call without ringing a business. A Telnyx TeXML application on a
 * dedicated test number fetches these; nothing in call4me links to them.
 *
 * `auxilio` copies Hospital Auxilio Mutuo's Spanish menus as recorded on customer calls on
 * 2026-10-14: a main greeting that takes an extension, then Radiology's six options, replayed
 * three times and then hung up when nothing is pressed. Reaching the person (Radiology, option
 * 6) is the pass. Every request logs an `ivr probe` line with the digits it got.
 */
export const ivrProbe = new Hono<AppEnv>();

type Step = 'main' | 'directory' | 'radiology';

const MENUS: Record<Step, { lines: string[]; digits: number; plays: number; after: string }> = {
  main: {
    lines: [
      'Gracias por comunicarse al Hospital Auxilio Mutuo, el gran hospital de Puerto Rico.',
      'Si usted tiene una emergencia, llame al nueve uno uno.',
      'Con el propósito de mejorar la calidad de nuestros servicios, su llamada será grabada o monitoreada.',
      'Si conoce el número de extensión, márquela en este momento.',
      'Si desea escuchar el directorio de los departamentos, oprima el tres.',
      'Si es socio y desea realizar un pago u obtener información de su cuenta, oprima el cuatro.',
    ],
    digits: 4,
    plays: 2,
    after: 'No hemos recibido su selección. Gracias por llamar.',
  },
  directory: {
    lines: ['Para Admisiones, marque la extensión uno uno cero cero.', 'Para Radiología, marque la extensión uno dos nueve cero.', 'Para Laboratorio, marque la extensión uno cinco cero cero.'],
    digits: 4,
    plays: 2,
    after: 'No hemos recibido su selección. Gracias por llamar.',
  },
  radiology: {
    lines: [
      'Para citas, presione uno.',
      'Para conocer nuestros servicios, presione dos.',
      'Para plan médico, presione tres.',
      'Horario, presione cuatro.',
      'Ubicación, presione cinco.',
      'Para otros asuntos, presione seis.',
      'Si no selecciona ninguna de las opciones, uno de nuestros representantes se comunicará con usted a la brevedad posible.',
    ],
    digits: 1,
    plays: 3,
    // The real line just drops the call after the third play.
    after: '',
  },
};

const say = (text: string) => `<Say voice="Polly.Mia-Neural">${text}</Say>`;
const texml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;

ivrProbe.all('/probe/ivr/auxilio', async (c) => {
  const form = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const digits = typeof form.Digits === 'string' ? form.Digits : '';
  const step = (c.req.query('step') ?? 'start') as Step | 'start';
  const n = Number(c.req.query('n') ?? '1');
  const silent = c.req.query('silent') === '1';
  console.log('ivr probe', JSON.stringify({ scenario: 'auxilio', call: form.CallSid ?? null, step, n, digits, silent }));

  const url = (s: Step, k: number, extra = '') => new URL(`/probe/ivr/auxilio?step=${s}&n=${k}${extra}`, c.req.url).toString().replace(/&/g, '&amp;');
  // The nth play of a menu: keys go to its action, silence falls through to the redirect.
  const menu = (s: Step, k: number, before = '') =>
    `${before ? say(before) : ''}<Gather action="${url(s, k)}" numDigits="${MENUS[s].digits}" timeout="5" finishOnKey="">${MENUS[s].lines.map(say).join('')}</Gather><Redirect>${url(s, k, '&silent=1')}</Redirect>`;

  const respond = (body: string) => c.body(texml(body), 200, { 'content-type': 'application/xml', 'cache-control': 'no-store' });
  if (step === 'start' || !(step in MENUS)) return respond(menu('main', 1));
  if (silent) return respond(n >= MENUS[step].plays ? `${MENUS[step].after ? say(MENUS[step].after) : ''}<Hangup/>` : menu(step, n + 1));

  if (step === 'radiology') {
    if (digits === '6') return respond(`${say('Radiología, buenos días, le habla Marta. ¿En qué le puedo ayudar?')}<Pause length="30"/><Hangup/>`);
    if (digits === '1') return respond(`${say('Si nos llama de un teléfono celular, en breve recibirá un mensaje de texto con la información solicitada. Gracias.')}<Hangup/>`);
    if (['2', '3', '4', '5'].includes(digits)) return respond(menu('radiology', 1, 'Para esa información, visite nuestra página de internet.'));
    return respond(menu('radiology', n, 'Su selección no es válida.'));
  }
  if (digits === '3') return respond(menu('directory', 1));
  if (digits === '4') return respond(`${say('Para pagos, visite nuestra página de internet. Gracias por llamar.')}<Hangup/>`);
  if (digits === '1290') return respond(menu('radiology', 1, 'Saludos. Gracias por llamar al Departamento de Radiología en el Hospital Auxilio Mutuo. Para asistencia por texto, escuche las siguientes opciones.'));
  if (digits === '1100' || digits === '1500') return respond(menu('main', 1, 'La extensión que usted marcó no está disponible en este momento.'));
  return respond(menu(step, n, 'Su selección no es válida.'));
});

/**
 * `hold` is a customer-service line that tests staying on through holds and transfers: a menu,
 * three and a half minutes of hold music broken up by "please stay on the line" and a callback offer, a
 * frontline rep who transfers the call with eight seconds of dead air into a second hold, then the
 * billing rep who can actually help. Ads play between the music, as on real queues. Getting Priya's
 * reference number is the pass.
 */
// Real queues play ads between the music: sentences that are neither a hold line nor a person.
const AD = 'Did you know you can pay your bill online, any time, at northline dot com? Sign up for paperless billing and get a two dollar credit on every statement.';
const AD2 = 'Planning a move this winter? Northline can transfer your service to your new address in one visit. Ask your representative for details.';
type HoldStep = 'start' | 'menu' | 'hold' | 'callback' | 'hold2' | 'jordan' | 'transfer' | 'priya' | 'account' | 'reference' | 'bye';

ivrProbe.all('/probe/ivr/hold', async (c) => {
  const form = c.req.method === 'POST' ? await c.req.parseBody() : {};
  const digits = typeof form.Digits === 'string' ? form.Digits : '';
  const heard = typeof form.SpeechResult === 'string' ? form.SpeechResult : '';
  const step = (c.req.query('step') ?? 'start') as HoldStep;
  const n = Number(c.req.query('n') ?? '1');
  const silent = c.req.query('silent') === '1';
  console.log('ivr probe', JSON.stringify({ scenario: 'hold', call: form.CallSid ?? null, step, n, digits, heard, silent }));

  const url = (s: HoldStep, k = 1, extra = '') => new URL(`/probe/ivr/hold?step=${s}&n=${k}${extra}`, c.req.url).toString().replace(/&/g, '&amp;');
  const music = (times: number) => `<Play loop="${times}">${new URL('/static/probe/hold-music.mp3', c.req.url)}</Play>`;
  const ivr = (text: string) => `<Say voice="Polly.Joanna-Neural">${text}</Say>`;
  const jordan = (text: string) => `<Say voice="Polly.Matthew-Neural">${text}</Say>`;
  const priya = (text: string) => `<Say voice="Polly.Ruth-Neural">${text}</Say>`;
  // A rep's turn: they speak, then listen; no answer gets one "are you still there?" before the next step anyway.
  const turn = (s: HoldStep, line: string) =>
    `<Gather input="speech" action="${url(s)}" language="en-US" speechTimeout="auto" timeout="8">${line}</Gather><Redirect>${url(s, 1, '&silent=1')}</Redirect>`;
  const respond = (body: string) => c.body(texml(body), 200, { 'content-type': 'application/xml', 'cache-control': 'no-store' });
  const menu = (k: number) =>
    `<Gather action="${url('menu', k)}" numDigits="1" timeout="6">${ivr('Thank you for calling Northline Utilities. Calls may be recorded for quality. For billing and payments, press 1. For outages, press 2. For starting or stopping service, press 3. For all other questions, press 4.')}</Gather><Redirect>${url('menu', k, '&silent=1')}</Redirect>`;

  if (step === 'start') return respond(menu(1));
  if (step === 'menu') {
    if (silent) return respond(n >= 3 ? `${ivr('We did not receive a selection. Goodbye.')}<Hangup/>` : menu(n + 1));
    if (digits !== '1' && digits !== '4') return respond(`${ivr('That option is not available right now.')}${menu(n)}`);
    return respond(
      `${ivr('Please hold for the next available representative. Your estimated wait time is about three minutes.')}${music(1)}${ivr(AD)}${music(1)}${ivr('Thank you for holding. Your call is important to us. Please stay on the line.')}${music(1)}` +
        `<Gather action="${url('callback')}" numDigits="1" timeout="6">${ivr('If you would like us to call you back instead of waiting, press 1. Otherwise, please stay on the line.')}</Gather><Redirect>${url('hold2')}</Redirect>`,
    );
  }
  if (step === 'callback') return respond(`${ivr('We will call you back at the number you are calling from, within the next two business days. Goodbye.')}<Hangup/>`);
  if (step === 'hold2') return respond(`${music(1)}${ivr(AD2)}${music(1)}${ivr('All of our representatives are still helping other callers. Please continue to hold.')}${music(1)}<Redirect>${url('jordan', 1, '&silent=1&first=1')}</Redirect>`);
  if (step === 'jordan' && c.req.query('first') === '1') return respond(turn('jordan', jordan('Thanks for holding, this is Jordan with customer care. How can I help you today?')));
  if (step === 'jordan')
    return respond(
      `${jordan(silent ? 'Hello? I can transfer you to billing, one moment.' : 'Okay, a late fee dispute. That is handled by our billing team, so let me transfer you over. One moment.')}<Pause length="8"/>${ivr('Please continue to hold while we transfer your call.')}${music(2)}<Redirect>${url('transfer')}</Redirect>`,
    );
  if (step === 'transfer') return respond(turn('priya', priya('Billing, this is Priya. What can I do for you?')));
  if (step === 'priya') return respond(turn('account', priya(silent ? 'Hello? Are you still there? What can I help with?' : 'Sure, I can look into that late fee. What is the account number?')));
  if (step === 'account') return respond(turn('reference', priya(silent ? 'Hello? I still need the account number.' : 'Thank you. I removed the late fee and opened a ticket. Your reference number is B as in bravo, 4, 4, 7, 1. Is there anything else?')));
  if (step === 'reference') return respond(`${priya('Alright, thanks for calling Northline. Have a good day.')}<Hangup/>`);
  return respond(menu(1));
});
