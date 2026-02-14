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

export default function CouponsTable({ coupons }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
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
            <TableCell colSpan={7} className="text-center text-zinc-500">
              No coupons found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
