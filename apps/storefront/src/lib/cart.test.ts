import { describe, expect, it, beforeEach } from 'vitest';
import {
  $cartItems,
  $cartArray,
  $cartCount,
  $cartTotal,
  $cartCurrency,
  $cartSubtotal,
  $cartTaxAmount,
  $cartDiscount,
  $shippingFee,
  $cartGrandTotal,
  $appliedCoupon,
  $shippingConfig,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  getCartItems,
  getCartTotal,
  getCartCount,
  applyCoupon,
  removeCoupon,
  setShippingConfig,
} from './cart';

const sampleItem = {
  variantId: 1,
  productId: 100,
  title: 'Test Product',
  variantTitle: 'Default',
  price: 1000,
  currency: 'JPY',
  taxRate: 0.10,
};

describe('cart', () => {
  beforeEach(() => {
    clearCart();
    removeCoupon();
    setShippingConfig({ shippingFee: 500, freeShippingThreshold: 5000 });
  });

  describe('addToCart', () => {
    it('adds a new item with default quantity 1', () => {
      addToCart(sampleItem);
      const items = $cartArray.get();
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(1);
      expect(items[0].title).toBe('Test Product');
    });

    it('adds with specified quantity', () => {
      addToCart(sampleItem, 3);
      expect($cartArray.get()[0].quantity).toBe(3);
    });

    it('increments quantity for existing variant', () => {
      addToCart(sampleItem, 2);
      addToCart(sampleItem, 3);
      expect($cartArray.get()[0].quantity).toBe(5);
    });

    it('adds different variants separately', () => {
      addToCart(sampleItem);
      addToCart({ ...sampleItem, variantId: 2, variantTitle: 'Large' });
      expect($cartArray.get()).toHaveLength(2);
    });
  });

  describe('removeFromCart', () => {
    it('removes an item by variantId', () => {
      addToCart(sampleItem);
      removeFromCart(1);
      expect($cartArray.get()).toHaveLength(0);
    });

    it('does nothing for non-existent variantId', () => {
      addToCart(sampleItem);
      removeFromCart(999);
      expect($cartArray.get()).toHaveLength(1);
    });
  });

  describe('updateQuantity', () => {
    it('updates quantity of existing item', () => {
      addToCart(sampleItem, 2);
      updateQuantity(1, 5);
      expect($cartArray.get()[0].quantity).toBe(5);
    });

    it('removes item when quantity is 0 or negative', () => {
      addToCart(sampleItem, 2);
      updateQuantity(1, 0);
      expect($cartArray.get()).toHaveLength(0);
    });

    it('does nothing for non-existent variantId', () => {
      addToCart(sampleItem);
      updateQuantity(999, 5);
      expect($cartArray.get()).toHaveLength(1);
      expect($cartArray.get()[0].quantity).toBe(1);
    });
  });

  describe('clearCart', () => {
    it('removes all items', () => {
      addToCart(sampleItem);
      addToCart({ ...sampleItem, variantId: 2 });
      clearCart();
      expect($cartArray.get()).toHaveLength(0);
    });
  });

  describe('computed values', () => {
    it('computes cart count', () => {
      addToCart(sampleItem, 2);
      addToCart({ ...sampleItem, variantId: 2 }, 3);
      expect($cartCount.get()).toBe(5);
    });

    it('computes cart total', () => {
      addToCart(sampleItem, 2);
      expect($cartTotal.get()).toBe(2000);
    });

    it('computes currency from first item', () => {
      addToCart(sampleItem);
      expect($cartCurrency.get()).toBe('JPY');
    });

    it('defaults currency to JPY when empty', () => {
      expect($cartCurrency.get()).toBe('JPY');
    });

    it('computes tax breakdown with 10% rate', () => {
      addToCart({ ...sampleItem, price: 1100, taxRate: 0.10 }, 1);
      const subtotal = $cartSubtotal.get();
      const tax = $cartTaxAmount.get();
      expect(subtotal + tax).toBe(1100);
      expect(tax).toBeGreaterThan(0);
    });
  });

  describe('coupon', () => {
    it('applies and removes coupon', () => {
      applyCoupon({ code: 'TEST10', type: 'percentage', value: 10, discountAmount: 100 });
      expect($cartDiscount.get()).toBe(100);
      expect($appliedCoupon.get()?.code).toBe('TEST10');

      removeCoupon();
      expect($cartDiscount.get()).toBe(0);
      expect($appliedCoupon.get()).toBeNull();
    });
  });

  describe('shipping', () => {
    it('charges shipping below threshold', () => {
      addToCart({ ...sampleItem, price: 1000 }, 1);
      expect($shippingFee.get()).toBe(500);
    });

    it('free shipping at or above threshold', () => {
      addToCart({ ...sampleItem, price: 5000 }, 1);
      expect($shippingFee.get()).toBe(0);
    });

    it('updates shipping config', () => {
      setShippingConfig({ shippingFee: 800, freeShippingThreshold: 10000 });
      expect($shippingConfig.get().shippingFee).toBe(800);
    });
  });

  describe('grand total', () => {
    it('computes total + shipping - discount', () => {
      addToCart({ ...sampleItem, price: 2000 }, 1);
      applyCoupon({ code: 'OFF', type: 'fixed', value: 200, discountAmount: 200 });
      // total=2000, discount=200, shipping=500 (below threshold)
      expect($cartGrandTotal.get()).toBe(2300);
    });
  });

  describe('helper functions', () => {
    it('getCartItems returns array', () => {
      addToCart(sampleItem);
      expect(getCartItems()).toHaveLength(1);
    });

    it('getCartTotal sums prices', () => {
      addToCart(sampleItem, 3);
      expect(getCartTotal()).toBe(3000);
    });

    it('getCartCount sums quantities', () => {
      addToCart(sampleItem, 3);
      expect(getCartCount()).toBe(3);
    });
  });
});
