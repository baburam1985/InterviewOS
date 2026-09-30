import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  loadCoachingAvailability,
  requestCoaching,
} from "../../lib/coaching-client.ts";
import { ApiError } from "../../lib/client-api.ts";
import { coachingRequest } from "../../lib/coaching-context.ts";
import { emptyProfile } from "../../lib/interview.ts";
import { sessionSchema } from "../../lib/api-validation.ts";
let originalFetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const request = coachingRequest(
  "A synthetic question?",
  "A synthetic answer.",
  "Behavioral",
  emptyProfile,
  [],
  { profile: false, stories: false },
);

test("setup requires a real boolean and distinguishes configured from unconfigured", async () => {
  for (const available of [true, false]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/coach");
      assert.equal(options.method, undefined);
      assert.equal(options.body, undefined);
      return Response.json({ available });
    };
    assert.equal(await loadCoachingAvailability(), available);
  }
});
test("unexpected setup responses cannot enable AI or masquerade as an absent key", async () => {
  for (const data of [
    {},
    { available: "true" },
    { available: 1 },
    { available: null },
    [],
    true,
  ]) {
    globalThis.fetch = async () => Response.json(data);
    await assert.rejects(
      loadCoachingAvailability(),
      (error) =>
        error instanceof ApiError &&
        error.status === 502 &&
        /unexpected response/.test(error.message),
    );
  }
});
test("accepted coaching preserves exact plain text within the saved-answer limit and request cancellation", async () => {
  for (const text of [
    "  A suggested outline.\nSecond line.  ",
    "🧪".repeat(10_000),
    "<script>This stays plain text</script>",
  ]) {
    const controller = new AbortController();
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/coach");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), request);
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.equal(options.signal.aborted, false);
      return Response.json({ text });
    };
    const result = await requestCoaching(request, controller.signal);
    assert.equal(result, text);
    assert.equal(sessionSchema.shape.ai.safeParse(result).success, true);
  }
});
test("malformed, blank and oversized success replies become recoverable coaching errors", async () => {
  for (const data of [
    {},
    { text: {} },
    { text: false },
    { text: 12 },
    { text: null },
    { text: "" },
    { text: " \n\t" },
    { text: "x".repeat(20_001) },
    [],
  ]) {
    globalThis.fetch = async () => Response.json(data);
    await assert.rejects(
      requestCoaching(request),
      (error) =>
        error instanceof ApiError &&
        error.status === 502 &&
        /previous feedback are unchanged/.test(error.message),
    );
  }
});
test("coaching preserves actionable HTTP, unreadable, connection and cancellation failures", async () => {
  globalThis.fetch = async () =>
    Response.json({ error: "Sign in again." }, { status: 401 });
  await assert.rejects(
    requestCoaching(request),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === "Sign in again.",
  );
  globalThis.fetch = async () =>
    new Response("<html>temporary failure</html>", { status: 200 });
  await assert.rejects(requestCoaching(request), /unreadable response/);
  globalThis.fetch = async () => {
    throw new TypeError("Disconnected");
  };
  await assert.rejects(requestCoaching(request), /Could not connect/);
  const controller = new AbortController();
  const aborted = new DOMException("Cancelled", "AbortError");
  globalThis.fetch = async (_url, options) => {
    controller.abort();
    assert.equal(options.signal.aborted, true);
    throw aborted;
  };
  await assert.rejects(
    requestCoaching(request, controller.signal),
    (error) => error === aborted,
  );
});

test("setup checks use a short request timeout while explicit coaching allows provider response time", async () => {
  const originalTimeout = AbortSignal.timeout;
  const durations = [];
  AbortSignal.timeout = (duration) => {
    durations.push(duration);
    return new AbortController().signal;
  };
  globalThis.fetch = async (_url, options) =>
    Response.json(
      options.method === "POST"
        ? { text: "A synthetic suggestion." }
        : { available: false },
    );
  try {
    await loadCoachingAvailability();
    await requestCoaching(request);
    assert.deepEqual(durations, [15_000, 50_000]);
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});
