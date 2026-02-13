import { useStore } from '@nanostores/react';
import { $recentlyViewedList, type RecentlyViewedItem } from '../lib/recentlyViewed';
import { useTranslation } from '../i18n';

interface Props {
	excludeId?: number;
}

const formatPrice = (amount: number, currency: string = 'JPY') => {
	return new Intl.NumberFormat('ja-JP', {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
	}).format(amount);
};

export default function RecentlyViewed({ excludeId }: Props) {
	const items = useStore($recentlyViewedList);
	const { t } = useTranslation();

	const filtered = excludeId
		? items.filter((item: RecentlyViewedItem) => item.id !== excludeId)
		: items;

	if (filtered.length === 0) return null;

	return (
		<section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
			<h2 className="text-xl font-semibold text-gray-900 mb-6">
				{t('recentlyViewed.title')}
			</h2>
			<div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
				{filtered.map((item: RecentlyViewedItem) => (
					<a
						key={item.id}
						href={`/products/${item.id}`}
						className="flex-shrink-0 w-48 snap-start group"
					>
						<div className="aspect-square w-full overflow-hidden rounded-xl bg-gray-100">
							{item.image ? (
								<img
									src={item.image}
									alt={item.name}
									loading="lazy"
									className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center text-gray-300">
									<svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
										<path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
									</svg>
								</div>
							)}
						</div>
						<p className="mt-2 text-sm font-medium text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
							{item.name}
						</p>
						<p className="text-sm text-gray-500">
							{formatPrice(item.price, item.currency)}
						</p>
					</a>
				))}
			</div>
		</section>
	);
}
