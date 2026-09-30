import assert from 'node:assert/strict';
import test from 'node:test';
import { exampleAudio } from '../src/server/lib/example-audio';

const asset = () => new Response(new Uint8Array([0, 1, 2, 3, 4, 5]), { headers: { 'content-type': 'audio/mpeg', etag: '"original"' } });
const request = (range?: string, extra: Record<string, string> = {}) => new Request('https://call4.me/static/examples/dinner-reservation.mp3', { headers: { ...(range ? { range } : {}), ...extra } });

test('audio byte ranges support seeking and Safari probes', async () => {
  for (const [range, expected, contentRange] of [
    ['bytes=0-1', [0, 1], 'bytes 0-1/6'],
    ['bytes=3-', [3, 4, 5], 'bytes 3-5/6'],
    ['bytes=-2', [4, 5], 'bytes 4-5/6'],
    ['bytes=4-99', [4, 5], 'bytes 4-5/6'],
  ] as const) {
    const res = await exampleAudio(request(range), asset());
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-range'), contentRange);
    assert.equal(res.headers.get('content-length'), String(expected.length));
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [...expected]);
  }
});

test('unsatisfiable ranges return the real file size without a body', async () => {
  for (const range of ['bytes=6-', 'bytes=4-2', 'bytes=-0', 'bytes=999999999999999999999-']) {
    const res = await exampleAudio(request(range), asset());
    assert.equal(res.status, 416);
    assert.equal(res.headers.get('content-range'), 'bytes */6');
    assert.equal((await res.arrayBuffer()).byteLength, 0);
  }
});

test('full audio, HEAD, unsupported ranges, and If-Range preserve HTTP behavior', async () => {
  for (const req of [request(), request('bytes=0-1,4-5'), request('broken'), request('bytes=0-1', { 'if-range': '"old"' })]) {
    const res = await exampleAudio(req, asset());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal((await res.arrayBuffer()).byteLength, 6);
  }
  const head = await exampleAudio(new Request(request(), { method: 'HEAD' }), asset());
  assert.equal(head.headers.get('content-length'), '6');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const missing = new Response('missing', { status: 404 });
  assert.equal(await exampleAudio(request('bytes=0-1'), missing), missing);
  assert.equal((await exampleAudio(request('bytes=0-1', { 'if-range': '"original"' }), asset())).status, 206);
});
