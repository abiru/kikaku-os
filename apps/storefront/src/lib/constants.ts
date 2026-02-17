export const DATE_FORMATS = {
  DATE_SHORT: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
  DATE_LONG: {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
  DATE_MONTH_SHORT: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
  DATETIME: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  },
  DATETIME_LONG: {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
  DATETIME_SECONDS: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

export type DateFormatKey = keyof typeof DATE_FORMATS

/**
 * 配送業者の追跡 URL テンプレート
 * `{{trackingNumber}}` がエンコード済みの追跡番号に置換される
 */
export const CARRIER_TRACKING_URLS: Record<string, string> = {
  'ヤマト運輸':
    'https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number={{trackingNumber}}',
  '佐川急便':
    'https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={{trackingNumber}}',
  '日本郵便':
    'https://trackings.post.japanpost.jp/services/srv/search/?requestNo1={{trackingNumber}}',
}
