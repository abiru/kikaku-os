import { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFetchBlob } from '../../api/client';

type DailyReport = {
  date: string;
  orders: { count: number; totalNet: number; totalFee: number };
  payments: { count: number; totalAmount: number; totalFee: number };
  refunds: { count: number; totalAmount: number };
  anomalies: { level: 'ok' | 'warning' | 'critical'; diff: number; message: string };
};

type DocumentRow = { id: number; path: string; content_type: string | null };

const formatJPY = (value: number) => value.toLocaleString('ja-JP');

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const DailyClosePage = () => {
  const [date, setDate] = useState<string>(yesterday());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ ok: boolean; report: DailyReport }>(`/reports/daily?date=${d}`);
      setReport(data.report);
    } catch (err: any) {
      setError(err.message || 'failed');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async (d: string) => {
    const data = await apiFetch<{ ok: boolean; documents: DocumentRow[] }>(`/daily-close/${d}/documents`);
    setDocs(data.documents || []);
  };

  useEffect(() => {
    fetchReport(date);
    fetchDocuments(date);
  }, [date]);

  const createArtifacts = async () => {
    setCreating(true);
    try {
      await apiFetch(`/daily-close/${date}/artifacts`, { method: 'POST' });
      await fetchDocuments(date);
      await fetchReport(date);
    } catch (err: any) {
      alert(err.message || 'failed');
    } finally {
      setCreating(false);
    }
  };

  const badgeClass = useMemo(() => {
    if (!report) return 'badge badge-ok';
    if (report.anomalies.level === 'critical') return 'badge badge-critical';
    if (report.anomalies.level === 'warning') return 'badge badge-warning';
    return 'badge badge-ok';
  }, [report]);

  const openDocument = async (path: string) => {
    const blob = await apiFetchBlob(`/r2?key=${encodeURIComponent(path)}`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Daily Close</h1>
          <p className="text-sm text-zinc-500">日次KPIと証跡作成</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
          />
          <button
            onClick={createArtifacts}
            className="btn btn-primary"
            disabled={creating}
          >
            {creating ? '作成中...' : '証跡作成'}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-medium">デイリーレポート</div>
            <div className="text-sm text-zinc-500">{date} の集計</div>
          </div>
          <span className={badgeClass}>{report?.anomalies.message || '---'}</span>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {loading && <div className="text-sm text-zinc-500">loading...</div>}
        {report && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-sm text-zinc-500">Orders</div>
              <div className="text-2xl font-semibold mt-1">¥{formatJPY(report.orders.totalNet)}</div>
              <div className="text-xs text-zinc-500">count {report.orders.count} / fee ¥{formatJPY(report.orders.totalFee)}</div>
            </div>
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-sm text-zinc-500">Payments</div>
              <div className="text-2xl font-semibold mt-1">¥{formatJPY(report.payments.totalAmount)}</div>
              <div className="text-xs text-zinc-500">count {report.payments.count} / fee ¥{formatJPY(report.payments.totalFee)}</div>
            </div>
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
              <div className="text-sm text-zinc-500">Refunds</div>
              <div className="text-2xl font-semibold mt-1">¥{formatJPY(report.refunds.totalAmount)}</div>
              <div className="text-xs text-zinc-500">count {report.refunds.count}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-medium">Documents</div>
          <button className="btn btn-ghost" onClick={() => fetchDocuments(date)}>再読込</button>
        </div>
        {docs.length === 0 && <div className="text-sm text-zinc-500">まだありません</div>}
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between border border-zinc-200 rounded-xl px-4 py-3">
              <div>
                <div className="font-medium">{doc.path}</div>
                <div className="text-xs text-zinc-500">{doc.content_type || 'unknown'}</div>
              </div>
              <button className="btn btn-primary" onClick={() => openDocument(doc.path)}>
                開く
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyClosePage;
