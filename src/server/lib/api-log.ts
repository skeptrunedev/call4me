import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './context';

/**
 * One log line for each /api request a key or token signed in to, as for an MCP tool call
 * (mcp/server.ts): the route, the account, how long it took and how it came out. Never the body,
 * which carries personal details. A refusal carries the error it returned. An agent on the REST
 * API was refused POST /api/calls with a 400 91 times in an hour (Nov 22, 2026), and no line said
 * whose account it was or why: the request log showed only the status.
 */
export const apiLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const started = Date.now();
  await next();
  const account = c.get('apiAccount');
  if (!account) return;
  const { status } = c.res;
  const outcome = status < 400 ? 'ok' : `${status} error: ${await errorOf(c.res)}`;
  console.log(`api ${c.req.method} ${c.req.path} account=${account} ${Date.now() - started}ms ${outcome}`);
};

/** The refusal's message, from the JSON body every /api error returns ({ error }), on one line. */
async function errorOf(res: Response): Promise<string> {
  const body = (await res.clone().json().catch(() => null)) as { error?: unknown } | null;
  const error = body?.error;
  const text = typeof error === 'string' ? error : typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  return text.replace(/\s+/g, ' ').slice(0, 200);
}
