import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerChangedOnRefresh, rememberAnswerAttempt } from '../../lib/answer-refresh.ts';
import { evaluate } from '../../lib/interview.ts';
const confirmed = { id: 'one', question: 'What changed?', category: 'Behavioral', answer: 'I led the project.', seconds: 0, createdAt: '2026-09-30T17:00:00.000Z', review: evaluate('I led the project.', 0, 'Behavioral') };

test('a changed persisted answer is detected without mutating either version', () => {
  for (const patch of [{answer:'An external revision'}, {question:'A different question'}, {category:'Technical'}, {seconds:30}, {ai:'Different coaching'}]) {
    const external = {...confirmed, ...patch};
    const before = structuredClone([confirmed,external]);
    assert.equal(answerChangedOnRefresh([external], 'one', confirmed, []), true);
    assert.deepEqual([confirmed, external], before);
  }
});

test('matching pending writes retain same-ID retries after a lost acknowledgement', () => {
  const attempted = {...confirmed, answer:'My edited answer'};
  const refreshed = {...attempted, review:evaluate(attempted.answer,0,attempted.category)};
  assert.equal(answerChangedOnRefresh([refreshed], 'one', confirmed, [attempted]), false);
  assert.equal(answerChangedOnRefresh([refreshed], 'one', null, [attempted]), false);
  assert.equal(answerChangedOnRefresh([confirmed], 'one', confirmed, [attempted]), false);
  assert.equal(answerChangedOnRefresh([{...confirmed,answer:'A third version'}], 'one', confirmed, [attempted]), true);
});

test('server-owned reviews and timestamps do not create a false content conflict', () => {
  assert.equal(answerChangedOnRefresh([{...confirmed, createdAt:'2026-09-30T18:00:00.000Z', review:{...confirmed.review,score:1}, question:'  What changed?  ', ai:''}], 'one', confirmed, []), false);
});

test('missing, untracked and unrelated records preserve ordinary retry identity', () => {
  assert.equal(answerChangedOnRefresh([], 'one', confirmed, []), false);
  assert.equal(answerChangedOnRefresh([{...confirmed, id:'two'}], 'one', confirmed, []), false);
  assert.equal(answerChangedOnRefresh([confirmed], '', confirmed, []), false);
  assert.equal(answerChangedOnRefresh([confirmed], 'one', null, []), false);
  assert.equal(answerChangedOnRefresh([confirmed], 'one', {...confirmed,id:'two'}, []), false);
});


test('multiple unconfirmed versions remain recognizable without duplicating repeated payloads', () => {
  const second = {...confirmed, answer:'My first unconfirmed edit'};
  const third = {...confirmed, answer:'My later edit'};
  let attempted = rememberAnswerAttempt([], second);
  attempted = rememberAnswerAttempt(attempted, third);
  const same = rememberAnswerAttempt(attempted, {...third, createdAt:'2026-09-30T19:00:00.000Z'});
  assert.equal(same, attempted);
  assert.equal(same.length, 2);
  assert.equal(answerChangedOnRefresh([second], 'one', confirmed, attempted), false);
  assert.equal(answerChangedOnRefresh([{...confirmed, answer:'Other-tab revision'}], 'one', confirmed, attempted), true);
});
