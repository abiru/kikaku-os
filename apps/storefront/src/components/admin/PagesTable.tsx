import { useState } from 'react'
import { Badge } from '../catalyst/badge'
import { formatDate } from '../../lib/format'
import AdminTable, { type Column, type SelectionState } from './AdminTable'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'

type Page = {
  id: number
  slug: string
  title: string
  meta_title: string | null
  meta_description: string | null
  body: string
  status: string
  created_at: string
  updated_at: string
}

type Props = {
  pages: Page[]
  coreSlugs: string[]
}

const confirmDialog = (window as any).__confirmDialog as
  | ((opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => Promise<boolean>)
  | undefined

export default function PagesTable({ pages: initialPages, coreSlugs }: Props) {
  const [pages, setPages] = useState(initialPages)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const deletableIds = pages.filter((p) => !coreSlugs.includes(p.slug)).map((p) => p.id)

  const handleBulkDelete = async (selectedIds: ReadonlySet<number>, clearSelection: () => void) => {
    const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))
    if (selectedDeletable.length === 0) return

    const skipped = selectedIds.size - selectedDeletable.length
    const message = skipped > 0
      ? t('admin.confirm.deletePages', { count: selectedDeletable.length }) + '\n' + t('admin.confirm.corePagesSkipped', { count: skipped })
      : t('admin.confirm.deletePages', { count: selectedDeletable.length })

    const confirmed = confirmDialog
      ? await confirmDialog({
          title: t('admin.confirm.title'),
          message,
          confirmLabel: t('common.delete'),
          cancelLabel: t('common.cancel'),
          danger: true,
        })
      : window.confirm(message)
    if (!confirmed) return

    setBulkLoading(true)
    setBulkMessage(null)
    let success = 0
    let fail = 0

    for (const id of selectedDeletable) {
      try {
        const res = await fetch(`/api/admin/pages/${id}`, { method: 'DELETE' })
        if (res.ok) success++
        else fail++
      } catch {
        fail++
      }
    }

    setBulkLoading(false)
    if (fail === 0) {
      setBulkMessage({ type: 'success', text: `${success}件のページを削除しました` })
      setPages(prev => prev.filter(p => !selectedDeletable.includes(p.id)))
      clearSelection()
    } else {
      setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
    }
  }

  const columns: Column<Page>[] = [
    {
      id: 'title',
      header: 'Title',
      cell: (p) => (
        <>
          <div className="font-medium">{p.title}</div>
          {coreSlugs.includes(p.slug) && (
            <span className="text-xs text-zinc-500">Core page</span>
          )}
        </>
      ),
    },
    {
      id: 'slug',
      header: 'Slug',
      cell: (p) => (
        <code className="text-xs bg-zinc-100 px-2 py-1 rounded">/{p.slug}</code>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (p) => (
        p.status === 'published'
          ? <Badge color="lime">Published</Badge>
          : <Badge color="zinc">Draft</Badge>
      ),
    },
    {
      id: 'updated',
      header: 'Updated',
      className: 'text-zinc-500 tabular-nums',
      cell: (p) => formatDate(p.updated_at),
    },
    {
      id: 'action',
      header: 'Action',
      headerClassName: 'text-right',
      className: 'text-right',
      cell: (p) => (
        <a href={`/admin/pages/${p.id}`} className="text-indigo-600 hover:underline font-medium">Edit</a>
      ),
    },
  ]

  return (
    <AdminTable
      data={pages}
      columns={columns}
      itemLabel={(p) => `${p.title} を選択`}
      renderBulkActions={({ selectedIds, clearSelection }: SelectionState) => {
        const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))
        return (
          <>
            <button
              type="button"
              onClick={() => handleBulkDelete(selectedIds, clearSelection)}
              disabled={bulkLoading || selectedDeletable.length === 0}
              className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50"
            >
              一括削除
            </button>
            {bulkLoading && (
              <span className="text-sm text-indigo-600 animate-pulse">処理中...</span>
            )}
          </>
        )
      }}
      message={bulkMessage}
      rowHref={(p) => `/admin/pages/${p.id}`}
      emptyState={
        <TableEmptyState
          icon="file-text"
          message={t('admin.emptyPages')}
          description={t('admin.emptyPagesDesc')}
          actionLabel={t('admin.addFirstPage')}
          actionHref="/admin/pages/new"
        />
      }
    />
  )
}
