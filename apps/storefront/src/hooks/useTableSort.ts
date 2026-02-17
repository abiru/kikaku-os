import { useCallback } from 'react'

type FieldType = 'string' | 'number' | 'date'
type SortFieldConfig = Record<string, FieldType>

/**
 * Creates a memoized sort comparator from field type definitions.
 * Date fields use direct string comparison on ISO 8601 strings
 * instead of creating Date objects per comparison call.
 */
export function useTableSort<T extends Record<string, unknown>>(
  fieldTypes: SortFieldConfig,
): { sortComparator: (a: T, b: T, field: string) => number } {
  const sortComparator = useCallback(
    (a: T, b: T, field: string): number => {
      const type = fieldTypes[field]
      if (!type) return 0

      const valA = a[field]
      const valB = b[field]

      switch (type) {
        case 'string':
          return String(valA ?? '').localeCompare(String(valB ?? ''))
        case 'number':
          return (Number(valA) || 0) - (Number(valB) || 0)
        case 'date': {
          const dateA = String(valA ?? '')
          const dateB = String(valB ?? '')
          if (dateA < dateB) return -1
          if (dateA > dateB) return 1
          return 0
        }
        default:
          return 0
      }
    },
    // fieldTypes is a static config object — safe to depend on reference
    [fieldTypes],
  )

  return { sortComparator }
}
