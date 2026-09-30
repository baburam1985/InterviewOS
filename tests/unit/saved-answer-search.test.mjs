import assert from "node:assert/strict";
import { test } from "node:test";
import { findSavedAnswers } from "../../lib/saved-answer-search.ts";
import { evaluate } from "../../lib/interview.ts";

function saved(
  id,
  answer,
  category = "Behavioral",
  question = "Tell me about a project.",
) {
  return {
    id,
    answer,
    category,
    question,
    seconds: 0,
    createdAt: "2026-09-30T00:00:00.000Z",
    review: evaluate(answer, 0, category),
  };
}

test("search combines literal case-insensitive terms across question, answer and category", () => {
  const records = [
    saved("1", "I tested a Redis cache.", "Technical"),
    saved("2", "I improved the hiring process."),
    saved("3", "I tested the request queue.", "Technical"),
  ];
  assert.deepEqual(
    findSavedAnswers(records, "  TECHNICAL\nredis  ").map(
      (row) => row.session.id,
    ),
    ["1"],
  );
  assert.deepEqual(
    findSavedAnswers(records, "project tested").map((row) => row.session.id),
    ["1", "3"],
  );
  assert.deepEqual(findSavedAnswers(records, "technical hiring"), []);
  for (const token of [
    "C++",
    "a.b",
    "[x]",
    "(input)",
    "a|b",
    "\\path",
    "$cost",
    "*",
  ]) {
    const record = saved("literal", `The exact token was ${token}.`);
    assert.equal(findSavedAnswers([record], token).length, 1, token);
  }
  assert.equal(findSavedAnswers([saved("1", "literal text")], ".*").length, 0);
});

test("empty searches preserve order and expose concise previews without changing stored records", () => {
  const records = [
    saved("new", "  First line.\n\tSecond line.  "),
    saved("old", "Detail ".repeat(100)),
  ];
  const original = structuredClone(records);
  const rows = findSavedAnswers(records, " \n ");
  assert.deepEqual(
    rows.map((row) => row.session.id),
    ["new", "old"],
  );
  assert.equal(rows[0].session, records[0]);
  assert.equal(rows[0].preview, "First line. Second line.");
  assert.ok(Array.from(rows[1].preview).length <= 182);
  assert.match(rows[1].preview, /…$/);
  assert.deepEqual(records, original);
});

test("answer excerpts reveal later matching details and prefer a specific term", () => {
  const record = saved(
    "1",
    "The project ".repeat(50) +
      "used a cobalt migration to reduce errors. " +
      "More detail. ".repeat(50),
  );
  const [row] = findSavedAnswers([record], "project cobalt");
  assert.match(row.preview, /cobalt migration/);
  assert.match(row.preview, /^…/);
  assert.match(row.preview, /…$/);
  assert.ok(Array.from(row.preview).length <= 182);
  assert.equal(findSavedAnswers([record], "Technical").length, 0);
});

test("Unicode matching and excerpt boundaries preserve complete characters", () => {
  const record = saved(
    "1",
    "🧪".repeat(175) + " CAFÉ résumé 測試 " + "🚀".repeat(200),
  );
  const [row] = findSavedAnswers([record], "café 測試");
  assert.ok(row);
  assert.match(row.preview, /CAFÉ résumé 測試/);
  assert.ok(row.preview.isWellFormed());
  assert.ok(Array.from(row.preview).length <= 182);
  assert.ok(findSavedAnswers([record], "🧪")[0].preview.isWellFormed());
});
