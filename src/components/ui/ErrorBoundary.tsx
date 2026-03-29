import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full items-center justify-center bg-bg">
          <div className="max-w-md rounded-2xl border border-border bg-panel px-8 py-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-coral/10">
              <span className="text-lg text-coral">!</span>
            </div>
            <h2 className="mb-2 text-base font-semibold tracking-tight text-text">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm leading-relaxed text-text-muted">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
