import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { formatDate } from '../../lib/format'

type ReadyToShipOrder = {
  order_id: number
  customer_email: string | null
  total: number
  paid_at: string | null
  fulfillment_id: number | null
  fulfillment_status: string | null
  tracking_number?: string | null
  carrier?: string | null
}

type Props = {
  orders: ReadyToShipOrder[]
  onShipClick: (orderId: number, fulfillmentId: number | null) => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)
}

const getStatusBadge = (status: string | null): { label: string; color: 'zinc' | 'yellow' | 'blue' | 'green' } => {
  switch (status) {
    case 'shipped':
      return { label: '発送済み', color: 'blue' }
    case 'processing':
      return { label: '準備中', color: 'yellow' }
    case 'delivered':
      return { label: '配達済み', color: 'green' }
    default:
      return { label: '未発送', color: 'zinc' }
  }
}

export default function ShippingTable({ orders, onShipClick }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>注文</TableHeader>
          <TableHeader>顧客</TableHeader>
          <TableHeader>支払日時</TableHeader>
          <TableHeader>ステータス</TableHeader>
          <TableHeader>配送情報</TableHeader>
          <TableHeader className="text-right">合計</TableHeader>
          <TableHeader className="text-right">アクション</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {orders.length > 0 ? (
          orders.map((order) => {
            const badge = getStatusBadge(order.fulfillment_status)
            return (
              <TableRow key={order.order_id}>
                <TableCell className="font-medium">
                  <a href={`/admin/orders/${order.order_id}`} className="text-indigo-600 hover:underline">
                    #{order.order_id}
                  </a>
                </TableCell>
                <TableCell>
                  <div className="text-zinc-950">{order.customer_email || 'ゲスト'}</div>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(order.paid_at, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell>
                  <Badge color={badge.color}>
                    {badge.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  {order.carrier && (
                    <div className="text-sm text-zinc-700">{order.carrier}</div>
                  )}
                  {order.tracking_number && (
                    <div className="text-xs font-mono text-zinc-500">{order.tracking_number}</div>
                  )}
                  {!order.carrier && !order.tracking_number && (
                    <span className="text-xs text-zinc-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(order.total)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    color="indigo"
                    onClick={() => onShipClick(order.order_id, order.fulfillment_id)}
                  >
                    発送
                  </Button>
                </TableCell>
              </TableRow>
            )
          })
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-zinc-500">
              出荷待ちの注文はありません。
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
