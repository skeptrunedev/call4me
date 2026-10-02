/**
 * Write a finished call's outcome again from its saved transcript, for when the recap at hangup
 * failed (routes/webhooks.ts writeRecap, e.g. the OpenAI account ran out of credits). Same
 * prompt and model as the live recap; clears the "recap failed" error once the outcome is saved.
 *
 *   npm run recap -- <call_id> [--local]
 *
 * Needs OPENAI_API_KEY in the environment (BACK_OFFICE_MODEL too, if the Worker sets one).
 * Refuses a call that already has an outcome.
 */
import { execFileSync } from 'node:child_process';
import type { Brief, CallRow, TranscriptLine } from '../src/server/services/calls';
import { summarizeCall, summaryPrompt } from '../src/server/services/summary';

const args = process.argv.slice(2);
const where = args.includes('--local') ? '--local' : '--remote';
const [callId] = args.filter((a) => a !== '--local');
if (!callId?.startsWith('call_')) {
  console.error('usage: npm run recap -- <call_id> [--local]');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
function d1<T>(sql: string): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', where, '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out)[0].results as T[];
}

const [row] = d1<CallRow>(`SELECT * FROM calls WHERE id = ${sqlString(callId)}`);
if (!row) {
  console.error(`no call ${callId}`);
  process.exit(1);
}
if (row.outcome) {
  console.error(`${callId} already has an outcome; not overwriting it`);
  process.exit(1);
}

const transcript = row.transcript ? (JSON.parse(row.transcript) as TranscriptLine[]) : [];
const outcome = await summarizeCall(
  { OPENAI_API_KEY: process.env.OPENAI_API_KEY, BACK_OFFICE_MODEL: process.env.BACK_OFFICE_MODEL ?? '' },
  summaryPrompt(row, JSON.parse(row.brief) as Brief, transcript),
);
d1(
  `UPDATE calls SET outcome = ${sqlString(JSON.stringify(outcome))},
     error = CASE WHEN error LIKE 'recap failed:%' THEN NULL ELSE error END
   WHERE id = ${sqlString(callId)} AND outcome IS NULL`,
);
console.log(`${callId}: ${outcome.result}\n${outcome.summary}`);
