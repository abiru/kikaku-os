import { atom, computed } from 'nanostores';

export type WishlistItem = {
	productId: number;
	title: string;
	price: number;
	currency: string;
	taxRate?: number;
	imageUrl?: string;
	variantId?: number;
	variantTitle?: string;
	addedAt: number;
};

type WishlistState = Record<string, WishlistItem>;

const STORAGE_KEY = 'led-kikaku-wishlist';

const isValidWishlistItem = (item: unknown): item is WishlistItem => {
	if (!item || typeof item !== 'object') return false;
	const i = item as Record<string, unknown>;
	return (
		typeof i.productId === 'number' &&
		!isNaN(i.productId) &&
		typeof i.title === 'string' &&
		typeof i.price === 'number' &&
		!isNaN(i.price) &&
		typeof i.addedAt === 'number'
	);
};

const loadWishlist = (): WishlistState => {
	if (typeof localStorage === 'undefined') return {};
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return {};
		const parsed = JSON.parse(stored);
		if (typeof parsed !== 'object' || parsed === null) return {};
		const valid: WishlistState = {};
		Object.entries(parsed).forEach(([key, item]) => {
			if (isValidWishlistItem(item)) {
				valid[key] = item as WishlistItem;
			}
		});
		return valid;
	} catch {
		return {};
	}
};

const saveWishlist = (state: WishlistState) => {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Ignore storage errors
	}
};

export const $wishlistItems = atom<WishlistState>(loadWishlist());

$wishlistItems.listen((state) => {
	saveWishlist(state);
});

export const $wishlistArray = computed($wishlistItems, (items) =>
	Object.values(items)
		.filter(isValidWishlistItem)
		.sort((a, b) => b.addedAt - a.addedAt)
);

export const $wishlistCount = computed($wishlistArray, (items) => items.length);

export const addToWishlist = (item: Omit<WishlistItem, 'addedAt'>) => {
	const key = String(item.productId);
	const current = $wishlistItems.get();
	if (current[key]) return;
	$wishlistItems.set({ ...current, [key]: { ...item, addedAt: Date.now() } });
};

export const removeFromWishlist = (productId: number) => {
	const key = String(productId);
	const current = $wishlistItems.get();
	const { [key]: _, ...rest } = current;
	$wishlistItems.set(rest);
};

export const isInWishlist = (productId: number): boolean => {
	const key = String(productId);
	return !!$wishlistItems.get()[key];
};

export const toggleWishlist = (item: Omit<WishlistItem, 'addedAt'>) => {
	if (isInWishlist(item.productId)) {
		removeFromWishlist(item.productId);
	} else {
		addToWishlist(item);
	}
};
