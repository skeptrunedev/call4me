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
