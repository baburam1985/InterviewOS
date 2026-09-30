import assert from "node:assert/strict";
import { test } from "node:test";
import {
  earlierSavedAnswer,
  answerWordCount,
} from "../../lib/answer-comparison.ts";

const saved = (id, second, overrides = {}) => ({
  id,
  question: "Explain a decision.",
  category: "Behavioral",
  answer: "I described my decision.",
  createdAt: new Date(Date.UTC(2026, 8, 30, 12, 0, second)).toISOString(),
  ...overrides,
});

test("comparison picks the most recent earlier matching save without changing data or order", () => {
  const selected = saved("selected", 10);
  const records = [
    saved("old", 1),
    saved("later", 20),
    saved("nearest", 9),
    selected,
  ];
  const before = structuredClone(records);
  assert.equal(earlierSavedAnswer(selected, records), records[2]);
  assert.deepEqual(records, before);
  assert.equal(
    earlierSavedAnswer(selected, [...records].reverse()),
    records[2],
  );
  assert.equal(
    earlierSavedAnswer(selected, [
      saved("trimmed", 8, { question: "  Explain a decision.\n" }),
    ]).id,
    "trimmed",
  );
});

test("comparison never treats another prompt, category, same ID or tied save as an earlier attempt", () => {
  const selected = saved("selected", 10);
  const records = [
    saved("selected", 1),
    saved("tie", 10),
    saved("future", 11),
    saved("category", 1, { category: "Leadership" }),
    saved("different", 1, { question: "Explain another decision." }),
    saved("case", 1, { question: "explain a decision." }),
    saved("invalid", 1, { createdAt: "invalid" }),
  ];
  assert.equal(earlierSavedAnswer(selected, records), null);
  assert.equal(
    earlierSavedAnswer({ ...selected, createdAt: "invalid" }, [
      saved("old", 1),
    ]),
    null,
  );
  assert.equal(earlierSavedAnswer(selected, []), null);
});

test("equally recent earlier candidates have a stable identity independent of input ordering", () => {
  const selected = saved("selected", 10);
  const a = saved("a", 5);
  const b = saved("b", 5);
  assert.equal(earlierSavedAnswer(selected, [b, a]), a);
  assert.equal(earlierSavedAnswer(selected, [a, b]), a);
});

test("comparison counts whitespace-separated text without changing Unicode or claiming language segmentation", () => {
  assert.equal(answerWordCount("  \n\t"), 0);
  assert.equal(answerWordCount("  I\nexplained\tmy   decision.  "), 4);
  assert.equal(answerWordCount("測試結果 🧪 café\u00a0résumé"), 4);
  assert.equal(answerWordCount("測試結果"), 1);
});
