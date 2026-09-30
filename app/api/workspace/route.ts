import {getChatGPTUser} from '../../chatgpt-auth';
import {database} from '../../../lib/storage';
import {evaluate} from '../../../lib/interview';
import type {Profile, Session, Story} from '../../../lib/interview';
import {jsonResponse, readJsonBody, RequestError, validOrigin} from '../../../lib/api-http';
import {recordIdSchema, recordKindSchema, workspaceBodySchema} from '../../../lib/api-validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return jsonResponse({error: 'Sign in to save and load your workspace.'}, 401);

  try {
    const result = await database()
      .prepare('SELECT kind, data FROM records WHERE user_id = ? ORDER BY created_at DESC')
      .bind(user.userId)
      .all<{kind: string; data: string}>();
    if (!result.success) throw new Error('Storage read failed');

    // A damaged record must not prevent the rest of the workspace from loading.
    let skipped = 0;
    const records: ({kind: 'profile'; data: Profile} | {kind: 'story'; data: Story} | {kind: 'session'; data: Session})[] = [];
    for (const record of result.results) {
      try {
        const parsed = workspaceBodySchema.safeParse({kind: record.kind, data: JSON.parse(record.data)});
        if (!parsed.success) throw new Error('Invalid saved record');
        const value = parsed.data;
        if (value.kind === 'session') {
          records.push({...value, data: {...value.data, review: evaluate(value.data.answer, value.data.seconds, value.data.category)}});
        } else {
          records.push(value);
        }
      } catch {
        skipped += 1;
      }
    }

    return jsonResponse({
      records,
      ...(skipped ? {warning: 'Some saved items could not be loaded. Your other items are available; no data was deleted.'} : {}),
    });
  } catch {
    return jsonResponse({error: 'Your workspace could not be loaded. Please retry.'}, 503);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonResponse({error: 'Sign in to save your workspace.'}, 401);
  if (!validOrigin(request)) return jsonResponse({error: 'Invalid origin.'}, 403);

  try {
    // Accommodate every valid field even when Unicode is JSON-escaped (six bytes per UTF-16 unit).
    const raw = await readJsonBody(request, 400_000);
    const parsed = workspaceBodySchema.safeParse(raw);
    if (!parsed.success) return jsonResponse({error: 'Check your fields and try again.'}, 400);

    const value = parsed.data;
    const data = value.kind === 'session'
      ? {...value.data, review: evaluate(value.data.answer, value.data.seconds, value.data.category)}
      : value.data;
    const id = value.kind === 'profile' ? 'profile' : value.data.id;
    const result = await database()
      .prepare(`INSERT INTO records (user_id,id,kind,data,created_at) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data
        WHERE records.kind=excluded.kind`)
      .bind(user.userId, id, value.kind, JSON.stringify(data), new Date().toISOString())
      .run();
    if (!result.success) throw new Error('Storage write failed');
    // The kind guard is atomic: simultaneous saves cannot replace a story with a session.
    if (result.meta.changes === 0) {
      return jsonResponse({error: 'This ID is already used by a different kind of item. Create a new item and retry.'}, 409);
    }
    return jsonResponse({data});
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse({error: error.message}, error.status);
    return jsonResponse({error: 'Could not save. Your input is still here; please retry.'}, 503);
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return jsonResponse({error: 'Sign in first.'}, 401);
  if (!validOrigin(request)) return jsonResponse({error: 'Invalid origin.'}, 403);

  const params = new URL(request.url).searchParams;
  const id = recordIdSchema.safeParse(params.get('id'));
  const kind = params.has('kind') ? recordKindSchema.safeParse(params.get('kind')) : undefined;
  if (!id.success || (kind && !kind.success)) return jsonResponse({error: 'Invalid record.'}, 400);
  if (kind?.success && (kind.data === 'profile') !== (id.data === 'profile')) {
    return jsonResponse({error: 'Invalid record.'}, 400);
  }

  try {
    // Keep the original id-only API working; new clients can additionally guard the kind.
    const statement = kind?.success
      ? database().prepare('DELETE FROM records WHERE user_id=? AND id=? AND kind=?').bind(user.userId, id.data, kind.data)
      : database().prepare('DELETE FROM records WHERE user_id=? AND id=?').bind(user.userId, id.data);
    const result = await statement.run();
    if (!result.success) throw new Error('Storage delete failed');
    return jsonResponse({ok: true});
  } catch {
    return jsonResponse({error: 'Could not delete. Please retry.'}, 503);
  }
}
