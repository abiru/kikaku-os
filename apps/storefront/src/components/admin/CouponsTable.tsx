import { useState } from 'react'
import { Badge } from '../catalyst/badge'
import { formatDate } from '../../lib/format'
import AdminTable, { type Column, type SelectionState } from './AdminTable'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'
import { useBulkActions } from '../../hooks/useBulkActions'

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

const confirmDialog = (window as any).__confirmDialog as
  | ((opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>)
  | undefined

export default function CouponsTable({ coupons: initialCoupons }: Props) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const { bulkLoading, bulkMessage, setBulkMessage, executeBulk } = useBulkActions()

  const deletableIds = coupons.filter((c) => c.current_uses === 0).map((c) => c.id)

  const handleBulkDelete = async (selectedIds: ReadonlySet<number>, clearSelection: () => void) => {
    const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))
    if (selectedDeletable.length === 0) return

    const skipped = selectedIds.size - selectedDeletable.length
    const message = skipped > 0
      ? t('admin.confirm.deleteCoupons', { count: selectedDeletable.length }) + '\n' + t('admin.confirm.usedCouponsSkipped', { count: skipped })
      : t('admin.confirm.deleteCoupons', { count: selectedDeletable.length })

    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t('admin.confirm.title'),
          message,
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          danger: true,
        })
      : window.confirm(message)
    if (!confirmed) return

    await executeBulk(async () => {
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

      if (fail === 0) {
        setBulkMessage({ type: 'success', text: `${success}件のクーポンを削除しました` })
        setCoupons(prev => prev.filter(c => !selectedIds.has(c.id)))
        clearSelection()
      } else {
        setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
      }
    })
  }

  const columns: Column<Coupon>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (c) => (
        <>
          <div className="font-mono font-medium">{c.code}</div>
          {c.min_order_amount > 0 && (
            <div className="text-xs text-zinc-500">
              Min: {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: c.currency, minimumFractionDigits: 0 }).format(c.min_order_amount)}
            </div>
          )}
        </>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (c) => (
        <Badge color="zinc">
          {c.type === 'percentage' ? 'Percentage' : 'Fixed'}
        </Badge>
      ),
    },
    {
      id: 'value',
      header: 'Value',
      className: 'font-medium tabular-nums',
      cell: (c) => formatValue(c),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (c) => {
        if (isExpired(c)) return <Badge color="amber">Expired</Badge>
        if (c.status === 'active') return <Badge color="lime">Active</Badge>
        return <Badge color="zinc">Inactive</Badge>
      },
    },
    {
      id: 'usage',
      header: 'Usage',
      className: 'text-zinc-500 tabular-nums',
      cell: (c) => <>{c.current_uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</>,
    },
    {
      id: 'expires',
      header: 'Expires',
      className: 'text-zinc-500 tabular-nums',
      cell: (c) => formatDate(c.expires_at),
    },
    {
      id: 'action',
      header: 'Action',
      cell: (c) => (
        <a href={`/admin/coupons/${c.id}`} className="text-indigo-600 hover:underline font-medium">Edit</a>
      ),
    },
  ]

  return (
    <AdminTable
      data={coupons}
      columns={columns}
      itemLabel={(c) => `${c.code} を選択`}
      renderBulkActions={({ selectedIds, clearSelection }: SelectionState) => {
        const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))
        return (
          <>
            <button
              type="button"
              onClick={() => handleBulkDelete(selectedIds, clearSelection)}
              disabled={bulkLoading || selectedDeletable.length === 0}
              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              一括削除
            </button>
            {bulkLoading && (
              <span className="text-sm text-indigo-600 animate-pulse">処理中...</span>
            )}
          </>
        )
      }}
      message={bulkMessage}
      rowHref={(c) => `/admin/coupons/${c.id}`}
      emptyState={
        <TableEmptyState
          icon="tag"
          message={t('admin.emptyCoupons')}
          description={t('admin.emptyCouponsDesc')}
          actionLabel={t('admin.addFirstCoupon')}
          actionHref="/admin/coupons/new"
        />
      }
    />
  )
}
