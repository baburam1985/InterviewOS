import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categories, evaluate } from '../../lib/interview.ts';
import { reviewCheckEvidence } from '../../lib/review-evidence.ts';

const check = (answer, category, label) => evaluate(answer, 0, category).checks.find(c => c.label === label);

test('keyword explanations use actual matched text and bounded Unicode-safe context', () => {
  const answer = '😀'.repeat(50) + ' I\n\tled the review. ' + '🎯'.repeat(80);
  const evidence = reviewCheckEvidence(answer, 'Behavioral', check(answer, 'Behavioral', 'Shows ownership'));
  assert.equal(evidence.kind, 'match');
  assert.equal(evidence.matched, 'I led');
  assert.equal(evidence.before, '…' + '😀'.repeat(44) + ' ');
  assert.equal(Array.from(evidence.after).length, 76);
  assert.ok(evidence.after.endsWith('…'));
  assert.ok(evidence.before.isWellFormed());
  assert.ok(evidence.after.isWellFormed());
  const short = 'During a project, I owned the plan.';
  const exact = reviewCheckEvidence(short, 'Behavioral', check(short, 'Behavioral', 'Shows ownership'));
  assert.deepEqual(exact, { kind: 'match', before: 'During a project, ', matched: 'I owned', after: ' the plan.' });
  assert.equal(exact.before + exact.matched + exact.after, short);
});

test('explanations match each category rubric without changing reviews or claiming semantic quality', () => {
  const answers = [
    '', 'Hello there.',
    'During a project, I led the team. First I tested the input because the result reduced failures for 20 users. Thank you for the opportunity. My priority is flexibility and I would discuss next steps. My background and experience motivate me to contribute to this company. My approach uses a hash map with time complexity, edge cases and a cache.',
  ];
  for (const category of categories) for (const answer of answers) {
    const review = evaluate(answer, 0, category);
    const snapshot = structuredClone(review);
    for (const c of review.checks) {
      const evidence = reviewCheckEvidence(answer, category, c);
      assert.equal(evidence.kind, c.label === 'Keeps a useful length' ? 'length' : c.pass ? 'match' : 'unmatched');
      if (evidence.kind === 'match') assert.ok(answer.replace(/\s+/g, ' ').includes(evidence.matched));
    }
    assert.deepEqual(review, snapshot);
  }
  // Make a partial-word false positive inspectable instead of claiming meaning.
  const answer = 'I sometimes pause.';
  assert.equal(reviewCheckEvidence(answer, 'Technical', check(answer, 'Technical', 'Discusses trade-offs')).matched, 'time');
});

test('word-count evidence explains the actual boundaries without a fabricated keyword', () => {
  for (const words of [0, 59, 60, 300, 301]) {
    const answer = 'word '.repeat(words);
    const c = check(answer, 'Behavioral', 'Keeps a useful length');
    assert.deepEqual(reviewCheckEvidence(answer, 'Behavioral', c), { kind: 'length', words });
    assert.equal(c.pass, words >= 60 && words <= 300);
  }
});

test('unknown or inconsistent saved checks do not invent a current-rule explanation', () => {
  const answer = 'During a project, I owned the plan.';
  for (const label of ['Future rule', '__proto__', 'constructor', 'Clarifies requirements']) {
    assert.deepEqual(reviewCheckEvidence(answer, 'Behavioral', { label, pass: true, advice: '' }), { kind: 'unavailable' });
  }
  const c = check(answer, 'Behavioral', 'Shows ownership');
  assert.deepEqual(reviewCheckEvidence(answer, 'Behavioral', { ...c, pass: false }), { kind: 'unavailable' });
  const missing = check('Hello.', 'Behavioral', 'Shows ownership');
  assert.deepEqual(reviewCheckEvidence('Hello.', 'Behavioral', { ...missing, pass: true }), { kind: 'unavailable' });
  assert.deepEqual(reviewCheckEvidence('Hello.', 'Behavioral', { label: 'Keeps a useful length', pass: true, advice: '' }), { kind: 'unavailable' });
});
