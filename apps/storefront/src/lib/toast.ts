import { toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

type ToastOptions = {
	duration?: number;
	description?: string;
};

const DEFAULT_DURATION = 5000;

export function showToast(message: string, type: ToastType = 'info', options: ToastOptions = {}) {
	const duration = options.duration ?? DEFAULT_DURATION;

	switch (type) {
		case 'success':
			return sonnerToast.success(message, { duration, description: options.description });
		case 'error':
			return sonnerToast.error(message, { duration, description: options.description });
		case 'warning':
			return sonnerToast.warning(message, { duration, description: options.description });
		case 'info':
		default:
			return sonnerToast.info(message, { duration, description: options.description });
	}
}

export { sonnerToast as toast };
