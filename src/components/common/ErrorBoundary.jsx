import React from 'react';
import { reportClientError } from '../../utils/monitoring';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorId: null
    };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const errorId = reportClientError({
      source: 'render-boundary',
      error,
      stack: error?.stack || '',
      extra: {
        componentStack: errorInfo?.componentStack || ''
      }
    });
    this.setState({ errorId });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen ds-page flex items-center justify-center p-4">
        <div className="w-full max-w-md ds-card ds-section-lg text-center">
          <h1 className="text-xl font-bold text-[color:var(--ds-text-strong)]">Something went wrong</h1>
          <p className="text-sm text-[color:var(--ds-text-muted)] mt-2">
            The app hit an unexpected error. Reload to recover.
          </p>
          {this.state.errorId && (
            <p className="text-[11px] text-[color:var(--ds-text-soft)] mt-2 font-data-mono">
              Error id: {this.state.errorId}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 w-full ds-btn ds-btn-primary py-3"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
