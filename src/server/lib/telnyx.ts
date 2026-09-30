/**
 * The few Telnyx Call Control and Numbers endpoints call4me uses.
 * Docs: developers.telnyx.com/api-reference (dial incl. supervise_call_control_id, switch_supervisor_role,
 * gather_using_speak, hangup, send_dtmf, answer,
 * available_phone_numbers, number_orders, phone_numbers, requirement_groups, outbound_voice_profiles)
 * and .../receiving-webhooks for signatures.
 */

const API = 'https://api.telnyx.com/v2';

type TelnyxEnv = Pick<Env, 'TELNYX_API_KEY' | 'TELNYX_CONNECTION_ID'>;

export class TelnyxError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(env: TelnyxEnv, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.TELNYX_API_KEY}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 500);
    try {
      const j = JSON.parse(text) as { errors?: { title?: string; detail?: string }[] };
      detail = j.errors?.map((e) => e.detail ?? e.title).join('; ') || detail;
    } catch {
      // not JSON; keep the raw text
    }
    throw new TelnyxError(`telnyx ${method} ${path}: ${res.status} ${detail}`, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface AvailableNumber {
  phoneNumber: string;
  /** What Telnyx charges once when the number is bought, in US cents (rounded up). */
  upfrontCents: number;
  /** What Telnyx charges every month the number is kept, in US cents (rounded up). */
  monthlyCents: number;
}

/** Telnyx quotes dollars as decimal strings ("1.00000"). */
const toCents = (dollars: string) => Math.ceil(Number(dollars) * 100 - 1e-9);

export interface TelnyxRecording {
  id: string;
  call_control_id: string | null;
  call_leg_id?: string;
  status: string;
  download_urls?: { mp3?: string | null; wav?: string | null } | null;
  duration_millis?: number;
  recording_started_at?: string;
  recording_ended_at?: string;
}

/** Bidirectional G.711 u-law over RTP both ways: the same format GPT-Live speaks, so no transcoding. */
const STREAM = {
  stream_track: 'inbound_track',
  stream_codec: 'PCMU',
  stream_bidirectional_mode: 'rtp',
  stream_bidirectional_codec: 'PCMU',
} as const;

const PERSON_LEG = '|person';
export const clientState = (callId: string) => btoa(callId);
/** The person's own phone, patched into a call: same call id, marked so its hang-up doesn't end the call. */
export const personClientState = (callId: string) => btoa(`${callId}${PERSON_LEG}`);
export const readClientState = (s: string | undefined | null): { callId: string; personLeg: boolean } | null => {
  if (!s) return null;
  try {
    const raw = atob(s);
    return raw.endsWith(PERSON_LEG) ? { callId: raw.slice(0, -PERSON_LEG.length), personLeg: true } : { callId: raw, personLeg: false };
  } catch {
    return null;
  }
};

export function telnyx(env: TelnyxEnv) {
  return {
    /** Recover an exact historical association from original provider webhook payloads. */
    async callLeg(callControlId: string): Promise<string | null> {
      const legs = new Set<string>();
      for (let page = 1; page <= 100; page++) {
        const query = new URLSearchParams({ 'filter[webhook][contains]': callControlId, 'filter[event_type]': 'call.hangup', 'page[number]': String(page), 'page[size]': '100' });
        const result = await call<{ data: { webhook?: { payload?: { call_control_id?: string; call_leg_id?: string } } }[]; meta: { total_pages: number } }>(env, 'GET', `/webhook_deliveries?${query}`);
        if (!Array.isArray(result.data) || !Number.isInteger(result.meta?.total_pages) || result.meta.total_pages < 0) throw new TelnyxError('invalid webhook history response', 502);
        for (const event of result.data) {
          const p = event.webhook?.payload;
          if (p?.call_control_id === callControlId && p.call_leg_id) legs.add(p.call_leg_id);
        }
        if (legs.size > 1) throw new TelnyxError('conflicting call leg identifiers', 502);
        if (page >= result.meta.total_pages) return [...legs][0] ?? null;
      }
      throw new TelnyxError('too many webhook history pages', 502);
    },

    /** Fresh download links for one call. Control IDs are not call leg IDs. */
    async recordings(callControlId: string, callLegId?: string): Promise<TelnyxRecording[]> {
      const recordings: TelnyxRecording[] = [];
      for (let page = 1; page <= 100; page++) {
        const field = callLegId ? 'call_leg_id' : 'call_control_id';
        const query = new URLSearchParams({ [`filter[${field}]`]: callLegId ?? callControlId, 'page[number]': String(page), 'page[size]': '100' });
        const result = await call<{ data: TelnyxRecording[]; meta: { total_pages: number } }>(env, 'GET', `/recordings?${query}`);
        if (!Array.isArray(result.data) || !Number.isInteger(result.meta?.total_pages) || result.meta.total_pages < 0) {
          throw new TelnyxError('invalid recordings response', 502);
        }
        // Fail closed if the provider ever ignores its filter. Never expose another call.
        if (result.data.some((r) => callLegId ? r.call_leg_id !== callLegId || (r.call_control_id && r.call_control_id !== callControlId) : r.call_control_id !== callControlId)) throw new TelnyxError('recording call mismatch', 502);
        recordings.push(...result.data);
        if (page >= result.meta.total_pages) return recordings;
      }
      throw new TelnyxError('too many recording pages', 502);
    },

    /** Place an outbound call. Recording stays off (it is only on when `record` is passed). */
    async dial(opts: { to: string; from: string; webhookUrl: string; streamUrl: string; callId: string; timeLimitSecs: number }): Promise<string> {
      const r = await call<{ data: { call_control_id: string } }>(env, 'POST', '/calls', {
        connection_id: env.TELNYX_CONNECTION_ID,
        to: opts.to,
        from: opts.from,
        webhook_url: opts.webhookUrl,
        client_state: clientState(opts.callId),
        timeout_secs: 40,
        time_limit_secs: opts.timeLimitSecs,
        stream_url: opts.streamUrl,
        ...STREAM,
      });
      return r.data.call_control_id;
    },

    /** Answer an inbound call and stream it the same way. */
    async answer(callControlId: string, opts: { webhookUrl: string; streamUrl: string; callId: string; timeLimitSecs: number }): Promise<void> {
      await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/answer`, {
        webhook_url: opts.webhookUrl,
        client_state: clientState(opts.callId),
        time_limit_secs: opts.timeLimitSecs,
        stream_url: opts.streamUrl,
        ...STREAM,
      });
    },

    async reject(callControlId: string): Promise<void> {
      await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/reject`, { cause: 'USER_BUSY' });
    },

    async hangup(callControlId: string): Promise<void> {
      try {
        await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/hangup`, {});
      } catch (err) {
        // 422 means the call already ended, which is the state we wanted.
        if (!(err instanceof TelnyxError && err.status === 422)) throw err;
      }
    },

    /**
     * Ring the person as a "monitor" supervisor of the call: they hear both ends, but nobody hears
     * them. A voicemail can pick up in two seconds, so answering proves nothing; they are only put
     * on the call (switchSupervisorRole to barge) after pressing 1 at the joinGate prompt.
     */
    async dialPerson(opts: { to: string; from: string; webhookUrl: string; callId: string; superviseControlId: string; timeLimitSecs: number }): Promise<string> {
      const r = await call<{ data: { call_control_id: string } }>(env, 'POST', '/calls', {
        connection_id: env.TELNYX_CONNECTION_ID,
        to: opts.to,
        from: opts.from,
        webhook_url: opts.webhookUrl,
        client_state: personClientState(opts.callId),
        timeout_secs: 20,
        time_limit_secs: opts.timeLimitSecs,
        supervise_call_control_id: opts.superviseControlId,
        supervisor_role: 'monitor',
      });
      return r.data.call_control_id;
    },

    /** Ask the answered person leg to press 1; the result comes back as call.gather.ended. */
    async joinGate(callControlId: string, opts: { callId: string; business: string }): Promise<void> {
      await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/gather_using_speak`, {
        voice: 'AWS.Polly.Joanna-Neural',
        payload: `This is Call for Me. Your call with ${opts.business} is on the line. Press 1 to join it.`,
        invalid_payload: 'Press 1 to join the call.',
        valid_digits: '1',
        minimum_digits: 1,
        maximum_digits: 1,
        maximum_tries: 2,
        timeout_millis: 8000,
        client_state: personClientState(opts.callId),
      });
    },

    /** barge: they hear and are heard by both ends; monitor: they only listen. */
    async switchSupervisorRole(callControlId: string, role: 'barge' | 'monitor'): Promise<void> {
      await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/switch_supervisor_role`, { role });
    },

    async sendDtmf(callControlId: string, digits: string): Promise<void> {
      await call(env, 'POST', `/calls/${encodeURIComponent(callControlId)}/actions/send_dtmf`, { digits, duration_millis: 250 });
    },

    /**
     * The first voice number for sale in `country` of `type`, preferably in `areaCode` (national
     * destination code), with what Telnyx charges for it. Null when none is for sale.
     */
    async availableNumber(opts: { country: string; type: string; areaCode?: string | null }): Promise<AvailableNumber | null> {
      const search = async (ndc: string | null) => {
        const q = new URLSearchParams({ 'filter[country_code]': opts.country, 'filter[phone_number_type]': opts.type, 'filter[features][]': 'voice', 'filter[limit]': '1' });
        if (ndc) {
          q.set('filter[national_destination_code]', ndc);
          q.set('filter[best_effort]', 'true');
        }
        const r = await call<{ data: { phone_number: string; cost_information: { upfront_cost: string; monthly_cost: string; currency: string } }[] }>(env, 'GET', `/available_phone_numbers?${q}`);
        const n = r.data[0];
        if (!n) return null;
        if (n.cost_information.currency !== 'USD') throw new TelnyxError(`number prices in ${n.cost_information.currency}, not USD`, 502);
        return { phoneNumber: n.phone_number, upfrontCents: toCents(n.cost_information.upfront_cost), monthlyCents: toCents(n.cost_information.monthly_cost) };
      };
      return (opts.areaCode ? await search(opts.areaCode) : null) ?? (await search(null));
    },

    /**
     * Order `number` onto our Call Control connection, with the requirement group that holds its
     * country's paperwork when it needs one. Orders complete asynchronously and a number can't
     * place calls until its order succeeds, so this waits for the outcome.
     */
    async orderNumber(number: string, requirementGroupId?: string | null): Promise<void> {
      const order = await call<{ data: { id: string; status: string } }>(env, 'POST', '/number_orders', {
        phone_numbers: [{ phone_number: number, ...(requirementGroupId ? { requirement_group_id: requirementGroupId } : {}) }],
        connection_id: env.TELNYX_CONNECTION_ID,
      });
      let status = order.data.status;
      for (let i = 0; i < 20 && status === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        status = (await call<{ data: { status: string } }>(env, 'GET', `/number_orders/${order.data.id}`)).data.status;
      }
      if (status !== 'success') throw new TelnyxError(`number order ${order.data.id} for ${number} is ${status}`, 503);
    },

    /** Give a number back to Telnyx; its monthly charge stops. Already gone counts as released. */
    async releaseNumber(number: string): Promise<void> {
      const q = new URLSearchParams({ 'filter[phone_number]': number });
      const r = await call<{ data: { id: string; phone_number: string }[] }>(env, 'GET', `/phone_numbers?${q}`);
      const found = r.data.find((n) => n.phone_number === number);
      if (!found) return;
      await call(env, 'DELETE', `/phone_numbers/${encodeURIComponent(found.id)}`);
    },

    /** "approved" once Telnyx has accepted a requirement group's paperwork. */
    async requirementGroupStatus(id: string): Promise<string> {
      return (await call<{ data: { status: string } }>(env, 'GET', `/requirement_groups/${encodeURIComponent(id)}`)).data.status;
    },

    /**
     * Let our outbound voice profile call `countries`. Telnyx refuses calls to countries missing
     * from the profile's whitelist, which starts as the US and Canada. Only ever adds.
     */
    async allowDestinations(countries: string[]): Promise<void> {
      const app = await call<{ data: { outbound: { outbound_voice_profile_id: string } } }>(env, 'GET', `/call_control_applications/${encodeURIComponent(env.TELNYX_CONNECTION_ID)}`);
      const profileId = app.data.outbound.outbound_voice_profile_id;
      const profile = await call<{ data: { whitelisted_destinations: string[] } }>(env, 'GET', `/outbound_voice_profiles/${encodeURIComponent(profileId)}`);
      const allowed = profile.data.whitelisted_destinations;
      const missing = countries.filter((c) => !allowed.includes(c));
      if (!missing.length) return;
      await call(env, 'PATCH', `/outbound_voice_profiles/${encodeURIComponent(profileId)}`, { whitelisted_destinations: [...allowed, ...missing] });
    },
  };
}

/**
 * Telnyx signs `${timestamp}|${rawBody}` with Ed25519; the public key is on the portal's
 * API keys page. Stale timestamps are rejected so a captured webhook cannot be replayed.
 */
export async function verifyTelnyxSignature(opts: { publicKeyB64: string; signatureB64: string | undefined; timestamp: string | undefined; body: string; toleranceSecs?: number; nowMs?: number }): Promise<boolean> {
  if (!opts.signatureB64 || !opts.timestamp) return false;
  const ts = Number(opts.timestamp);
  if (!Number.isFinite(ts) || Math.abs((opts.nowMs ?? Date.now()) / 1000 - ts) > (opts.toleranceSecs ?? 300)) return false;
  try {
    const key = await crypto.subtle.importKey('raw', b64bytes(opts.publicKeyB64), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, b64bytes(opts.signatureB64), new TextEncoder().encode(`${opts.timestamp}|${opts.body}`));
  } catch {
    return false;
  }
}

function b64bytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
