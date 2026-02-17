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
