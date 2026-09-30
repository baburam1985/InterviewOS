/** JSON responses can contain private interview context, including error responses. */
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
}

export class RequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'RequestError';
  }
}

export function validOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return request.headers.get('sec-fetch-site') !== 'cross-site'
    && (!origin || origin === new URL(request.url).origin);
}

/** Bound bytes while reading, rather than buffering an arbitrarily large body first. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestError('Content is too large.', 413);
  }
  if (!request.body) throw new RequestError('Send a valid JSON body.', 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let total = 0;
  let text = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Do not wait on cancellation: an untrusted producer might never acknowledge it.
        void reader.cancel().catch(() => {});
        throw new RequestError('Content is too large.', 413);
      }
      text += decoder.decode(value, {stream: true});
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('Send a valid JSON body.', 400);
  } finally {
    reader.releaseLock();
  }
}
