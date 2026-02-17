import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n';
import { formatPrice } from '../lib/format';
import type { CartItem } from '../lib/cart';

type QuoteBreakdown = {
	subtotal: number;
	taxAmount: number;
	cartTotal: number;
	discount: number;
	shippingFee: number;
	grandTotal: number;
	currency: string;
};

export type AddressData = {
	name: string;
	address: {
		line1: string;
		line2: string | null;
		city: string;
		state: string;
		postal_code: string;
		country: string;
	};
};

type OrderConfirmationModalProps = {
	items: CartItem[];
	breakdown: QuoteBreakdown;
	email: string;
	address: AddressData | null;
	onConfirm: () => void;
	onCancel: () => void;
	isProcessing: boolean;
};

export default function OrderConfirmationModal({
	items,
	breakdown,
	email,
	address,
	onConfirm,
	onCancel,
	isProcessing
}: OrderConfirmationModalProps) {
	const { t } = useTranslation();
	const currency = breakdown.currency || 'JPY';
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !isProcessing) {
				onCancel();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isProcessing, onCancel]);

	const handleFocusTrap = useCallback((e: KeyboardEvent) => {
		if (e.key !== 'Tab' || !modalRef.current) return;
		const focusable = modalRef.current.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;
		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;
		if (e.shiftKey) {
			if (document.activeElement === first) { e.preventDefault(); last.focus(); }
		} else {
			if (document.activeElement === last) { e.preventDefault(); first.focus(); }
		}
	}, []);

	useEffect(() => {
		document.addEventListener('keydown', handleFocusTrap);
		return () => document.removeEventListener('keydown', handleFocusTrap);
	}, [handleFocusTrap]);

	useEffect(() => {
		const timer = setTimeout(() => {
			const btn = modalRef.current?.querySelector<HTMLElement>('button');
			btn?.focus();
		}, 50);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
			role="dialog"
			aria-modal="true"
			aria-label={t('checkout.orderConfirmationTitle')}
		>
			<div ref={modalRef} className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
				<h2 className="text-xl font-bold text-gray-900 mb-6">
					{t('checkout.orderConfirmationTitle')}
				</h2>

				{/* Order items */}
				<div className="space-y-3 mb-4">
					{items.map((item) => (
						<div key={item.variantId} className="flex justify-between text-sm">
							<div className="flex-1">
								<p className="font-medium text-gray-900">
									{item.title}
									{item.variantTitle && item.variantTitle !== 'Default' && (
										<span className="text-gray-500"> - {item.variantTitle}</span>
									)}
								</p>
								<p className="text-gray-500">{t('checkout.quantity')}: {item.quantity}</p>
							</div>
							<p className="font-medium text-gray-900 ml-4">
								{formatPrice(item.price * item.quantity, currency)}
							</p>
						</div>
					))}
				</div>

				{/* Price breakdown */}
				<div className="border-t border-gray-200 pt-4 space-y-2 mb-4">
					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.subtotal')}</span>
						<span>{formatPrice(breakdown.subtotal, currency)}</span>
					</div>
					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.tax')}</span>
						<span>{formatPrice(breakdown.taxAmount, currency)}</span>
					</div>
					{breakdown.discount > 0 && (
						<div className="flex justify-between text-sm text-green-600">
							<span>{t('checkout.discount')}</span>
							<span>-{formatPrice(breakdown.discount, currency)}</span>
						</div>
					)}
					<div className="flex justify-between text-sm text-gray-600">
						<span>{t('checkout.shipping')}</span>
						<span>
							{breakdown.shippingFee === 0
								? t('checkout.free')
								: formatPrice(breakdown.shippingFee, currency)}
						</span>
					</div>
					<div className="flex justify-between text-lg font-semibold text-gray-900 pt-2 border-t border-gray-200">
						<span>{t('checkout.total')}</span>
						<span>{formatPrice(breakdown.grandTotal, currency)}</span>
					</div>
				</div>

				{/* Shipping address */}
				{address && (
					<div className="border-t border-gray-200 pt-4 mb-4">
						<h3 className="text-sm font-medium text-gray-700 mb-1">
							{t('checkout.shippingAddress')}
						</h3>
						<p className="text-sm text-gray-600">
							{address.name && <span className="block">{address.name}</span>}
							{address.address.postal_code && (
								<span className="block">〒{address.address.postal_code}</span>
							)}
							<span className="block">
								{address.address.state}{address.address.city}{address.address.line1}
							</span>
							{address.address.line2 && <span className="block">{address.address.line2}</span>}
						</p>
					</div>
				)}

				{/* Email */}
				{email && (
					<div className="border-t border-gray-200 pt-4 mb-6">
						<h3 className="text-sm font-medium text-gray-700 mb-1">
							{t('checkout.email')}
						</h3>
						<p className="text-sm text-gray-600">{email}</p>
					</div>
				)}

				{/* Buttons */}
				<div className="flex flex-col gap-3">
					<button
						type="button"
						onClick={onConfirm}
						disabled={isProcessing}
						className="w-full rounded-lg bg-brand px-4 py-3 text-base font-medium text-white shadow-sm hover:bg-brand-active focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
					>
						{isProcessing ? (
							<span className="inline-flex items-center justify-center gap-2">
								<svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
								</svg>
								{t('checkout.processing')}
							</span>
						) : t('checkout.confirmAndPay')}
					</button>
					<button
						type="button"
						onClick={onCancel}
						disabled={isProcessing}
						className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
					>
						{t('checkout.goBack')}
					</button>
				</div>
			</div>
		</div>
	);
}
