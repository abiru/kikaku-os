import { useState } from 'react';
import { apiFetch } from '../../api/client';

type SqlResponse = { ok: boolean; sql: string; notes?: string };
type QueryResponse = { ok: boolean; rows: Record<string, unknown>[]; truncated: boolean };

const AiQueryPage = () => {
  const [prompt, setPrompt] = useState('');
  const [sql, setSql] = useState('');
  const [notes, setNotes] = useState<string | undefined>();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSql = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SqlResponse>('/ai/sql', { method: 'POST', body: { prompt } });
      setSql(res.sql);
      setNotes(res.notes);
      setRows([]);
      setTruncated(false);
    } catch (err: any) {
      setError(err.message || 'failed');
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    if (!sql.trim()) {
      setError('SQL is empty');
      return;
    }
    setQuerying(true);
    setError(null);
    try {
      const res = await apiFetch<QueryResponse>('/ai/query', { method: 'POST', body: { sql, prompt } });
      setRows(res.rows || []);
      setTruncated(res.truncated);
    } catch (err: any) {
      setError(err.message || 'failed');
    } finally {
      setQuerying(false);
    }
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI SQL</h1>
        <p className="text-sm text-zinc-500">自然文からSELECTを生成して実行します（READ ONLY）</p>
      </div>

      <div className="card space-y-4">
        <label className="flex flex-col gap-2 text-sm">
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
            placeholder="例: 昨日の売上合計を見たい"
          />
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={generateSql} disabled={loading}>
            {loading ? '生成中...' : 'SQL生成'}
          </button>
          <button className="btn btn-ghost" onClick={runQuery} disabled={querying}>
            {querying ? '実行中...' : '実行'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-medium">SQL</div>
        {notes && <div className="text-sm text-zinc-500">{notes}</div>}
        <pre className="text-xs bg-zinc-50 border border-zinc-200 rounded-xl p-4 overflow-x-auto">
          {sql || '---'}
        </pre>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-medium">Results</div>
          {truncated && <span className="badge badge-warning">truncated</span>}
        </div>
        {rows.length === 0 ? (
          <div className="text-sm text-zinc-500">結果がありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-500">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="py-2 pr-4">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    {columns.map((col) => (
                      <td key={col} className="py-2 pr-4">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AiQueryPage;
