import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  loadWorkspace,
  saveWorkspace,
  deleteWorkspace,
} from "../../lib/workspace-client.ts";
import { ApiError } from "../../lib/client-api.ts";
import { evaluate } from "../../lib/interview.ts";

const profile = {
  role: " Engineer ",
  company: " Example ",
  resume: "  My experience\n",
  job: "Build tools",
};
const story = {
  id: "e81fb7a1-0fd2-4cdd-9f96-5bdbb858873c",
  title: " A project ",
  tag: "Leadership",
  situation: "A launch",
  task: "Own delivery",
  action: "Test it",
  result: "Fewer errors",
};
const session = {
  id: "69ba0a83-b2d6-457e-8b63-46fdfcc9d86d",
  question: " Explain your approach. ",
  category: "Technical",
  answer: "  Use a map for the input.\n    Test empty cases.\n",
  seconds: 0,
  createdAt: "2026-09-30T00:00:00.000Z",
  ai: "Optional saved feedback",
};
const canonicalProfile = { ...profile, role: "Engineer", company: "Example" };
const canonicalStory = { ...story, title: "A project" };
const canonicalSession = {
  ...session,
  question: "Explain your approach.",
  review: evaluate(session.answer, 0, session.category),
};
const valid = {
  records: [
    { kind: "profile", data: canonicalProfile },
    { kind: "story", data: canonicalStory },
    { kind: "session", data: canonicalSession },
  ],
  warning: "One damaged saved item was skipped.",
};
let originalFetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function unexpected(error) {
  return error instanceof ApiError && error.status === 502;
}

test("workspace load validates every record and preserves saved reviews and warnings", async () => {
  globalThis.fetch = async () => Response.json(valid);
  assert.deepEqual(await loadWorkspace(), valid);
});

test("malformed workspace responses cannot become a partial or empty ready workspace", async () => {
  const invalid = [
    {},
    [],
    false,
    { records: null },
    { records: [], warning: {} },
    { records: [{ kind: "profile", data: {} }] },
    { records: [...valid.records, valid.records[0]] },
    {
      records: [
        valid.records[1],
        { kind: "session", data: { ...canonicalSession, id: story.id } },
      ],
    },
    {
      records: [
        valid.records[0],
        {
          kind: "session",
          data: { ...canonicalSession, createdAt: "yesterday" },
        },
      ],
    },
    {
      records: [
        { kind: "session", data: { ...canonicalSession, review: undefined } },
      ],
    },
    ...[
      { ...canonicalSession.review, score: 101 },
      { ...canonicalSession.review, pace: "fast" },
      { ...canonicalSession.review, words: -1 },
      { ...canonicalSession.review, checks: [] },
      {
        ...canonicalSession.review,
        checks: [{ label: "Context", pass: "yes", advice: "Explain it" }],
      },
      { ...canonicalSession.review, next: "" },
    ].map((review) => ({
      records: [{ kind: "session", data: { ...canonicalSession, review } }],
    })),
  ];
  for (const body of invalid) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(loadWorkspace(), unexpected, JSON.stringify(body));
  }
});

test("saves allow server trimming, preserve answer whitespace, and accept server-owned reviews", async () => {
  for (const [kind, input, output] of [
    ["profile", profile, canonicalProfile],
    ["story", story, canonicalStory],
    [
      "session",
      { ...session, review: { next: "Client-supplied review is ignored" } },
      canonicalSession,
    ],
  ]) {
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/workspace");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { kind, data: input });
      return Response.json({ data: output });
    };
    assert.deepEqual(await saveWorkspace(kind, input), { data: output });
  }
});

test("a malformed success or acknowledgement of a different persisted value is rejected", async () => {
  const wrongSession = [
    { id: story.id },
    { question: "Different question" },
    { answer: session.answer.trim() },
    { category: "Behavioral" },
    { seconds: 60 },
    { createdAt: "2026-09-30T00:01:00.000Z" },
    { ai: "Different feedback" },
    { review: undefined },
    { review: { score: 100 } },
  ].map((change) => ({ data: { ...canonicalSession, ...change } }));
  for (const body of [
    {},
    [],
    false,
    { data: {} },
    { data: canonicalStory },
    ...wrongSession,
  ]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(
      saveWorkspace("session", session),
      (error) =>
        unexpected(error) && /did not confirm this save/.test(error.message),
    );
  }
  for (const [kind, input, output] of [
    [
      "profile",
      profile,
      { ...canonicalProfile, resume: "Replaced experience" },
    ],
    ["story", story, { ...canonicalStory, result: "Invented result" }],
  ]) {
    globalThis.fetch = async () => Response.json({ data: output });
    await assert.rejects(saveWorkspace(kind, input), unexpected);
  }
});

test("delete requires an explicit success acknowledgement and keeps its kind guard", async () => {
  for (const body of [{}, [], false, { ok: false }, { ok: "true" }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(
      deleteWorkspace(story.id, "story"),
      (error) =>
        unexpected(error) && /did not confirm deletion/.test(error.message),
    );
  }
  globalThis.fetch = async (path, options) => {
    assert.equal(path, `/api/workspace?id=${story.id}&kind=story`);
    assert.equal(options.method, "DELETE");
    return Response.json({ ok: true });
  };
  await deleteWorkspace(story.id, "story");
});

test("workspace validation preserves actionable HTTP and network errors", async () => {
  globalThis.fetch = async () =>
    Response.json({ error: "Please sign in" }, { status: 401 });
  await assert.rejects(
    loadWorkspace(),
    (error) => error instanceof ApiError && error.status === 401,
  );
  globalThis.fetch = async () => {
    throw new TypeError("Disconnected");
  };
  await assert.rejects(
    saveWorkspace("profile", profile),
    (error) =>
      error instanceof ApiError &&
      error.status === 0 &&
      /input is still here/.test(error.message),
  );
});
