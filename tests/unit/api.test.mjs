import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {afterEach, beforeEach, test} from 'node:test';
import * as workspace from '../../app/api/workspace/route.ts';
import * as coach from '../../app/api/coach/route.ts';
import {evaluate} from '../../lib/interview.ts';
import {readJsonBody, RequestError} from '../../lib/api-http.ts';
import {auth, env} from './mocks.mjs';

const origin = 'https://interviewos.test';
const id = 'e81fb7a1-0fd2-4cdd-9f96-5bdbb858873c';
const secondId = '69ba0a83-b2d6-457e-8b63-46fdfcc9d86d';
const profile = {role: 'Engineer', company: 'Example', resume: 'Experience', job: 'Build useful tools'};
const story = {id, title: 'A useful project', tag: 'Leadership', situation: 'My team had a project.', task: 'I owned delivery.', action: 'I tested it first.', result: 'We reduced errors by 20 percent.'};
const session = {id: secondId, question: 'Tell me about a project.', answer: 'When my team had a project, I led the work. First I tested an approach because it would reduce errors. As a result we saved 20 hours.', category: 'Behavioral', seconds: 60, createdAt: '2026-09-30T00:00:00.000Z'};
const coaching = {question: session.question, answer: session.answer, category: session.category, profile, stories: [story]};
let db;
let originalFetch;
let providerCalls;

function request(path, body, {method = 'POST', headers = {}, raw = false, signal} = {}) {
  return new Request(origin + path, {
    method,
    headers: {'Content-Type': 'application/json', Origin: origin, ...headers},
    ...(body === undefined ? {} : {body: raw ? body : JSON.stringify(body)}),
    ...(signal ? {signal} : {}),
  });
}

function d1(database) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() { return {success: true, results: database.prepare(sql).all(...values)}; },
            async run() {
              const result = database.prepare(sql).run(...values);
              return {success: true, meta: {changes: Number(result.changes)}};
            },
          };
        },
      };
    },
  };
}

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  db.exec(await readFile(new URL('../../drizzle/0000_plain_vampiro.sql', import.meta.url), 'utf8'));
  for (const key of Object.keys(env)) delete env[key];
  env.DB = d1(db);
  auth.user = {userId: 'user-a', email: 'a@example.test', displayName: 'A', fullName: null};
  originalFetch = globalThis.fetch;
  providerCalls = [];
  globalThis.fetch = async (...args) => {
    providerCalls.push(args);
    throw new Error('Unexpected provider call; network is disabled in unit tests');
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

test('workspace authentication protects reads, writes and deletes', async () => {
  auth.user = null;
  for (const response of [
    await workspace.GET(),
    await workspace.POST(request('/api/workspace', {kind: 'profile', data: profile})),
    await workspace.DELETE(request('/api/workspace?id=' + id, undefined, {method: 'DELETE'})),
  ]) {
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0);
});

test('malformed JSON is a client error in both APIs, even without an AI key', async () => {
  for (const handler of [workspace.POST, coach.POST]) {
    for (const body of ['{', '', 'not json']) {
      assert.equal((await handler(request('/api/test', body, {raw: true}))).status, 400);
    }
    assert.equal((await handler(request('/api/test', undefined))).status, 400);
  }
  assert.equal(providerCalls.length, 0);
});

test('workspace rejects invalid fields, categories, whitespace-only values and times', async () => {
  const invalid = [
    null,
    {},
    {kind: 'other', data: {}},
    {kind: 'story', data: {...story, title: ' \n\t '}},
    {kind: 'story', data: {...story, tag: 'unknown'}},
    {kind: 'story', data: {...story, id: 'arbitrary-id'}},
    {kind: 'session', data: {...session, answer: ' \n\t '}},
    {kind: 'session', data: {...session, question: '  '}},
    {kind: 'session', data: {...session, category: 'unknown'}},
    {kind: 'session', data: {...session, seconds: -1}},
    {kind: 'session', data: {...session, seconds: 86401}},
    {kind: 'session', data: {...session, createdAt: 'not a date'}},
    {kind: 'profile', data: {...profile, role: 'x'.repeat(151)}},
  ];
  for (const body of invalid) {
    const response = await workspace.POST(request('/api/workspace', body));
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0);
});

test('body limits count UTF-8 bytes and reject oversized declared bodies', async () => {
  assert.equal((await workspace.POST(request('/api/workspace', '🌍'.repeat(100_001), {raw: true}))).status, 413);
  assert.equal((await coach.POST(request('/api/coach', 'x'.repeat(1_300_001), {raw: true}))).status, 413);
  assert.equal((await workspace.POST(request('/api/workspace', '{}', {raw: true, headers: {'Content-Length': '400001'}}))).status, 413);
  assert.equal(providerCalls.length, 0);
});

test('schema-limit multilingual and fully Unicode-escaped profiles remain saveable', async () => {
  const maxProfile = {role: '界'.repeat(150), company: '界'.repeat(150), resume: '界'.repeat(30_000), job: '界'.repeat(30_000)};
  const body = {kind: 'profile', data: maxProfile};
  for (const raw of [JSON.stringify(body), JSON.stringify(body).replaceAll('界', '\\u754c')]) {
    assert.ok(Buffer.byteLength(raw) > 100_000);
    assert.ok(Buffer.byteLength(raw) < 400_000);
    const response = await workspace.POST(request('/api/workspace', raw, {raw: true}));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, maxProfile);
  }
});

