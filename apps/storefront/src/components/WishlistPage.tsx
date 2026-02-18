import { useStore } from '@nanostores/react';
import { $wishlistArray, removeFromWishlist } from '../lib/wishlist';
import { addToCart } from '../lib/cart';
import { useTranslation } from '../i18n';
import { useState } from 'react';
import { formatPrice } from '../lib/format';
import { showToast } from '../lib/toast';

function EmptyWishlist() {
	const { t } = useTranslation();
	return (
		<div className="text-center py-16">
			<svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
				<path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
			</svg>
			<h2 className="mt-4 text-lg font-medium text-neutral-900">{t('wishlist.empty')}</h2>
			<p className="mt-2 text-sm text-neutral-500">{t('wishlist.emptyDescription')}</p>
			<div className="mt-6">
				<a href="/products" className="inline-flex items-center rounded-lg bg-brand h-12 px-6 py-3 text-base font-semibold text-white hover:bg-brand-hover transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 motion-safe:active:scale-[0.98]">
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
		showToast(t('toast.cartAdded'), 'success');
	};

	return (
		<li className="flex py-6 sm:py-10">
			<div className="shrink-0">
				<a href={`/products/${item.productId}`}>
					{item.imageUrl ? (
						<img
							src={item.imageUrl}
							alt={item.title}
							loading="lazy"
							className="size-24 rounded-md object-cover sm:size-48 hover:opacity-80 transition-opacity"
						/>
					) : (
						<div className="size-24 rounded-md bg-neutral-100 flex items-center justify-center sm:size-48" aria-hidden="true">
							<svg className="size-8 text-neutral-300 sm:size-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
							</svg>
						</div>
					)}
				</a>
			</div>

			<div className="ml-4 flex flex-1 flex-col justify-between sm:ml-6">
				<div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
					<div>
						<h3 className="text-sm">
							<a href={`/products/${item.productId}`} className="font-medium text-neutral-700 hover:text-neutral-800">
								{item.title}
							</a>
						</h3>
						{item.variantTitle && item.variantTitle !== 'Default' && (
							<p className="mt-1 text-sm text-neutral-500">{item.variantTitle}</p>
						)}
						<p className="mt-1 text-sm font-medium text-neutral-900">
							{formatPrice(item.price, item.currency)}
						</p>
					</div>

					<div className="mt-4 sm:mt-0 sm:pr-9">
						<div className="absolute top-0 right-0">
							<button
								type="button"
								onClick={() => {
									removeFromWishlist(item.productId);
									showToast(t('toast.wishlistRemoved'), 'info');
								}}
								className="-m-2 inline-flex p-2 text-neutral-400 hover:text-neutral-500"
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
							className="inline-flex items-center rounded-lg bg-brand h-10 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 motion-safe:active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
							disabled={addedToCart}
						>
							{addedToCart ? t('wishlist.addedToCart') : t('wishlist.addToCart')}
						</button>
					) : (
						<a
							href={`/products/${item.productId}`}
							className="inline-flex items-center rounded-lg bg-brand h-10 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 motion-safe:active:scale-[0.98]"
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
			<h2 className="text-lg font-medium text-neutral-900 mb-2">
				{t('wishlist.itemCount', { count: String(items.length) })}
			</h2>
			<ul role="list" className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
				{items.map((item) => (
					<WishlistItem key={item.productId} item={item} />
				))}
			</ul>
			<div className="mt-6 text-center text-sm">
				<a href="/products" className="font-medium text-brand hover:text-brand-active">
					{t('wishlist.continueShopping')}
					<span aria-hidden="true"> &rarr;</span>
				</a>
			</div>
		</div>
	);
}
