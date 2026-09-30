import assert from 'node:assert/strict';
import {test} from 'node:test';
import {categories, emptyProfile, evaluate, guidance, questions} from '../../lib/interview.ts';

const detail = ' I can explain the decision and the supporting context clearly.'.repeat(5);

test('every interview category can run five unique mock questions without repeating', () => {
  assert.equal(categories.length, 7);
  assert.equal(new Set(questions.map(question => question.text)).size, questions.length);
  for (const category of categories) {
    const bank = questions.filter(question => question.category === category);
    assert.ok(bank.length >= 5, category + ' needs five distinct questions');
    assert.equal(new Set(bank.slice(0, 5).map(question => question.text)).size, 5);
    assert.ok(bank.every(question => question.text.trim().length > 0));
  }
  assert.ok(questions.every(question => categories.includes(question.category)));
});

test('empty answers have no invented score, words or pace in every category', () => {
  for (const category of categories) {
    const review = evaluate(' \n\t ', 0, category);
    assert.equal(review.score, 0);
    assert.equal(review.words, 0);
    assert.equal(review.fillers, 0);
    assert.equal(review.pace, null);
    assert.equal(review.checks.length, 6);
    assert.equal(review.next, review.checks[0].advice);
  }
});

test('behavioral review checks ownership, actions, outcome and concrete detail', () => {
  const answer = 'When my team started the project, I led the work. First I tested a plan because it reduced risk. The result saved 20 hours.' + detail;
  const review = evaluate(answer, 60, 'Behavioral');
  assert.equal(review.score, 100);
  assert.ok(review.checks.every(check => check.pass));
  assert.equal(review.pace, review.words);
  assert.match(review.next, /Rehearse once more/);
});

test('technical and system-design review emphasize correctness reasoning and failure cases', () => {
  const answer = 'I clarify the input constraints and scale, compare a hash map approach and database service, explain time complexity and latency trade-offs, then test empty input and failure retries for 20 users.' + detail;
  for (const category of ['Technical', 'System design']) {
    const review = evaluate(answer, 0, category);
    assert.equal(review.score, 100);
    assert.deepEqual(review.checks.slice(0, 4).map(check => check.label), [
      'Clarifies requirements', 'Explains approach', 'Discusses trade-offs', 'Covers edge cases',
    ]);
    assert.equal(review.pace, null);
  }
});

test('negotiation gets collaborative requests and next-step feedback rather than STAR', () => {
  const answer = 'Thank you for the opportunity. My priority is flexibility because of the role responsibilities. Could we discuss a target of 20 additional days and confirm the next step by Friday?' + detail;
  const review = evaluate(answer, 0, 'Negotiation');
  assert.equal(review.score, 100);
  assert.deepEqual(review.checks.slice(0, 4).map(check => check.label), [
    'Keeps a collaborative tone', 'Explains priorities', 'Makes a clear request', 'Agrees on next steps',
  ]);
  assert.equal(guidance('Negotiation', emptyProfile, [], 'Discuss an offer').labels, 'ASKS');
});

test('recruiter review checks relevant experience, motivation and role fit', () => {
  const answer = 'My background includes 3 years of engineering experience. I am interested because this team builds useful products. For example, I built a project that improved the customer workflow.' + detail;
  const review = evaluate(answer, 0, 'Recruiter');
  assert.equal(review.score, 100);
  assert.deepEqual(review.checks.slice(0, 4).map(check => check.label), [
    'Gives relevant context', 'Explains motivation', 'Connects to the opportunity', 'Uses a specific example',
  ]);
  assert.equal(guidance('Recruiter', emptyProfile, [], 'Tell me about yourself').labels, 'FITS');
});

test('delivery metrics count fillers and only expose measured pace after ten seconds', () => {
  const answer = 'Um, actually, you know, this is kind of really useful.';
  const review = evaluate(answer, 9.99, 'Behavioral');
  assert.equal(review.fillers, 4);
  assert.equal(review.words, 10);
  assert.equal(review.pace, null);
  assert.equal(evaluate(answer, 10, 'Behavioral').pace, 60);
  assert.equal(evaluate(answer, 30, 'Behavioral').pace, 20);
});

test('guidance selects relevant real stories and matches each four-step framework', () => {
  const stories = [
    {id: '1', title: 'Launch', tag: 'Leadership', action: 'Coordinated stakeholders'},
    {id: '2', title: 'Database migration', tag: 'Technical', action: 'Reduced database latency'},
  ];
  const profile = {...emptyProfile, role: 'Engineer', company: 'Example'};
  const relevant = guidance('Technical', profile, stories, 'Discuss a database migration');
  assert.equal(relevant.story.id, '2');
  assert.equal(relevant.context, 'Connect your example to Engineer at Example.');
  assert.equal(guidance('Behavioral', emptyProfile, stories, 'Discuss mentoring').story, undefined);
  for (const category of categories) {
    const result = guidance(category, emptyProfile, [], 'Practice');
    assert.equal(result.steps.length, 4);
    assert.equal(result.labels.length, result.steps.length);
    assert.ok(result.steps.every(step => step.length > 0));
  }
});
