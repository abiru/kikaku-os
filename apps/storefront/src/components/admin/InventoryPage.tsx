'use client'

import { useState } from 'react'
import InventoryTable from './InventoryTable'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Field, Label } from '../catalyst/fieldset'
import { Dialog, DialogTitle, DialogDescription, DialogBody, DialogActions } from '../catalyst/dialog'

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

const getInventoryStatus = (onHand: number, threshold: number | null): 'ok' | 'low' | 'out' => {
  if (onHand <= 0) return 'out'
  if (threshold !== null && onHand <= threshold) return 'low'
  return 'ok'
}

export default function InventoryPage({ inventory: initialInventory }: Props) {
  const [inventory, setInventory] = useState(initialInventory)
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

  const closeAdjustModal = () => {
    setAdjustModal(null)
  }

  const closeThresholdModal = () => {
    setThresholdModal(null)
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

      setInventory(prev => prev.map(item =>
        item.variant_id === adjustModal.variantId
          ? { ...item, on_hand: item.on_hand + delta, status: getInventoryStatus(item.on_hand + delta, item.threshold) }
          : item
      ))
      closeAdjustModal()
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

      setInventory(prev => prev.map(item =>
        item.variant_id === thresholdModal.variantId
          ? { ...item, threshold, status: getInventoryStatus(item.on_hand, threshold) }
          : item
      ))
      closeThresholdModal()
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
      <Dialog open={adjustModal?.open ?? false} onClose={closeAdjustModal} size="md">
        <DialogTitle>Adjust Stock</DialogTitle>
        <DialogDescription>
          {adjustModal?.productTitle} - {adjustModal?.variantTitle}
        </DialogDescription>
        <DialogBody>
          <form id="adjust-form" onSubmit={submitAdjust} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-950 mb-2">
                Current Stock: <span className="font-semibold tabular-nums">{adjustModal?.onHand}</span>
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
          </form>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={closeAdjustModal}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" color="indigo">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Threshold Modal */}
      <Dialog open={thresholdModal?.open ?? false} onClose={closeThresholdModal} size="md">
        <DialogTitle>Set Threshold</DialogTitle>
        <DialogDescription>{thresholdModal?.variantTitle}</DialogDescription>
        <DialogBody>
          <form id="threshold-form" onSubmit={submitThreshold} className="space-y-4">
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
          </form>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={closeThresholdModal}>
            Cancel
          </Button>
          <Button type="submit" form="threshold-form" color="indigo">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
