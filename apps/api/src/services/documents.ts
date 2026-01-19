import { Env } from '../env';

export const listDocuments = async (env: Env['Bindings'], refType: string, refId: string) => {
  const res = await env.DB.prepare(
    `SELECT id, path, content_type FROM documents WHERE ref_type=? AND ref_id=? ORDER BY created_at DESC`
  ).bind(refType, refId).all<{ id: number; path: string; content_type: string | null }>();
  return res.results || [];
};

export const upsertDocument = async (
  env: Env['Bindings'],
  refType: string,
  refId: string,
  path: string,
  contentType: string
) => {
  // Atomic upsert using ON CONFLICT (requires unique index on ref_type, ref_id, path)
  await env.DB.prepare(`
    INSERT INTO documents (ref_type, ref_id, path, content_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(ref_type, ref_id, path) DO UPDATE SET
      content_type = excluded.content_type,
      updated_at = datetime('now')
  `).bind(refType, refId, path, contentType).run();
};
