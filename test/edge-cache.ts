/** An in-memory caches.default for tests, standing in for the Workers edge cache. */
export function installEdgeCache(): Map<string, Response> {
  const store = new Map<string, Response>();
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      async match(request: Request) { return store.get(request.url)?.clone(); },
      async put(request: Request, response: Response) { store.set(request.url, response.clone()); },
    },
  };
  return store;
}

/** A Workers ExecutionContext for app.request: background work just runs. */
export const executionCtx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
