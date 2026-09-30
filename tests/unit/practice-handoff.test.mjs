import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  PRACTICE_HANDOFF_KEY,
  PRACTICE_HANDOFF_TTL,
  clearPracticeHandoff,
  readPracticeHandoff,
  writePracticeHandoff,
} from "../../lib/practice-handoff.ts";

const now = 1_790_700_000_000;
const draft = {
  question: "Explain your approach?",
  category: "Technical",
  answer: "  I would use a hash map.\nThen test duplicate inputs.  ",
  seconds: 15.5,
  reviewed: true,
  focus: "Explain a concrete test case.",
  mode: "advanced",
};
let originalWindow;
let values;
beforeEach(() => {
  originalWindow = globalThis.window;
  values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };
});
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

test("sign-in handoff preserves the exact draft without saved records or account data", () => {
  assert.equal(
    writePracticeHandoff(
      {
        ...draft,
        id: "saved-session",
        profile: { role: "private" },
        ai: "extra",
      },
      now,
    ),
    true,
  );
  assert.deepEqual(readPracticeHandoff(now), draft);
  const serialized = values.get(PRACTICE_HANDOFF_KEY);
  assert.doesNotMatch(serialized, /saved-session|private|extra/);
  clearPracticeHandoff();
  assert.equal(readPracticeHandoff(now), null);
});

test("expired, malformed, oversized and implausibly future handoffs are discarded", () => {
  const valid = { version: 1, expiresAt: now + 1000, draft };
  for (const raw of [
    "not json",
    "x".repeat(220_001),
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, expiresAt: now }),
    JSON.stringify({ ...valid, expiresAt: now + PRACTICE_HANDOFF_TTL + 1 }),
    JSON.stringify({ ...valid, draft: { ...draft, category: "Unknown" } }),
    JSON.stringify({ ...valid, draft: { ...draft, seconds: -1 } }),
    JSON.stringify({ ...valid, draft: { ...draft, answer: " " } }),
    JSON.stringify({
      ...valid,
      draft: { ...draft, answer: "a".repeat(30_001) },
    }),
    JSON.stringify({ ...valid, draft: { ...draft, reviewed: "true" } }),
  ]) {
    values.set(PRACTICE_HANDOFF_KEY, raw);
    assert.equal(readPracticeHandoff(now), null);
    assert.equal(values.has(PRACTICE_HANDOFF_KEY), false);
  }
  assert.equal(writePracticeHandoff(draft, now), true);
  assert.equal(
    readPracticeHandoff(now + PRACTICE_HANDOFF_TTL - 1)?.answer,
    draft.answer,
  );
  assert.equal(readPracticeHandoff(now + PRACTICE_HANDOFF_TTL), null);
});

test("a newer sign-in replaces the prior snapshot and rejects invalid writes", () => {
  assert.equal(writePracticeHandoff(draft, now), true);
  const updated = {
    ...draft,
    answer: "My latest answer",
    reviewed: false,
    seconds: 0,
  };
  assert.equal(writePracticeHandoff(updated, now + 1), true);
  assert.deepEqual(readPracticeHandoff(now + 1), updated);
  assert.equal(
    writePracticeHandoff({ ...draft, question: "x".repeat(3001) }, now),
    false,
  );
  assert.equal(
    writePracticeHandoff({ ...draft, seconds: Infinity }, now),
    false,
  );
  assert.deepEqual(readPracticeHandoff(now + 1), updated);
});

test("unavailable or full browser storage fails safely without claiming retention", () => {
  Object.defineProperty(window, "sessionStorage", {
    get() {
      throw new Error("Storage unavailable");
    },
    configurable: true,
  });
  assert.equal(writePracticeHandoff(draft, now), false);
  assert.equal(readPracticeHandoff(now), null);
  assert.doesNotThrow(() => clearPracticeHandoff());
  Object.defineProperty(window, "sessionStorage", {
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    },
    configurable: true,
  });
  assert.equal(writePracticeHandoff(draft, now), false);
  window.sessionStorage.setItem = () => {};
  assert.equal(writePracticeHandoff(draft, now), false);
});
