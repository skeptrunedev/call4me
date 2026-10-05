/** Score only the synthetic fixture's known fields, never infer spoken words
 * from the model's intended transcript. Contradictory recognized facts fail.
 */
export function scoreReceivedReadback(text, phase) {
  const norm = text.toLowerCase()
    .replace(/p\s*\.\s*m\.?/g, 'pm')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .replace(/\bp\s+m\b/g, 'pm')
    .replace(/\s+/g, ' ');
  const day = phase === 'initial' ? '12' : '22';
  const time = phase === 'initial' ? '715' : '645';
  const dates = [...norm.matchAll(/\boctober\s+(\d{1,2})\s+(\d{4})\b/g)];
  const times = [...norm.matchAll(/\b(\d{1,2})\s+(\d{2})\s*pm\b|\b(\d{3,4})\s*pm\b/g)];
  const codes = [...text.matchAll(/reference\s+code\s*[:,]?\s*(?:is\s+)?([^.!?\n]+)/gi)]
    .map(match => match[1].replace(/[^a-z0-9]/gi, '').toUpperCase());
  return {
    date: dates.length > 0 && dates.every(match => match[1] === day && match[2] === '2026'),
    time: times.length > 0 && times.every(match => (match[3] ?? match[1] + match[2]) === time),
    zone: /\b(pacific|pt)\b/.test(norm),
    code: codes.length > 0 && codes.every(code => code === 'B7Q29'),
  };
}
