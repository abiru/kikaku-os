import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';

const STORAGE_KEY = 'cookie-consent-accepted';

export default function CookieConsent() {
	const { t } = useTranslation();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const accepted = localStorage.getItem(STORAGE_KEY);
		if (!accepted) {
			const timer = setTimeout(() => setVisible(true), 500);
			return () => clearTimeout(timer);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(STORAGE_KEY, 'true');
		setVisible(false);
	};

	if (!visible) return null;

	return (
		<div
			className="fixed bottom-0 left-0 right-0 z-[9999] animate-slideUp"
			role="dialog"
			aria-label={t('cookie.title')}
		>
			<div className="mx-auto max-w-5xl px-4 pb-4">
				<div className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/50 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
					<p className="text-[13px] text-primary/80 leading-relaxed flex-1">
						{t('cookie.message')}{' '}
						<a
							href="/privacy"
							className="text-brand hover:underline"
						>
							{t('cookie.learnMore')}
						</a>
					</p>
					<button
						type="button"
						onClick={handleAccept}
						className="shrink-0 rounded-full bg-brand px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-brand-hover active:bg-[#006ADB]"
					>
						{t('cookie.accept')}
					</button>
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
