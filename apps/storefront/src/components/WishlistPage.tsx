import { useStore } from '@nanostores/react';
import { $wishlistArray, removeFromWishlist } from '../lib/wishlist';
import { addToCart } from '../lib/cart';
import { useTranslation } from '../i18n';
import { useState } from 'react';
import { formatPrice } from '../lib/format';

function EmptyWishlist() {
	const { t } = useTranslation();
	return (
		<div className="text-center py-16">
			<svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
				<path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
			</svg>
			<h2 className="mt-4 text-lg font-medium text-gray-900">{t('wishlist.empty')}</h2>
			<p className="mt-2 text-sm text-gray-500">{t('wishlist.emptyDescription')}</p>
			<div className="mt-6">
				<a href="/products" className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
					{t('wishlist.browseProducts')}
				</a>
			</div>
		</div>
	);
}

function WishlistItem({ item }: { item: typeof $wishlistArray extends { get(): (infer T)[] } ? T : never }) {
	const { t } = useTranslation();
	const [addedToCart, setAddedToCart] = useState(false);

	const handleAddToCart = () => {
		if (!item.variantId) return;
		addToCart({
			variantId: item.variantId,
			productId: item.productId,
			title: item.title,
			variantTitle: item.variantTitle || 'Default',
			price: item.price,
			currency: item.currency,
			taxRate: item.taxRate,
			imageUrl: item.imageUrl,
		});
		setAddedToCart(true);
		setTimeout(() => setAddedToCart(false), 2000);
	};

	return (
		<li className="flex py-6 sm:py-10">
			<div className="shrink-0">
				<a href={`/products/${item.productId}`}>
					{item.imageUrl ? (
						<img
							src={item.imageUrl}
							alt={item.title}
							className="size-24 rounded-md object-cover sm:size-48 hover:opacity-80 transition-opacity"
						/>
					) : (
						<div className="size-24 rounded-md bg-gray-100 flex items-center justify-center sm:size-48">
							<span className="text-2xl font-bold text-gray-300 select-none sm:text-4xl">IMG</span>
						</div>
					)}
				</a>
			</div>

			<div className="ml-4 flex flex-1 flex-col justify-between sm:ml-6">
				<div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
					<div>
						<h3 className="text-sm">
							<a href={`/products/${item.productId}`} className="font-medium text-gray-700 hover:text-gray-800">
								{item.title}
							</a>
						</h3>
						{item.variantTitle && item.variantTitle !== 'Default' && (
							<p className="mt-1 text-sm text-gray-500">{item.variantTitle}</p>
						)}
						<p className="mt-1 text-sm font-medium text-gray-900">
							{formatPrice(item.price, item.currency)}
						</p>
					</div>

					<div className="mt-4 sm:mt-0 sm:pr-9">
						<div className="absolute top-0 right-0">
							<button
								type="button"
								onClick={() => removeFromWishlist(item.productId)}
								className="-m-2 inline-flex p-2 text-gray-400 hover:text-gray-500"
							>
								<span className="sr-only">{t('common.remove')}</span>
								<svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
									<path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
								</svg>
							</button>
						</div>
					</div>
				</div>

				<div className="mt-4 flex items-center gap-3">
					{item.variantId ? (
						<button
							type="button"
							onClick={handleAddToCart}
							className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
							disabled={addedToCart}
						>
							{addedToCart ? t('wishlist.addedToCart') : t('wishlist.addToCart')}
						</button>
					) : (
						<a
							href={`/products/${item.productId}`}
							className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
						>
							{t('wishlist.viewProduct')}
						</a>
					)}
				</div>
			</div>
		</li>
	);
}

export default function WishlistPage() {
	const { t } = useTranslation();
	const items = useStore($wishlistArray);

	if (items.length === 0) {
		return <EmptyWishlist />;
	}

	return (
		<div>
			<h2 className="text-lg font-medium text-gray-900 mb-2">
				{t('wishlist.itemCount', { count: String(items.length) })}
			</h2>
			<ul role="list" className="divide-y divide-gray-200 border-t border-b border-gray-200">
				{items.map((item) => (
					<WishlistItem key={item.productId} item={item} />
				))}
			</ul>
			<div className="mt-6 text-center text-sm">
				<a href="/products" className="font-medium text-indigo-600 hover:text-indigo-500">
					{t('wishlist.continueShopping')}
					<span aria-hidden="true"> &rarr;</span>
				</a>
			</div>
		</div>
	);
}
