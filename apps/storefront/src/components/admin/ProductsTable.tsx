import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Pagination, PaginationPrevious, PaginationNext, PaginationList, PaginationPage } from '../catalyst/pagination'
import { Link } from '../catalyst/link'

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
  apiBase: string
  apiKey: string
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

const handleArchive = async (productId: number, productTitle: string, apiBase: string, apiKey: string) => {
  if (!confirm(`Archive "${productTitle}"?`)) return

  try {
    const res = await fetch(`${apiBase}/admin/products/${productId}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': apiKey },
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

const handleRestore = async (productId: number, productTitle: string, apiBase: string, apiKey: string) => {
  if (!confirm(`Restore "${productTitle}"?`)) return

  try {
    const res = await fetch(`${apiBase}/admin/products/${productId}/restore`, {
      method: 'POST',
      headers: { 'x-admin-key': apiKey },
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
  apiBase,
  apiKey,
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
                  <div className="font-medium text-zinc-950 dark:text-white">{product.title}</div>
                  {product.description && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs">
                      {product.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge color={getStatusBadgeColor(product.status)}>
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums dark:text-zinc-400">
                  {new Date(product.updated_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/products/${product.id}`} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-medium">
                      Edit
                    </Link>
                    {product.status !== 'archived' && (
                      <Button
                        plain
                        onClick={() => handleArchive(product.id, product.title, apiBase, apiKey)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400"
                      >
                        Archive
                      </Button>
                    )}
                    {product.status === 'archived' && (
                      <Button
                        plain
                        onClick={() => handleRestore(product.id, product.title, apiBase, apiKey)}
                        className="text-green-600 hover:text-green-800 dark:text-green-400"
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
              <TableCell colSpan={4} className="text-center text-zinc-500 py-12 dark:text-zinc-400">
                No products found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Page {currentPage} of {totalPages}
          </div>
          <Pagination>
            {currentPage > 1 && (
              <PaginationPrevious
                href={`?page=${currentPage - 1}&q=${searchQuery}&status=${statusFilter}`}
              />
            )}
            <PaginationList>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                return (
                  <PaginationPage
                    key={pageNum}
                    href={`?page=${pageNum}&q=${searchQuery}&status=${statusFilter}`}
                    current={pageNum === currentPage}
                  >
                    {pageNum}
                  </PaginationPage>
                )
              })}
            </PaginationList>
            {currentPage < totalPages && (
              <PaginationNext
                href={`?page=${currentPage + 1}&q=${searchQuery}&status=${statusFilter}`}
              />
            )}
          </Pagination>
        </div>
      )}
    </div>
  )
}
