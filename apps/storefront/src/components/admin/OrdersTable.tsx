import { useState, useMemo, useCallback } from 'react'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Link } from '../catalyst/link'
import AdminTable, { type Column, type SelectionState } from './AdminTable'
import { formatPrice } from '../../lib/format'
import { getOrderBadgeColor, getPaymentStatusLabel, getFulfillmentStatusLabel, getFulfillmentBadgeColor } from '../../lib/adminUtils'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'
import { useTableSort } from '../../hooks/useTableSort'
import { useBulkActions } from '../../hooks/useBulkActions'

type Order = {
  id: number
  created_at: string
  customer_email: string | null
  status: string
  fulfillment_status: string | null
  total_net: number
  currency: string
}

type Props = {
  orders: Order[]
  currentPage: number
  totalPages: number
  searchQuery: string
}

const exportOrdersCSV = (orders: readonly Order[], selectedIds: ReadonlySet<number>) => {
  const selected = orders.filter((o) => selectedIds.has(o.id))
  const header = 'order_id,date,customer_email,status,fulfillment_status,total,currency'
  const rows = selected.map((o) => {
    const escape = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)
    return [
      String(o.id),
      escape(o.created_at),
      escape(o.customer_email || ''),
      escape(o.status),
      escape(o.fulfillment_status || 'unfulfilled'),
      String(o.total_net),
      escape(o.currency),
    ].join(',')
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orders_export_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const confirmDialog = (window as any).__confirmDialog as
  | ((opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>)
  | undefined

const sortFieldTypes = {
  id: 'number' as const,
  created_at: 'date' as const,
  total_net: 'number' as const,
  status: 'string' as const,
}

export default function OrdersTable({ orders: initialOrders, currentPage, totalPages, searchQuery }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const { bulkLoading, bulkMessage, setBulkMessage, executeBulk } = useBulkActions()
  const { sortComparator } = useTableSort<Order>(sortFieldTypes)

  const executeBulkFulfill = useCallback(async (targetIds: ReadonlySet<number>, clearSelection: () => void) => {
    await executeBulk(async () => {
      let successCount = 0
      const failedIds: number[] = []

      for (const orderId of targetIds) {
        try {
          const res = await fetch(`/api/admin/orders/${orderId}/fulfillments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'shipped' }),
          })
          if (res.ok) {
            successCount++
          } else {
            failedIds.push(orderId)
          }
        } catch {
          failedIds.push(orderId)
        }
      }

      if (failedIds.length === 0) {
        setBulkMessage({ type: 'success', text: t('admin.bulkFulfillSuccess', { count: successCount }) })
        setOrders(prev => prev.map(o =>
          targetIds.has(o.id) ? { ...o, fulfillment_status: 'shipped' } : o
        ))
        clearSelection()
      } else {
        const detail = failedIds.map(id => `#${id}`).join(', ')
        setBulkMessage({
          type: 'error',
          text: `${successCount}件成功、${failedIds.length}件失敗しました（${detail}）`,
          failedIds,
          action: 'fulfill',
        })
        if (successCount > 0) {
          const succeededIds = new Set([...targetIds].filter(id => !failedIds.includes(id)))
          setOrders(prev => prev.map(o =>
            succeededIds.has(o.id) ? { ...o, fulfillment_status: 'shipped' } : o
          ))
        }
      }
    })
  }, [executeBulk, setBulkMessage])

  const handleRetryFailed = useCallback((clearSelection: () => void) => {
    if (!bulkMessage?.failedIds || bulkMessage.failedIds.length === 0) return
    const retryIds = new Set(bulkMessage.failedIds)
    setBulkMessage(null)
    executeBulkFulfill(retryIds, clearSelection)
  }, [bulkMessage, executeBulkFulfill, setBulkMessage])

  const handleBulkAction = async (action: string, selectedIds: ReadonlySet<number>, clearSelection: () => void) => {
    if (!action) return

    if (action === 'export') {
      exportOrdersCSV(orders, selectedIds)
      setBulkMessage({ type: 'success', text: t('admin.bulkExportSuccess', { count: selectedIds.size }) })
      setTimeout(() => setBulkMessage(null), 3000)
      return
    }

    if (action === 'fulfill') {
      const confirmed = confirmDialog
        ? await confirmDialog({
            title: t('admin.confirm.title'),
            message: t('admin.confirm.bulkFulfill', { count: selectedIds.size }),
            confirmLabel: t('admin.markAsShipped'),
            cancelLabel: t('common.cancel'),
            danger: false,
          })
        : window.confirm(t('admin.confirm.bulkFulfill', { count: selectedIds.size }))
      if (!confirmed) return

      await executeBulkFulfill(selectedIds, clearSelection)
    }
  }

  const columns: Column<Order>[] = useMemo(() => [
    {
      id: 'id',
      header: t('admin.order'),
      sortable: true,
      className: 'font-medium',
      cell: (o) => (
        <Link href={`/admin/orders/${o.id}`} className="text-indigo-600 hover:text-indigo-800">
          #{o.id}
        </Link>
      ),
    },
    {
      id: 'created_at',
      header: t('admin.date'),
      sortable: true,
      className: 'text-zinc-500 tabular-nums',
      cell: (o) => (
        <>
          {new Date(o.created_at).toLocaleDateString('ja-JP')}{' '}
          <span className="text-xs">
            {new Date(o.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      ),
    },
    {
      id: 'customer',
      header: t('admin.customer'),
      cell: (o) => (
        <div className="text-zinc-950">{o.customer_email || t('admin.guest')}</div>
      ),
    },
    {
      id: 'status',
      header: t('admin.payment'),
      sortable: true,
      cell: (o) => (
        <Badge color={getOrderBadgeColor(o.status)}>{getPaymentStatusLabel(o.status)}</Badge>
      ),
    },
    {
      id: 'fulfillment',
      header: t('admin.fulfillment'),
      cell: (o) => (
        <Badge color={getFulfillmentBadgeColor(o.fulfillment_status)}>
          {getFulfillmentStatusLabel(o.fulfillment_status)}
        </Badge>
      ),
    },
    {
      id: 'total_net',
      header: t('admin.total'),
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right font-medium tabular-nums',
      cell: (o) => formatPrice(o.total_net, o.currency),
    },
  ], [])

  return (
    <AdminTable
      data={orders}
      columns={columns}
      defaultSortField="id"
      defaultSortOrder="desc"
      sortComparator={sortComparator}
      itemLabel={(o) => t('admin.selectOrder', { id: o.id })}
      renderBulkActions={({ selectedIds, clearSelection }: SelectionState) => (
        <>
          <select
            className="rounded-md border-gray-300 text-sm py-1.5 pl-3 pr-8 focus:border-indigo-500 focus:ring-indigo-500"
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value
              e.target.value = ''
              handleBulkAction(val, selectedIds, clearSelection)
            }}
            disabled={bulkLoading}
          >
            <option value="" disabled>{t('admin.bulkActions')}</option>
            <option value="fulfill">{t('admin.markAsShipped')}</option>
            <option value="export">{t('admin.csvExport')}</option>
          </select>
          {bulkLoading && (
            <span className="text-sm text-indigo-600 animate-pulse">{t('admin.processing')}</span>
          )}
          {bulkMessage?.failedIds && bulkMessage.failedIds.length > 0 && (
            <Button
              plain
              onClick={() => handleRetryFailed(clearSelection)}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
              disabled={bulkLoading}
            >
              失敗した{bulkMessage.failedIds.length}件をリトライ
            </Button>
          )}
        </>
      )}
      message={bulkMessage ? { type: bulkMessage.type, text: bulkMessage.text } : null}
      pagination={{
        currentPage,
        totalPages,
        buildHref: (page) => `?page=${page}&q=${searchQuery}`,
      }}
      renderMobileCard={(order) => (
        <a
          href={`/admin/orders/${order.id}`}
          className="block rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-indigo-600">#{order.id}</span>
            <span className="text-sm font-medium tabular-nums">
              {formatPrice(order.total_net, order.currency)}
            </span>
          </div>
          <div className="mt-2 text-sm text-zinc-600">
            {order.customer_email || t('admin.guest')}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge color={getOrderBadgeColor(order.status)}>{getPaymentStatusLabel(order.status)}</Badge>
              <Badge color={getFulfillmentBadgeColor(order.fulfillment_status)}>
                {getFulfillmentStatusLabel(order.fulfillment_status)}
              </Badge>
            </div>
            <span className="text-xs text-zinc-400 tabular-nums">
              {new Date(order.created_at).toLocaleDateString('ja-JP')}
            </span>
          </div>
        </a>
      )}
      emptyState={
        <TableEmptyState
          icon="shopping-cart"
          message={t('admin.emptyOrders')}
          description={t('admin.emptyOrdersDesc')}
        />
      }
      rowHref={(o) => `/admin/orders/${o.id}`}
      rowTitle={(o) => `${t('admin.order')} #${o.id}`}
      striped
    />
  )
}
