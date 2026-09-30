import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { api, ApiError } from "../../lib/client-api.ts";

let originalFetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

test("client receives JSON data and preserves method, body and cancellation", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/workspace");
    assert.equal(options.method, "POST");
    assert.equal(options.body, "fixture");
    assert.equal(options.signal.aborted, false);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    return Response.json({ data: { id: "fixture" } });
  };
  assert.deepEqual(await api("/api/workspace", { method: "POST", body: "fixture", signal: controller.signal }), { data: { id: "fixture" } });
});

test("client preserves structured API errors and their status", async () => {
  globalThis.fetch = async () => Response.json({ error: "Please sign in" }, { status: 401 });
  await assert.rejects(api("/api/workspace"), error => error instanceof ApiError && error.status === 401 && error.message === "Please sign in");
});

test("client presents a recoverable error for HTML service failures", async () => {
  globalThis.fetch = async () => new Response("<h1>Temporarily unavailable</h1>", { status: 503 });
  await assert.rejects(api("/api/workspace"), error => error instanceof ApiError && error.status === 503 && /input is still here/.test(error.message));
});

test("client rejects an unreadable success response", async () => {
  globalThis.fetch = async () => new Response("not JSON", { status: 200 });
  await assert.rejects(api("/api/workspace"), /unreadable response/);
});

test("client translates network errors without hiding aborts", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(api("/api/workspace"), error => error instanceof ApiError && error.status === 0 && /connection/.test(error.message));
  const abort = new DOMException("Cancelled", "AbortError");
  globalThis.fetch = async () => { throw abort; };
  await assert.rejects(api("/api/coach"), error => error === abort);
});
