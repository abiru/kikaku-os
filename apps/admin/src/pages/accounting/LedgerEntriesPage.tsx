import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';

type LedgerEntry = {
  id: number;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
};

const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const LedgerEntriesPage = () => {
  const [date, setDate] = useState(yesterday());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  const fetchEntries = async (d: string) => {
    const data = await apiFetch<{ ok: boolean; entries: LedgerEntry[] }>(`/ledger-entries?date=${d}`);
    setEntries(data.entries || []);
  };

  useEffect(() => {
    fetchEntries(date);
  }, [date]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ledger Entries</h1>
          <p className="text-sm text-zinc-500">日次締め仕訳</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-zinc-200 px-3 py-2 bg-white"
        />
      </div>

      <div className="card">
        {entries.length === 0 ? (
          <div className="text-sm text-zinc-500">仕訳がありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-sm text-zinc-500">
                <tr>
                  <th className="py-2">Account</th>
                  <th className="py-2">Debit</th>
                  <th className="py-2">Credit</th>
                  <th className="py-2">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {entries.map((e) => (
                  <tr key={e.id} className="text-sm">
                    <td className="py-3 font-medium">{e.account_id}</td>
                    <td className="py-3">¥{e.debit.toLocaleString('ja-JP')}</td>
                    <td className="py-3">¥{e.credit.toLocaleString('ja-JP')}</td>
                    <td className="py-3 text-zinc-500">{e.memo || ''}</td>
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

export default LedgerEntriesPage;
