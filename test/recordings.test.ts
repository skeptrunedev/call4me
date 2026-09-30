import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { TelnyxError, type TelnyxRecording } from '../src/server/lib/telnyx';
import { ACTIVE, CallError, type CallRow } from '../src/server/services/calls';
import { getCallRecordings, recordingUrl } from '../src/server/services/recordings';

const accountId = 'account_owner';
const callId = 'call_finished';
const controlId = 'v3:test/control+id=';
const legId = '11111111-2222-4333-8444-555555555555';

function environment(overrides: Partial<CallRow> = {}, mapping: { saved?: string; writes?: unknown[][] } = {}): Env {
  const row = { id: callId, account_id: accountId, status: 'completed', telnyx_call_control_id: controlId, ...overrides };
  return {
    TELNYX_API_KEY: 'test_api_key',
    TELNYX_CONNECTION_ID: 'test_connection',
    DB: {
      prepare(sql: string) {
        if (sql.startsWith('SELECT call_leg_id FROM call_provider_legs')) {
          return {
            bind(id: string) {
              assert.equal(id, row.telnyx_call_control_id);
              return { async first() { return mapping.saved ? { call_leg_id: mapping.saved } : null; } };
            },
          };
        }
        if (sql.startsWith('INSERT OR IGNORE INTO call_provider_legs')) {
          assert.match(sql, /\(call_control_id, call_leg_id\) VALUES \(\?, \?\)/);
          return {
            bind(...values: unknown[]) {
              return {
                async run() {
                  mapping.writes?.push(values);
                  mapping.saved ??= String(values[1]);
                  return { success: true };
                },
              };
            },
          };
        }
        assert.match(sql, /^SELECT \* FROM calls WHERE id = \? AND account_id = \?$/);
        return {
          bind(id: string, owner: string) {
            return { async first() { return id === row.id && owner === row.account_id ? row : null; } };
          },
        };
      },
    },
  } as unknown as Env;
}

function recording(overrides: Partial<TelnyxRecording> = {}): TelnyxRecording {
  return {
    id: 'recording_one',
    call_control_id: controlId,
    status: 'completed',
    download_urls: { mp3: 'https://media.example.test/recording.mp3?token=first' },
    ...overrides,
  };
}

function provider(t: TestContext, respond: (url: URL) => Response, options: { leg?: string; history?: (url: URL) => Response } = {}) {
  return t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, 'https://api.telnyx.com');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test_api_key');
    if (url.pathname === '/v2/webhook_deliveries') {
      assert.equal(url.searchParams.get('filter[webhook][contains]'), controlId);
      assert.equal(url.searchParams.get('filter[event_type]'), 'call.hangup');
      return options.history?.(url) ?? Response.json({ data: [], meta: { total_pages: 0 } });
    }
    assert.equal(url.pathname, '/v2/recordings');
    assert.equal(url.searchParams.get(options.leg ? 'filter[call_leg_id]' : 'filter[call_control_id]'), options.leg ?? controlId);
    assert.equal(url.searchParams.has(options.leg ? 'filter[call_control_id]' : 'filter[call_leg_id]'), false);
    return respond(url);
  });
}

function neverFetch(t: TestContext) {
  return t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('this request must not access the provider');
  });
}

test('another account cannot retrieve a call or contact the provider', async (t) => {
  const fetch = neverFetch(t);
  await assert.rejects(getCallRecordings(environment(), 'account_other', callId), (error) => error instanceof CallError && error.status === 404);
  assert.equal(fetch.mock.callCount(), 0);
});

