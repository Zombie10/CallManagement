import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Admin UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="glass-card max-w-lg p-8 text-center">
            <h1 className="font-display text-xl font-semibold text-red-200">Error en el panel</h1>
            <p className="mt-3 text-sm text-slate-400">
              Recarga la página con <kbd className="rounded bg-white/10 px-1.5 py-0.5">Ctrl+Shift+R</kbd> (o
              Cmd+Shift+R en Mac) para limpiar caché.
            </p>
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}