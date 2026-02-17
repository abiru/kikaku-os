import { useState, useCallback, useMemo, Fragment, type ReactNode } from 'react'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import AdminPagination from './AdminPagination'
import SortIcon from './SortIcon'
import { t } from '../../i18n'

export type SortOrder = 'asc' | 'desc'

export type Column<T> = {
  id: string
  header: ReactNode
  cell: (item: T) => ReactNode
  sortable?: boolean
  className?: string
  headerClassName?: string
}

export type SelectionState = {
  selectedIds: ReadonlySet<number>
  someSelected: boolean
  allSelected: boolean
  clearSelection: () => void
}

type PaginationConfig = {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

type Props<T extends { id: number }> = {
  data: T[]
  columns: Column<T>[]
  defaultSortField?: string
  defaultSortOrder?: SortOrder
  sortComparator?: (a: T, b: T, field: string) => number
  selectable?: boolean
  itemLabel?: (item: T) => string
  renderBulkActions?: (selection: SelectionState) => ReactNode
  message?: { type: 'success' | 'error'; text: string } | null
  pagination?: PaginationConfig
  renderMobileCard?: (item: T) => ReactNode
  emptyState?: ReactNode
  rowHref?: (item: T) => string
  rowTitle?: (item: T) => string
  striped?: boolean
}

function MessageBanner({ message }: { message: { type: 'success' | 'error'; text: string } }) {
  return (
    <div
      className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
        message.type === 'success'
          ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-red-50 border-red-200 text-red-700'
      }`}
    >
      {message.text}
    </div>
  )
}

export default function AdminTable<T extends { id: number }>({
  data,
  columns,
  defaultSortField,
  defaultSortOrder = 'desc',
  sortComparator,
  selectable = true,
  itemLabel,
  renderBulkActions,
  message,
  pagination,
  renderMobileCard,
  emptyState,
  rowHref,
  rowTitle,
  striped = false,
}: Props<T>) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())
  const [sortField, setSortField] = useState(defaultSortField ?? '')
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder)

  const sortedData = useMemo(() => {
    if (!sortField || !sortComparator) return data
    return [...data].sort((a, b) => {
      const cmp = sortComparator(a, b, sortField)
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [data, sortField, sortOrder, sortComparator])

  const allIds = useMemo(() => sortedData.map((d) => d.id), [sortedData])
  const allSelected = sortedData.length > 0 && allIds.every((id) => selectedIds.has(id))
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

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleSort = useCallback((field: string) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortOrder('desc')
      return field
    })
  }, [])

  const selectionState: SelectionState = {
    selectedIds,
    someSelected,
    allSelected,
    clearSelection,
  }

  if (sortedData.length === 0 && emptyState) {
    return (
      <div>
        {message && <MessageBanner message={message} />}
        {emptyState}
      </div>
    )
  }

  return (
    <div>
      {someSelected && renderBulkActions && (
        <div className="mb-4 flex items-center gap-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
          <span className="text-sm font-medium text-indigo-900">
            {t('admin.selectedCount', { count: selectedIds.size })}
          </span>
          {renderBulkActions(selectionState)}
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-sm text-indigo-600 hover:text-indigo-800"
          >
            {t('admin.deselect')}
          </button>
        </div>
      )}

      {message && <MessageBanner message={message} />}

      {renderMobileCard && (
        <div className="block md:hidden space-y-3">
          {sortedData.map((item) => (
            <Fragment key={item.id}>{renderMobileCard(item)}</Fragment>
          ))}
        </div>
      )}

      <div className={renderMobileCard ? 'hidden md:block' : ''}>
        <Table striped={striped}>
          <TableHead>
            <TableRow>
              {selectable && (
                <TableHeader className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    aria-label={t('admin.selectAll')}
                  />
                </TableHeader>
              )}
              {columns.map((col) => (
                <TableHeader key={col.id} className={col.headerClassName}>
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.id)}
                      className="inline-flex items-center hover:text-indigo-600"
                    >
                      {col.header}
                      <SortIcon field={col.id} sortField={sortField} sortOrder={sortOrder} />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHeader>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow
                key={item.id}
                href={rowHref?.(item)}
                title={rowTitle?.(item)}
              >
                {selectable && (
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleOne(item.id)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label={
                        itemLabel
                          ? itemLabel(item)
                          : `ID ${item.id} を選択`
                      }
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell key={col.id} className={col.className}>
                    {col.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <AdminPagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          buildHref={pagination.buildHref}
        />
      )}
    </div>
  )
}
