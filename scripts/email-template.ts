/**
 * Change the copy of the automated emails without a deploy (the email_templates table, read
 * by services/drip.ts at send time).
 *
 *   npm run template -- list                                        every email and its stored subject
 *   npm run template -- show <key>                                  the stored copy (or the code default)
 *   npm run template -- set <key> --file body.txt [--subject "..."] replace the body (and subject)
 *   npm run template -- preview <key>                               the email as sent, with an example link
 *
 * Add --local to use the local D1 instead of production. Bodies may use {addCredits} (the
 * account's add-credits link) and {host} (call4.me); anything else in braces is refused.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fill, PLACEHOLDERS, render, STEPS, unknownPlaceholders, type EmailTemplate } from '../src/server/services/drip';

const USAGE = 'usage: npm run template -- list | show <key> | set <key> --file <body.txt> [--subject "..."] | preview <key>  [--local]';

export interface Command {
  action: 'list' | 'show' | 'set' | 'preview';
  key?: string;
  file?: string;
  subject?: string;
  local: boolean;
}

/** The command line, or an error message. */
export function parse(argv: string[]): Command | string {
  const local = argv.includes('--local');
  const args = argv.filter((a) => a !== '--local');
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const [action, key] = args;
  if (action === 'list') return { action, local };
  if (action !== 'show' && action !== 'set' && action !== 'preview') return USAGE;
  if (!key || key.startsWith('--')) return USAGE;
  if (!STEPS.some((s) => s.id === key)) return `no email called "${key}". emails: ${STEPS.map((s) => s.id).join(', ')}`;
  if (action !== 'set') return { action, key, local };
  const file = flag('--file');
  const subject = flag('--subject');
  if (!file) return `set needs --file <body.txt>. ${USAGE}`;
  if (subject !== undefined && !subject.trim()) return '--subject is empty';
  return { action, key, file, subject, local };
}

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

function d1<T>(sql: string, local: boolean): T[] {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'callbay', local ? '--local' : '--remote', '--json', '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).at(-1).results as T[];
}

function stored(key: string, local: boolean): (EmailTemplate & { updated_at: number }) | undefined {
  return d1<EmailTemplate & { updated_at: number }>(`SELECT subject, body, updated_at FROM email_templates WHERE key = ${sqlString(key)}`, local)[0];
}

function main(): void {
  const cmd = parse(process.argv.slice(2));
  if (typeof cmd === 'string') {
    console.error(cmd);
    process.exit(1);
  }
  if (cmd.action === 'list') {
    const rows = d1<{ key: string; subject: string; updated_at: number }>(`SELECT key, subject, updated_at FROM email_templates`, cmd.local);
    for (const step of STEPS) {
      const row = rows.find((r) => r.key === step.id);
      console.log(`${step.id}: ${row ? `"${row.subject}" (stored, updated ${new Date(row.updated_at).toISOString()})` : `"${step.template.subject}" (code default, nothing stored)`}`);
    }
    return;
  }
  const step = STEPS.find((s) => s.id === cmd.key)!;
  if (cmd.action === 'set') {
    const current = stored(step.id, cmd.local) ?? step.template;
    const next: EmailTemplate = { subject: cmd.subject ?? current.subject, body: readFileSync(cmd.file!, 'utf8').replace(/\s+$/, '') };
    if (!next.body) {
      console.error('the body file is empty');
      process.exit(1);
    }
    const unknown = unknownPlaceholders(next);
    if (unknown.length) {
      console.error(`unknown placeholder${unknown.length > 1 ? 's' : ''} ${unknown.map((u) => `{${u}}`).join(', ')}. allowed: ${PLACEHOLDERS.map((p) => `{${p}}`).join(', ')}`);
      process.exit(1);
    }
    d1(
      `INSERT INTO email_templates (key, subject, body, updated_at) VALUES (${sqlString(step.id)}, ${sqlString(next.subject)}, ${sqlString(next.body)}, ${Date.now()})
       ON CONFLICT (key) DO UPDATE SET subject = excluded.subject, body = excluded.body, updated_at = excluded.updated_at`,
      cmd.local,
    );
  }
  const row = stored(step.id, cmd.local);
  const template = row ?? step.template;
  if (cmd.action === 'preview') {
    const email = fill(template, { host: 'call4.me', addCredits: 'call4.me/add/<account>-<signature>' });
    console.log(`subject: ${email.subject}\n\n${render(email, 'https://call4.me/unsubscribe?a=<account>&s=<signature>').text}`);
    return;
  }
  console.log(`${step.id} (${row ? `stored, updated ${new Date(row.updated_at).toISOString()}` : 'code default, nothing stored'})\nsubject: ${template.subject}\n\n${template.body}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
