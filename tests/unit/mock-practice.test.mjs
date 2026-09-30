import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginMockRun,
  captureMockAnswer,
  advanceMockRun,
  endMockRun,
  recordMockSave,
  describeMockRun,
} from "../../lib/mock-practice.ts";
import { evaluate } from "../../lib/interview.ts";

const questions = Array.from({ length: 5 }, (_, i) => ({
  text: `Synthetic question ${i + 1}`,
  category: "Behavioral",
}));
const session = (index, answer = "I helped a team.") => ({
  id: `session-${index}`,
  question: questions[index].text,
  category: "Behavioral",
  answer,
  seconds: 0,
  createdAt: "2026-09-30T07:00:00Z",
  review: evaluate(answer, 0, "Behavioral"),
});

test("recap distinguishes explicit skips, unsaved answers, unanswered and untouched rounds", () => {
  let run = beginMockRun(questions);
  run = advanceMockRun(captureMockAnswer(run, "", ""));
  run = advanceMockRun(
    captureMockAnswer(run, "A draft left without saving", ""),
  );
  run = endMockRun(captureMockAnswer(run, "", ""), false);
  const recap = describeMockRun(run, []);
  assert.deepEqual(
    recap.rounds.map((round) => round.status),
    ["Skipped", "Not saved", "Not answered", "Not reached", "Not reached"],
  );
  assert.equal(run.completed, false);
  assert.equal(recap.savedCount, 0);
  assert.equal(recap.priority, undefined);
});

test("repeated saves count once per round and later unsaved changes keep the saved version", () => {
  const first = session(0);
  let run = recordMockSave(beginMockRun(questions), first);
  run = recordMockSave(run, { ...first, answer: "Updated saved text" });
  run = advanceMockRun(captureMockAnswer(run, "A newer unsaved edit", ""));
  run = endMockRun(captureMockAnswer(run, "", ""), false);
  const recap = describeMockRun(run, [first]);
  assert.equal(recap.savedCount, 1);
  assert.equal(recap.rounds[0].status, "Saved");
  assert.equal(recap.rounds[0].unsavedChanges, true);
  assert.equal(recap.priority.id, first.id);
  assert.equal(
    describeMockRun(run, []).rounds[0].status,
    "Saved answer unavailable",
  );
  assert.equal(describeMockRun(run, []).savedCount, 0);
  assert.equal(
    describeMockRun(run, [{ ...first, question: "A replaced question" }])
      .savedCount,
    0,
  );
});

test("five completed rounds preserve their own saved IDs and grounded suggestion", () => {
  const sessions = questions.map((_, i) => session(i));
  let run = beginMockRun(questions);
  for (let index = 0; index < 5; index++) {
    run = recordMockSave(run, sessions[index]);
    run = captureMockAnswer(run, sessions[index].answer, sessions[index].id);
    run = index < 4 ? advanceMockRun(run) : endMockRun(run, true);
  }
  const recap = describeMockRun(run, sessions);
  assert.equal(run.completed, true);
  assert.equal(recap.savedCount, 5);
  assert.deepEqual(
    recap.rounds.map((round) => round.session.id),
    sessions.map((item) => item.id),
  );
  assert.equal(recap.priority.review.next, sessions[0].review.next);
  assert.equal(
    recap.rounds.some((round) => round.unsavedChanges),
    false,
  );
});

test("retained answer can save after ending but a replaced answer cannot join the mock", () => {
  const saved = session(0);
  const original = beginMockRun(questions);
  let run = endMockRun(captureMockAnswer(original, saved.answer, ""), false);
  run = recordMockSave(run, saved);
  assert.equal(describeMockRun(run, [saved]).savedCount, 1);
  const closed = endMockRun(
    captureMockAnswer(run, saved.answer, saved.id),
    false,
    false,
  );
  assert.equal(recordMockSave(closed, { ...saved, id: "fresh-retry" }), closed);
  assert.equal(
    captureMockAnswer(closed, "A different question's answer", ""),
    closed,
  );
  assert.equal(
    original.rounds[0].answered,
    false,
    "snapshots must not mutate prior state",
  );
});

test("finishing with an empty last round marks it skipped without inventing a saved answer", () => {
  let run = beginMockRun(questions);
  for (let index = 0; index < 4; index++)
    run = advanceMockRun(captureMockAnswer(run, "", ""));
  run = endMockRun(captureMockAnswer(run, "", ""), true);
  assert.deepEqual(
    describeMockRun(run, []).rounds.map((round) => round.status),
    Array(5).fill("Skipped"),
  );
  assert.equal(run.completed, true);
});
