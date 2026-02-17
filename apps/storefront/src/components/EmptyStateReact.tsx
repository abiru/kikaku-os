import type { ReactNode } from 'react';

type IconType = 'cart' | 'search' | 'review' | 'default';

interface EmptyStateProps {
	icon?: IconType;
	title: string;
	description?: string;
	ctaLabel?: string;
	ctaHref?: string;
	compact?: boolean;
	children?: ReactNode;
}

function CartIcon({ className }: { className: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
			<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
		</svg>
	);
}

function SearchIcon({ className }: { className: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
			<path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
		</svg>
	);
}

function ReviewIcon({ className }: { className: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
			<path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5z" />
		</svg>
	);
}

function DefaultIcon({ className }: { className: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
			<path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h10.5m-10.5 4.5h10.5m-10.5 4.5h6" />
			<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25v13.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5z" />
		</svg>
	);
}

const iconComponents: Record<IconType, React.ComponentType<{ className: string }>> = {
	cart: CartIcon,
	search: SearchIcon,
	review: ReviewIcon,
	default: DefaultIcon,
};

export function EmptyStateReact({
	icon = 'default',
	title,
	description,
	ctaLabel,
	ctaHref,
	compact = false,
	children,
}: EmptyStateProps) {
	const IconComponent = iconComponents[icon];
	const iconSize = compact ? 'h-10 w-10' : 'h-12 w-12';
	const svgSize = compact ? 'h-5 w-5' : 'h-6 w-6';

	return (
		<div className={`text-center ${compact ? 'py-8' : 'py-16'}`}>
			<div className={`mx-auto flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 ${iconSize}`}>
				<IconComponent className={svgSize} />
			</div>
			<h2 className="typo-h3 mt-4 text-primary">{title}</h2>
			{description && (
				<p className="mt-2 text-sm text-secondary">{description}</p>
			)}
			{ctaLabel && ctaHref && (
				<div className={compact ? 'mt-4' : 'mt-6'}>
					<a
						href={ctaHref}
						className="inline-flex items-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-active"
					>
						{ctaLabel}
					</a>
				</div>
			)}
			{children}
		</div>
	);
}
