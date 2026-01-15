import { useEffect, useMemo, useState } from 'react';
import { apiFetch, proxyR2Url } from '../../api/client';

type SeedResponse = {
  ok: boolean;
  date: string;
  created: Record<string, number>;
};

type DocumentRow = { id: number; path: string; content_type: string | null };

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const SeedPage = () => {
  const [date, setDate] = useState(yesterday());
  const [orders, setOrders] = useState(5);
  const [payments, setPayments] = useState('');
  const [refunds, setRefunds] = useState(1);
  const [makeInbox, setMakeInbox] = useState(true);
  const [result, setResult] = useState<SeedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [artifactLoading, setArtifactLoading] = useState(false);

  useEffect(() => {
    setDocs([]);
  }, [date]);

  const payload = useMemo(() => {
    const base: Record<string, any> = { date, orders, refunds, makeInbox };
    if (payments !== '') base.payments = Number(payments);
    return base;
  }, [date, orders, refunds, makeInbox, payments]);

  const runSeed = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SeedResponse>('/dev/seed', { method: 'POST', body: payload });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'failed');
    } finally {
      setLoading(false);
    }
  };

  const createArtifacts = async () => {
    setArtifactLoading(true);
    setError(null);
    try {
      await apiFetch(`/daily-close/${date}/artifacts`, { method: 'POST' });
      const docsRes = await apiFetch<{ ok: boolean; documents: DocumentRow[] }>(
        `/daily-close/${date}/documents`
      );
      setDocs(docsRes.documents || []);
    } catch (err: any) {
      setError(err.message || 'failed');
    } finally {
      setArtifactLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dev Seed</h1>
        <p className="text-sm text-zinc-500">/dev/seed を実行してダミーデータを作成</p>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-sm">
            日付
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Orders
            <input
              type="number"
              min={0}
              value={orders}
              onChange={(e) => setOrders(Number(e.target.value))}
              className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Payments (optional)
            <input
              type="number"
              min={0}
              value={payments}
              onChange={(e) => setPayments(e.target.value)}
              placeholder="empty = default"
              className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            Refunds
            <input
              type="number"
              min={0}
              value={refunds}
              onChange={(e) => setRefunds(Number(e.target.value))}
              className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={makeInbox}
            onChange={(e) => setMakeInbox(e.target.checked)}
          />
          Inboxを作成
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={runSeed} disabled={loading}>
            {loading ? '実行中...' : 'Seed実行'}
          </button>
          <button className="btn btn-ghost" onClick={createArtifacts} disabled={artifactLoading}>
            {artifactLoading ? '作成中...' : 'この日付で証跡作成'}
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-medium">結果</div>
        <pre className="text-xs bg-zinc-50 border border-zinc-200 rounded-xl p-4 overflow-x-auto">
          {result ? JSON.stringify(result, null, 2) : '---'}
        </pre>
      </div>

      <div className="card space-y-3">
        <div className="text-lg font-medium">Documents</div>
        {docs.length === 0 && <div className="text-sm text-zinc-500">まだありません</div>}
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between border border-zinc-200 rounded-xl px-4 py-3">
              <div>
                <div className="font-medium">{doc.path}</div>
                <div className="text-xs text-zinc-500">{doc.content_type || 'unknown'}</div>
              </div>
              <a className="btn btn-primary" href={proxyR2Url(doc.path)} target="_blank" rel="noreferrer">
                開く
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SeedPage;