test('coaching accepts every maximum-length context field with worst-case JSON escaping', async () => {
  env.OPENAI_API_KEY = 'fake-unit-test-key';
  const text = length => '界'.repeat(length);
  const maxStory = {title: text(200), situation: text(6_000), task: text(6_000), action: text(6_000), result: text(6_000)};
  const body = {
    question: text(3_000), answer: text(30_000), category: 'Technical',
    profile: {role: text(150), company: text(150), resume: text(30_000), job: text(30_000)},
    stories: Array.from({length: 5}, () => ({...maxStory})),
  };
  const raw = JSON.stringify(body).replaceAll('界', '\\u754c');
  assert.ok(Buffer.byteLength(raw) > 1_280_000);
  assert.ok(Buffer.byteLength(raw) < 1_300_000);
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(JSON.parse(init.body).input), body);
    return Response.json({status: 'completed', output: [{content: [{type: 'output_text', text: 'Verified synthetic context.'}]}]});
  };
  const response = await coach.POST(request('/api/coach', raw, {raw: true}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {text: 'Verified synthetic context.'});
});

test('bounded reader supports streamed Unicode and rejects bad UTF-8', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({text: '🌍'}));
  const stream = new ReadableStream({start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  }});
  const streamed = new Request(origin, {method: 'POST', body: stream, duplex: 'half'});
  assert.deepEqual(await readJsonBody(streamed, bytes.length), {text: '🌍'});
  const invalid = new Request(origin, {method: 'POST', body: new Uint8Array([0xff])});
  await assert.rejects(readJsonBody(invalid, 10), error => error instanceof RequestError && error.status === 400);
});

test('cross-origin and cross-site writes fail before storage or provider calls', async () => {
  for (const headers of [{Origin: 'https://attacker.test'}, {Origin: 'null'}, {'Sec-Fetch-Site': 'cross-site'}]) {
    assert.equal((await workspace.POST(request('/api/workspace', {kind: 'story', data: story}, {headers}))).status, 403);
    assert.equal((await workspace.DELETE(request('/api/workspace?id=' + id, undefined, {method: 'DELETE', headers}))).status, 403);
    assert.equal((await coach.POST(request('/api/coach', coaching, {headers}))).status, 403);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 0);
  assert.equal(providerCalls.length, 0);
});

test('profile upsert trims labels and keeps a single record', async () => {
  const first = await workspace.POST(request('/api/workspace', {kind: 'profile', data: {...profile, role: ' Engineer ', userId: 'user-b'}}));
  assert.equal(first.status, 200);
  const saved = (await first.json()).data;
  assert.equal(saved.role, 'Engineer');
  assert.equal(saved.userId, undefined);
  assert.equal((await workspace.POST(request('/api/workspace', {kind: 'profile', data: {...profile, company: 'Updated'}}))).status, 200);
  const loaded = await workspace.GET();
  assert.equal(loaded.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await loaded.json()).records, [{kind: 'profile', data: {...profile, company: 'Updated'}}]);
});

test('session reviews are generated on the server, not trusted from clients', async () => {
  const answer = '  const value = 1;\n    return value;\n';
  const data = {...session, answer, category: 'Technical', review: {score: 999}};
  const response = await workspace.POST(request('/api/workspace', {kind: 'session', data}));
  assert.equal(response.status, 200);
  const saved = (await response.json()).data;
  assert.equal(saved.answer, answer);
  assert.deepEqual(saved.review, evaluate(answer, session.seconds, 'Technical'));
  assert.deepEqual((await (await workspace.GET()).json()).records[0].data, saved);
});