test('every active call status rejects retrieval before contacting the provider', async (t) => {
  const fetch = neverFetch(t);
  for (const status of ACTIVE) {
    await assert.rejects(getCallRecordings(environment({ status }), accountId, callId), (error) => error instanceof CallError && error.status === 409);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('a call without a provider control id returns no recordings without fetching', async (t) => {
  const fetch = neverFetch(t);
  const result = await getCallRecordings(environment({ telnyx_call_control_id: null }), accountId, callId);
  assert.equal(result.call_id, callId);
  assert.deepEqual(result.recordings, []);
  assert.equal(fetch.mock.callCount(), 0);
});

test('pagination retains the exact control id filter and returns every page', async (t) => {
  const pages: number[] = [];
  const fetch = provider(t, (url) => {
    const page = Number(url.searchParams.get('page[number]'));
    pages.push(page);
    assert.equal(url.searchParams.get('page[size]'), '100');
    return Response.json({ data: [recording({ id: `recording_${page}` })], meta: { total_pages: 2 } });
  });
  const result = await getCallRecordings(environment(), accountId, callId);
  assert.deepEqual(pages, [1, 2]);
  assert.equal(fetch.mock.callCount(), 3);
  assert.deepEqual(result.recordings.map((item) => item.id), ['recording_1', 'recording_2']);
});

test('a mismatched record on a later page fails the entire request', async (t) => {
  provider(t, (url) => Response.json({
    data: [recording({ call_control_id: url.searchParams.get('page[number]') === '1' ? controlId : 'v3:another_call' })],
    meta: { total_pages: 2 },
  }));
  await assert.rejects(getCallRecordings(environment(), accountId, callId), (error) => error instanceof TelnyxError && error.status === 502 && /mismatch/.test(error.message));
});

test('a provider failure propagates instead of returning empty success', async (t) => {
  provider(t, () => Response.json({ errors: [{ detail: 'provider unavailable' }] }, { status: 503 }));
  await assert.rejects(getCallRecordings(environment(), accountId, callId), (error) => error instanceof TelnyxError && error.status === 503 && /provider unavailable/.test(error.message));
});

test('completed recordings map metadata and refresh download links on every request', async (t) => {
  let requests = 0;
  provider(t, () => {
    requests++;
    return Response.json({
      data: [recording({
        download_urls: { mp3: `https://media.example.test/audio.mp3?token=${requests}`, wav: `https://media.example.test/audio.wav?token=${requests}` },
        duration_millis: 45000,
        recording_started_at: '2026-09-28T12:00:00Z',
        recording_ended_at: '2026-09-28T12:00:45Z',
      })],
      meta: { total_pages: 1 },
    });
  });
  const env = environment();
  const first = await getCallRecordings(env, accountId, callId);
  const second = await getCallRecordings(env, accountId, callId);
  assert.deepEqual(first.recordings, [{
    id: 'recording_one',
    download_urls: { mp3: 'https://media.example.test/audio.mp3?token=1', wav: 'https://media.example.test/audio.wav?token=1' },
    duration_millis: 45000,
    started_at: '2026-09-28T12:00:00Z',
    ended_at: '2026-09-28T12:00:45Z',
  }]);
  assert.equal(second.recordings[0].download_urls.mp3, 'https://media.example.test/audio.mp3?token=2');
  assert.equal(second.recordings[0].download_urls.wav, 'https://media.example.test/audio.wav?token=2');
  assert.equal(requests, 2);
});

test('records without completed downloadable media return an empty list', async (t) => {
  provider(t, () => Response.json({
    data: [recording({ status: 'processing' }), recording({ download_urls: undefined }), recording({ download_urls: {} })],
    meta: { total_pages: 1 },
  }));
  const result = await getCallRecordings(environment(), accountId, callId);
  assert.deepEqual(result.recordings, []);
  assert.match(result.message, /No recording is available/);
});

test('an empty provider result returns an empty list', async (t) => {
  provider(t, () => Response.json({ data: [], meta: { total_pages: 0 } }));
  assert.deepEqual((await getCallRecordings(environment(), accountId, callId)).recordings, []);
});

test('a null alternate format is omitted while the available download remains usable', async (t) => {
  provider(t, () => Response.json({
    data: [
      recording({ id: 'mp3_only', download_urls: { mp3: 'https://media.example.test/audio.mp3', wav: null } }),
      recording({ id: 'wav_only', download_urls: { mp3: null, wav: 'https://media.example.test/audio.wav' } }),
      recording({ id: 'neither', download_urls: { mp3: null, wav: null } }),
      recording({ id: 'no_urls', download_urls: null }),
    ],
    meta: { total_pages: 1 },
  }));
  const result = await getCallRecordings(environment(), accountId, callId);
  assert.deepEqual(result.recordings.map(({ id, download_urls }) => ({ id, download_urls })), [
    { id: 'mp3_only', download_urls: { mp3: 'https://media.example.test/audio.mp3' } },
    { id: 'wav_only', download_urls: { wav: 'https://media.example.test/audio.wav' } },
  ]);
});

test('a trunk recording with null control id is retrieved by its saved exact leg without history access', async (t) => {
  const fetch = provider(t, () => Response.json({
    data: [recording({ call_control_id: null, call_leg_id: legId })],
    meta: { total_pages: 1 },
  }), {
    leg: legId,
    history: () => assert.fail('saved mapping must skip webhook history'),
  });
  const result = await getCallRecordings(environment({}, { saved: legId }), accountId, callId);
  assert.equal(result.recordings.length, 1);
  assert.equal(result.recordings[0].id, 'recording_one');
  assert.equal(fetch.mock.callCount(), 1);
});

test('history pagination matches exact control ids and persists only the recovered mapping', async (t) => {
  const historyPages: number[] = [];
  const writes: unknown[][] = [];
  let mediaRequests = 0;
  provider(t, () => {
    mediaRequests++;
    return Response.json({
      data: [recording({ call_control_id: null, call_leg_id: legId, download_urls: { mp3: `https://media.example.test/audio.mp3?token=${mediaRequests}` } })],
      meta: { total_pages: 1 },
    });
  }, {
    leg: legId,
    history: (url) => {
      const page = Number(url.searchParams.get('page[number]'));
      historyPages.push(page);
      const payload = page === 1
        ? { call_control_id: `${controlId}substring_collision`, call_leg_id: 'another_leg' }
        : { call_control_id: controlId, call_leg_id: legId };
      return Response.json({ data: [{ webhook: { payload } }], meta: { total_pages: 2 } });
    },
  });
  const env = environment({}, { writes });
  const first = await getCallRecordings(env, accountId, callId);
  const second = await getCallRecordings(env, accountId, callId);
  assert.deepEqual(historyPages, [1, 2]);
  assert.deepEqual(writes, [[controlId, legId]]);
  assert.equal(first.recordings[0].download_urls.mp3, 'https://media.example.test/audio.mp3?token=1');
  assert.equal(second.recordings[0].download_urls.mp3, 'https://media.example.test/audio.mp3?token=2');
});

test('substring collisions in history never become saved mappings or leg filters', async (t) => {
  const writes: unknown[][] = [];
  provider(t, () => Response.json({ data: [], meta: { total_pages: 0 } }), {
    history: () => Response.json({
      data: [{ webhook: { payload: { call_control_id: `prefix${controlId}`, call_leg_id: 'another_leg' } } }],
      meta: { total_pages: 1 },
    }),
  });
  assert.deepEqual((await getCallRecordings(environment({}, { writes }), accountId, callId)).recordings, []);
  assert.deepEqual(writes, []);
});

test('conflicting exact historical leg mappings fail before saving or fetching media', async (t) => {
  const writes: unknown[][] = [];
  provider(t, () => assert.fail('conflicting history must not fetch media'), {
    history: (url) => Response.json({
      data: [{ webhook: { payload: { call_control_id: controlId, call_leg_id: url.searchParams.get('page[number]') === '1' ? legId : 'conflicting_leg' } } }],
      meta: { total_pages: 2 },
    }),
  });
  await assert.rejects(getCallRecordings(environment({}, { writes }), accountId, callId), (error) => error instanceof TelnyxError && error.status === 502 && /conflicting/.test(error.message));
  assert.deepEqual(writes, []);
});

test('a recording with the wrong leg fails even when its control id matches', async (t) => {
  provider(t, () => Response.json({
    data: [recording({ call_leg_id: 'another_leg' })],
    meta: { total_pages: 1 },
  }), { leg: legId });
  await assert.rejects(getCallRecordings(environment({}, { saved: legId }), accountId, callId), (error) => error instanceof TelnyxError && error.status === 502 && /mismatch/.test(error.message));
});

test('a recording with a conflicting control id fails even when its leg matches', async (t) => {
  provider(t, () => Response.json({
    data: [recording({ call_leg_id: legId, call_control_id: 'v3:another_call' })],
    meta: { total_pages: 1 },
  }), { leg: legId });
  await assert.rejects(getCallRecordings(environment({}, { saved: legId }), accountId, callId), (error) => error instanceof TelnyxError && error.status === 502 && /mismatch/.test(error.message));
});

test('history failures propagate without silently querying recordings or saving mappings', async (t) => {
  const writes: unknown[][] = [];
  provider(t, () => assert.fail('failed history must not fetch media'), {
    history: () => Response.json({ errors: [{ detail: 'history unavailable' }] }, { status: 503 }),
  });
  await assert.rejects(getCallRecordings(environment({}, { writes }), accountId, callId), (error) => error instanceof TelnyxError && error.status === 503 && /history unavailable/.test(error.message));
  assert.deepEqual(writes, []);
});

test('malformed history pagination fails without fetching recordings', async (t) => {
  provider(t, () => assert.fail('invalid history must not fetch media'), {
    history: () => Response.json({ data: [], meta: { total_pages: '1' } }),
  });
  await assert.rejects(getCallRecordings(environment(), accountId, callId), (error) => error instanceof TelnyxError && error.status === 502 && /invalid webhook history/.test(error.message));
});

// ---- one recording's link, behind the signed-in call page's audio route (routes/public.tsx)

test('another account cannot resolve a recording link or contact the provider', async (t) => {
  const fetch = neverFetch(t);
  await assert.rejects(recordingUrl(environment(), 'account_other', callId, 'recording_one', 'mp3'), (error) => error instanceof CallError && error.status === 404);
  assert.equal(fetch.mock.callCount(), 0);
});

test('a live call resolves no recording link before contacting the provider', async (t) => {
  const fetch = neverFetch(t);
  await assert.rejects(recordingUrl(environment({ status: 'in_progress' }), accountId, callId, 'recording_one', 'mp3'), (error) => error instanceof CallError && error.status === 409);
  assert.equal(fetch.mock.callCount(), 0);
});

test('the owner gets a fresh link for the requested recording and format', async (t) => {
  let requests = 0;
  provider(t, () => {
    requests++;
    return Response.json({
      data: [
        recording({ id: 'recording_other', download_urls: { mp3: 'https://media.example.test/other.mp3' } }),
        recording({ download_urls: { mp3: `https://media.example.test/audio.mp3?token=${requests}`, wav: `https://media.example.test/audio.wav?token=${requests}` } }),
      ],
      meta: { total_pages: 1 },
    });
  });
  const env = environment();
  assert.equal(await recordingUrl(env, accountId, callId, 'recording_one', 'mp3'), 'https://media.example.test/audio.mp3?token=1');
  assert.equal(await recordingUrl(env, accountId, callId, 'recording_one', 'wav'), 'https://media.example.test/audio.wav?token=2');
});

test('an unknown recording or a missing format resolves to null', async (t) => {
  provider(t, () => Response.json({ data: [recording()], meta: { total_pages: 1 } }));
  const env = environment();
  assert.equal(await recordingUrl(env, accountId, callId, 'recording_missing', 'mp3'), null);
  assert.equal(await recordingUrl(env, accountId, callId, 'recording_one', 'wav'), null);
});

test('a provider failure propagates from the link lookup instead of resolving to null', async (t) => {
  provider(t, () => Response.json({ errors: [{ detail: 'provider unavailable' }] }, { status: 503 }));
  await assert.rejects(recordingUrl(environment(), accountId, callId, 'recording_one', 'mp3'), (error) => error instanceof TelnyxError && error.status === 503);
});
