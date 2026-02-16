import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}(${JSON.stringify(params)})`
      return key
    },
  }),
}))

vi.mock('../lib/format', () => ({
  formatPrice: (amount: number, currency: string) => `${currency} ${amount}`,
}))

const { mockRemoveFromWishlist, mockAddToCart, mockWishlistGet } = vi.hoisted(() => ({
  mockRemoveFromWishlist: vi.fn(),
  mockAddToCart: vi.fn(),
  mockWishlistGet: vi.fn(() => []),
}))

vi.mock('../lib/wishlist', () => ({
  $wishlistArray: { subscribe: vi.fn(), get: mockWishlistGet },
  removeFromWishlist: mockRemoveFromWishlist,
}))

vi.mock('../lib/cart', () => ({
  addToCart: mockAddToCart,
}))

vi.mock('@nanostores/react', () => ({
  useStore: (store: { get: () => unknown }) => store.get(),
}))

import WishlistPage from './WishlistPage'

const mockItems = [
  {
    productId: 1,
    variantId: 10,
    title: 'Test Product',
    variantTitle: 'Large',
    price: 3000,
    currency: 'JPY',
    taxRate: 10,
    imageUrl: '/img/product.jpg',
  },
  {
    productId: 2,
    variantId: null,
    title: 'No Variant Product',
    variantTitle: null,
    price: 1500,
    currency: 'JPY',
    taxRate: 10,
    imageUrl: null,
  },
]

describe('WishlistPage', () => {
  it('renders empty state when no items', () => {
    mockWishlistGet.mockReturnValue([])
    render(<WishlistPage />)
    expect(screen.getByText('wishlist.empty')).toBeDefined()
    expect(screen.getByText('wishlist.browseProducts')).toBeDefined()
  })

  it('renders wishlist items with product titles', () => {
    mockWishlistGet.mockReturnValue(mockItems)
    render(<WishlistPage />)
    expect(screen.getByText('Test Product')).toBeDefined()
    expect(screen.getByText('No Variant Product')).toBeDefined()
  })

  it('renders item count', () => {
    mockWishlistGet.mockReturnValue(mockItems)
    render(<WishlistPage />)
    expect(screen.getByText(/wishlist\.itemCount/)).toBeDefined()
  })

  it('shows add to cart button for items with variants', () => {
    mockWishlistGet.mockReturnValue([mockItems[0]])
    render(<WishlistPage />)
    expect(screen.getByText('wishlist.addToCart')).toBeDefined()
  })

  it('shows view product link for items without variants', () => {
    mockWishlistGet.mockReturnValue([mockItems[1]])
    render(<WishlistPage />)
    expect(screen.getByText('wishlist.viewProduct')).toBeDefined()
  })

  it('calls addToCart when add to cart clicked', () => {
    mockWishlistGet.mockReturnValue([mockItems[0]])
    render(<WishlistPage />)
    fireEvent.click(screen.getByText('wishlist.addToCart'))
    expect(mockAddToCart).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 10,
      productId: 1,
      title: 'Test Product',
    }))
  })

  it('shows variant title when not Default', () => {
    mockWishlistGet.mockReturnValue([mockItems[0]])
    render(<WishlistPage />)
    expect(screen.getByText('Large')).toBeDefined()
  })

  it('renders continue shopping link', () => {
    mockWishlistGet.mockReturnValue(mockItems)
    render(<WishlistPage />)
    const link = screen.getByText('wishlist.continueShopping')
    expect(link.closest('a')?.getAttribute('href')).toBe('/products')
  })
})
