// Shared admin utility functions
// Badge color types matching catalyst Badge component

type BadgeColor = 'lime' | 'amber' | 'red' | 'zinc' | 'blue' | 'green' | 'yellow'

// Inquiry status
export const getInquiryBadgeColor = (status: string): BadgeColor => {
  switch (status) {
    case 'open': return 'amber'
    case 'replied': return 'lime'
    case 'closed': return 'zinc'
    default: return 'zinc'
  }
}

export const getInquiryStatusLabel = (status: string): string => {
  switch (status) {
    case 'open': return '未対応'
    case 'replied': return '返信済み'
    case 'closed': return 'クローズ'
    default: return status
  }
}

// Order payment status
export const getOrderBadgeColor = (status: string): BadgeColor => {
  switch (status) {
    case 'paid': return 'lime'
    case 'pending': return 'amber'
    case 'refunded': return 'red'
    default: return 'zinc'
  }
}

// Event processing status
export const getEventBadgeColor = (status: string): BadgeColor => {
  switch (status) {
    case 'completed': return 'lime'
    case 'pending': return 'amber'
    case 'failed': return 'red'
    default: return 'zinc'
  }
}

// Review status
export const getReviewBadgeColor = (status: string): BadgeColor => {
  const colors: Record<string, BadgeColor> = {
    pending: 'amber',
    approved: 'lime',
    rejected: 'red',
  }
  return colors[status] || 'zinc'
}

// Inventory status
export const getInventoryBadgeColor = (status: string): BadgeColor => {
  switch (status) {
    case 'ok': return 'lime'
    case 'low': return 'amber'
    case 'out': return 'red'
    default: return 'zinc'
  }
}

export const getInventoryStatusLabel = (status: string): string => {
  switch (status) {
    case 'ok': return 'OK'
    case 'low': return 'Low'
    case 'out': return 'Out'
    default: return status
  }
}

// Product status
export const getProductBadgeColor = (status: string): BadgeColor => {
  switch (status) {
    case 'active': return 'lime'
    case 'draft': return 'zinc'
    case 'archived': return 'red'
    default: return 'zinc'
  }
}
