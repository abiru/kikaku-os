import { DATE_FORMATS, type DateFormatKey } from './constants'

export const formatPrice = (amount: number, currency = 'JPY') =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: currency || 'JPY',
    minimumFractionDigits: 0,
  }).format(amount)

export const formatDate = (dateStr: string | null, options?: DateFormatKey | Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '-'
  const resolved = typeof options === 'string' ? DATE_FORMATS[options] : options
  return new Date(dateStr).toLocaleDateString('ja-JP', resolved)
}
