import { useState, useCallback } from 'react'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { formatDate } from '../../lib/format'

type Coupon = {
  id: number
  code: string
  type: string
  value: number
  currency: string
  min_order_amount: number
  max_uses: number | null
  uses_per_customer: number
  current_uses: number
  status: string
  starts_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

type Props = {
  coupons: Coupon[]
}

const formatValue = (coupon: Coupon) => {
  if (coupon.type === 'percentage') {
    return `${coupon.value}%`
  }
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: coupon.currency,
    minimumFractionDigits: 0
  }).format(coupon.value)
}

const isExpired = (coupon: Coupon) => {
  if (!coupon.expires_at) return false
  return new Date(coupon.expires_at) < new Date()
}

export default function CouponsTable({ coupons: initialCoupons }: Props) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const allIds = coupons.map((c) => c.id)
  const deletableIds = coupons.filter((c) => c.current_uses === 0).map((c) => c.id)
  const allSelected = coupons.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someSelected = selectedIds.size > 0
  const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allCurrentlySelected = allIds.every((id) => prev.has(id))
      return allCurrentlySelected ? new Set() : new Set(allIds)
    })
  }, [allIds])

  const toggleOne = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const executeBulkDelete = async () => {
    setShowConfirm(false)
    setBulkLoading(true)
    setBulkMessage(null)
    let success = 0
    let fail = 0

    for (const id of selectedDeletable) {
      try {
        const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' })
        if (res.ok) success++
        else fail++
      } catch {
        fail++
      }
    }

    setBulkLoading(false)
    if (fail === 0) {
      setBulkMessage({ type: 'success', text: `${success}件のクーポンを削除しました` })
      setCoupons(prev => prev.filter(c => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
    } else {
      setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
    }
  }

  return (
    <div>
      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-zinc-950 mb-2">Delete Coupons</h3>
              <p className="text-sm text-zinc-600">
                Are you sure you want to delete {selectedDeletable.length} coupon(s)? This action cannot be undone.
                {selectedIds.size !== selectedDeletable.length && (
                  <span className="block mt-2 text-amber-600">
                    Note: {selectedIds.size - selectedDeletable.length} coupon(s) with existing usage will be skipped.
                  </span>
                )}
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-gray-100">
              <button type="button" onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50">Cancel</button>
              <button type="button" onClick={executeBulkDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <span className="text-sm font-medium text-indigo-900">
            {selectedIds.size}件選択中
          </span>
          <button
            type="button"
            onClick={() => { if (selectedDeletable.length > 0) setShowConfirm(true) }}
            disabled={bulkLoading || selectedDeletable.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50"
          >
            一括削除
          </button>
          {bulkLoading && (
            <span className="text-sm text-indigo-600 animate-pulse">処理中...</span>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800"
          >
            選択解除
          </button>
        </div>
      )}

      {bulkMessage && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          bulkMessage.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {bulkMessage.text}
        </div>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                aria-label="全て選択"
              />
            </TableHeader>
            <TableHeader>Code</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Value</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Usage</TableHeader>
            <TableHeader>Expires</TableHeader>
            <TableHeader>Action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {coupons.length > 0 ? (
            coupons.map((coupon) => (
              <TableRow key={coupon.id} href={`/admin/coupons/${coupon.id}`}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(coupon.id)}
                    onChange={() => toggleOne(coupon.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`${coupon.code} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-mono font-medium">{coupon.code}</div>
                  {coupon.min_order_amount > 0 && (
                    <div className="text-xs text-zinc-500">
                      Min: {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: coupon.currency, minimumFractionDigits: 0 }).format(coupon.min_order_amount)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge color="zinc">
                    {coupon.type === 'percentage' ? 'Percentage' : 'Fixed'}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  {formatValue(coupon)}
                </TableCell>
                <TableCell>
                  {isExpired(coupon) ? (
                    <Badge color="amber">Expired</Badge>
                  ) : coupon.status === 'active' ? (
                    <Badge color="lime">Active</Badge>
                  ) : (
                    <Badge color="zinc">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {coupon.current_uses}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(coupon.expires_at)}
                </TableCell>
                <TableCell>
                  <a href={`/admin/coupons/${coupon.id}`} className="text-indigo-600 hover:underline font-medium">Edit</a>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-zinc-500">
                No coupons found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
