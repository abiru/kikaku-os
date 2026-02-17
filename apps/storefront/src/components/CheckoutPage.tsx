import { useTranslation } from '../i18n';
import { useCheckout } from '../hooks/useCheckout';
import CheckoutForm from './CheckoutForm';
import OrderSummary from './OrderSummary';
import { ErrorBoundary } from './ErrorBoundary';

function CheckoutSkeleton() {
	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			{/* Title skeleton — matches text-2xl sm:text-3xl font-bold */}
			<div className="animate-pulse mb-8">
				<div className="h-7 sm:h-9 bg-gray-200 rounded w-48" />
			</div>

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column skeleton — matches CheckoutForm layout */}
				<div className="lg:col-span-7 animate-pulse">
					<div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
						{/* Email field */}
						<div className="space-y-2">
							<div className="h-4 bg-gray-200 rounded w-32" />
							<div className="h-12 bg-gray-200 rounded" />
						</div>
						{/* Address field */}
						<div className="space-y-2">
							<div className="h-4 bg-gray-200 rounded w-40" />
							<div className="h-10 bg-gray-200 rounded" />
							<div className="h-10 bg-gray-200 rounded" />
						</div>
						{/* Payment field */}
						<div className="space-y-2">
							<div className="h-4 bg-gray-200 rounded w-28" />
							<div className="h-10 bg-gray-200 rounded" />
						</div>
						{/* Submit button */}
						<div className="h-12 bg-gray-200 rounded" />
					</div>
				</div>

				{/* Right column skeleton — matches OrderSummary layout */}
				<div className="mt-10 lg:mt-0 lg:col-span-5 animate-pulse">
					<div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
						<div className="h-5 bg-gray-200 rounded w-24" />
						<div className="h-4 bg-gray-200 rounded" />
						<div className="h-4 bg-gray-200 rounded w-3/4" />
						<div className="border-t border-gray-200 pt-4 space-y-2">
							<div className="h-4 bg-gray-200 rounded" />
							<div className="h-4 bg-gray-200 rounded" />
							<div className="h-6 bg-gray-200 rounded w-1/2 mt-4" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function CheckoutPageContent() {
	const { t } = useTranslation();
	const {
		cartItems,
		breakdown,
		clientSecret,
		orderToken,
		publishableKey,
		loading,
		error,
		retry,
		createQuote,
	} = useCheckout();

	if (loading) {
		return <CheckoutSkeleton />;
	}

	if (error && !breakdown) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center max-w-md">
					<div className="text-red-600 mb-4">
						<svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
						</svg>
					</div>
					<p className="text-lg text-gray-900 font-medium">{error}</p>
						<div className="mt-6 flex flex-col items-center gap-3">
							<button
								type="button"
								onClick={retry}
								className="text-brand hover:text-brand-active font-medium min-h-[44px] flex items-center justify-center"
							>
								{t('errors.retry')}
						</button>
						<a href="/cart" className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] flex items-center justify-center">
							{t('checkout.returnToCart')}
						</a>
					</div>
				</div>
			</div>
		);
	}

	if (cartItems.length === 0) {
		return (
			<div className="flex items-center justify-center min-h-[60vh]">
				<div className="text-center">
					<p className="text-lg text-gray-900">{t('cart.empty')}</p>
					<a href="/products" className="mt-4 inline-block text-brand hover:text-brand-active min-h-[44px] flex items-center justify-center">
						{t('cart.continueShopping')}
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 mb-8">
				{t('checkout.title')}
			</h1>

			{error && (
				<div className="mb-6 rounded-md bg-red-50 p-4" role="alert">
					<p className="text-sm text-red-800">{error}</p>
				</div>
			)}

			<div className="lg:grid lg:grid-cols-12 lg:gap-x-12 xl:gap-x-16">
				{/* Left column - Stripe prebuilt payment form */}
				<div className="lg:col-span-7">
					<CheckoutForm
						clientSecret={clientSecret}
						orderToken={orderToken}
						publishableKey={publishableKey}
					/>
				</div>

				{/* Right column - Order summary */}
				<div className="mt-10 lg:mt-0 lg:col-span-5">
					<OrderSummary
						items={cartItems}
						breakdown={breakdown}
						onCouponApply={createQuote}
					/>
				</div>
			</div>
		</div>
	);
}

export default function CheckoutPage() {
	return (
		<ErrorBoundary>
			<CheckoutPageContent />
		</ErrorBoundary>
	);
}
