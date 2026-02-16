import { useState, useCallback } from 'react'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from'../catalyst/table'
import { Badge } from'../catalyst/badge'
import { Link } from'../catalyst/link'
import AdminPagination from './AdminPagination'

type Order = {
 id: number
 created_at: string
 customer_email: string | null
 status: string
 fulfillment_status: string | null
 total_net: number
 currency: string
}

type SortField = 'id' | 'created_at' | 'total_net' | 'status'
type SortOrder = 'asc' | 'desc'

type Props = {
 orders: Order[]
 currentPage: number
 totalPages: number
 searchQuery: string
}

const formatCurrency = (amount: number, currency: string) => {
 return new Intl.NumberFormat('ja-JP', { style:'currency', currency }).format(amount)
}

const getBadgeColor = (status: string) => {
 switch (status) {
 case'paid':
 return'lime' as const
 case'pending':
 return'amber' as const
 case'refunded':
 return'red' as const
 default:
 return'zinc' as const
 }
}

const getFulfillmentBadgeColor = (status: string | null) => {
 if (status ==='shipped') return'lime' as const
 return'zinc' as const
}

const SortIcon = ({ field, sortField, sortOrder }: { field: SortField; sortField: SortField; sortOrder: SortOrder }) => {
  if (field !== sortField) {
    return (
      <svg className="w-3 h-3 ml-1 inline-block text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return sortOrder === 'asc' ? (
    <svg className="w-3 h-3 ml-1 inline-block text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 ml-1 inline-block text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
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

export default function OrdersTable({ orders, currentPage, totalPages, searchQuery }: Props) {
 const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
 const [sortField, setSortField] = useState<SortField>('id')
 const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
 const [bulkLoading, setBulkLoading] = useState(false)
 const [bulkError, setBulkError] = useState<string | null>(null)
 const [bulkSuccess, setBulkSuccess] = useState<string | null>(null)

 const sortedOrders = [...orders].sort((a, b) => {
   let cmp = 0
   switch (sortField) {
     case 'id':
       cmp = a.id - b.id
       break
     case 'created_at':
       cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
       break
     case 'total_net':
       cmp = a.total_net - b.total_net
       break
     case 'status':
       cmp = a.status.localeCompare(b.status)
       break
   }
   return sortOrder === 'asc' ? cmp : -cmp
 })

 const allIds = sortedOrders.map((o) => o.id)
 const allSelected = sortedOrders.length > 0 && allIds.every((id) => selectedIds.has(id))
 const someSelected = selectedIds.size > 0

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

 const handleSort = useCallback((field: SortField) => {
   setSortField((prev) => {
     if (prev === field) {
       setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
       return prev
     }
     setSortOrder('desc')
     return field
   })
 }, [])

 const handleBulkAction = useCallback(async (action: string) => {
   if (!action) return
   setBulkError(null)
   setBulkSuccess(null)

   if (action === 'export') {
     exportOrdersCSV(orders, selectedIds)
     setBulkSuccess(`${selectedIds.size}件の注文をCSVエクスポートしました`)
     setTimeout(() => setBulkSuccess(null), 3000)
     return
   }

   if (action === 'fulfill') {
     setBulkLoading(true)
     let successCount = 0
     let failCount = 0

     for (const orderId of selectedIds) {
       try {
         const res = await fetch(`/api/admin/orders/${orderId}/fulfillments`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ status: 'shipped' }),
         })
         if (res.ok) {
           successCount++
         } else {
           failCount++
         }
       } catch {
         failCount++
       }
     }

     setBulkLoading(false)
     if (failCount === 0) {
       setBulkSuccess(`${successCount}件の注文を発送済みに変更しました`)
       setTimeout(() => { window.location.reload() }, 1500)
     } else {
       setBulkError(`${successCount}件成功、${failCount}件失敗しました`)
     }
   }
 }, [orders, selectedIds])

 return (
 <div>
 {/* Bulk action bar */}
 {someSelected && (
  <div className="mb-4 flex items-center gap-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
   <span className="text-sm font-medium text-indigo-900">
    {selectedIds.size}件選択中
   </span>
   <select
    className="rounded-md border-gray-300 text-sm py-1.5 pl-3 pr-8 focus:border-indigo-500 focus:ring-indigo-500"
    defaultValue=""
    onChange={(e) => {
     const val = e.target.value
     e.target.value = ''
     handleBulkAction(val)
    }}
    disabled={bulkLoading}
   >
    <option value="" disabled>一括操作...</option>
    <option value="fulfill">発送済みに変更</option>
    <option value="export">CSVエクスポート</option>
   </select>
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

 {bulkError && (
   <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
     {bulkError}
   </div>
 )}

 {bulkSuccess && (
   <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
     {bulkSuccess}
   </div>
 )}

 <Table striped>
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
 <TableHeader>
   <button type="button" onClick={() => handleSort('id')} className="inline-flex items-center hover:text-indigo-600">
     Order
     <SortIcon field="id" sortField={sortField} sortOrder={sortOrder} />
   </button>
 </TableHeader>
 <TableHeader>
   <button type="button" onClick={() => handleSort('created_at')} className="inline-flex items-center hover:text-indigo-600">
     Date
     <SortIcon field="created_at" sortField={sortField} sortOrder={sortOrder} />
   </button>
 </TableHeader>
 <TableHeader>Customer</TableHeader>
 <TableHeader>
   <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center hover:text-indigo-600">
     Payment
     <SortIcon field="status" sortField={sortField} sortOrder={sortOrder} />
   </button>
 </TableHeader>
 <TableHeader>Fulfillment</TableHeader>
 <TableHeader className="text-right">
   <button type="button" onClick={() => handleSort('total_net')} className="inline-flex items-center hover:text-indigo-600">
     Total
     <SortIcon field="total_net" sortField={sortField} sortOrder={sortOrder} />
   </button>
 </TableHeader>
 </TableRow>
 </TableHead>
 <TableBody>
 {sortedOrders.length > 0 ? (
 sortedOrders.map((order) => (
 <TableRow key={order.id} href={`/admin/orders/${order.id}`} title={`Order #${order.id}`}>
 <TableCell>
  <input
   type="checkbox"
   checked={selectedIds.has(order.id)}
   onChange={(e) => {
    e.stopPropagation()
    toggleOne(order.id)
   }}
   onClick={(e) => e.stopPropagation()}
   className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
   aria-label={`注文 #${order.id} を選択`}
  />
 </TableCell>
 <TableCell className="font-medium">
 <Link href={`/admin/orders/${order.id}`} className="text-indigo-600 hover:text-indigo-800">
 #{order.id}
 </Link>
 </TableCell>
 <TableCell className="text-zinc-500 tabular-nums">
 {new Date(order.created_at).toLocaleDateString('ja-JP')}{''}
 <span className="text-xs">
 {new Date(order.created_at).toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' })}
 </span>
 </TableCell>
 <TableCell>
 <div className="text-zinc-950">{order.customer_email ||'Guest'}</div>
 </TableCell>
 <TableCell>
 <Badge color={getBadgeColor(order.status)}>{order.status}</Badge>
 </TableCell>
 <TableCell>
 <Badge color={getFulfillmentBadgeColor(order.fulfillment_status)}>
 {order.fulfillment_status ||'Unfulfilled'}
 </Badge>
 </TableCell>
 <TableCell className="text-right font-medium tabular-nums">
 {formatCurrency(order.total_net, order.currency)}
 </TableCell>
 </TableRow>
 ))
 ) : (
 <TableRow>
 <TableCell colSpan={7} className="text-center text-zinc-500 py-12">
 No orders found.
 </TableCell>
 </TableRow>
 )}
 </TableBody>
 </Table>

 <AdminPagination
 currentPage={currentPage}
 totalPages={totalPages}
 buildHref={(page) => `?page=${page}&q=${searchQuery}`}
 />
 </div>
 )
}
