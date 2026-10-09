import { Component } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Catches render errors in its children and shows `fallback` instead of a
 * blank page. To recover, unmount it or change its `key` — a fresh instance
 * starts without the error.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      `[ErrorBoundary:${this.props.name ?? "unnamed"}] render failed:`,
      error,
      errorInfo?.componentStack,
    );
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/** Full-page sheet used as the visible fallback for an ErrorBoundary. */
export function ErrorFallback({ title, message, actionLabel, onAction }) {
  return (
    <main className="error-fallback-container">
      <div className="error-fallback" role="alert">
        <AlertTriangle
          size={32}
          strokeWidth={2.5}
          className="error-fallback-icon"
          aria-hidden="true"
        />
        <h2 className="error-fallback-title">{title}</h2>
        <p className="error-fallback-message">{message}</p>
        <button type="button" className="primary-btn" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </main>
  );
}

export default ErrorBoundary;
