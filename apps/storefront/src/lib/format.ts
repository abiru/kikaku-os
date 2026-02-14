export const formatPrice = (amount: number, currency = 'JPY') =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: currency || 'JPY',
    minimumFractionDigits: 0,
  }).format(amount)

export const formatDate = (dateStr: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ja-JP', options)
}
