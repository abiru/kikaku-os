import { useState, useMemo } from 'react'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Link } from '../catalyst/link'
import AdminTable, { type Column, type SelectionState } from './AdminTable'
import { getProductBadgeColor } from '../../lib/adminUtils'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'
import { useTableSort } from '../../hooks/useTableSort'
import { useBulkActions } from '../../hooks/useBulkActions'

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

const confirmDialog = (window as any).__confirmDialog as
  | ((opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>)
  | undefined

const sortFieldTypes = {
  title: 'string' as const,
  status: 'string' as const,
  updated_at: 'date' as const,
}

export default function ProductsTable({
  products: initialProducts,
  currentPage,
  totalPages,
  searchQuery,
  statusFilter,
}: Props) {
  const [products, setProducts] = useState(initialProducts)
  const { bulkLoading, bulkMessage, setBulkMessage, executeBulk } = useBulkActions()
  const { sortComparator } = useTableSort<Product>(sortFieldTypes)

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

  const handleBulkAction = async (action: string, selectedIds: ReadonlySet<number>, clearSelection: () => void) => {
    if (!action) return
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

      await executeBulk(async () => {
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
        if (fail === 0) {
          setBulkMessage({ type: 'success', text: `${success}件のアーカイブに成功しました` })
          setProducts(prev => prev.map(p => selectedIds.has(p.id) ? { ...p, status: 'archived' } : p))
          clearSelection()
        } else {
          setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
        }
      })
    }
  }

  const columns: Column<Product>[] = useMemo(() => [
    {
      id: 'title',
      header: t('admin.title'),
      sortable: true,
      cell: (p) => (
        <>
          <div className="font-medium text-zinc-950">{p.title}</div>
          {p.description && (
            <div className="text-xs text-zinc-500 truncate max-w-xs">{p.description}</div>
          )}
        </>
      ),
    },
    {
      id: 'status',
      header: t('admin.status'),
      sortable: true,
      cell: (p) => (
        <Badge color={getProductBadgeColor(p.status)}>
          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
        </Badge>
      ),
    },
    {
      id: 'updated_at',
      header: t('admin.updated'),
      sortable: true,
      className: 'text-zinc-500 tabular-nums',
      cell: (p) => new Date(p.updated_at).toLocaleDateString('ja-JP'),
    },
    {
      id: 'actions',
      header: t('admin.action'),
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/products/${p.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
            {t('common.edit')}
          </Link>
          {p.status !== 'archived' && (
            <Button
              plain
              onClick={() => handleArchive(p.id, p.title)}
              className="text-red-600 hover:text-red-800"
            >
              {t('admin.archive')}
            </Button>
          )}
          {p.status === 'archived' && (
            <Button
              plain
              onClick={() => handleRestore(p.id, p.title)}
              className="text-green-600 hover:text-green-800"
            >
              {t('admin.restore')}
            </Button>
          )}
        </div>
      ),
    },
  ], [])

  return (
    <AdminTable
      data={products}
      columns={columns}
      defaultSortField="updated_at"
      defaultSortOrder="desc"
      sortComparator={sortComparator}
      itemLabel={(p) => `${p.title} を選択`}
      renderBulkActions={({ selectedIds, clearSelection }: SelectionState) => (
        <>
          <select
            className="rounded-md border-gray-300 text-sm py-1.5 pl-3 pr-8 focus:border-indigo-500 focus:ring-indigo-500"
            defaultValue=""
            onChange={(e) => {
              const val = e.target.value
              e.target.value = ''
              handleBulkAction(val, selectedIds, clearSelection)
            }}
            disabled={bulkLoading}
          >
            <option value="" disabled>一括操作...</option>
            <option value="archive">一括アーカイブ</option>
          </select>
          {bulkLoading && (
            <span className="text-sm text-indigo-600 animate-pulse">処理中...</span>
          )}
        </>
      )}
      message={bulkMessage}
      pagination={{
        currentPage,
        totalPages,
        buildHref: (page) => `?page=${page}&q=${searchQuery}&status=${statusFilter}`,
      }}
      renderMobileCard={(product) => (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
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
      )}
      emptyState={
        <TableEmptyState
          icon="package"
          message={t('admin.emptyProducts')}
          description={t('admin.emptyProductsDesc')}
          actionLabel={t('admin.addFirstProduct')}
          actionHref="/admin/products/new"
        />
      }
      striped
    />
  )
}
