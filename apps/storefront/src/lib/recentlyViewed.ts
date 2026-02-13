import { atom, computed } from 'nanostores';

export type RecentlyViewedItem = {
	id: number;
	name: string;
	image: string | null;
	price: number;
	currency: string;
	viewedAt: number;
};

const MAX_ITEMS = 10;
const STORAGE_KEY = 'led-kikaku-recently-viewed';

const isValidItem = (item: unknown): item is RecentlyViewedItem => {
	if (!item || typeof item !== 'object') return false;
	const i = item as Record<string, unknown>;
	return (
		typeof i.id === 'number' &&
		!isNaN(i.id) &&
		typeof i.name === 'string' &&
		typeof i.price === 'number' &&
		!isNaN(i.price) &&
		typeof i.viewedAt === 'number'
	);
};

const loadRecentlyViewed = (): RecentlyViewedItem[] => {
	if (typeof localStorage === 'undefined') return [];
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isValidItem).slice(0, MAX_ITEMS);
	} catch {
		return [];
	}
};

const saveRecentlyViewed = (items: readonly RecentlyViewedItem[]) => {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
	} catch {
		// Ignore storage errors
	}
};

export const $recentlyViewed = atom<RecentlyViewedItem[]>(loadRecentlyViewed());

$recentlyViewed.listen((items) => {
	saveRecentlyViewed(items);
});

export const $recentlyViewedList = computed($recentlyViewed, (items): RecentlyViewedItem[] =>
	[...items].sort((a, b) => b.viewedAt - a.viewedAt)
);

export const addToRecentlyViewed = (product: Omit<RecentlyViewedItem, 'viewedAt'>) => {
	const current = $recentlyViewed.get();
	const filtered = current.filter((item) => item.id !== product.id);
	const updated = [{ ...product, viewedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
	$recentlyViewed.set(updated);
};

export const getRecentlyViewed = (): RecentlyViewedItem[] => {
	return $recentlyViewedList.get();
};
