import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { apiFetch } from '../../api/client';

type InboxItem = {
  id: number;
  title: string;
  body: string | null;
  severity: string | null;
  status: string;
  kind?: string | null;
  date?: string | null;
  created_at: string;
};

type InboxView = {
  key: string;
  label: string;
  params: Record<string, string>;
};

const views: InboxView[] = [
  { key: 'all_open', label: 'All Open', params: { status: 'open' } },
  { key: 'daily_close', label: 'Daily Close', params: { status: 'open', kind: 'daily_close_anomaly' } },
  { key: 'critical', label: 'Critical', params: { status: 'open', severity: 'critical' } },
  { key: 'closed', label: 'Closed', params: { status: 'closed' } }
];

const buildInboxQuery = (params: Record<string, string>, date: string | null) => {
  const qs = new URLSearchParams(params);
  if (date) qs.set('date', date);
  return qs.toString();
};

const InboxPage = () => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewKey = searchParams.get('inboxView') || 'all_open';
  const dateFilter = searchParams.get('date');
  const view = useMemo(() => views.find((v) => v.key === viewKey) || views[0], [viewKey]);

  const load = async () => {
    const qs = buildInboxQuery(view.params, dateFilter);
    const data = await apiFetch<{ ok: boolean; items: InboxItem[] }>(`/inbox?${qs}`);
    setItems(data.items || []);
    if (data.items && data.items.length > 0) setSelected(data.items[0]);
    else setSelected(null);
  };

  useEffect(() => {
    load();
  }, [viewKey, dateFilter]);

  const act = async (id: number, action: 'approve' | 'reject') => {
    await apiFetch(`/inbox/${id}/${action}`, { method: 'POST' });
    await load();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="card md:col-span-1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-lg font-medium">Inbox</div>
          <button className="btn btn-ghost" onClick={load}>再読込</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {views.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.set('inboxView', tab.key);
                  setSearchParams(next);
                }}
                className={`px-3 py-1.5 rounded-xl border text-sm ${
                  view.key === tab.key ? 'bg-black text-white border-black' : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter || ''}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams);
                if (e.target.value) next.set('date', e.target.value);
                else next.delete('date');
                setSearchParams(next);
              }}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 bg-white text-sm"
            />
            {dateFilter && (
              <button
                className="btn btn-ghost text-sm"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('date');
                  setSearchParams(next);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelected(item)}
              className={`w-full text-left px-4 py-3 rounded-xl border ${selected?.id === item.id ? 'border-black bg-zinc-100' : 'border-zinc-200 hover:border-zinc-300'}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{item.title}</div>
                <span className={`badge ${item.severity === 'critical' ? 'badge-critical' : 'badge-ok'}`}>
                  {item.severity || 'normal'}
                </span>
              </div>
              <div className="text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</div>
            </button>
          ))}
          {items.length === 0 && <div className="text-sm text-zinc-500">open はありません</div>}
        </div>
      </div>

      <div className="card md:col-span-2">
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-semibold">{selected.title}</div>
                <div className="text-sm text-zinc-500">{selected.severity || 'normal'}</div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => act(selected.id, 'reject')}>Reject</button>
                <button className="btn btn-primary" onClick={() => act(selected.id, 'approve')}>Approve</button>
              </div>
            </div>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{selected.body}</p>
          </div>
        ) : (
          <div className="text-sm text-zinc-500">詳細を選択してください</div>
        )}
      </div>
    </div>
  );
};

export default InboxPage;
