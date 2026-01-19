import { persistentMap } from '@nanostores/persistent';
import { computed } from 'nanostores';

export type CartItem = {
	variantId: number;
	productId: number;
	title: string;
	variantTitle: string;
	price: number;
	currency: string;
	quantity: number;
};

// Cart items stored by variantId as key
export const $cartItems = persistentMap<Record<string, CartItem>>('cart:', {});

// Computed: array of cart items
export const $cartArray = computed($cartItems, (items) => Object.values(items));

// Computed: total item count
export const $cartCount = computed($cartArray, (items) =>
	items.reduce((sum, item) => sum + item.quantity, 0)
);

// Computed: total price
export const $cartTotal = computed($cartArray, (items) =>
	items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

// Computed: cart currency (from first item or default)
export const $cartCurrency = computed($cartArray, (items) =>
	items[0]?.currency || 'JPY'
);

export const addToCart = (
	item: Omit<CartItem, 'quantity'>,
	quantity: number = 1
) => {
	const key = String(item.variantId);
	const existing = $cartItems.get()[key];

	if (existing) {
		$cartItems.setKey(key, {
			...existing,
			quantity: existing.quantity + quantity
		});
	} else {
		$cartItems.setKey(key, { ...item, quantity });
	}
};

export const removeFromCart = (variantId: number) => {
	const key = String(variantId);
	const current = $cartItems.get();
	const { [key]: _, ...rest } = current;
	// Reset the entire map to remove the key
	Object.keys(current).forEach((k) => {
		if (k !== key) return;
		$cartItems.setKey(k, undefined as unknown as CartItem);
	});
	// Workaround: persistentMap doesn't support delete, so we rebuild
	clearCart();
	Object.values(rest).forEach((item) => {
		$cartItems.setKey(String(item.variantId), item);
	});
};

export const updateQuantity = (variantId: number, quantity: number) => {
	const key = String(variantId);
	const existing = $cartItems.get()[key];

	if (!existing) return;

	if (quantity <= 0) {
		removeFromCart(variantId);
	} else {
		$cartItems.setKey(key, { ...existing, quantity });
	}
};

export const clearCart = () => {
	const keys = Object.keys($cartItems.get());
	keys.forEach((key) => {
		$cartItems.setKey(key, undefined as unknown as CartItem);
	});
};

export const getCartItems = (): CartItem[] => {
	return Object.values($cartItems.get()).filter(Boolean);
};

export const getCartTotal = (): number => {
	return getCartItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
};

export const getCartCount = (): number => {
	return getCartItems().reduce((sum, item) => sum + item.quantity, 0);
};
