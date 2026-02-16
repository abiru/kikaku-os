type LogContext = {
	page?: string;
	action?: string;
	resourceId?: string | number;
};

export function logError(message: string, error: unknown, context?: LogContext): void {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const entry = {
		message,
		error: errorMessage,
		...context,
		timestamp: new Date().toISOString(),
	};

	if (import.meta.env.DEV) {
		console.error(`[${context?.page || 'unknown'}] ${message}:`, error);
	} else {
		console.error(JSON.stringify(entry));
	}
}