test('same-kind upserts work and cross-kind UUID collisions cannot corrupt data', async () => {
  assert.equal((await workspace.POST(request('/api/workspace', {kind: 'story', data: story}))).status, 200);
  assert.equal((await workspace.POST(request('/api/workspace', {kind: 'story', data: {...story, title: 'Updated'}}))).status, 200);
  assert.equal((await workspace.POST(request('/api/workspace', {kind: 'session', data: {...session, id}}))).status, 409);
  const records = (await (await workspace.GET()).json()).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'story');
  assert.equal(records[0].data.title, 'Updated');
});

test('tenant isolation applies to reads, profile and UUID upserts, and deletes', async () => {
  await workspace.POST(request('/api/workspace', {kind: 'profile', data: profile}));
  await workspace.POST(request('/api/workspace', {kind: 'story', data: story}));
  auth.user.userId = 'user-b';
  assert.deepEqual((await (await workspace.GET()).json()).records, []);
  await workspace.DELETE(request('/api/workspace?id=' + id, undefined, {method: 'DELETE'}));
  await workspace.POST(request('/api/workspace', {kind: 'profile', data: {...profile, role: 'Private B'}}));
  await workspace.POST(request('/api/workspace', {kind: 'session', data: {...session, id}}));
  assert.equal((await (await workspace.GET()).json()).records.length, 2);
  auth.user.userId = 'user-a';
  let records = (await (await workspace.GET()).json()).records;
  assert.equal(records.find(record => record.kind === 'profile').data.role, 'Engineer');
  assert.equal(records.find(record => record.kind === 'story').data.title, story.title);
  await workspace.DELETE(request('/api/workspace?id=' + id + '&kind=story', undefined, {method: 'DELETE'}));
  auth.user.userId = 'user-b';
  records = (await (await workspace.GET()).json()).records;
  assert.equal(records.find(record => record.kind === 'session').data.id, id);
  assert.equal(records.find(record => record.kind === 'profile').data.role, 'Private B');
});

test('DELETE validates identifiers and supports an optional kind guard', async () => {
  for (const suffix of ['', '?id=bad', '?id=profile&kind=story', '?id=' + id + '&kind=other', '?id=' + id + '&kind=profile']) {
    assert.equal((await workspace.DELETE(request('/api/workspace' + suffix, undefined, {method: 'DELETE'}))).status, 400);
  }
  await workspace.POST(request('/api/workspace', {kind: 'story', data: story}));
  assert.equal((await workspace.DELETE(request('/api/workspace?id=' + id + '&kind=session', undefined, {method: 'DELETE'}))).status, 200);
  assert.equal((await (await workspace.GET()).json()).records.length, 1);
  assert.equal((await workspace.DELETE(request('/api/workspace?id=' + id + '&kind=story', undefined, {method: 'DELETE'}))).status, 200);
  assert.deepEqual((await (await workspace.GET()).json()).records, []);
});

test('a damaged saved item does not hide valid records or delete anything', async () => {
  await workspace.POST(request('/api/workspace', {kind: 'profile', data: profile}));
  db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run('user-a', id, 'story', '{broken', '2026-09-29T00:00:00Z');
  db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run('user-a', secondId, 'session', JSON.stringify({answer: 'incomplete'}), '2026-09-29T00:00:00Z');
  const response = await workspace.GET();
  assert.equal(response.status, 200);
  const loaded = await response.json();
  assert.equal(loaded.records.length, 1);
  assert.match(loaded.warning, /Some saved items/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM records').get().count, 3);
});

test('missing storage gives actionable 503 errors without leaking internals', async () => {
  delete env.DB;
  for (const response of [
    await workspace.GET(),
    await workspace.POST(request('/api/workspace', {kind: 'profile', data: profile})),
    await workspace.DELETE(request('/api/workspace?id=' + id, undefined, {method: 'DELETE'})),
  ]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(await response.json()), /Storage unavailable|SELECT|INSERT|DELETE/);
  }
});

