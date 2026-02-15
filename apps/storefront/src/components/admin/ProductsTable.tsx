import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Link } from '../catalyst/link'
import AdminPagination from './AdminPagination'

type Product = {
  id: number
  title: string
  description: string | null
  status: string
  updated_at: string
}

type Props = {
  products: Product[]
  currentPage: number
  totalPages: number
  searchQuery: string
  statusFilter: string
}

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'lime' as const
    case 'draft':
      return 'zinc' as const
    case 'archived':
      return 'red' as const
    default:
      return 'zinc' as const
  }
}

const handleArchive = async (productId: number, productTitle: string) => {
  if (!confirm(`Archive "${productTitle}"?`)) return

  try {
    const res = await fetch(`/api/admin/products/${productId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      window.location.reload()
    } else {
      const data = await res.json()
      alert(data.message || 'Failed to archive')
    }
  } catch (err) {
    alert('Failed to archive product')
  }
}

const handleRestore = async (productId: number, productTitle: string) => {
  if (!confirm(`Restore "${productTitle}"?`)) return

  try {
    const res = await fetch(`/api/admin/products/${productId}/restore`, {
      method: 'POST',
    })

    if (res.ok) {
      window.location.reload()
    } else {
      const data = await res.json()
      alert(data.message || 'Failed to restore')
    }
  } catch (err) {
    alert('Failed to restore product')
  }
}

export default function ProductsTable({
  products,
  currentPage,
  totalPages,
  searchQuery,
  statusFilter,
}: Props) {
  return (
    <div>
      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Updated</TableHeader>
            <TableHeader className="text-right">Action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.length > 0 ? (
            products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="font-medium text-zinc-950">{product.title}</div>
                  {product.description && (
                    <div className="text-xs text-zinc-500 truncate max-w-xs">
                      {product.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge color={getStatusBadgeColor(product.status)}>
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {new Date(product.updated_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/products/${product.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                      Edit
                    </Link>
                    {product.status !== 'archived' && (
                      <Button
                        plain
                        onClick={() => handleArchive(product.id, product.title)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Archive
                      </Button>
                    )}
                    {product.status === 'archived' && (
                      <Button
                        plain
                        onClick={() => handleRestore(product.id, product.title)}
                        className="text-green-600 hover:text-green-800"
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-zinc-500 py-12">
                No products found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={(page) => `?page=${page}&q=${searchQuery}&status=${statusFilter}`}
      />
    </div>
  )
}
