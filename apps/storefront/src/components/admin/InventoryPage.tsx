'use client'

import { useState } from 'react'
import InventoryTable from './InventoryTable'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Field, Label } from '../catalyst/fieldset'

type InventoryItem = {
  variant_id: number
  variant_title: string
  product_id: number
  product_title: string
  sku: string | null
  on_hand: number
  threshold: number | null
  status: 'ok' | 'low' | 'out'
}

type Props = {
  inventory: InventoryItem[]
}

export default function InventoryPage({ inventory }: Props) {
  const [adjustModal, setAdjustModal] = useState<{
    open: boolean
    variantId: number
    variantTitle: string
    productTitle: string
    onHand: number
  } | null>(null)
  const [thresholdModal, setThresholdModal] = useState<{
    open: boolean
    variantId: number
    variantTitle: string
    threshold: number | null
  } | null>(null)

  const [adjustType, setAdjustType] = useState('add')
  const [adjustQuantity, setAdjustQuantity] = useState('')
  const [adjustReason, setAdjustReason] = useState('restock')
  const [thresholdValue, setThresholdValue] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  const handleAdjust = (variantId: number, variantTitle: string, productTitle: string, onHand: number) => {
    setAdjustModal({ open: true, variantId, variantTitle, productTitle, onHand })
    setAdjustType('add')
    setAdjustQuantity('')
    setAdjustReason('restock')
    setAdjustError(null)
  }

  const handleThreshold = (variantId: number, variantTitle: string, threshold: number | null) => {
    setThresholdModal({ open: true, variantId, variantTitle, threshold })
    setThresholdValue(threshold?.toString() || '')
    setThresholdError(null)
  }

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustModal) return

    const quantity = parseInt(adjustQuantity, 10)
    if (isNaN(quantity) || quantity < 1) {
      setAdjustError('Please enter a valid quantity')
      return
    }

    const delta = adjustType === 'add' ? quantity : -quantity

    try {
      const res = await fetch(`/api/admin/inventory/movements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variant_id: adjustModal.variantId, delta, reason: adjustReason })
      })

      if (!res.ok) {
        const data = await res.json()
        setAdjustError(data.message || 'Failed to record movement')
        return
      }

      window.location.reload()
    } catch {
      setAdjustError('An error occurred. Please try again.')
    }
  }

  const submitThreshold = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!thresholdModal) return

    const threshold = parseInt(thresholdValue, 10)
    if (isNaN(threshold) || threshold < 0) {
      setThresholdError('Please enter a valid threshold (0 or greater)')
      return
    }

    try {
      const res = await fetch(`/api/admin/inventory/thresholds/${thresholdModal.variantId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threshold })
      })

      if (!res.ok) {
        const data = await res.json()
        setThresholdError(data.message || 'Failed to update threshold')
        return
      }

      window.location.reload()
    } catch {
      setThresholdError('An error occurred. Please try again.')
    }
  }

  return (
    <>
      <InventoryTable
        inventory={inventory}
        onAdjust={handleAdjust}
        onThreshold={handleThreshold}
      />

      {/* Adjustment Modal */}
      {adjustModal?.open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setAdjustModal(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-zinc-200">
            <div className="p-6 border-b border-zinc-200">
              <h3 className="text-lg font-semibold text-zinc-950">Adjust Stock</h3>
              <p className="text-sm text-zinc-500 mt-1">
                {adjustModal.productTitle} - {adjustModal.variantTitle}
              </p>
            </div>
            <form onSubmit={submitAdjust} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-950 mb-2">
                  Current Stock: <span className="font-semibold tabular-nums">{adjustModal.onHand}</span>
                </label>
              </div>

              <Field>
                <Label>Adjustment Type *</Label>
                <Select value={adjustType} onChange={(e) => setAdjustType(e.target.value)} required>
                  <option value="add">Add Stock</option>
                  <option value="remove">Remove Stock</option>
                </Select>
              </Field>

              <Field>
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  required
                  min="1"
                  step="1"
                  placeholder="Enter quantity"
                />
              </Field>

              <Field>
                <Label>Reason *</Label>
                <Select value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required>
                  <option value="restock">Restock</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="damaged">Damaged</option>
                  <option value="return">Return</option>
                  <option value="sale">Sale</option>
                  <option value="other">Other</option>
                </Select>
              </Field>

              {adjustError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {adjustError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" plain onClick={() => setAdjustModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" color="indigo">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Threshold Modal */}
      {thresholdModal?.open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setThresholdModal(null)}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-zinc-200">
            <div className="p-6 border-b border-zinc-200">
              <h3 className="text-lg font-semibold text-zinc-950">Set Threshold</h3>
              <p className="text-sm text-zinc-500 mt-1">{thresholdModal.variantTitle}</p>
            </div>
            <form onSubmit={submitThreshold} className="p-6 space-y-4">
              <Field>
                <Label>Low Stock Threshold</Label>
                <Input
                  type="number"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(e.target.value)}
                  required
                  min="0"
                  step="1"
                  placeholder="Enter threshold"
                />
                <p className="text-sm text-zinc-500 mt-1">Alert when stock falls below this number.</p>
              </Field>

              {thresholdError && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {thresholdError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" plain onClick={() => setThresholdModal(null)}>
                  Cancel
                </Button>
                <Button type="submit" color="indigo">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
