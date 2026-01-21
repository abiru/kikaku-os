import { atom, computed } from 'nanostores';

export type CartItem = {
	variantId: number;
	productId: number;
	title: string;
	variantTitle: string;
	price: number;
	currency: string;
	quantity: number;
};

type CartState = Record<string, CartItem>;

const STORAGE_KEY = 'led-kikaku-cart';

const isValidCartItem = (item: unknown): item is CartItem => {
	if (!item || typeof item !== 'object') return false;
	const i = item as Record<string, unknown>;
	return (
		typeof i.variantId === 'number' &&
		!isNaN(i.variantId) &&
		typeof i.productId === 'number' &&
		typeof i.title === 'string' &&
		typeof i.price === 'number' &&
		!isNaN(i.price) &&
		typeof i.quantity === 'number'
	);
};

// Load cart from localStorage
const loadCart = (): CartState => {
	if (typeof localStorage === 'undefined') return {};
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return {};
		const parsed = JSON.parse(stored);
		if (typeof parsed !== 'object' || parsed === null) return {};
		const valid: CartState = {};
		Object.entries(parsed).forEach(([key, item]) => {
			if (isValidCartItem(item)) {
				valid[key] = item as CartItem;
			}
		});
		return valid;
	} catch {
		return {};
	}
};

// Save cart to localStorage
const saveCart = (state: CartState) => {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage errors
	}
};

// Main cart store
export const $cartItems = atom<CartState>(loadCart());

// Save on every change
$cartItems.listen((state) => {
	saveCart(state);
});

// Computed: array of cart items
export const $cartArray = computed($cartItems, (items) =>
	Object.values(items).filter(isValidCartItem)
);

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
	const current = $cartItems.get();
	const existing = current[key];

	const newState = existing
		? { ...current, [key]: { ...existing, quantity: existing.quantity + quantity } }
		: { ...current, [key]: { ...item, quantity } };

	$cartItems.set(newState);
};

export const removeFromCart = (variantId: number) => {
	const key = String(variantId);
	const current = $cartItems.get();
	const { [key]: _, ...rest } = current;
	$cartItems.set(rest);
};

export const updateQuantity = (variantId: number, quantity: number) => {
	if (quantity <= 0) {
		removeFromCart(variantId);
		return;
	}

	const key = String(variantId);
	const current = $cartItems.get();
	const existing = current[key];
	if (!existing) return;

	$cartItems.set({ ...current, [key]: { ...existing, quantity } });
};

export const clearCart = () => {
	$cartItems.set({});
};

export const getCartItems = (): CartItem[] => {
	return Object.values($cartItems.get()).filter(isValidCartItem);
};

export const getCartTotal = (): number => {
	return getCartItems().reduce((sum, item) => sum + item.price * item.quantity, 0);
};

export const getCartCount = (): number => {
	return getCartItems().reduce((sum, item) => sum + item.quantity, 0);
};

// Coupon types and stores
export type AppliedCoupon = {
	code: string;
	type: 'percentage' | 'fixed';
	value: number;
	discountAmount: number;
};

export const $appliedCoupon = atom<AppliedCoupon | null>(null);

export const $cartDiscount = computed($appliedCoupon, (coupon) => coupon?.discountAmount || 0);

export const $shippingFee = computed($cartTotal, (total) => {
	const FREE_SHIPPING_THRESHOLD = 5000;
	const SHIPPING_FEE = 500;
	return total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
});

export const $cartGrandTotal = computed(
	[$cartTotal, $cartDiscount, $shippingFee],
	(total, discount, shipping) => total - discount + shipping
);

export const applyCoupon = (coupon: AppliedCoupon) => {
	$appliedCoupon.set(coupon);
};

export const removeCoupon = () => {
	$appliedCoupon.set(null);
};
