import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

type InboxItem = {
  id: number;
  title: string;
  body: string | null;
  severity: string | null;
  status: string;
  created_at: string;
};

const InboxPage = () => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<InboxItem | null>(null);

  const load = async () => {
    const data = await apiFetch<{ ok: boolean; items: InboxItem[] }>('/inbox?status=open');
    setItems(data.items || []);
    if (data.items && data.items.length > 0) setSelected(data.items[0]);
  };

  useEffect(() => {
    load();
  }, []);

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
