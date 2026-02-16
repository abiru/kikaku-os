import { useState, useEffect } from 'react';
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

	useEffect(() => {
		const consent = getStoredConsent();
		if (consent === 'undecided') {
			const timer = setTimeout(() => setVisible(true), 500);
			return () => clearTimeout(timer);
		}
		if (consent === 'rejected') {
			disableAnalytics();
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(STORAGE_KEY, 'accepted');
		setVisible(false);
	};

	const handleReject = () => {
		localStorage.setItem(STORAGE_KEY, 'rejected');
		disableAnalytics();
		setVisible(false);
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
	};

	if (!visible) return null;

	return (
		<div
			className="fixed bottom-0 left-0 right-0 z-[9999] animate-slideUp"
			role="dialog"
			aria-label={t('cookie.title')}
		>
			<div className="mx-auto max-w-5xl px-4 pb-4">
				<div className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/50 px-6 py-4">
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
										className="rounded border-gray-300"
									/>
									<span>{t('cookie.essential')}</span>
								</label>
								<label className="flex items-center gap-3 text-[13px] text-primary/80">
									<input
										type="checkbox"
										checked={analyticsEnabled}
										onChange={(e) => setAnalyticsEnabled(e.target.checked)}
										className="rounded border-gray-300"
									/>
									<span>{t('cookie.analytics')}</span>
								</label>
							</div>
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={handleSavePreferences}
									className="rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover active:bg-brand-active"
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
									className="rounded-full border border-gray-300 bg-white px-5 py-2 text-[13px] font-medium text-primary/80 transition-colors hover:bg-gray-50 active:bg-gray-100"
								>
									{t('cookie.reject')}
								</button>
								<button
									type="button"
									onClick={handleAccept}
									className="shrink-0 rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover active:bg-brand-active"
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
