import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { resetWorkspaceRequest } from "./fixtures";

test.beforeEach(async ({ request }) => {
  await resetWorkspaceRequest(request);
});

test("signed-out requests and spoofed identity headers cannot read or mutate data", async ({
  playwright,
  baseURL,
}) => {
  const api = await playwright.request.newContext({ baseURL });
  for (const method of ["GET", "POST", "DELETE"]) {
    const response = await api.fetch("/api/workspace", {
      method,
      headers: {
        "oai-authenticated-user-id": "local_seedy",
        "oai-authenticated-user-email": "spoof@example.test",
      },
      ...(method === "POST" ? { data: { kind: "profile", data: {} } } : {}),
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  await api.dispose();
});

test("local API rejects malformed, oversized, invalid, and cross-origin mutations", async ({
  request,
}) => {
  const coach = await request.get("/api/coach");
  expect(await coach.json()).toEqual({ available: false });
  const malformed = await request.post("/api/workspace", {
    data: "{",
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);
  const invalid = await request.post("/api/workspace", {
    data: { kind: "story", data: { id: "bad" } },
  });
  expect(invalid.status()).toBe(400);
  const oversized = await request.post("/api/workspace", {
    data: "x".repeat(400_001),
    headers: { "Content-Type": "application/json" },
  });
  expect(oversized.status()).toBe(413);
  const invalidDelete = await request.delete(
    "/api/workspace?id=not-a-record-id",
  );
  expect(invalidDelete.status()).toBe(400);
  const foreignOrigin = await request.post("/api/workspace", {
    headers: { origin: "https://foreign.example" },
    data: {},
  });
  expect(foreignOrigin.status()).toBe(403);
  const crossSite = await request.delete("/api/workspace?id=profile", {
    headers: { "sec-fetch-site": "cross-site" },
  });
  expect(crossSite.status()).toBe(403);
});

test("server-owned reviews and cross-kind collisions preserve records", async ({
  request,
}) => {
  const id = randomUUID();
  const story = {
    id,
    title: "Synthetic collision fixture",
    tag: "Impact",
    situation: "A project",
    task: "Test",
    action: "Analyze",
    result: "Reliable",
  };
  expect(
    (
      await request.post("/api/workspace", {
        data: { kind: "story", data: story },
      })
    ).status(),
  ).toBe(200);
  const session = {
    id,
    question: "A question",
    answer: "An intentionally short response",
    category: "Behavioral",
    seconds: 0,
    createdAt: new Date().toISOString(),
    review: { score: 100 },
  };
  expect(
    (
      await request.post("/api/workspace", {
        data: { kind: "session", data: session },
      })
    ).status(),
  ).toBe(409);
  const afterCollision = await (await request.get("/api/workspace")).json();
  expect(afterCollision.records).toEqual([{ kind: "story", data: story }]);
  const result = await request.post("/api/workspace", {
    data: { kind: "session", data: { ...session, id: randomUUID() } },
  });
  expect(result.status()).toBe(200);
  expect((await result.json()).data.review.score).toBeLessThan(100);
});
