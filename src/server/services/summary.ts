import type { Brief, CallRow, Outcome, TranscriptLine } from './calls';

/**
 * The outcome of a finished call, written from the whole transcript once the line is down.
 * The voice agent can't be trusted to report it in-call: the other side often hangs up
 * right after "see you tomorrow", before any hand-off runs.
 */

const SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string', enum: ['done', 'partial', 'not_possible', 'voicemail', 'call_back_later'] },
    summary: { type: 'string' },
    details: {
      type: 'array',
      items: { type: 'object', properties: { field: { type: 'string' }, value: { type: 'string' } }, required: ['field', 'value'], additionalProperties: false },
    },
  },
  required: ['result', 'summary', 'details'],
  additionalProperties: false,
} as const;

export function summaryPrompt(row: Pick<CallRow, 'direction' | 'business' | 'goal' | 'callback_for'>, brief: Pick<Brief, 'on_behalf_of' | 'facts' | 'flexibility'>, transcript: TranscriptLine[]): string {
  const lines = transcript.map((l) => `${l.role}: ${l.text}`).join('\n');
  const task =
    row.direction === 'inbound' && row.callback_for
      ? `This was ${row.business} calling back ${brief.on_behalf_of}'s number about an unfinished task, answered by their assistant, who tried to finish it. The task: ${row.goal}\nAllowed without asking: ${brief.flexibility || '(only exactly the task)'}`
      : row.direction === 'inbound'
        ? `This was an incoming call to ${brief.on_behalf_of}'s number, answered by their assistant. If the caller was following up on an earlier task, it tried to finish it; otherwise it took a message.`
        : `The caller phoned ${row.business} for ${brief.on_behalf_of}. The task: ${row.goal}\nAllowed without asking: ${brief.flexibility || '(only exactly the task)'}`;
  return `${task}

Report what happened to ${brief.on_behalf_of}, based only on the transcript below (speech-to-text, so allow for small transcription errors in names and numbers).

- result: done (the task was fully achieved), partial (some of it), not_possible (they couldn't or wouldn't), voicemail (reached voicemail), call_back_later (needs a follow-up call).
- summary: two or three plain sentences with every concrete detail that was agreed: date, time, the name it's under, price, confirmation number, anything to bring. Note any mismatch with the task (e.g. "6:30 instead of 7"). For an incoming call: who called, about what, and how to reach them.
- details: the key facts as field/value pairs (e.g. date, time, name, party_size, phone_given, confirmation).

Transcript:
${lines || '(nothing was said)'}`;
}

export async function summarizeCall(env: Pick<Env, 'OPENAI_API_KEY' | 'BACK_OFFICE_MODEL'>, prompt: string): Promise<Outcome> {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.BACK_OFFICE_MODEL || 'gpt-5.5',
      reasoning: { effort: 'low' },
      store: false,
      input: prompt,
      text: { format: { type: 'json_schema', name: 'call_outcome', strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`summary: openai ${res.status} ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { output: { type: string; content?: { type: string; text?: string }[] }[] };
  const text = body.output.find((o) => o.type === 'message')?.content?.find((c) => c.type === 'output_text')?.text;
  if (!text) throw new Error('summary: no output text');
  const parsed = JSON.parse(text) as { result: Outcome['result']; summary: string; details: { field: string; value: string }[] };
  return { result: parsed.result, summary: parsed.summary, details: Object.fromEntries(parsed.details.map((d) => [d.field, d.value])) };
}
