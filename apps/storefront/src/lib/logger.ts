type LogContext = {
	page?: string;
	action?: string;
	resourceId?: string | number;
};

export function logError(message: string, error: unknown, context?: LogContext): void {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const logData = {
		level: 'error',
		message,
		error: errorMessage,
		...context,
		timestamp: new Date().toISOString(),
	};
	console.error(JSON.stringify(logData));
}

export function logWarn(message: string, context?: LogContext): void {
	const logData = {
		level: 'warn',
		message,
		...context,
		timestamp: new Date().toISOString(),
	};
	console.warn(JSON.stringify(logData));
}
