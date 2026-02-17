import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n';

const STORAGE_KEY = 'cookie-consent-accepted';

type ConsentState = 'undecided' | 'accepted' | 'rejected';

function getStoredConsent(): ConsentState {
	const value = localStorage.getItem(STORAGE_KEY);
	if (value === 'true' || value === 'accepted') return 'accepted';
	if (value === 'rejected') return 'rejected';
	return 'undecided';
}

function disableAnalytics() {
	// Disable Google Tag Manager / Analytics
	(window as unknown as Record<string, unknown>)['ga-disable-GA_MEASUREMENT_ID'] = true;
	// Remove existing analytics cookies
	const analyticsCookies = ['_ga', '_gid', '_gat', '__utma', '__utmb', '__utmc', '__utmz'];
	for (const name of analyticsCookies) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
	}
}

export default function CookieConsent() {
	const { t } = useTranslation();
	const [visible, setVisible] = useState(false);
	const [showPreferences, setShowPreferences] = useState(false);
	const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
	const bannerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const consent = getStoredConsent();
		if (consent === 'undecided') {
			triggerRef.current = document.activeElement as HTMLElement | null;
			const timer = setTimeout(() => setVisible(true), 500);
			return () => clearTimeout(timer);
		}
		if (consent === 'rejected') {
			disableAnalytics();
		}
	}, []);

	// Focus first interactive element when banner becomes visible
	useEffect(() => {
		if (!visible || !bannerRef.current) return;
		const firstFocusable = bannerRef.current.querySelector<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		firstFocusable?.focus();
	}, [visible, showPreferences]);

	// Focus trap: Tab/Shift+Tab cycles within banner
	const handleFocusTrap = useCallback((e: KeyboardEvent) => {
		if (e.key !== 'Tab' || !bannerRef.current) return;

		const focusable = bannerRef.current.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (focusable.length === 0) return;

		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;

		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}, []);

	useEffect(() => {
		if (!visible) return;
		document.addEventListener('keydown', handleFocusTrap);
		return () => document.removeEventListener('keydown', handleFocusTrap);
	}, [visible, handleFocusTrap]);

	const restoreFocus = () => {
		if (triggerRef.current && triggerRef.current !== document.body) {
			triggerRef.current.focus();
		}
		triggerRef.current = null;
	};

	const handleAccept = () => {
		localStorage.setItem(STORAGE_KEY, 'accepted');
		setVisible(false);
		restoreFocus();
	};

	const handleReject = () => {
		localStorage.setItem(STORAGE_KEY, 'rejected');
		disableAnalytics();
		setVisible(false);
		restoreFocus();
	};

	const handleSavePreferences = () => {
		if (analyticsEnabled) {
			localStorage.setItem(STORAGE_KEY, 'accepted');
		} else {
			localStorage.setItem(STORAGE_KEY, 'rejected');
			disableAnalytics();
		}
		setVisible(false);
		setShowPreferences(false);
		restoreFocus();
	};

	if (!visible) return null;

	return (
		<div
			ref={bannerRef}
			className="fixed bottom-0 left-0 right-0 z-[9999] animate-slideUp"
			role="alertdialog"
			aria-label={t('cookie.title')}
		>
			<div className="mx-auto max-w-5xl px-4 pb-4">
				<div className="rounded-2xl bg-white shadow-lg ring-1 ring-neutral-200/50 px-6 py-4">
					{showPreferences ? (
						<div className="space-y-4">
							<h3 className="text-sm font-medium text-primary">
								{t('cookie.preferencesTitle')}
							</h3>
							<div className="space-y-3">
								<label className="flex items-center gap-3 text-[13px] text-primary/80">
									<input
										type="checkbox"
										checked
										disabled
										className="rounded border-neutral-300"
									/>
									<span>{t('cookie.essential')}</span>
								</label>
								<label className="flex items-center gap-3 text-[13px] text-primary/80">
									<input
										type="checkbox"
										checked={analyticsEnabled}
										onChange={(e) => setAnalyticsEnabled(e.target.checked)}
										className="rounded border-neutral-300"
									/>
									<span>{t('cookie.analytics')}</span>
								</label>
							</div>
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={handleSavePreferences}
									className="rounded-lg bg-brand h-12 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 motion-safe:active:scale-[0.98]"
								>
									{t('cookie.savePreferences')}
								</button>
								<button
									type="button"
									onClick={() => setShowPreferences(false)}
									className="text-[13px] text-primary/60 hover:text-primary/80 transition-colors"
								>
									{t('common.cancel')}
								</button>
							</div>
						</div>
					) : (
						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
							<p className="text-[13px] text-primary/80 leading-relaxed flex-1">
								{t('cookie.message')}{' '}
								<a
									href="/privacy"
									className="text-brand hover:underline"
								>
									{t('cookie.learnMore')}
								</a>
							</p>
							<div className="flex items-center gap-3 shrink-0">
								<button
									type="button"
									onClick={() => setShowPreferences(true)}
									className="text-[13px] text-primary/60 hover:text-primary/80 transition-colors"
								>
									{t('cookie.manage')}
								</button>
								<button
									type="button"
									onClick={handleReject}
									className="rounded-full border border-neutral-300 bg-white px-5 py-2 text-[13px] font-medium text-primary/80 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
								>
									{t('cookie.reject')}
								</button>
								<button
									type="button"
									onClick={handleAccept}
									className="shrink-0 rounded-lg bg-brand h-12 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30 motion-safe:active:scale-[0.98]"
								>
									{t('cookie.accept')}
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
			<style>{`
				@keyframes slideUp {
					from { transform: translateY(100%); opacity: 0; }
					to { transform: translateY(0); opacity: 1; }
				}
				.animate-slideUp {
					animation: slideUp 0.4s ease-out;
				}
			`}</style>
		</div>
	);
}