test('AI availability is uncached and whitespace credentials are treated as absent', async () => {
  let response = await coach.GET();
  assert.deepEqual(await response.json(), {available: false});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  env.OPENAI_API_KEY = '   ';
  assert.deepEqual(await (await coach.GET()).json(), {available: false});
  env.OPENAI_API_KEY = 'fake-unit-test-key';
  assert.deepEqual(await (await coach.GET()).json(), {available: true});
});

test('AI requires sign-in and valid input before provider access', async () => {
  auth.user = null;
  assert.equal((await coach.POST(request('/api/coach', coaching))).status, 401);
  auth.user = {userId: 'user-a'};
  for (const data of [null, {...coaching, question: ' \n '}, {...coaching, category: 'unknown'}, {...coaching, stories: Array(6).fill(story)}]) {
    assert.equal((await coach.POST(request('/api/coach', data))).status, 400);
  }
  assert.equal((await coach.POST(request('/api/coach', coaching))).status, 503);
  assert.equal(providerCalls.length, 0);
});

test('AI sends only validated context, disables response storage and supports an empty answer outline', async () => {
  env.OPENAI_API_KEY = 'fake-unit-test-key';
  env.OPENAI_MODEL = 'test-model';
  let sent;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    sent = init;
    return Response.json({status: 'completed', output: [
      {content: [{type: 'output_text', text: 'What works: clear context.'}, {type: 'refusal', text: 'ignored'}]},
      {content: [{type: 'output_text', text: 'Follow-up: what changed?'}]},
    ]});
  };
  const response = await coach.POST(request('/api/coach', {...coaching, answer: '', irrelevant: 'do not forward'}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {text: 'What works: clear context.\nFollow-up: what changed?'});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = JSON.parse(sent.body);
  assert.equal(payload.model, 'test-model');
  assert.equal(payload.store, false);
  assert.equal(payload.max_output_tokens, 1200);
  assert.equal(JSON.parse(payload.input).answer, '');
  assert.equal(JSON.parse(payload.input).irrelevant, undefined);
  assert.equal(JSON.parse(payload.input).stories[0].id, undefined);
  assert.ok(sent.signal instanceof AbortSignal);
});

test('AI provider failures, malformed and incomplete results remain recoverable 502 errors', async () => {
  env.OPENAI_API_KEY = 'fake-unit-test-key';
  const failures = [
    () => new Response('provider billing details', {status: 429}),
    () => new Response('{broken', {headers: {'Content-Type': 'application/json'}}),
    () => Response.json({output: {unexpected: true}}),
    () => Response.json({output: []}),
    () => Response.json({output: [{content: [{type: 'output_text', text: '   '}]}]}),
    () => Response.json({status: 'incomplete', output: [{content: [{type: 'output_text', text: 'Partial'}]}]}),
    () => { throw new DOMException('Aborted', 'TimeoutError'); },
  ];
  for (const failure of failures) {
    globalThis.fetch = async () => failure();
    const response = await coach.POST(request('/api/coach', coaching));
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(await response.json()), /provider billing details|fake-unit-test-key/);
  }
});

test('cancelling a coaching request also aborts the upstream provider request', async () => {
  env.OPENAI_API_KEY = 'fake-unit-test-key';
  const controller = new AbortController();
  let providerSignal;
  globalThis.fetch = async (_url, init) => {
    providerSignal = init.signal;
    controller.abort();
    throw new DOMException('Cancelled', 'AbortError');
  };
  assert.equal((await coach.POST(request('/api/coach', coaching, {signal: controller.signal}))).status, 502);
  assert.equal(providerSignal.aborted, true);
});


test("saved and reloaded all-pass feedback does not require a missing profile", async () => {
  const answer =
    "During a project our team faced unclear requirements. I owned the release testing strategy and needed to improve quality. First I analyzed the highest risk flows because we had limited time. Then I implemented a focused test plan, reviewed it with the team, and prioritized the most important scenarios. As a result, we reduced escaped defects by 35 percent over six weeks. I learned to align stakeholders early.";
  const response = await workspace.POST(
    request("/api/workspace", {
      kind: "session",
      data: { ...session, answer },
    }),
  );
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.data.review.score, 100);
  assert.match(saved.data.review.next, /own decisions.*outcome/);
  assert.doesNotMatch(saved.data.review.next, /target role|resume/i);
  const loaded = await (await workspace.GET()).json();
  assert.equal(loaded.records.length, 1);
  assert.equal(loaded.records[0].kind, "session");
  assert.equal(loaded.records[0].data.review.next, saved.data.review.next);
});
