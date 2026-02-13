'use client'

import { useState } from 'react'
import ShippingTable from './ShippingTable'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Select } from '../catalyst/select'
import { Field, Label } from '../catalyst/fieldset'

const CARRIERS = [
  { value: '', label: '選択してください' },
  { value: 'ヤマト運輸', label: 'ヤマト運輸' },
  { value: '佐川急便', label: '佐川急便' },
  { value: '日本郵便', label: '日本郵便' },
  { value: 'other', label: 'その他' },
] as const

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
}

export default function ShippingPage({ orders }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{ orderId: number; fulfillmentId: number | null } | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrierSelect, setCarrierSelect] = useState('')
  const [customCarrier, setCustomCarrier] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleShipClick = (orderId: number, fulfillmentId: number | null) => {
    setSelectedOrder({ orderId, fulfillmentId })
    setTrackingNumber('')
    setCarrierSelect('')
    setCustomCarrier('')
    setError(null)
    setIsModalOpen(true)
  }

  const handleClose = () => {
    setIsModalOpen(false)
    setSelectedOrder(null)
    setTrackingNumber('')
    setCarrierSelect('')
    setCustomCarrier('')
    setError(null)
  }

  const getCarrierName = (): string | null => {
    if (carrierSelect === 'other') return customCarrier.trim() || null
    return carrierSelect || null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrder) return

    setIsSubmitting(true)
    setError(null)

    try {
      let res: Response
      const tracking_number = trackingNumber.trim() || null
      const carrier = getCarrierName()

      const body = JSON.stringify({ status: 'shipped', tracking_number, carrier })

      if (selectedOrder.fulfillmentId) {
        res = await fetch(`/api/admin/fulfillments/${selectedOrder.fulfillmentId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body
        })
      } else {
        res = await fetch(`/api/admin/orders/${selectedOrder.orderId}/fulfillments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body
        })
      }

      if (!res.ok) {
        const data = await res.json()
        setError(data.message || '発送ステータスの更新に失敗しました')
        return
      }

      window.location.reload()
    } catch {
      setError('エラーが発生しました。もう一度お試しください。')
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
              <h3 className="text-lg font-semibold text-zinc-950">出荷処理</h3>
              <p className="text-sm text-zinc-500 mt-1">
                注文 #{selectedOrder?.orderId}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Field>
                <Label>配送業者</Label>
                <Select
                  value={carrierSelect}
                  onChange={(e) => setCarrierSelect(e.target.value)}
                >
                  {CARRIERS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </Field>

              {carrierSelect === 'other' && (
                <Field>
                  <Label>配送業者名</Label>
                  <Input
                    type="text"
                    value={customCarrier}
                    onChange={(e) => setCustomCarrier(e.target.value)}
                    placeholder="配送業者名を入力"
                  />
                </Field>
              )}

              <Field>
                <Label>追跡番号</Label>
                <Input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="追跡番号を入力（任意）"
                />
              </Field>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
                <Button type="button" plain onClick={handleClose}>
                  キャンセル
                </Button>
                <Button type="submit" color="indigo" disabled={isSubmitting}>
                  {isSubmitting ? '処理中...' : '発送済みにする'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
