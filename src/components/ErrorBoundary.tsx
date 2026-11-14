import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. "Inventory page"). Defaults to "This section". */
  sectionName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors in any child component tree and renders a friendly
 * fallback instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary sectionName="POS">
 *     <POS />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so the developer can inspect it in DevTools / log files.
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const section = this.props.sectionName ?? 'This section';

    return (
      <div className="flex items-center justify-center h-full min-h-[300px] p-8">
        <div className="bg-white border border-red-200 rounded-2xl shadow-md p-8 max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <span className="bg-red-100 p-4 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </span>
          </div>

          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {section} crashed unexpectedly
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              An error occurred while rendering this page. The rest of the app is still working.
            </p>
          </div>

          {/* Show error message in a copyable code block */}
          {this.state.error && (
            <pre className="text-left bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700 overflow-auto max-h-32 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}

          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
