'use client'

import { useState } from 'react'
import ShippingTable from './ShippingTable'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Field, Label } from '../catalyst/fieldset'

type ReadyToShipOrder = {
  order_id: number
  customer_email: string | null
  total: number
  paid_at: string | null
  fulfillment_id: number | null
  fulfillment_status: string | null
}

type Props = {
  orders: ReadyToShipOrder[]
  apiBase: string
  apiKey: string
}

export default function ShippingPage({ orders, apiBase, apiKey }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{ orderId: number; fulfillmentId: number | null } | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleShipClick = (orderId: number, fulfillmentId: number | null) => {
    setSelectedOrder({ orderId, fulfillmentId })
    setTrackingNumber('')
    setError(null)
    setIsModalOpen(true)
  }

  const handleClose = () => {
    setIsModalOpen(false)
    setSelectedOrder(null)
    setTrackingNumber('')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrder) return

    setIsSubmitting(true)
    setError(null)

    try {
      let res: Response
      const tracking_number = trackingNumber.trim() || null

      if (selectedOrder.fulfillmentId) {
        res = await fetch(`${apiBase}/admin/fulfillments/${selectedOrder.fulfillmentId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': apiKey
          },
          body: JSON.stringify({ status: 'shipped', tracking_number })
        })
      } else {
        res = await fetch(`${apiBase}/admin/orders/${selectedOrder.orderId}/fulfillments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': apiKey
          },
          body: JSON.stringify({ status: 'shipped', tracking_number })
        })
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Failed to update shipping status')
        return
      }

      window.location.reload()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="bg-white">
        <div className="overflow-x-auto">
          <ShippingTable orders={orders} onShipClick={handleShipClick} />
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-zinc-200">
            <div className="p-6 border-b border-zinc-200">
              <h3 className="text-lg font-semibold text-zinc-950">Ship Order</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Order #{selectedOrder?.orderId}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Field>
                <Label>Tracking Number</Label>
                <Input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Optional tracking number"
                />
              </Field>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" plain onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" color="indigo" disabled={isSubmitting}>
                  {isSubmitting ? 'Shipping...' : 'Mark as Shipped'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
