import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { formatPrice } from '../../lib/format'

type LedgerEntry = {
  id: number
  ref_type: string
  ref_id: string
  account_name: string
  memo: string | null
  debit: number
  credit: number
  currency: string
  created_at: string
}

type Props = {
  entries: LedgerEntry[]
}

export default function LedgerTable({ entries }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Date</TableHeader>
          <TableHeader>Ref</TableHeader>
          <TableHeader>Account</TableHeader>
          <TableHeader>Memo</TableHeader>
          <TableHeader>Debit</TableHeader>
          <TableHeader>Credit</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.length > 0 ? (
          entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-zinc-500 whitespace-nowrap font-sans">
                {new Date(entry.created_at).toLocaleDateString()}
                <div className="text-[10px]">{new Date(entry.created_at).toLocaleTimeString()}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap font-sans">
                <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700">
                  {entry.ref_type}
                </span>
                <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[80px]">#{entry.ref_id}</div>
              </TableCell>
              <TableCell className="font-semibold text-zinc-950 font-sans">
                {entry.account_name}
              </TableCell>
              <TableCell className="text-zinc-700 truncate max-w-xs font-sans">
                {entry.memo || '-'}
              </TableCell>
              <TableCell className="font-mono">
                {entry.debit > 0 ? formatPrice(entry.debit, entry.currency) : ''}
              </TableCell>
              <TableCell className="font-mono">
                {entry.credit > 0 ? formatPrice(entry.credit, entry.currency) : ''}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-zinc-500 font-sans">
              No ledger entries found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
