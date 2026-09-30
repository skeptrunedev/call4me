/** Byte ranges let native audio controls seek, including Safari's initial probes. */
export async function exampleAudio(request: Request, asset: Response): Promise<Response> {
  if (asset.status !== 200) return asset;
  const bytes = await asset.arrayBuffer();
  const size = bytes.byteLength;
  const headers = new Headers(asset.headers);
  headers.set('accept-ranges', 'bytes');
  headers.set('content-length', String(size));
  const full = () => new Response(request.method === 'HEAD' ? null : bytes, { headers });
  if (request.method === 'HEAD') return full();
  const ifRange = request.headers.get('if-range');
  if (ifRange && ifRange !== headers.get('etag') && ifRange !== headers.get('last-modified')) return full();
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  // Unsupported multipart or malformed ranges are answered with the complete file.
  if (!range || (!range[1] && !range[2])) return full();
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start || (!range[1] && Number(range[2]) === 0)) {
    headers.set('content-range', `bytes */${size}`);
    headers.set('content-length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}
