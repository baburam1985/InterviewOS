import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyProfile, evaluate } from '../../lib/interview.ts';
import { workspaceExport } from '../../lib/workspace-export.ts';

const now = new Date('2026-09-30T16:00:00.000Z');
const base = { profile: emptyProfile, profileHasUnsavedChanges: false, savedWorkspaceAvailable: true, stories: [], sessions: [], storyDraft: null, practiceDraft: null };

test('export preserves compatible saved fields and labels open drafts without changing source data', () => {
  const story = { id: 'story', title: 'Saved title', tag: 'Leadership', situation: 'A real problem', task: '', action: '', result: '' };
  const answer = 'During a project, I led testing and reduced failures by 20 percent.';
  const session = { id: 'answer', question: 'What changed?', category: 'Behavioral', answer, seconds: 0, createdAt: now.toISOString(), review: evaluate(answer, 0, 'Behavioral') };
  const state = { ...base, profile: { ...emptyProfile, resume: 'Exact notes\n😀' }, profileHasUnsavedChanges: true, stories: [story], sessions: [session], storyDraft: { ...story, title: 'An unfinished edit' }, practiceDraft: { question: 'A new question', category: 'Behavioral', answer: '  Exact unsaved answer\n', seconds: 0, review: null, ai: '', focus: '', saveState: 'unsaved' } };
  const before = structuredClone(state);
  const exported = JSON.parse(JSON.stringify(workspaceExport(state, now)));
  assert.deepEqual(exported.profile, state.profile);
  assert.deepEqual(exported.stories, [story]);
  assert.deepEqual(exported.sessions, [session]);
  assert.deepEqual(exported.drafts, { story: state.storyDraft, practice: state.practiceDraft });
  assert.equal(exported.exportInfo.exportedAt, now.toISOString());
  assert.equal(exported.exportInfo.version, 1);
  assert.equal(exported.exportInfo.profileHasUnsavedChanges, true);
  assert.deepEqual(state, before);
});

test('partial exports and unconfirmed saves never claim an available complete workspace', () => {
  const draft = { question: 'Practice', category: 'Technical', answer: 'A cache approach', seconds: 0, review: evaluate('A cache approach', 0, 'Technical'), ai: 'Synthetic optional coaching', focus: 'Clarify inputs', saveState: 'unconfirmed' };
  const exported = workspaceExport({ ...base, savedWorkspaceAvailable: false, practiceDraft: draft }, now);
  assert.equal(exported.exportInfo.savedWorkspaceAvailable, false);
  assert.match(exported.exportInfo.scope, /Unavailable server data is not included/);
  assert.match(exported.exportInfo.restore, /Automatic import is not supported/);
  assert.deepEqual(exported.drafts.practice, draft);
  assert.equal(exported.drafts.practice.saveState, 'unconfirmed');
  assert.deepEqual(exported.sessions, []);
});

test('no drafts are invented and an intentionally cleared profile stays distinguishable from a saved empty profile', () => {
  const saved = workspaceExport(base, now);
  assert.deepEqual(saved.drafts, { story: null, practice: null });
  assert.equal(saved.exportInfo.profileHasUnsavedChanges, false);
  const cleared = workspaceExport({ ...base, profileHasUnsavedChanges: true }, now);
  assert.deepEqual(cleared.profile, emptyProfile);
  assert.equal(cleared.exportInfo.profileHasUnsavedChanges, true);
});
