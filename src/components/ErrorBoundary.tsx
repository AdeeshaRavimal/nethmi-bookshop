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
      <div className="flex items-center justify-center h-full min-h-[360px] p-8">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl shadow-slate-900/5 p-8 max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <span className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 p-3.5 rounded-2xl text-rose-600 dark:text-rose-400 shadow-2xs">
              <AlertTriangle className="w-6 h-6 stroke-[1.8]" />
            </span>
          </div>

          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {section} crashed unexpectedly
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              An error occurred while rendering this page. The rest of the app is still working.
            </p>
          </div>

          {/* Show error message in a copyable code block */}
          {this.state.error && (
            <pre className="text-left bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-rose-600 dark:text-rose-400 font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}

          <div>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
