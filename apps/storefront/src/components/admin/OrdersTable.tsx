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

export default function OrdersTable({ orders, currentPage, totalPages, searchQuery }: Props) {
 const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())

 const allIds = orders.map((o) => o.id)
 const allSelected = orders.length > 0 && allIds.every((id) => selectedIds.has(id))
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
     if (!e.target.value) return
     e.target.value = ''
    }}
   >
    <option value="" disabled>一括操作...</option>
    <option value="fulfill">発送済みに変更</option>
    <option value="export">CSVエクスポート</option>
   </select>
   <button
    type="button"
    onClick={() => setSelectedIds(new Set())}
    className="ml-auto text-sm text-indigo-600 hover:text-indigo-800"
   >
    選択解除
   </button>
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
 <TableHeader>Order</TableHeader>
 <TableHeader>Date</TableHeader>
 <TableHeader>Customer</TableHeader>
 <TableHeader>Payment</TableHeader>
 <TableHeader>Fulfillment</TableHeader>
 <TableHeader className="text-right">Total</TableHeader>
 </TableRow>
 </TableHead>
 <TableBody>
 {orders.length > 0 ? (
 orders.map((order) => (
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
