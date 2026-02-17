import { useState, useCallback } from 'react'

export type SelectionActions = {
  selectedIds: ReadonlySet<number>
  someSelected: boolean
  toggleAll: (allIds: readonly number[]) => void
  toggleOne: (id: number) => void
  clearSelection: () => void
}

export function useTableSelection(): SelectionActions {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())

  const toggleAll = useCallback((allIds: readonly number[]) => {
    setSelectedIds((prev) => {
      const allCurrentlySelected = allIds.length > 0 && allIds.every((id) => prev.has(id))
      return allCurrentlySelected ? new Set() : new Set(allIds)
    })
  }, [])

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

  return {
    selectedIds,
    someSelected: selectedIds.size > 0,
    toggleAll,
    toggleOne,
    clearSelection,
  }
}
