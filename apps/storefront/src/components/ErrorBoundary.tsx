import { Component, type ReactNode } from 'react';
import { t } from '../i18n';
import { logError } from '../lib/logger';
import { getApiBase } from '../lib/api';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  trackingId: string | null;
};

/**
 * Generate a client-side error tracking ID.
 * Format: ERR-{timestamp}-{random4chars}
 */
function generateTrackingId(): string {
  const random = Math.random().toString(36).slice(2, 6);
  return `ERR-${Date.now()}-${random}`;
}

/**
 * Report an error to the server for tracking and correlation.
 * Fire-and-forget: failures are silently ignored to avoid cascading errors.
 */
function reportErrorToServer(payload: {
  trackingId: string;
  message: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
}): void {
  try {
    const apiBase = getApiBase();
    fetch(`${apiBase}/errors/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore network failures
    });
  } catch {
    // Silently ignore any synchronous errors
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, trackingId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    const trackingId = generateTrackingId();
    return { hasError: true, trackingId };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const trackingId = this.state.trackingId ?? generateTrackingId();

    logError('Component error caught by ErrorBoundary', error, {
      page: 'ErrorBoundary',
      action: info.componentStack ?? undefined,
    });

    reportErrorToServer({
      trackingId,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">
            {t('errors.componentError')}
          </p>
          {this.state.trackingId && (
            <p className="mt-2 text-xs text-red-500 font-mono">
              {t('errors.errorTrackingId', { id: this.state.trackingId })}
            </p>
          )}
          <button
            type="button"
            className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-800"
            onClick={() => this.setState({ hasError: false, trackingId: null })}
          >
            {t('errors.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
