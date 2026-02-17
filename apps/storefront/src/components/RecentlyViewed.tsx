import { useStore } from '@nanostores/react';
import { $recentlyViewedList, type RecentlyViewedItem } from '../lib/recentlyViewed';
import { useTranslation } from '../i18n';
import { ProductCardReact } from './ui/ProductCardReact';

interface Props {
	excludeId?: number;
}

export default function RecentlyViewed({ excludeId }: Props) {
	const items = useStore($recentlyViewedList);
	const { t } = useTranslation();

	const filtered = excludeId
		? items.filter((item: RecentlyViewedItem) => item.id !== excludeId)
		: items;

	if (filtered.length === 0) return null;

	return (
		<section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
			<h2 className="typo-h3 text-primary mb-6">
				{t('recentlyViewed.title')}
			</h2>
			<div className="relative">
				{/* Left fade */}
				<div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-subtle to-transparent" />
				{/* Right fade */}
				<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-subtle to-transparent" />

				<div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
					{filtered.map((item: RecentlyViewedItem) => (
						<div key={item.id} className="flex-shrink-0 w-48 snap-start">
							<ProductCardReact
								id={item.id}
								title={item.name}
								image={item.image}
								price={item.price}
								currency={item.currency}
								variant="compact"
							/>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
