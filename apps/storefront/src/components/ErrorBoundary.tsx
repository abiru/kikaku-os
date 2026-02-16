import { Component, type ReactNode } from 'react';
import { t } from '../i18n';

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: React.ErrorInfo) {
    // Error already captured by getDerivedStateFromError
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">
            {t('errors.componentError')}
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-medium text-red-600 underline hover:text-red-800"
            onClick={() => window.location.reload()}
          >
            {t('errors.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
