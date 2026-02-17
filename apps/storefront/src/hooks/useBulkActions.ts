import { useState, useCallback } from 'react'

export type BulkMessage = { type: 'success' | 'error'; text: string } | null

export type BulkActions = {
  bulkLoading: boolean
  bulkMessage: BulkMessage
  setBulkMessage: (msg: BulkMessage) => void
  executeBulk: <R>(fn: () => Promise<R>) => Promise<R>
}

export function useBulkActions(): BulkActions {
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<BulkMessage>(null)

  const executeBulk = useCallback(async <R>(fn: () => Promise<R>): Promise<R> => {
    setBulkLoading(true)
    setBulkMessage(null)
    try {
      return await fn()
    } finally {
      setBulkLoading(false)
    }
  }, [])

  return { bulkLoading, bulkMessage, setBulkMessage, executeBulk }
}
