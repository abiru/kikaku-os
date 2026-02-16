import { useState, useCallback } from 'react'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { formatDate } from '../../lib/format'
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
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const deletablePages = pages.filter((p) => !coreSlugs.includes(p.slug))
  const deletableIds = deletablePages.map((p) => p.id)
  const allIds = pages.map((p) => p.id)
  const allSelected = pages.length > 0 && allIds.every((id) => selectedIds.has(id))
  const someSelected = selectedIds.size > 0
  const selectedDeletable = [...selectedIds].filter((id) => deletableIds.includes(id))

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

  const handleBulkDelete = async () => {
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
      setSelectedIds(new Set())
    } else {
      setBulkMessage({ type: 'error', text: `${success}件成功、${fail}件失敗しました` })
    }
  }

  return (
    <div>
      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-4 flex items-center gap-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <span className="text-sm font-medium text-indigo-900">
            {selectedIds.size}件選択中
          </span>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkLoading || selectedDeletable.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 disabled:opacity-50"
          >
            一括削除
          </button>
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

      <Table>
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
            <TableHeader>Title</TableHeader>
            <TableHeader>Slug</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Updated</TableHeader>
            <TableHeader className="text-right">Action</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pages.length > 0 ? (
            pages.map((p) => (
              <TableRow key={p.id} href={`/admin/pages/${p.id}`}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={`${p.title} を選択`}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{p.title}</div>
                  {coreSlugs.includes(p.slug) && (
                    <span className="text-xs text-zinc-500">Core page</span>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-zinc-100 px-2 py-1 rounded">/{p.slug}</code>
                </TableCell>
                <TableCell>
                  {p.status === 'published' ? (
                    <Badge color="lime">Published</Badge>
                  ) : (
                    <Badge color="zinc">Draft</Badge>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(p.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <a href={`/admin/pages/${p.id}`} className="text-indigo-600 hover:underline font-medium">Edit</a>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6}>
                <TableEmptyState
                  icon="file-text"
                  message={t('admin.emptyPages')}
                  description={t('admin.emptyPagesDesc')}
                  actionLabel={t('admin.addFirstPage')}
                  actionHref="/admin/pages/new"
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
