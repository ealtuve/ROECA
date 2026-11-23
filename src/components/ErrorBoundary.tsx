import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error?.message || 'Ha ocurrido un error inesperado en la aplicación.';
    try {
      const parsed = JSON.parse(message);
      if (parsed && parsed.error) {
        message = `Error de acceso a datos (${parsed.operationType || 'operación'}): ${parsed.error}`;
      }
    } catch {
      // Not JSON, keep message as-is
    }
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ROECA ErrorBoundary]', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 dark:bg-[#0d1117] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#161b22] border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-7 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            </div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Se produjo un problema inesperado
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar Distribuidora ROECA
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
