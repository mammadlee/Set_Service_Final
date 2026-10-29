import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Company dashboard render failure', {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="state-block error-state" role="alert">
        <h1>Panel yüklənə bilmədi</h1>
        <p>Səhifəni yeniləyib yenidən cəhd edin.</p>
        <button className="btn primary" type="button" onClick={() => window.location.reload()}>
          Səhifəni yenilə
        </button>
      </main>
    );
  }
}
