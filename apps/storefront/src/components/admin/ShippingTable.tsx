import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { formatDate, formatPrice } from '../../lib/format'
import { getShippingBadgeColor, getShippingStatusLabel } from '../../lib/adminUtils'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'

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

export default function ShippingTable({ orders, onShipClick }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{t('admin.order')}</TableHeader>
          <TableHeader>{t('admin.customer')}</TableHeader>
          <TableHeader>{t('admin.paidAt')}</TableHeader>
          <TableHeader>{t('admin.status')}</TableHeader>
          <TableHeader>{t('admin.shippingInfo')}</TableHeader>
          <TableHeader className="text-right">{t('admin.total')}</TableHeader>
          <TableHeader className="text-right">{t('admin.actions')}</TableHeader>
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
                  <div className="text-zinc-950">{order.customer_email || t('admin.guest')}</div>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(order.paid_at, 'DATETIME')}
                </TableCell>
                <TableCell>
                  <Badge color={getShippingBadgeColor(order.fulfillment_status)}>
                    {getShippingStatusLabel(order.fulfillment_status)}
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
                  {formatPrice(order.total)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    color="indigo"
                    onClick={() => onShipClick(order.order_id, order.fulfillment_id)}
                  >
                    {t('admin.shipButton')}
                  </Button>
                </TableCell>
              </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7}>
              <TableEmptyState
                icon="truck"
                message={t('admin.emptyShipping')}
                description={t('admin.emptyShippingDesc')}
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
