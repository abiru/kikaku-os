import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'

type ReadyToShipOrder = {
  order_id: number
  customer_email: string | null
  total: number
  paid_at: string | null
  fulfillment_id: number | null
  fulfillment_status: string | null
}

type Props = {
  orders: ReadyToShipOrder[]
  onShipClick: (orderId: number, fulfillmentId: number | null) => void
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export default function ShippingTable({ orders, onShipClick }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Order</TableHeader>
          <TableHeader>Customer</TableHeader>
          <TableHeader>Paid At</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader className="text-right">Total</TableHeader>
          <TableHeader className="text-right">Actions</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {orders.length > 0 ? (
          orders.map((order) => (
            <TableRow key={order.order_id}>
              <TableCell className="font-medium">
                <a href={`/admin/orders/${order.order_id}`} className="text-indigo-600 hover:underline">
                  #{order.order_id}
                </a>
              </TableCell>
              <TableCell>
                <div className="text-zinc-950">{order.customer_email || 'Guest'}</div>
              </TableCell>
              <TableCell className="text-zinc-500 tabular-nums">
                {formatDate(order.paid_at)}
              </TableCell>
              <TableCell>
                <Badge color="zinc">
                  {order.fulfillment_status || 'Unfulfilled'}
                </Badge>
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
                  Ship
                </Button>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-zinc-500">
              No orders ready to ship.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
