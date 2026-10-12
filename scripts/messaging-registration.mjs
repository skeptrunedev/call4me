#!/usr/bin/env node
/**
 * Telnyx sender registration. All writes default to a local dry run.
 * TELNYX_API_KEY is needed only for reads and explicit --submit operations.
 * JSON files contain provider fields, never inferred business/consent details.
 *
 * npm run messaging:registration -- status
 * npm run messaging:registration -- brand create brand.json [--submit]
 * npm run messaging:registration -- brand show <id>
 * npm run messaging:registration -- brand feedback <id>
 * npm run messaging:registration -- brand vettings <id>
 * npm run messaging:registration -- campaign qualify <brand-id> <usecase>
 * Qualification also returns current monthly, quarterly and annual fees.
 * npm run messaging:registration -- campaign create campaign.json [--submit]
 * npm run messaging:registration -- campaign show <id>
 * npm run messaging:registration -- profile create profile.json [--submit]
 * npm run messaging:registration -- enums <name>
 *
 * Official contracts:
 * https://developers.telnyx.com/api-reference/brands/create-brand
 * https://developers.telnyx.com/api-reference/brands/get-brand-feedback-by-id
 * Feedback route verified against the official SDK (API reference route is stale):
 * https://github.com/team-telnyx/telnyx-node/blob/master/src/resources/messaging-10dlc/brand/brand.ts
 * https://developers.telnyx.com/api-reference/brands/list-external-vettings
 * https://developers.telnyx.com/api-reference/campaign/submit-campaign
 * https://developers.telnyx.com/api-reference/campaign/qualify-by-usecase
 * https://developers.telnyx.com/api-reference/profiles/create-a-messaging-profile
 * https://support.telnyx.com/en/articles/9940291-10dlc-campaign-compliance-requirements
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const usage = 'usage: npm run messaging:registration -- status | enums <name> | brand show <id> | brand feedback <id> | brand vettings <id> | brand create <file.json> [--submit] | campaign show <id> | campaign qualify <brand-id> <usecase> (includes fees) | campaign create <file.json> [--submit] | profile create <file.json> [--submit]';
const encode = encodeURIComponent;
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function redactRegistration(value) {
  if (Array.isArray(value)) return value.map(redactRegistration);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^(ein|universalEin|altBusinessId|taxId)$/i.test(key) && item ? '[redacted]' : redactRegistration(item),
  ]));
}

function requireText(body, fields) {
  for (const field of fields) {
    if (typeof body[field] !== 'string' || !body[field].trim()) throw new Error(`${field} must be a nonempty string`);
  }
}

function requireUrl(body, fields) {
  for (const field of fields) {
    let url;
    try { url = new URL(body[field]); } catch { throw new Error(`${field} must be an absolute public website URL`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field} must use HTTP or HTTPS`);
  }
}

export function validateRegistration(kind, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Registration JSON must be an object');
  if (kind === 'brand') {
    requireText(body, ['entityType', 'displayName', 'country', 'email', 'vertical', 'phone', 'street', 'city', 'state', 'postalCode', 'website']);
    if (!['PRIVATE_PROFIT', 'PUBLIC_PROFIT', 'NON_PROFIT', 'GOVERNMENT', 'SOLE_PROPRIETOR'].includes(body.entityType)) throw new Error('Invalid entityType');
    if (!/^[A-Z]{2}$/.test(body.country)) throw new Error('country must be an ISO country code');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new Error('email must be a valid support email');
    if (!/^\+[1-9]\d{7,14}$/.test(body.phone)) throw new Error('phone must use E.164 format');
    if (body.entityType === 'SOLE_PROPRIETOR') requireText(body, ['firstName', 'lastName', 'mobilePhone']);
    else requireText(body, ['companyName', 'ein']);
    if (body.country === 'US' && body.entityType !== 'SOLE_PROPRIETOR' && !/^\d{2}-?\d{7}$/.test(body.ein)) throw new Error('US ein must contain nine digits');
    if (body.entityType === 'PUBLIC_PROFIT') requireText(body, ['stockSymbol', 'stockExchange', 'businessContactEmail']);
    requireUrl(body, ['website']);
  } else if (kind === 'campaign') {
    requireText(body, ['brandId', 'description', 'usecase', 'referenceId', 'messageFlow', 'sample1', 'optinKeywords', 'optinMessage', 'optoutKeywords', 'optoutMessage', 'helpKeywords', 'helpMessage', 'privacyPolicyLink', 'termsAndConditionsLink']);
    if (body.messageFlow.length < 40 || body.messageFlow.length > 2048) throw new Error('messageFlow must contain 40 to 2048 characters and describe the live consent flow');
    for (const field of ['subscriberOptin', 'subscriberOptout', 'subscriberHelp', 'termsAndConditions']) {
      if (body[field] !== true) throw new Error(`${field} must be explicitly true before submitting a campaign`);
    }
    for (const field of ['ageGated', 'directLending', 'embeddedLink', 'embeddedPhone', 'numberPool', 'autoRenewal']) {
      if (typeof body[field] !== 'boolean') throw new Error(`${field} must be explicitly true or false`);
    }
    requireUrl(body, ['privacyPolicyLink', 'termsAndConditionsLink']);
    if (body.embeddedLink) { requireText(body, ['embeddedLinkSample']); requireUrl(body, ['embeddedLinkSample']); }
    if (body.usecase === 'ACCOUNT_NOTIFICATION') requireText(body, ['sample2', 'sample3']);
    if (['MIXED', 'LOW_VOLUME'].includes(body.usecase)) {
      if (!Array.isArray(body.subUsecases) || !body.subUsecases.length || body.subUsecases.some(item => typeof item !== 'string' || !item)) throw new Error('Mixed campaigns need explicit subUsecases');
      requireText(body, Array.from({ length: Math.max(2, body.subUsecases.length) }, (_, index) => `sample${index + 1}`));
    }
  } else if (kind === 'profile') {
    requireText(body, ['name']);
    if (!Array.isArray(body.whitelisted_destinations) || !body.whitelisted_destinations.length || body.whitelisted_destinations.some(value => typeof value !== 'string' || !/^(\*|[A-Z]{2})$/.test(value))) throw new Error('whitelisted_destinations must contain country codes or *');
    for (const field of ['webhook_url', 'webhook_failover_url']) if (body[field]) requireUrl(body, [field]);
  } else throw new Error(`Unknown registration type: ${kind}`);
  return body;
}

export function messagingRegistrationClient(apiKey, fetchApi = fetch) {
  async function request(path, method = 'GET', body) {
    if (!apiKey) throw new Error('TELNYX_API_KEY must be set');
    let response;
    try {
      response = await fetchApi(`https://api.telnyx.com/v2${path}`, {
        method,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new Error(`Telnyx ${method} ${path}: ${error.message}${method === 'POST' ? '. Submission outcome is unknown; inspect status before another submit' : ''}`);
    }
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error(`Telnyx ${method} ${path}: HTTP ${response.status}, ${raw || 'empty response'}. Inspect status before another submit`); }
    if (!response.ok) throw new Error(`Telnyx ${method} ${path}: HTTP ${response.status}, ${JSON.stringify(redactRegistration(payload))}`);
    return payload;
  }

  async function list(path, legacy = true, filter = {}) {
    const records = [];
    const size = legacy ? 500 : 250;
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ ...filter, ...(legacy ? { page: String(page), recordsPerPage: String(size) } : { 'page[number]': String(page), 'page[size]': String(size) }) });
      const payload = await request(`${path}?${query}`);
      const batch = legacy ? payload.records : payload.data;
      if (!Array.isArray(batch)) throw new Error(`Telnyx ${path}: missing list records; refusing incomplete inventory`);
      records.push(...batch);
      const total = legacy ? payload.totalRecords : payload.meta?.total_results;
      if (typeof total === 'number' && records.length >= total) return records;
      if (batch.length < size) {
        if (typeof total === 'number' && records.length < total) throw new Error(`Telnyx ${path}: incomplete inventory`);
        return records;
      }
      if (page >= 1000) throw new Error(`Telnyx ${path}: pagination limit reached; refusing incomplete inventory`);
    }
  }

  const brands = () => list('/10dlc/brand');
  const campaigns = brandId => list('/10dlc/campaign', true, { brandId });
  const profiles = () => list('/messaging_profiles', false);
  const show = async (kind, id) => {
    const path = kind === 'brand' ? '/10dlc/brand' : '/10dlc/campaign';
    const payload = await request(`${path}/${encode(id)}`);
    return payload.data ?? payload;
  };

  return {
    brands, campaigns, profiles, show,
    feedback: brandId => request(`/10dlc/brand/feedback/${encode(brandId)}`),
    vettings: brandId => request(`/10dlc/brand/${encode(brandId)}/externalVetting`),
    enums: name => request(`/10dlc/enum/${encode(name)}`),
    qualify: (brandId, usecase) => request(`/10dlc/campaignBuilder/brand/${encode(brandId)}/usecase/${encode(usecase)}`),
    async status() {
      const [brandRecords, profileRecords] = await Promise.all([brands(), profiles()]);
      const campaignRecords = (await Promise.all(brandRecords.map(brand => {
        if (!brand.brandId) throw new Error('Brand inventory is missing brandId');
        return campaigns(brand.brandId);
      }))).flat();
      return { brands: brandRecords, campaigns: campaignRecords, profiles: profileRecords };
    },
    async create(kind, body, submit = false) {
      validateRegistration(kind, body);
      const path = { brand: '/10dlc/brand', campaign: '/10dlc/campaignBuilder', profile: '/messaging_profiles' }[kind];
      if (!submit) return { dryRun: true, method: 'POST', path, body: redactRegistration(body), note: 'No provider request made. Use --submit only after verifying legal details and the live consent flow.' };
      let duplicate;
      if (kind === 'brand') {
        const current = await brands();
        // Read details when the list omits legal identifiers. Never assume that
        // a differently named product is a different registered legal entity.
        for (const record of current) {
          if (!record.brandId) throw new Error('Brand inventory is missing brandId; refusing duplicate check with incomplete data');
          const brand = record.ein && record.companyName ? record : await show('brand', record.brandId);
          if ((body.ein && normalized(brand.ein) === normalized(body.ein)) ||
              (body.companyName && normalized(brand.companyName) === normalized(body.companyName)) ||
              normalized(brand.displayName) === normalized(body.displayName)) { duplicate = brand; break; }
        }
      } else if (kind === 'campaign') {
        duplicate = (await campaigns(body.brandId)).find(item => item.referenceId === body.referenceId || (item.usecase === body.usecase && item.description === body.description));
      } else duplicate = (await profiles()).find(item => normalized(item.name) === normalized(body.name));
      if (duplicate) throw new Error(`Existing ${kind} matches this registration: ${duplicate[{ brand: 'brandId', campaign: 'campaignId', profile: 'id' }[kind]]}. Inspect it before creating another`);
      const payload = await request(path, 'POST', body);
      const created = payload.data ?? payload;
      const id = created[{ brand: 'brandId', campaign: 'campaignId', profile: 'id' }[kind]];
      if (!id) throw new Error(`Telnyx accepted ${kind} creation without returning its ID. Inspect status before another submit`);
      return created;
    },
  };
}

export async function runMessagingRegistration(args, apiKey = process.env.TELNYX_API_KEY, fetchApi = fetch) {
  const [kind, action, value, extra, flag] = args;
  const client = messagingRegistrationClient(apiKey, fetchApi);
  if (kind === 'status' && args.length === 1) return redactRegistration(await client.status());
  if (kind === 'enums' && action && args.length === 2) return client.enums(action);
  if (['brand', 'campaign'].includes(kind) && action === 'show' && value && args.length === 3) return redactRegistration(await client.show(kind, value));
  if (kind === 'brand' && ['feedback', 'vettings'].includes(action) && value && args.length === 3) return redactRegistration(await client[action](value));
  if (kind === 'campaign' && action === 'qualify' && value && extra && args.length === 4) return client.qualify(value, extra);
  if (kind === 'campaign' && action === 'fee') throw new Error('Telnyx campaign cost reference endpoint currently returns 404. Use campaign qualify <brand-id> <usecase> to retrieve live monthlyFee, quarterlyFee and annualFee instead.');
  if (['brand', 'campaign', 'profile'].includes(kind) && action === 'create' && value && !flag && (args.length === 3 || (args.length === 4 && extra === '--submit'))) {
    const body = JSON.parse(await readFile(value, 'utf8'));
    return redactRegistration(await client.create(kind, body, extra === '--submit'));
  }
  throw new Error(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runMessagingRegistration(process.argv.slice(2)), null, 2)); }
  catch (error) {
    // Provider errors can echo the submitted tax ID inside freeform detail text.
    console.error(error.message.replace(/\b\d{2}-?\d{7}\b/g, '[redacted tax identifier]'));
    process.exitCode = 1;
  }
}
