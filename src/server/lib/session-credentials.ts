/** Kept stable from the original callbay domain so existing sessions survive. */
export const COOKIE_PREFIX = 'callbay';
const SESSION_COOKIE = new RegExp(`(^|;\\s*)(__Secure-)?${COOKIE_PREFIX}\\.session_token=`);
export const hasCredentials = (headers: Headers) => headers.has('authorization') || SESSION_COOKIE.test(headers.get('cookie') ?? '');
