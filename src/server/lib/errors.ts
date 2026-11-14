/**
 * An error as log text: its name and message, what caused it, then where it was thrown.
 *
 * Workers Observability prints an Error handed to console.* as its stack frames alone and drops the
 * message, so `console.error('mcp tool failed', err)` for a D1 failure in save_profile (Hy,
 * 2026-11-14) logged only "at D1DatabaseSessionAlwaysPrimary._sendOrThrow" and never said what D1
 * refused. Log errors through this instead.
 */
export function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const lines = [`${err.name}: ${err.message}`];
  for (let cause = err.cause, depth = 0; cause !== undefined && depth < 3; cause = cause instanceof Error ? cause.cause : undefined, depth++) {
    lines.push(`caused by ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`);
  }
  lines.push(...(err.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line)));
  return lines.join('\n');
}
