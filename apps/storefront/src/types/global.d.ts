/**
 * Global Window interface extensions for custom properties
 * used across the storefront application.
 *
 * Centralises all `window.__*` declarations so that individual files
 * no longer need `(window as any)` casts or per-file `declare global` blocks.
 */

export type ConfirmDialogOptions = {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
};

export type ConfirmDialogFn = (opts: ConfirmDialogOptions) => Promise<boolean>;

declare global {
	interface Window {
		/* ------------------------------------------------------------------ */
		/*  Admin: confirm dialog                                             */
		/* ------------------------------------------------------------------ */
		__confirmDialog?: ConfirmDialogFn;

		/* ------------------------------------------------------------------ */
		/*  Admin: page config (pages/[id])                                   */
		/* ------------------------------------------------------------------ */
		__PAGE_CONFIG__?: {
			pageId: string | number;
			canDelete: boolean;
			currentStatus: string;
			pageTitle: string;
			i18nPublish: string;
			i18nUnpublish: string;
			i18nPublished: string;
			i18nDraft: string;
		};

		/* ------------------------------------------------------------------ */
		/*  Admin: user config (users/[id])                                   */
		/* ------------------------------------------------------------------ */
		__userConfig?: {
			userName: string;
		};

		/* ------------------------------------------------------------------ */
		/*  Admin: tax-rate config (tax-rates/[id])                           */
		/* ------------------------------------------------------------------ */
		__taxRateConfig?: {
			taxRateName: string;
		};

		/* ------------------------------------------------------------------ */
		/*  Quotations                                                        */
		/* ------------------------------------------------------------------ */
		__QUOTATION_PAGE__?: {
			apiUrl: string;
			quotationToken: string;
			quotationNumber: string;
			i18n: {
				pdf: string;
				generatingPdf: string;
				pdfLoadError: string;
				pdfDownloadError: string;
				orderFromQuotation: string;
				processing: string;
				checkoutUrlError: string;
				acceptError: string;
				confirmOrder: string;
			};
		};

		__QUOTATION_API_URL__?: string;
		__QUOTATION_I18N__?: {
			emptyCart: string;
			viewProducts: string;
			quantity: string;
			creating: string;
			createButton: string;
			createError: string;
			tokenError: string;
		};

		/* ------------------------------------------------------------------ */
		/*  Checkout success                                                  */
		/* ------------------------------------------------------------------ */
		__CHECKOUT_SUCCESS_API_BASE__?: string;
		__CHECKOUT_ORDER__?: {
			id: number;
			total_amount: number;
			currency: string;
			items?: Array<{
				title?: string;
				quantity?: number;
				unit_price?: number;
				product_id?: number;
				variant_title?: string;
			}>;
		} | null;

		__I18N_PAYMENT_PROCESSING__?: string;
		__I18N_PAYMENT_PROCESSING_DESC__?: string;
		__I18N_CONFIRMED__?: string;
		__I18N_POLLING_MAX_RETRIES__?: string;
		__I18N_CONTACT_SUPPORT__?: string;
		__I18N_POLLING_CHECKING__?: string;
		__I18N_POLLING_ERROR__?: string;
		__I18N_POLLING_RETRY__?: string;

		/* ------------------------------------------------------------------ */
		/*  GTM / Analytics                                                   */
		/* ------------------------------------------------------------------ */
		dataLayer: Record<string, unknown>[];

		/* ------------------------------------------------------------------ */
		/*  html2pdf (loaded dynamically on quotation detail page)            */
		/* ------------------------------------------------------------------ */
		html2pdf?: () => {
			set: (options: unknown) => {
				from: (element: Element) => {
					save: () => Promise<void>;
				};
			};
		};
	}
}
