import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { getInventoryBadgeColor, getInventoryStatusLabel } from '../../lib/adminUtils'

type InventoryItem = {
  variant_id: number
  variant_title: string
  product_id: number
  product_title: string
  sku: string | null
  on_hand: number
  threshold: number | null
  status: 'ok' | 'low' | 'out'
}

type Props = {
  inventory: InventoryItem[]
  onAdjust: (variantId: number, variantTitle: string, productTitle: string, onHand: number) => void
  onThreshold: (variantId: number, variantTitle: string, threshold: number | null) => void
}

export default function InventoryTable({ inventory, onAdjust, onThreshold }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Product</TableHeader>
          <TableHeader>Variant</TableHeader>
          <TableHeader>SKU</TableHeader>
          <TableHeader>On Hand</TableHeader>
          <TableHeader>Threshold</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Actions</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {inventory.length > 0 ? (
          inventory.map((item) => (
            <TableRow key={item.variant_id}>
              <TableCell>
                <a href={`/admin/products/${item.product_id}`} className="text-indigo-600 hover:underline">
                  {item.product_title}
                </a>
              </TableCell>
              <TableCell>{item.variant_title}</TableCell>
              <TableCell className="text-zinc-500 font-mono text-xs">{item.sku || '-'}</TableCell>
              <TableCell className="tabular-nums font-semibold">{item.on_hand}</TableCell>
              <TableCell className="tabular-nums text-zinc-500">{item.threshold ?? '-'}</TableCell>
              <TableCell>
                <Badge color={getInventoryBadgeColor(item.status)}>{getInventoryStatusLabel(item.status)}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onAdjust(item.variant_id, item.variant_title, item.product_title, item.on_hand)}
                    className="text-sm text-indigo-600 hover:underline"
                  >
                    Adjust
                  </button>
                  <button
                    type="button"
                    onClick={() => onThreshold(item.variant_id, item.variant_title, item.threshold)}
                    className="text-sm text-zinc-500 hover:text-zinc-950 hover:underline"
                  >
                    Threshold
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-zinc-500">
              No variants found. Add variants to products first.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
