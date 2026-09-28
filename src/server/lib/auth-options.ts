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

export function authOptions(deps: AuthDeps) {
  return {
    appName: deps.appName,
    baseURL: deps.baseURL,
    basePath: '/api/auth',
    secret: deps.secret,
    database: deps.database,
    trustedOrigins: [deps.baseURL],
    emailAndPassword: { enabled: false },
    socialProviders: {
      // Left out without credentials so better-auth does not warn on every request.
      ...(deps.google.clientId ? { google: { clientId: deps.google.clientId, clientSecret: deps.google.clientSecret, prompt: 'select_account' as const } } : {}),
      ...(deps.twitter.clientId ? { twitter: { clientId: deps.twitter.clientId, clientSecret: deps.twitter.clientSecret } } : {}),
    },
    account: {
      accountLinking: { enabled: true, allowDifferentEmails: true },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      cookiePrefix: 'callbay',
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
        resources: [
          { identifier: mcpResource(deps.baseURL), name: `${deps.appName} MCP`, accessTokenTtl: 7 * 24 * 3600 },
          // The site itself (GET /api, credits over x402) accepts the same tokens, so agents can hold one token for both.
          { identifier: siteResource(deps.baseURL), name: `${deps.appName} API`, accessTokenTtl: 7 * 24 * 3600 },
        ],
        clientRegistrationDefaultResources: [mcpResource(deps.baseURL), siteResource(deps.baseURL)],
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
