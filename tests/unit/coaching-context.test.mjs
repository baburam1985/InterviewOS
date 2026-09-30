import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coachingRequest } from '../../lib/coaching-context.ts';
import { emptyProfile } from '../../lib/interview.ts';
const profile = { role:'Synthetic role', company:'Example', resume:'Private synthetic resume\n😀', job:'Private role requirements', hidden:'Never include this extra field' };
const stories = Array.from({length:6},(_,i) => ({id:`local-${i}`, tag:'Leadership', title:`Story ${i}`, situation:`Situation ${i}`, task:'My task', action:'My action', result:'My result', hidden:'Extra record data'}));

test('unselected context excludes personal fields and stories while retaining the practice request', () => {
  const data = coachingRequest('Question?', '  Exact answer\n', 'Technical', profile, stories, {profile:false,stories:false});
  assert.deepEqual(data, {question:'Question?',answer:'  Exact answer\n',category:'Technical',profile:emptyProfile,stories:[]});
  assert.notEqual(data.profile, emptyProfile);
  assert.doesNotMatch(JSON.stringify(data), /Private|local-|Story|Never include/);
});

test('profile and stories are independent choices with only disclosed fields and no mutation', () => {
  const before = structuredClone({profile,stories});
  const p = coachingRequest('Question?', '', 'Behavioral', profile, stories, {profile:true,stories:false});
  assert.deepEqual(p.profile, {role:profile.role,company:profile.company,resume:profile.resume,job:profile.job});
  assert.deepEqual(p.stories, []);
  const s = coachingRequest('Question?', '', 'Behavioral', profile, stories, {profile:false,stories:true});
  assert.deepEqual(s.profile, emptyProfile);
  assert.equal(s.stories.length, 5);
  assert.deepEqual(s.stories[0], {title:'Story 0',situation:'Situation 0',task:'My task',action:'My action',result:'My result'});
  assert.doesNotMatch(JSON.stringify(s), /local-|Leadership|Extra record data|Private/);
  assert.deepEqual({profile,stories}, before);
});

test('included stories preserve order, cap at five and leave an empty library empty', () => {
  const data = coachingRequest('Question?', 'Answer', 'Recruiter', profile, stories, {profile:true,stories:true});
  assert.deepEqual(data.stories.map(s=>s.title), ['Story 0','Story 1','Story 2','Story 3','Story 4']);
  assert.equal(data.profile.resume, profile.resume);
  assert.deepEqual(coachingRequest('Question?', '', 'Recruiter', emptyProfile, [], {profile:true,stories:true}).stories, []);
});
