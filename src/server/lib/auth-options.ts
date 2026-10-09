import type { BetterAuthOptions } from 'better-auth';
import { bearer, jwt } from 'better-auth/plugins';
import { mcp } from '@better-auth/mcp';

/**
 * better-auth configuration shared by the worker (per-request instance) and the
 * schema-generation CLI config (auth.config.ts). Anything that touches env or
 * bindings comes in through `deps` so this module stays pure.
 *
 * Mirrors skillbay: Google and X sign-in for the site, and an OAuth 2.1 provider
 * for the MCP endpoint so MCP clients sign people in through the browser.
 */

export interface AuthDeps {
  database: BetterAuthOptions['database'];
  secret: string;
  baseURL: string;
  appName: string;
  google: { clientId: string; clientSecret: string };
  twitter: { clientId: string; clientSecret: string };
}

/** Prefix of better-auth's cookies (`callbay.session_token`); kept from before the rename so sessions survive. */
export const COOKIE_PREFIX = 'callbay';
const ACCESS_TOKEN_TTL = 7 * 24 * 3600;

export function authOptions(deps: AuthDeps) {
  return {
    appName: deps.appName,
    baseURL: deps.baseURL,
    basePath: '/api/auth',
    secret: deps.secret,
    database: deps.database,
    trustedOrigins: [deps.baseURL],
    // Password sign-in only for accounts made with scripts/create-password-user.mjs (the ChatGPT
    // directory's reviewers need a plain login); everyone else signs up with Google or X.
    emailAndPassword: { enabled: true, disableSignUp: true },
    socialProviders: {
      // Left out without credentials so better-auth does not warn on every request.
      ...(deps.google.clientId ? { google: { clientId: deps.google.clientId, clientSecret: deps.google.clientSecret, prompt: 'select_account' as const } } : {}),
      ...(deps.twitter.clientId ? { twitter: { clientId: deps.twitter.clientId, clientSecret: deps.twitter.clientSecret } } : {}),
    },
    account: {
      accountLinking: { enabled: true, allowDifferentEmails: true },
    },
    session: {
      // Long-lived browser sessions: 400 days is the longest cookie browsers keep, and any visit
      // after a day pushes the expiry out again.
      expiresIn: 400 * 24 * 3600,
      updateAge: 24 * 3600,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      // Migrations are applied by wrangler from migrations/; skip per-instance introspection.
      database: { validateSchema: false, generateId: 'uuid' },
    },
    plugins: [
      // Lets API clients send the session token as `Authorization: Bearer` instead of a cookie.
      bearer(),
      // JWT access tokens (and the /jwks endpoint) the MCP OAuth provider issues and verifies.
      jwt(),
      // OAuth 2.1 authorization server for the MCP endpoint (RFC 9728 protected resource metadata,
      // PKCE, dynamic client registration so MCP clients can onboard themselves). The login and
      // consent pages are ours; the provider hands the signed authorize query to them.
      mcp({
        resource: mcpResource(deps.baseURL),
        // A week: clients that did not ask for offline_access get no refresh token, and signing
        // in every hour would make the connector useless. Consent can be revoked.
        // Resource TTLs can only shorten the provider-wide limit, whose default is one hour.
        accessTokenExpiresIn: ACCESS_TOKEN_TTL,
        resources: [
          { identifier: mcpResource(deps.baseURL), name: `${deps.appName} MCP`, accessTokenTtl: ACCESS_TOKEN_TTL },
          // The app directories' servers (routes/mcp.tsx), each a resource of its own so a host's token is bound to its URL.
          ...DIRECTORY_SERVERS.map((s) => ({ identifier: mcpResourceAt(s.path, deps.baseURL), name: `${deps.appName} for ${s.host}`, accessTokenTtl: ACCESS_TOKEN_TTL })),
          // The site itself (GET /api, credits over x402) accepts the same tokens, so agents can hold one token for both.
          { identifier: siteResource(deps.baseURL), name: `${deps.appName} API`, accessTokenTtl: ACCESS_TOKEN_TTL },
        ],
        clientRegistrationDefaultResources: [mcpResource(deps.baseURL), ...DIRECTORY_SERVERS.map((s) => mcpResourceAt(s.path, deps.baseURL)), siteResource(deps.baseURL)],
        // Active clients can renew without signing in: each refresh rotates the token for
        // another ten years. Revocation or a refresh token left unused past expiry ends access.
        refreshTokenExpiresIn: 10 * 365 * 24 * 3600,
        // The signed authorize query the login page carries (and the code) live this long; the
        // default 10 minutes sends anyone who pauses mid-sign-in (app reviewers too) back to the start.
        codeExpiresIn: 3600,
        loginPage: '/login',
        consentPage: '/oauth/consent',
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // `calls` is the resource scope: place calls and spend credits as the user.
        scopes: ['calls', 'openid', 'profile', 'email', 'offline_access'],
      }),
    ],
  } satisfies BetterAuthOptions;
}

/**
 * The MCP endpoint as an RFC 8707 resource identifier. It must be https except on
 * loopback hosts; `wrangler dev` can present the production hostname over plain http,
 * so the scheme is forced there to keep the identifier equal to the real one.
 */
export function mcpResource(baseURL: string): string {
  return canonicalUrl('/mcp', baseURL);
}

/**
 * The MCP servers listed in app directories: the directory tool set (McpDeps.surface), one path
 * per host so each host's token is bound to the URL it was listed with.
 */
export const DIRECTORY_SERVERS = [
  { path: '/chatgpt/mcp', host: 'ChatGPT', surface: 'chatgpt' },
  { path: '/claude/mcp', host: 'Claude', surface: 'claude' },
] as const;
export type McpPath = '/mcp' | (typeof DIRECTORY_SERVERS)[number]['path'];

/** An MCP endpoint, by the path it is served at, as a resource identifier. */
export function mcpResourceAt(path: McpPath, baseURL: string): string {
  return canonicalUrl(path, baseURL);
}

/** The site itself as a resource identifier (RFC 9728 root document; the audience of GET /api). */
export function siteResource(baseURL: string): string {
  return canonicalUrl('/', baseURL);
}

/** The site's origin as agents should see it (https, no trailing slash), for links in discovery documents. */
export const siteUrl = (baseURL: string): string => siteResource(baseURL).replace(/\/$/, '');

function canonicalUrl(path: string, baseURL: string): string {
  const url = new URL(path, baseURL);
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && !url.hostname.startsWith('127.')) url.protocol = 'https:';
  return url.toString();
}

/** X accounts that share no email get a `*.invalid` placeholder address from better-auth. */
export function realEmail(email: string | null | undefined): string | null {
  if (!email || email.endsWith('.invalid')) return null;
  return email;
}
