import { Toaster } from 'sonner';

export default function ToastProvider() {
	return (
		<Toaster
			position="top-right"
			toastOptions={{
				style: {
					fontFamily: '"Inter", "Noto Sans JP", sans-serif',
					fontSize: '0.875rem',
					borderRadius: '10px',
					boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
				},
				className: 'toast-item',
			}}
			richColors
			closeButton
			expand={false}
			visibleToasts={5}
		/>
	);
}
