import { Component, type ErrorInfo, type ReactNode } from 'react';
import screenStyles from '../screens/Screens.module.css';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches any error that escapes the UI and shows it with a reload button, so a crash never leaves a
 * blank window.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('mboard hit a problem it could not recover from:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <main className={screenStyles.screen}>
        <h1 className={screenStyles.heading}>mboard hit a problem</h1>
        <p role="alert" className={screenStyles.explanation}>
          {error.message}
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
