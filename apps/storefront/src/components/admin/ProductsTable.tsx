import { useState, useCallback } from 'react'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Link } from '../catalyst/link'
import AdminPagination from './AdminPagination'
import SortIcon from './SortIcon'
import { getProductBadgeColor } from '../../lib/adminUtils'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'

type Product = {
  id: number
  title: string
  description: string | null
  status: string
  updated_at: string
}

type SortField = 'title' | 'status' | 'updated_at'
type SortOrder = 'asc' | 'desc'

type Props = {
  products: Product[]
  currentPage: number
  totalPages: number
  searchQuery: string
  statusFilter: string
}

const confirmDialog = (window as any).__confirmDialog as
  | ((opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>)
  | undefined

export default function ProductsTable({
  products: initialProducts,
  currentPage,
  totalPages,
  searchQuery,
  statusFilter,
}: Props) {
  const [products, setProducts] = useState(initialProducts)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [sortField, setSortField] = useState<SortField>('updated_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sortedProducts = [...products].sort((a: Product, b: Product) => {
    let cmp = 0
    switch (sortField) {
      case 'title':
        cmp = a.title.localeCompare(b.title)
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
      case 'updated_at':
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        break
    }
    return sortOrder === 'asc' ? cmp : -cmp
  })

  const allIds = sortedProducts.map((p) => p.id)
  const allSelected = sortedProducts.length > 0 && allIds.every((id) => selectedIds.has(id))
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

  const handleArchive = async (productId: number, productTitle: string) => {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t('admin.confirm.title'),
          message: t('admin.confirm.archiveProduct', { title: productTitle }),
          confirmLabel: t('admin.archive'),
          cancelLabel: t('common.cancel'),
          danger: true,
        })
      : window.confirm(t('admin.confirm.archiveProduct', { title: productTitle }))
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: 'DELETE' })
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: 'archived' } : p))
      } else {
        const data = await res.json()
        setBulkMessage({ type: 'error', text: data.message || 'Failed to archive' })
      }
    } catch {
      setBulkMessage({ type: 'error', text: 'Failed to archive product' })
    }
  }

  const handleRestore = async (productId: number, productTitle: string) => {
    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t('admin.confirm.title'),
          message: t('admin.confirm.restoreProduct', { title: productTitle }),
          confirmLabel: t('admin.restore'),
          cancelLabel: t('common.cancel'),
          danger: false,
        })
      : window.confirm(t('admin.confirm.restoreProduct', { title: productTitle }))
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/products/${productId}/restore`, { method: 'POST' })
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: 'active' } : p))
      } else {
        const data = await res.json()
        setBulkMessage({ type: 'error', text: data.message || 'Failed to restore' })
      }
    } catch {
      setBulkMessage({ type: 'error', text: 'Failed to restore product' })
    }
  }

  const handleBulkAction = useCallback(async (action: string) => {
    if (!action) return
    setBulkMessage(null)
    if (action === 'archive') {
      const confirmed = confirmDialog
        ? await confirmDialog({
            title: t('admin.confirm.title'),
            message: t('admin.confirm.bulkArchiveProducts', { count: selectedIds.size }),
            confirmLabel: t('admin.archive'),
            cancelLabel: t('common.cancel'),
            danger: true,
          })
        : window.confirm(t('admin.confirm.bulkArchiveProducts', { count: selectedIds.size }))
      if (!confirmed) return

      setBulkLoading(true)
      let success = 0
      let fail = 0
      for (const pid of selectedIds) {
        try {
          const res = await fetch(`/api/admin/products/${pid}`, { method: 'DELETE' })
          if (res.ok) success++
          else fail++
        } catch {
          fail++
        }
      }
      setBulkLoading(false)
      if (fail === 0) {
        setBulkMessage({ type: 'success', text: `${success}件のアーカイブに成功しました` })
        setProducts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, status: 'archived' } : p))
        setSelectedIds(new Set())
      } else {
        setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
      }
    }
  }, [selectedIds])

  if (sortedProducts.length === 0) {
    return (
      <TableEmptyState
        icon="package"
        message={t('admin.emptyProducts')}
        description={t('admin.emptyProductsDesc')}
        actionLabel={t('admin.addFirstProduct')}
        actionHref="/admin/products/new"
      />
    )
  }

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
            <option value="archive">一括アーカイブ</option>
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

      {bulkMessage && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          bulkMessage.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {bulkMessage.text}
        </div>
      )}

      {/* Mobile card layout */}
      <div className="block md:hidden space-y-3">
        {sortedProducts.map((product) => (
          <div key={product.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <a href={`/admin/products/${product.id}`} className="font-medium text-zinc-950 hover:text-indigo-600">
                  {product.title}
                </a>
                {product.description && (
                  <p className="mt-0.5 text-xs text-zinc-500 truncate">{product.description}</p>
                )}
              </div>
              <Badge color={getProductBadgeColor(product.status)}>
                {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>{new Date(product.updated_at).toLocaleDateString('ja-JP')}</span>
              <div className="flex items-center gap-3">
                <a href={`/admin/products/${product.id}`} className="text-indigo-600 font-medium">
                  {t('common.edit')}
                </a>
                {product.status !== 'archived' && (
                  <button type="button" onClick={() => handleArchive(product.id, product.title)} className="text-red-600">
                    {t('admin.archive')}
                  </button>
                )}
                {product.status === 'archived' && (
                  <button type="button" onClick={() => handleRestore(product.id, product.title)} className="text-green-600">
                    {t('admin.restore')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block">
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
                <button type="button" onClick={() => handleSort('title')} className="inline-flex items-center hover:text-indigo-600">
                  {t('admin.title')}
                  <SortIcon field="title" sortField={sortField} sortOrder={sortOrder} />
                </button>
              </TableHeader>
              <TableHeader>
                <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center hover:text-indigo-600">
                  {t('admin.status')}
                  <SortIcon field="status" sortField={sortField} sortOrder={sortOrder} />
                </button>
              </TableHeader>
              <TableHeader>
                <button type="button" onClick={() => handleSort('updated_at')} className="inline-flex items-center hover:text-indigo-600">
                  {t('admin.updated')}
                  <SortIcon field="updated_at" sortField={sortField} sortOrder={sortOrder} />
                </button>
              </TableHeader>
              <TableHeader className="text-right">{t('admin.action')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleOne(product.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`${product.title} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium text-zinc-950">{product.title}</div>
                  {product.description && (
                    <div className="text-xs text-zinc-500 truncate max-w-xs">
                      {product.description}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge color={getProductBadgeColor(product.status)}>
                    {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {new Date(product.updated_at).toLocaleDateString('ja-JP')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/products/${product.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                      {t('common.edit')}
                    </Link>
                    {product.status !== 'archived' && (
                      <Button
                        plain
                        onClick={() => handleArchive(product.id, product.title)}
                        className="text-red-600 hover:text-red-800"
                      >
                        {t('admin.archive')}
                      </Button>
                    )}
                    {product.status === 'archived' && (
                      <Button
                        plain
                        onClick={() => handleRestore(product.id, product.title)}
                        className="text-green-600 hover:text-green-800"
                      >
                        {t('admin.restore')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={(page) => `?page=${page}&q=${searchQuery}&status=${statusFilter}`}
      />
    </div>
  )
}
