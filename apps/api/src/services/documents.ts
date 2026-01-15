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
  await env.DB.prepare(`DELETE FROM documents WHERE ref_type=? AND ref_id=? AND path=?`).bind(refType, refId, path).run();
  await env.DB.prepare(
    `INSERT INTO documents (ref_type, ref_id, path, content_type) VALUES (?, ?, ?, ?)`
  ).bind(refType, refId, path, contentType).run();
};
