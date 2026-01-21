import { atom, computed } from 'nanostores';

export type CartItem = {
	variantId: number;
	productId: number;
	title: string;
	variantTitle: string;
	price: number;
	currency: string;
	quantity: number;
	taxRate?: number; // e.g., 0.10 for 10%
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

// Tax calculation helper (client-side, matches server logic)
const calculateItemTax = (price: number, quantity: number, taxRate: number) => {
	const totalIncludingTax = price * quantity;
	// Use integer arithmetic to avoid floating point precision issues
	const taxRatePercent = Math.round(taxRate * 100);
	const subtotal = Math.floor((totalIncludingTax * 100) / (100 + taxRatePercent));
	const taxAmount = totalIncludingTax - subtotal;
	return { subtotal, taxAmount };
};

// Computed: tax breakdown
export const $cartTaxBreakdown = computed($cartArray, (items) => {
	let totalSubtotal = 0;
	let totalTax = 0;

	items.forEach((item) => {
		const taxRate = item.taxRate || 0.10; // Default to 10% if not set
		const { subtotal, taxAmount } = calculateItemTax(item.price, item.quantity, taxRate);
		totalSubtotal += subtotal;
		totalTax += taxAmount;
	});

	return { subtotal: totalSubtotal, taxAmount: totalTax };
});

// Computed: cart subtotal (tax-exclusive)
export const $cartSubtotal = computed($cartTaxBreakdown, (breakdown) => breakdown.subtotal);

// Computed: cart tax amount
export const $cartTaxAmount = computed($cartTaxBreakdown, (breakdown) => breakdown.taxAmount);

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

// Shipping config store (fetched from API)
export type ShippingConfig = {
	shippingFee: number;
	freeShippingThreshold: number;
};

export const $shippingConfig = atom<ShippingConfig>({
	shippingFee: 500,
	freeShippingThreshold: 5000
});

export const $shippingFee = computed(
	[$cartTotal, $shippingConfig],
	(total, config) => (total >= config.freeShippingThreshold ? 0 : config.shippingFee)
);

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

export const setShippingConfig = (config: ShippingConfig) => {
	$shippingConfig.set(config);
};
